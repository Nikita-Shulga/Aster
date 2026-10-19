'use strict';
// macOS updates: Homebrew formulae & casks, Mac App Store apps (via `mas`, when installed)
// and macOS itself (listed by softwareupdate; installing opens System Settings).
const fs = require('node:fs');
const {sh, shStream} = require('./sh.cjs');
const {td} = require('../i18n.cjs');

const BREW = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find(p => fs.existsSync(p)) || null;
const MAS = ['/opt/homebrew/bin/mas', '/usr/local/bin/mas'].find(p => fs.existsSync(p)) || null;
const ENV = {HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_ENV_HINTS: '1', HOMEBREW_NO_INSTALL_CLEANUP: '1'};

function parseSoftwareUpdate(out) {
  const items = [];
  for (const m of out.matchAll(/\*\s*Label:\s*(.+)\n\s*Title:\s*([^,\n]+),\s*Version:\s*([^,\n]+)/g)) {
    items.push({id: `macos:${m[1].trim()}`, name: m[2].trim(), installed: 'Current', available: m[3].trim(), kind: 'macos'});
  }
  return items;
}
// The cached list keeps the English "Current"; it is shown in the interface language.
const localize = cache => cache && {...cache, items: cache.items.map(r => r.kind === 'macos' && r.installed === 'Current' ? {...r, installed: td(r.installed)} : r)};
function parseMas(out) {
  return out.split('\n').map(l => l.match(/^\s*(\d+)\s+(.+?)\s+\((.+?)\s*->\s*(.+?)\)/)).filter(Boolean)
    .map(m => ({id: `mas:${m[1]}`, name: m[2].trim(), installed: m[3], available: m[4], kind: 'appstore'}));
}

class MacUpdates {
  constructor({store}) { this.store = store; this.cache = null; this.busy = false; }

  available() { return {available: true, brew: !!BREW, mas: !!MAS, provider: 'mac'}; }

  async check() {
    const tasks = [];
    if (BREW) tasks.push((async () => {
      await sh(BREW, ['update', '--quiet'], {timeout: 180000, env: {HOMEBREW_NO_ENV_HINTS: '1'}}).catch(() => {});
      const j = JSON.parse(await sh(BREW, ['outdated', '--json=v2'], {timeout: 120000, env: ENV}));
      return [
        ...(j.formulae || []).map(f => ({id: `formula:${f.name}`, name: f.name, installed: (f.installed_versions || []).slice(-1)[0] || '?', available: f.current_version, kind: 'formula'})),
        ...(j.casks || []).map(c => ({id: `cask:${c.name}`, name: c.name, installed: (c.installed_versions || []).slice(-1)[0] || '?', available: c.current_version, kind: 'cask'}))
      ];
    })());
    if (MAS) tasks.push(sh(MAS, ['outdated'], {timeout: 120000}).then(parseMas));
    tasks.push(sh('/usr/sbin/softwareupdate', ['--list'], {timeout: 180000}).then(parseSoftwareUpdate).catch(e => parseSoftwareUpdate(String(e.stdout || ''))));
    const results = await Promise.allSettled(tasks);
    const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    this.cache = {items, checkedAt: new Date().toISOString(), brew: !!BREW};
    return localize(this.cache);
  }

  last() { return localize(this.cache); }

  async update({id, onLine}) {
    const row = this.cache?.items.find(r => r.id === id);
    if (!row) throw new Error('Check for updates again.');
    if (row.kind === 'macos') {
      await sh('/usr/bin/open', ['x-apple.systempreferences:com.apple.Software-Update-Settings.extension']);
      return {ok: true, opened: true, message: td('macOS updates install from System Settings → Software Update.')};
    }
    if (this.busy) throw new Error('Another update is running.');
    this.busy = true;
    try {
      const name = id.split(':')[1];
      if (!/^[\w@.+-]{1,120}$/.test(name)) throw new Error('Invalid package');
      const [file, args] = row.kind === 'appstore' ? [MAS, ['upgrade', name]] : [BREW, ['upgrade', ...(row.kind === 'cask' ? ['--cask'] : []), name]];
      const {code, out} = await shStream(file, args, {onLine, env: ENV});
      const ok = code === 0;
      if (ok) { this.cache.items = this.cache.items.filter(r => r.id !== id); this.store.log({kind: 'update', key: 'activity.updated', vars: {name: row.name, version: row.available}}); }
      return {ok, code, message: ok ? null : out.trim().split('\n').slice(-2).join(' ').slice(0, 300)};
    } finally { this.busy = false; }
  }
}

module.exports = {MacUpdates, parseSoftwareUpdate, parseMas};
