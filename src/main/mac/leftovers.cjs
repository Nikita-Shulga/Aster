'use strict';
// macOS has no registry. Its equivalent clutter is what removed apps leave in ~/Library:
// preference files, data folders, caches, sandbox containers, saved window state and launch agents.
// Aster finds items whose app is no longer installed and moves them to the Trash (recoverable).
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {osa, asString, plist, mapLimit, LIB} = require('./sh.cjs');
const {findApps, SYSTEM_ROOTS} = require('./programs.cjs');
const {dirSize} = require('../programs.cjs');
const {td} = require('../i18n.cjs');

const CATEGORIES = [
  {id: 'prefs', name: 'Settings of removed apps', verdict: 'safe', defaultOn: true, description: 'Preference files (.plist) of apps that are no longer installed.',
    contains: 'Small files in ~/Library/Preferences where apps store their settings. These belong to apps that are no longer on this Mac.',
    ifDeleted: 'If you reinstall one of these apps later, it starts with default settings.', advice: 'Safe to clean. Files go to the Trash, so you can put them back.'},
  {id: 'caches', name: 'Caches of removed apps', verdict: 'safe', defaultOn: true, description: 'Cache folders left behind by uninstalled apps.',
    contains: 'Cached data in ~/Library/Caches from apps that were removed.', ifDeleted: 'Nothing — the apps are gone.', advice: 'Safe to clean.'},
  {id: 'savedstate', name: 'Saved window state', verdict: 'safe', defaultOn: true, description: 'Window positions saved by apps that were removed.',
    contains: 'Information macOS keeps to reopen an app’s windows where you left them, for apps that are no longer installed.', ifDeleted: 'Nothing.', advice: 'Safe to clean.'},
  {id: 'agents', name: 'Broken background agents', verdict: 'safe', defaultOn: true, description: 'Launch agents pointing to programs that no longer exist.',
    contains: 'Instructions in ~/Library/LaunchAgents to start a helper program at login, where the program has been deleted.', ifDeleted: 'macOS stops trying to start a missing program at every login.', advice: 'Worth fixing.'},
  {id: 'logs', name: 'Logs of removed apps', verdict: 'safe', defaultOn: true, description: 'Log folders of apps that are no longer installed.',
    contains: 'Text logs in ~/Library/Logs written by apps that were removed.', ifDeleted: 'Nothing.', advice: 'Safe to clean.'},
  {id: 'support', name: 'App data of removed apps', verdict: 'review', defaultOn: false, description: 'Folders in Application Support that no installed app uses.',
    contains: 'Folders in ~/Library/Application Support whose app seems to be gone. They can contain documents, libraries, game saves or databases the app stored.',
    ifDeleted: 'If the app comes back, its data (and possibly saves or projects stored inside) is gone. Some folders belong to command-line tools rather than apps.', advice: 'Review the list — only remove folders you recognise as belonging to apps you deleted.'},
  {id: 'containers', name: 'Sandbox containers of removed apps', verdict: 'review', defaultOn: false, description: 'Data containers of App Store apps that were deleted.',
    contains: 'Each App Store app keeps its data in a container in ~/Library/Containers. These belong to apps that are no longer installed.',
    ifDeleted: 'Documents those apps kept inside their container are removed too.', advice: 'Review first; usually safe for apps you deleted on purpose.'}
];

// Folders and files that belong to macOS itself or are shared, never "leftovers".
const PROTECTED = /(^|\.)com\.apple\.|^(apple|\.globalpreferences|loginwindow|pbs|knowledge|cloudkit|addressbook|callhistory|crashreporter|dock|icloud|mobilesync|filesystem|fileprovider|syncservices|ubiquity|cloud|keychains?|accounts|spotlight|siri|quicklook|familycircle|org\.cups\.|com\.microsoft\.office|microsoft|google|mozilla|homebrew|com\.docker|node|npm|zsh|vscode|code$)/i;

// macOS daemons (contactsd, tipsd, Animoji…) keep folders in ~/Library named after themselves, not
// com.apple.*. Collect the names of components macOS ships so those folders are never offered.
const SYSTEM_EXTRA = ['animoji', 'memoji', 'sesstorage', 'assistant', 'baseband', 'privacypreservingmeasurement', 'sync', 'coresimulator', 'callhistorytransactions', 'callhistorydb'];
let systemNames = null;
function macosComponentNames() {
  if (systemNames) return systemNames;
  const names = new Set(SYSTEM_EXTRA);
  const ls = d => { try { return fs.readdirSync(d); } catch { return []; } };
  const add = n => names.add(n.toLowerCase().replace(/\.(app|framework|xpc|bundle|plist|appex)$/, ''));
  for (const d of ['/usr/libexec', '/usr/sbin', '/usr/bin', '/System/Library/CoreServices', '/System/Library/PrivateFrameworks', '/System/Library/Frameworks', '/System/Applications', '/System/Library/Services']) for (const n of ls(d)) add(n);
  for (const d of ['/System/Library/LaunchAgents', '/System/Library/LaunchDaemons']) for (const n of ls(d)) { const l = n.replace(/\.plist$/, ''); add(l); add(l.split('.').pop()); }
  for (const root of ['/System/Library/PrivateFrameworks', '/System/Library/Frameworks']) for (const f of ls(root)) for (const sub of ['Support', 'XPCServices', 'Versions/A/Support', 'Versions/A/XPCServices']) for (const n of ls(path.join(root, f, sub))) if (!n.includes('.') || /\.(app|xpc)$/.test(n)) add(n);
  return (systemNames = names);
}

class MacLeftovers {
  constructor({store, trash}) { this.store = store; this.trash = trash; this.issues = new Map(); }
  // Category text is written in English above and shown in the interface language.
  categories() { return CATEGORIES.map(c => ({...c, name: td(c.name), description: td(c.description), contains: td(c.contains), ifDeleted: td(c.ifDeleted), advice: td(c.advice)})); }

  async installed() {
    const apps = await findApps(['/Applications', '/Applications/Utilities', path.join(require('node:os').homedir(), 'Applications'), ...SYSTEM_ROOTS, '/System/Library/CoreServices'], 3);
    const infos = await mapLimit(apps, 8, p => plist(path.join(p, 'Contents', 'Info.plist')));
    const ids = new Set(), names = new Set(), vendors = new Set(), brands = new Set(), words = new Set();
    apps.forEach((p, i) => {
      const id = (infos[i]?.CFBundleIdentifier || '').toLowerCase();
      if (id) { ids.add(id); const parts = id.split('.'); if (parts.length > 2) { vendors.add(parts.slice(0, 2).join('.')); if (parts[1].length > 3) { names.add(parts[1]); brands.add(parts[1]); } } }
      names.add(path.basename(p, '.app').toLowerCase());
      for (const w of path.basename(p, '.app').toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 3) words.add(w);
      if (infos[i]?.CFBundleName) names.add(String(infos[i].CFBundleName).toLowerCase());
    });
    return {ids, names, vendors, brands, words};
  }

  async scan({categories}) {
    const want = new Set(Array.isArray(categories) && categories.length ? categories : CATEGORIES.map(c => c.id));
    const inst = await this.installed();
    const system = macosComponentNames();
    // An identifier counts as installed if an app has it, or an app from the same vendor exists (helpers, agents).
    const known = raw => {
      const n = raw.toLowerCase().replace(/\.(plist|savedstate)$/, '');
      if (PROTECTED.test(n) || system.has(n)) return true;
      if (inst.ids.has(n) || inst.names.has(n)) return true;
      // "ZoomUpdater" or "ZoomPhone" next to an installed us.zoom.xos belong to that vendor.
      if (!n.includes('.') && [...inst.brands].some(b => n.startsWith(b))) return true;
      // "cura" or "Ultimaker B.V." next to "UltiMaker Cura.app", "Epic" next to "Epic Games Launcher.app".
      if (!/^[a-z]+\.[a-z0-9-]+\./.test(n) && n.split(/[^a-z0-9]+/).some(w => inst.words.has(w))) return true;
      if ([...inst.ids].some(id => n.startsWith(id + '.') || id.startsWith(n + '.'))) return true;
      const parts = n.split('.');
      // org.amneziavpn.AmneziaVPN belongs to an installed AmneziaVPN.app even if its bundle id differs.
      if (parts.length > 2 && parts[parts.length - 1].length > 3 && inst.names.has(parts[parts.length - 1])) return true;
      // com.dropbox.DropboxUpdater belongs to Dropbox.app (com.getdropbox.dropbox).
      if (parts.length > 2 && parts[1].length > 3 && (inst.names.has(parts[1]) || inst.words.has(parts[1]))) return true;
      if (parts.length > 2 && inst.vendors.has(parts.slice(0, 2).join('.'))) return true;
      return parts.length < 3 && !/\s/.test(n) && n.length < 3;
    };
    const items = [];
    const add = (type, full, title, extra = {}) => items.push({type, path: full, value: null, action: 'trash', title, target: null, admin: false, risk: 'low', ...extra});
    const list = async dir => { try { return await fsp.readdir(dir, {withFileTypes: true}); } catch { return []; } };

    if (want.has('prefs')) for (const e of await list(path.join(LIB, 'Preferences'))) {
      if (!e.isFile() || !e.name.endsWith('.plist')) continue;
      const n = e.name.replace(/\.plist$/, '');
      if (n.split('.').length >= 3 && !known(n)) add('prefs', path.join(LIB, 'Preferences', e.name), n);
    }
    for (const [type, dir, needsDot] of [['caches', path.join(LIB, 'Caches'), true], ['savedstate', path.join(LIB, 'Saved Application State'), true], ['containers', path.join(LIB, 'Containers'), true], ['support', path.join(LIB, 'Application Support'), false], ['logs', path.join(LIB, 'Logs'), false]]) {
      if (!want.has(type)) continue;
      for (const e of await list(dir)) {
        if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'DiagnosticReports') continue;
        const n = e.name.replace(/\.savedState$/i, '');
        if (needsDot && n.split('.').length < 3) continue;
        if (known(n)) continue;
        add(type, path.join(dir, e.name), n);
      }
    }
    if (want.has('agents')) for (const e of await list(path.join(LIB, 'LaunchAgents'))) {
      if (!e.name.endsWith('.plist')) continue;
      const full = path.join(LIB, 'LaunchAgents', e.name);
      const p = await plist(full).catch(() => ({}));
      const exe = p.Program || (Array.isArray(p.ProgramArguments) ? p.ProgramArguments[0] : null);
      if (exe && exe.startsWith('/') && !fs.existsSync(exe)) add('agents', full, p.Label || e.name, {target: exe, risk: 'medium'});
    }
    await mapLimit(items, 6, async it => { try { const st = await fsp.stat(it.path); it.size = st.isDirectory() ? await dirSize(it.path, 2000) : st.size; } catch { it.size = 0; } });
    this.issues.clear();
    const out = items.map(i => { const id = crypto.createHash('sha1').update(i.type + i.path).digest('hex').slice(0, 16); const item = {id, ...i}; this.issues.set(id, item); return item; });
    return {items: out, scannedAt: new Date().toISOString()};
  }

  async fix({ids}) {
    const items = (ids || []).map(id => this.issues.get(id)).filter(Boolean);
    if (!items.length) throw new Error('Scan again before cleaning.');
    const fixed = [], failed = [];
    for (const it of items) {
      try {
        try { await this.trash(it.path); } catch { await osa(`tell application "Finder" to delete POSIX file ${asString(it.path)}`, {timeout: 60000}); }
        fixed.push(it.id); this.issues.delete(it.id);
      } catch (e) { failed.push({id: it.id, error: e.message}); }
    }
    this.store.log({kind: 'registry', key: 'activity.macLeftovers', vars: {count: fixed.length}, count: fixed.length, bytes: items.filter(i => fixed.includes(i.id)).reduce((n, i) => n + (i.size || 0), 0)});
    return {fixed, failed, backup: null};
  }

  unsupported() { throw new Error('The registry editor is only available on Windows.'); }
  list() { return this.unsupported(); }
  edit() { return this.unsupported(); }
  search() { return this.unsupported(); }
  exportKey() { return this.unsupported(); }
  importFile() { return this.unsupported(); }
}

module.exports = {MacLeftovers};
