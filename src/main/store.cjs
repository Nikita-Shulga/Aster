'use strict';
// Local JSON persistence: settings, activity log and registry backups.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {run, sys32} = require('./ps.cjs');
const {t, tIn, td, isLanguage} = require('./i18n.cjs');
const en = require('./locales/en.cjs');

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
  language: 'en',              // interface language: 'en' or 'ru'. Never picked from the OS locale.
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
      else if (k === 'language') next[k] = isLanguage(v) ? v : 'en';
      else if (typeof DEFAULT_SETTINGS[k] === 'boolean') next[k] = v === true;
      else if (typeof DEFAULT_SETTINGS[k] === 'number') next[k] = Number.isFinite(+v) && +v > 0 ? +v : DEFAULT_SETTINGS[k];
      else next[k] = v;
    }
    this.settings = next;
    writeJson(this.settingsFile, next);
    return this.getSettings();
  }

  // entry.key + entry.vars name the message (locales/en.cjs "activity.*"); the English title is kept for
  // older versions of Aster, and the list is shown in the interface language.
  log(entry) {
    const item = {id: crypto.randomUUID(), at: new Date().toISOString(), ...entry};
    if (item.key && !item.title) item.title = tIn('en', item.key, item.vars);
    this.activity.unshift(item);
    this.activity = this.activity.slice(0, 500);
    writeJson(this.activityFile, this.activity);
    return item;
  }
  getActivity() {
    return this.activity.map(a => ({...a, title: activityTitle(a), backupExists: a.backup ? fs.existsSync(path.join(this.backupDir, a.backup)) : false}));
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
    if (typeof name !== 'string' || !/^[\w.-]+\.reg$/.test(name)) throw new Error(t('store.unknownBackup'));
    return path.join(this.backupDir, name);
  }
  async restoreBackup(name) {
    const file = this.backupPath(name);
    await fsp.access(file);
    try { await run(sys32('reg.exe'), ['import', file, '/reg:64'], {timeout: 60000}); }
    catch (e) {
      const msg = String(e.stderr || '').trim();
      throw new Error(/access/i.test(msg) ? t('store.restoreDenied') : (msg || t('store.restoreFailed')));
    }
    return {ok: true};
  }
}

// Activity titles in the interface language. Names inside them (tweak titles, "On"/"Off"…) go through the
// phrasebook; program and file names stay as they are. Entries written before entries had keys are recognised
// by matching their English title against the activity messages.
const translateVars = vars => Object.fromEntries(Object.entries(vars || {}).map(([k, v]) => [k, typeof v === 'string' ? td(v) : v]));
let patterns = null;
function legacyVars(title) {
  if (!patterns) {
    patterns = [];
    const esc = s => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
    for (const key of Object.keys(en).filter(k => k.startsWith('activity.'))) {
      for (const form of typeof en[key] === 'object' ? Object.values(en[key]) : [en[key]]) {
        const names = [];
        const re = new RegExp('^' + esc(form).replace(/\{(\w+)\}/g, (m, n) => { names.push(n); return '(.+?)'; }) + '$');
        patterns.push({key, re, names, fixed: form.replace(/\{\w+\}/g, '').length});
      }
    }
    // Most specific first: the more fixed text, the better ("{title}: {before} → {after}" comes last).
    patterns.sort((a, b) => b.fixed - a.fixed);
  }
  for (const {key, re, names} of patterns) {
    const m = re.exec(title);
    if (!m) continue;
    const vars = {};
    names.forEach((n, i) => { vars[n] = n === 'count' && /^[\d,.\s]+$/.test(m[i + 1]) ? Number(m[i + 1].replace(/[^\d]/g, '')) : m[i + 1]; });
    return {key, vars};
  }
  return null;
}
function activityTitle(a) {
  const named = a.key ? {key: a.key, vars: a.vars} : typeof a.title === 'string' ? legacyVars(a.title) : null;
  return named && en[named.key] ? t(named.key, translateVars(named.vars)) : a.title;
}

module.exports = {Store, DEFAULT_SETTINGS, activityTitle};
