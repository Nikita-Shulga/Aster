'use strict';
// macOS applications: .app bundles in /Applications and ~/Applications.
// Uninstalling = quit the app, move the bundle to the Trash, then find leftovers in ~/Library.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {sh, osa, asString, plist, mapLimit, HOME, LIB, volumeOf} = require('./sh.cjs');
const {dirSize} = require('../programs.cjs');
const {td} = require('../i18n.cjs');

const ROOTS = ['/Applications', '/Applications/Utilities', path.join(HOME, 'Applications')];
const SYSTEM_ROOTS = ['/System/Applications', '/System/Applications/Utilities'];

async function findApps(roots, depth = 2) {
  const out = [];
  const visit = async (dir, d) => {
    let entries; try { entries = await fsp.readdir(dir, {withFileTypes: true}); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.name.endsWith('.app') && (e.isDirectory() || e.isSymbolicLink())) out.push(full);
      else if (e.isDirectory() && !e.isSymbolicLink() && d > 1 && !e.name.startsWith('.')) await visit(full, d - 1);
    }
  };
  for (const r of roots) await visit(r, depth);
  return [...new Set(out)];
}

// mdls with a single attribute and many files prints one NUL-separated value per file, in order.
async function mdlsBatch(attr, files) {
  if (!files.length) return [];
  try {
    const out = await sh('/usr/bin/mdls', ['-name', attr, '-raw', ...files], {timeout: 60000});
    return out.split('\0').map(v => (v === '(null)' || v === '' ? null : v));
  } catch { return files.map(() => null); }
}
const toDate = v => { const d = v ? Date.parse(v.replace(' +0000', 'Z').replace(' ', 'T')) : NaN; return Number.isFinite(d) ? new Date(d).toISOString().slice(0, 10) : null; };
function publisherFrom(copyright, bundleId) {
  const c = String(copyright || '').replace(/copyright|©|\(c\)|all rights reserved\.?|\d{4}(\s*[-–]\s*\d{4})?/gi, ' ').replace(/[.,]+\s*$/, '').replace(/\s+/g, ' ').trim();
  if (c && c.length < 60) return c.replace(/^[,.\s]+/, '');
  const parts = String(bundleId || '').split('.');
  return parts.length > 2 ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : null;
}

class MacPrograms {
  constructor({store, getIcon, trash}) { this.store = store; this.getIcon = getIcon; this.trash = trash; this.items = new Map(); this.leftovers = new Map(); }

  async list() {
    const paths = await findApps(ROOTS);
    const infos = await mapLimit(paths, 8, p => plist(path.join(p, 'Contents', 'Info.plist')));
    const [sizes, used, added] = await Promise.all([mdlsBatch('kMDItemPhysicalSize', paths), mdlsBatch('kMDItemLastUsedDate', paths), mdlsBatch('kMDItemDateAdded', paths)]);
    this.items.clear();
    const out = [];
    paths.forEach((p, i) => {
      const info = infos[i] || {};
      const bundleId = info.CFBundleIdentifier || null;
      const apple = /^com\.apple\./.test(bundleId || '');
      const store = fs.existsSync(path.join(p, 'Contents', '_MASReceipt'));
      const id = crypto.createHash('sha1').update(p).digest('hex').slice(0, 16);
      const item = {
        id, type: apple ? 'apple' : store ? 'store' : 'app', bundleId,
        name: info.CFBundleDisplayName || info.CFBundleName || path.basename(p, '.app'),
        version: info.CFBundleShortVersionString || info.CFBundleVersion || '',
        publisher: apple ? 'Apple' : publisherFrom(info.NSHumanReadableCopyright, bundleId),
        location: p, drive: volumeOf(p),
        size: sizes[i] && Number(sizes[i]) > 0 ? Number(sizes[i]) : null,
        installDate: toDate(added[i]), lastUsed: toDate(used[i]),
        canUninstall: !apple, broken: false, hasQuiet: false
      };
      this.items.set(id, item); out.push(item);
    });
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
    return {items: out};
  }

  async icons({ids}) {
    const result = {};
    await Promise.all((ids || []).slice(0, 200).map(async id => { const it = this.items.get(id); if (it) result[id] = await this.getIcon(it.location).catch(() => null); }));
    return result;
  }

  async folderSize({id}) { const it = this.items.get(id); return {size: it ? await dirSize(it.location, 20000) : null}; }

  async moveToTrash(p) {
    try { await this.trash(p); }
    catch {
      // Bundles installed by an admin package are owned by root; Finder asks for the password.
      await osa(`tell application "Finder" to delete POSIX file ${asString(p)}`, {timeout: 120000});
    }
  }

  async uninstall({id}) {
    const it = this.items.get(id);
    if (!it) throw new Error('Refresh the program list and try again.');
    if (!it.canUninstall) throw new Error('Apps that come with macOS cannot be removed.');
    if (it.bundleId) await osa(`if application id ${asString(it.bundleId)} is running then tell application id ${asString(it.bundleId)} to quit`, {timeout: 20000}).catch(() => {});
    await new Promise(r => setTimeout(r, 1200));
    await this.moveToTrash(it.location);
    const removed = !fs.existsSync(it.location);
    if (removed) this.store.log({kind: 'uninstall', key: 'activity.macAppTrashed', vars: {name: it.name}});
    return {removed};
  }

  async removeEntry() { throw new Error('Not needed on macOS — removing the app removes its entry.'); }

  async scanLeftovers({id}) {
    const it = this.items.get(id);
    if (!it) throw new Error('Refresh the program list and try again.');
    const name = it.name.toLowerCase();
    const bare = path.basename(it.location, '.app').toLowerCase();
    const bid = (it.bundleId || '').toLowerCase();
    const others = new Set([...this.items.values()].filter(o => o.id !== id && o.bundleId).map(o => o.bundleId.toLowerCase()));
    const keys = new Set([name, bare, bid].filter(k => k && k.length > 2));
    const matchName = n => { const l = n.toLowerCase().replace(/\.(plist|savedstate|binarycookies)$/, ''); return keys.has(l) || (bid && (l === bid || l.startsWith(bid + '.') || l.endsWith('.' + bid))); };
    const places = [
      [path.join(LIB, 'Application Support'), 'App data'], [path.join(LIB, 'Caches'), 'Cache'], [path.join(LIB, 'Preferences'), 'Settings'],
      [path.join(LIB, 'Preferences', 'ByHost'), 'Settings'], [path.join(LIB, 'Containers'), 'Sandbox container (app data)'], [path.join(LIB, 'Group Containers'), 'Shared app data'],
      [path.join(LIB, 'Saved Application State'), 'Window state'], [path.join(LIB, 'Logs'), 'Logs'], [path.join(LIB, 'HTTPStorages'), 'Web storage'],
      [path.join(LIB, 'WebKit'), 'Web data'], [path.join(LIB, 'Cookies'), 'Cookies'], [path.join(LIB, 'LaunchAgents'), 'Background agent'],
      [path.join(LIB, 'Application Scripts'), 'Scripts'], ['/Library/Application Support', 'Shared app data (all users)'], ['/Library/LaunchAgents', 'Background agent (all users)'],
      ['/Library/LaunchDaemons', 'Background service (all users)'], ['/Library/PrivilegedHelperTools', 'Helper tool (all users)'], ['/Library/Preferences', 'Settings (all users)']
    ];
    const found = [];
    for (const [dir, reason] of places) {
      let entries; try { entries = await fsp.readdir(dir, {withFileTypes: true}); } catch { continue; }
      for (const e of entries) {
        if (!matchName(e.name)) continue;
        const full = path.join(dir, e.name);
        // Never touch data that another installed app with the same identifier prefix owns.
        if ([...others].some(o => e.name.toLowerCase().startsWith(o))) continue;
        let size = 0; try { size = e.isDirectory() ? await dirSize(full, 3000) : (await fsp.stat(full)).size; } catch {}
        found.push({kind: e.isDirectory() ? 'folder' : 'file', path: full, reason, size});
      }
    }
    if (fs.existsSync(it.location)) found.unshift({kind: 'folder', path: it.location, reason: 'Install folder', install: true, size: it.size || 0});
    const items = found.map(x => ({...x, id: crypto.createHash('sha1').update(x.path).digest('hex').slice(0, 16)}));
    this.leftovers.set(id, new Map(items.map(x => [x.id, x])));
    // Reasons are kept in English and shown in the interface language; "install" marks the app bundle itself.
    return {program: it, items: items.map(x => ({...x, reason: td(x.reason)}))};
  }

  async removeLeftovers({programId, ids}) {
    const map = this.leftovers.get(programId);
    if (!map) throw new Error('Scan for leftovers again.');
    const failed = []; let removed = 0, bytes = 0;
    for (const x of (ids || []).map(i => map.get(i)).filter(Boolean)) {
      try { await this.moveToTrash(x.path); removed++; bytes += x.size || 0; } catch (e) { failed.push({path: x.path, error: e.message}); }
    }
    const appName = this.items.get(programId)?.name;
    this.store.log({kind: 'leftovers', key: appName ? 'activity.macLeftoversOf' : 'activity.macLeftoversOfApp', vars: {count: removed, name: appName}, count: removed, bytes});
    return {removed, failed, bytes, backup: null};
  }
}

module.exports = {MacPrograms, findApps, SYSTEM_ROOTS, mdlsBatch};
