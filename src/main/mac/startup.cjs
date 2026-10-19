'use strict';
// macOS startup items: login items (System Events), launch agents (per user and all users)
// and launch daemons. Agents are switched with launchctl enable/disable — the same override
// macOS uses when you toggle items in System Settings → Login Items.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {sh, osa, sudo, q, asString, plist, mapLimit, LIB, uid, volumeOf} = require('./sh.cjs');
const {td} = require('../i18n.cjs');

const DIRS = [
  {dir: path.join(LIB, 'LaunchAgents'), type: 'agent', scope: 'user', source: 'Launch agent · Only me'},
  {dir: '/Library/LaunchAgents', type: 'agent', scope: 'machine', source: 'Launch agent · All users'},
  {dir: '/Library/LaunchDaemons', type: 'daemon', scope: 'machine', source: 'Background service (daemon)'}
];

async function disabledMap(domain) {
  try {
    const out = await sh('/bin/launchctl', ['print-disabled', domain], {timeout: 10000});
    const map = new Map();
    for (const m of out.matchAll(/"([^"]+)"\s*=>\s*(disabled|enabled|true|false)/g)) map.set(m[1], m[2] === 'disabled' || m[2] === 'true');
    return map;
  } catch { return new Map(); }
}

const appOf = p => { const m = /^(.*?\.app)(\/|$)/.exec(p || ''); return m ? m[1] : null; };

class MacStartup {
  constructor({store, getIcon, trash}) { this.store = store; this.getIcon = getIcon; this.trash = trash; this.items = new Map(); }

  async loginItems() {
    // Asking System Events may show a one-time macOS permission prompt (Automation).
    const script = 'set out to ""\ntell application "System Events"\nrepeat with li in login items\nset out to out & (name of li) & tab & (path of li) & tab & (hidden of li) & linefeed\nend repeat\nend tell\nreturn out';
    try {
      const out = await osa(script, {timeout: 20000});
      return out.split('\n').filter(Boolean).map(l => { const [name, p] = l.split('\t'); return {name, path: p}; });
    } catch { return null; }
  }

  async list() {
    const [userDisabled, sysDisabled] = await Promise.all([disabledMap(`gui/${uid()}`), disabledMap('system')]);
    const raw = [];
    for (const d of DIRS) {
      let names = []; try { names = (await fsp.readdir(d.dir)).filter(n => n.endsWith('.plist')); } catch {}
      const parsed = await mapLimit(names, 8, n => plist(path.join(d.dir, n)));
      names.forEach((n, i) => {
        const p = parsed[i] || {};
        const label = p.Label || n.replace(/\.plist$/, '');
        if (/^com\.apple\./.test(label)) return;
        const args = Array.isArray(p.ProgramArguments) ? p.ProgramArguments : [];
        const file = p.Program || args[0] || null;
        const overrides = d.type === 'daemon' ? sysDisabled : userDisabled;
        const disabled = overrides.has(label) ? overrides.get(label) : p.Disabled === true || p.Disabled === 'true';
        raw.push({type: d.type, name: label, label, command: [file, ...args.slice(p.Program ? 0 : 1)].filter(Boolean).join(' '), file, location: path.join(d.dir, n), scope: d.scope, source: d.source,
          enabled: !disabled, canToggle: true, runAtLoad: p.RunAtLoad === true || p.RunAtLoad === 'true', keepAlive: !!p.KeepAlive});
      });
    }
    const logins = await this.loginItems();
    for (const li of logins || []) raw.push({type: 'login', name: li.name, command: li.path, file: li.path, location: li.path, scope: 'user', source: 'Login item', enabled: true, canToggle: false});
    this.items.clear();
    const items = raw.map(r => {
      const id = crypto.createHash('sha1').update([r.type, r.location, r.name].join('|')).digest('hex').slice(0, 16);
      const app = appOf(r.file);
      const exists = !!r.file && fs.existsSync(r.file);
      const publisher = app ? path.basename(app, '.app') : (r.label?.split('.').length > 2 ? r.label.split('.')[1].replace(/^\w/, c => c.toUpperCase()) : null);
      const item = {id, ...r, exists, publisher, drive: volumeOf(r.file), admin: r.type === 'daemon', iconFile: app || r.file};
      this.items.set(id, item);
      return item;
    });
    // "source" stays English in the cached items and is shown in the interface language.
    return {items: items.map(i => ({...i, source: td(i.source)})), loginItemsUnavailable: logins === null};
  }

  async icons({ids}) {
    const out = {};
    await Promise.all((ids || []).slice(0, 200).map(async id => { const it = this.items.get(id); if (it?.iconFile && fs.existsSync(it.iconFile)) out[id] = await this.getIcon(it.iconFile).catch(() => null); }));
    return out;
  }

  async toggle({id, enabled}) {
    const it = this.items.get(id);
    if (!it || !it.canToggle) throw new Error('This item can’t be switched; remove it instead.');
    if (!/^[\w.@-]{1,200}$/.test(it.label)) throw new Error('Unsupported item label.');
    if (it.type === 'daemon') {
      await sudo(enabled ? `/bin/launchctl enable system/${it.label} && /bin/launchctl bootstrap system ${q(it.location)} 2>/dev/null; true` : `/bin/launchctl disable system/${it.label}; /bin/launchctl bootout system/${it.label} 2>/dev/null; true`);
    } else {
      const domain = `gui/${uid()}`;
      await sh('/bin/launchctl', [enabled ? 'enable' : 'disable', `${domain}/${it.label}`]);
      if (enabled) await sh('/bin/launchctl', ['bootstrap', domain, it.location]).catch(() => {});
      else await sh('/bin/launchctl', ['bootout', `${domain}/${it.label}`]).catch(() => {});
    }
    it.enabled = !!enabled;
    this.store.log({kind: 'startup', key: enabled ? 'activity.startupEnabled' : 'activity.startupDisabled', vars: {name: it.name}});
    return {ok: true};
  }

  async remove({id}) {
    const it = this.items.get(id);
    if (!it) throw new Error('Refresh the list and try again.');
    if (it.type === 'login') {
      await osa(`tell application "System Events" to delete login item ${asString(it.name)}`, {timeout: 20000});
    } else {
      if (it.type === 'agent' && it.scope === 'user') await sh('/bin/launchctl', ['bootout', `gui/${uid()}/${it.label}`]).catch(() => {});
      try { await this.trash(it.location); }
      catch { await osa(`tell application "Finder" to delete POSIX file ${asString(it.location)}`, {timeout: 120000}); }
    }
    this.items.delete(id);
    this.store.log({kind: 'startup', key: 'activity.startupRemoved', vars: {name: it.name}});
    return {ok: true, backup: null};
  }

  async add({command}) {
    const appPath = String(command || '').replace(/^"|"$/g, '');
    if (!appPath.startsWith('/')) throw new Error('Choose an app.');
    await osa(`tell application "System Events" to make login item at end with properties {path:${asString(appPath)}, hidden:false}`, {timeout: 20000});
    this.store.log({kind: 'startup', key: 'activity.loginItemAdded', vars: {name: path.basename(appPath, '.app')}});
    return {ok: true};
  }

  fileOf(id) { const it = this.items.get(id); return it?.type === 'login' ? it.file : it?.location; }
}

module.exports = {MacStartup};
