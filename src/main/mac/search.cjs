'use strict';
// Spotlight doctor: the macOS side of "Fix search". Spotlight finds apps and files only while indexing is on for the
// startup disk and the index answers; apps it never imported (copied in while indexing was off, or on another disk)
// don't show up. This checks those pieces, lists apps Spotlight can't find and asks it to import them.
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {sh, sudo} = require('./sh.cjs');

const APP_TYPE = "kMDItemContentType == 'com.apple.application-bundle'";
const FOLDERS = () => ['/Applications', path.join(os.homedir(), 'Applications')];

// .app bundles in the Applications folders and one level of subfolders (e.g. /Applications/Utilities, vendor folders).
async function listApps() {
  const out = [];
  for (const root of FOLDERS()) {
    let entries;
    try { entries = await fsp.readdir(root, {withFileTypes: true}); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const full = path.join(root, e.name);
      if (e.name.endsWith('.app')) { out.push(full); continue; }
      if (!e.isDirectory()) continue;
      const inner = await fsp.readdir(full, {withFileTypes: true}).catch(() => []);
      for (const i of inner) if (i.name.endsWith('.app') && !i.isSymbolicLink()) out.push(path.join(full, i.name));
    }
  }
  return out;
}

class MacSearch {
  constructor({store, getIcon}) { this.store = store; this.getIcon = getIcon; this.found = new Map(); }

  async check() {
    // "Indexing enabled." / "Indexing disabled." / "Error: …" for the startup disk.
    const status = (await sh('/usr/bin/mdutil', ['-s', '/'], {timeout: 20000}).catch(e => e.stdout || e.message || '')).toLowerCase();
    const enabled = /indexing enabled/.test(status);
    // Apple's own apps are always there: if Spotlight can't list them, the index is broken.
    const system = (await sh('/usr/bin/mdfind', ['-onlyin', '/System/Applications', APP_TYPE], {timeout: 30000}).catch(() => '')).split('\n').filter(Boolean);
    const indexed = new Set();
    for (const dir of FOLDERS()) {
      if (!fs.existsSync(dir)) continue;
      const r = await sh('/usr/bin/mdfind', ['-onlyin', dir, APP_TYPE], {timeout: 30000}).catch(() => '');
      for (const p of r.split('\n').filter(Boolean)) indexed.add(p.normalize('NFC'));
    }
    const all = await listApps();
    const missing = enabled && system.length ? all.filter(p => !indexed.has(p.normalize('NFC'))) : [];
    const apps = await Promise.all(missing.slice(0, 80).map(async exe => ({
      id: crypto.createHash('sha1').update(exe).digest('hex').slice(0, 16),
      name: path.basename(exe, '.app'), exe, folder: path.dirname(exe), drive: null, likely: true,
      icon: await this.getIcon(exe).catch(() => null)
    })));
    this.found = new Map(apps.map(a => [a.id, a]));
    return {
      platform: 'darwin', admin: false,
      service: {status: enabled ? 'Running' : 'Stopped', disabled: !enabled, ok: enabled},
      index: {ok: system.length > 0, error: null},
      startMenu: {ok: true, shortcuts: all.length},
      ui: true, apps, added: [], checkedAt: new Date().toISOString()
    };
  }

  // Asks Spotlight to import the chosen apps now; it needs no password and changes nothing else.
  async addApps({ids}) {
    const apps = (Array.isArray(ids) ? ids : []).map(id => this.found.get(id)).filter(a => a && fs.existsSync(a.exe));
    if (!apps.length) throw new Error('Check search again: the list is out of date.');
    let n = 0;
    for (const a of apps) { await sh('/usr/bin/mdimport', [a.exe], {timeout: 60000}).then(() => { n++; this.found.delete(a.id); }).catch(() => {}); }
    if (n) this.store.log({kind: 'tool', key: 'activity.spotlightImported', vars: {count: n}, count: n});
    return {added: n};
  }

  async removeAdded() { return {removed: 0}; }

  async fix({id}) {
    switch (id) {
      // The Spotlight window runs as the user and macOS starts it again on the next ⌘Space.
      case 'restart': await sh('/usr/bin/killall', ['Spotlight']).catch(() => {}); this.store.log({kind: 'tool', key: 'activity.searchRestarted'}); return {ok: true};
      case 'service': await sudo('/usr/bin/mdutil -i on /'); this.store.log({kind: 'tool', key: 'activity.spotlightOn'}); return {ok: true};
      case 'rebuild': await sudo('/usr/bin/mdutil -E /'); this.store.log({kind: 'tool', key: 'activity.spotlight'}); return {ok: true};
      default: throw new Error('Unknown action');
    }
  }
}

module.exports = {MacSearch, listApps};
