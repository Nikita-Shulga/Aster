'use strict';
// Local JSON persistence: settings, activity log and registry backups.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {run, sys32} = require('./ps.cjs');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

const DEFAULT_SETTINGS = {
  theme: 'system',
  closeAppsBeforeCleaning: false,
  confirmBeforeCleaning: true,
  exclusions: [],
  cleanerSelection: null,      // null = use rule defaults
  registryCategories: null,    // null = all safe categories
  largeFileMinMB: 100,
  duplicateMinKB: 1024,
  sidebarCollapsed: false
};

class Store {
  constructor(root) {
    this.root = root;
    this.backupDir = path.join(root, 'backups');
    fs.mkdirSync(this.backupDir, {recursive: true});
    this.settingsFile = path.join(root, 'settings.json');
    this.activityFile = path.join(root, 'activity.json');
    this.settings = {...DEFAULT_SETTINGS, ...readJson(this.settingsFile, {})};
    this.activity = readJson(this.activityFile, []);
    if (!Array.isArray(this.activity)) this.activity = [];
  }

  getSettings() { return structuredClone(this.settings); }
  updateSettings(patch) {
    const next = {...this.settings};
    for (const [k, v] of Object.entries(patch || {})) {
      if (!(k in DEFAULT_SETTINGS)) continue;
      if (k === 'exclusions') next[k] = Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.length < 1024).slice(0, 200) : [];
      else if (k === 'theme') next[k] = ['system', 'light', 'dark'].includes(v) ? v : 'system';
      else if (typeof DEFAULT_SETTINGS[k] === 'boolean') next[k] = v === true;
      else if (typeof DEFAULT_SETTINGS[k] === 'number') next[k] = Number.isFinite(+v) && +v > 0 ? +v : DEFAULT_SETTINGS[k];
      else next[k] = v;
    }
    this.settings = next;
    writeJson(this.settingsFile, next);
    return this.getSettings();
  }

  log(entry) {
    const item = {id: crypto.randomUUID(), at: new Date().toISOString(), ...entry};
    this.activity.unshift(item);
    this.activity = this.activity.slice(0, 500);
    writeJson(this.activityFile, this.activity);
    return item;
  }
  getActivity() {
    return this.activity.map(a => ({...a, backupExists: a.backup ? fs.existsSync(path.join(this.backupDir, a.backup)) : false}));
  }
  stats() {
    const cleaned = this.activity.filter(a => a.kind === 'clean').reduce((n, a) => n + (a.bytes || 0), 0);
    const fixed = this.activity.filter(a => a.kind === 'registry').reduce((n, a) => n + (a.count || 0), 0);
    const lastClean = this.activity.find(a => a.kind === 'clean')?.at || null;
    return {cleaned, fixed, lastClean};
  }

  newBackupFile(prefix) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `${prefix}-${stamp}-${crypto.randomBytes(3).toString('hex')}.reg`;
    return {name, file: path.join(this.backupDir, name)};
  }
  backupPath(name) {
    if (typeof name !== 'string' || !/^[\w.-]+\.reg$/.test(name)) throw new Error('Unknown backup');
    return path.join(this.backupDir, name);
  }
  async restoreBackup(name) {
    const file = this.backupPath(name);
    await fsp.access(file);
    try { await run(sys32('reg.exe'), ['import', file, '/reg:64'], {timeout: 60000}); }
    catch (e) {
      const msg = String(e.stderr || '').trim();
      throw new Error(/access/i.test(msg) ? 'Access denied. Restart Aster as administrator to restore system keys.' : (msg || 'The backup could not be imported.'));
    }
    return {ok: true};
  }
}

module.exports = {Store, DEFAULT_SETTINGS};
