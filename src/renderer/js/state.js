import {api, app, setApp, onEvent, t} from './lib.js';
import {onLanguageChange} from './i18n.js';

// Results shared between Overview (Smart Scan) and the individual tools.
export const shared = {
  cleaner: {rules: null, groups: null, selected: null, analysis: null, phase: 'idle', progress: null, lastClean: null},
  registry: {categories: null, selected: null, scan: null, phase: 'idle', checked: null},
  updates: {data: null, phase: 'idle'},
  startup: {items: null},
  listeners: new Set()
};
export const notify = () => { shared.listeners.forEach(fn => fn()); window.asterRenderNav?.(); };

// Rules and categories carry text from the main process in the interface language: drop them so they are
// fetched again, keeping the user's selection and results. Location names in the cleaner results are renamed too.
onLanguageChange(async () => {
  const c = shared.cleaner, r = shared.registry;
  c.rules = null; c.groups = null;
  r.categories = null;
  if (c.analysis) {
    const renamed = await api('cleaner.relabel', {analysis: c.analysis}).catch(() => null);
    if (renamed && c.analysis) { c.analysis.results = renamed.results; notify(); }
  }
  await loadRules().catch(() => {});
  await loadRegistryCategories().catch(() => {});
  notify();
});

onEvent(e => {
  if (e.channel === 'cleaner' && (shared.cleaner.phase === 'analyzing' || shared.cleaner.phase === 'cleaning')) {
    shared.cleaner.progress = e;
    shared.listeners.forEach(fn => fn());
  }
});

export async function loadRules() {
  const c = shared.cleaner;
  if (c.rules) return c;
  const {rules, groups} = await api('cleaner.rules');
  c.rules = rules; c.groups = groups;
  if (c.selected) return c;
  const saved = app.settings?.cleanerSelection;
  c.selected = new Set(Array.isArray(saved) ? saved.filter(id => rules.some(r => r.id === id)) : rules.filter(r => r.defaultOn).map(r => r.id));
  return c;
}

// Same numbers everywhere: what a click on "Clean" / "Fix" would actually act on.
export const cleanableBytes = () => { const a = shared.cleaner.analysis; return a ? a.results.filter(r => !r.running.length || app.settings?.closeAppsBeforeCleaning).reduce((n, r) => n + r.bytes, 0) : null; };
export const fixableCount = () => shared.registry.scan ? shared.registry.scan.items.filter(i => shared.registry.checked?.has(i.id)).length : null;

// A rule is usable when its app is installed and Aster has the access it needs (admin on Windows, Full Disk Access on macOS).
export const usableRule = r => r.installed && !(r.admin && !app.system?.admin) && !(r.fda && app.system?.fda === false);

export async function saveSelection() {
  const s = await api('settings.update', {cleanerSelection: [...shared.cleaner.selected]});
  setApp({settings: s});
  persistCleaner(); // a different selection makes the saved analysis outdated
}

// The last analysis is kept across restarts; null forgets it (after cleaning or a new selection).
export const persistCleaner = () => api('scans.save', {kind: 'cleaner', data: shared.cleaner.analysis || null}).catch(() => {});

// Brings back the analysis from before Aster was closed, once per session.
export async function restoreCleaner() {
  const c = await loadRules();
  if (c.triedLast || c.analysis || c.phase !== 'idle') return;
  c.triedLast = true;
  const saved = await api('scans.load', {kind: 'cleaner'}).catch(() => null);
  const a = saved?.data;
  if (!a || !Array.isArray(a.results) || c.analysis || c.phase !== 'idle') return;
  const known = new Set(c.rules.map(r => r.id));
  c.analysis = {...a, results: a.results.filter(r => known.has(r.id)), at: a.at || saved.savedAt};
  c.restored = true; c.phase = 'analyzed'; notify();
}

export async function analyzeCleaner() {
  const c = await loadRules();
  const ids = c.rules.filter(r => c.selected.has(r.id) && usableRule(r)).map(r => r.id);
  c.phase = 'analyzing'; c.analysis = null; c.lastClean = null; c.restored = false; c.progress = {index: 0, total: ids.length, label: t('cleaner.preparing')}; notify();
  try {
    c.analysis = {...await api('cleaner.analyze', {ids}), at: new Date().toISOString()};
    c.phase = 'analyzed';
    persistCleaner();
  } catch (e) { c.phase = 'idle'; throw e; } finally { notify(); }
  return c.analysis;
}

export async function loadRegistryCategories() {
  const r = shared.registry;
  if (r.categories) return r;
  r.categories = await api('registry.categories');
  if (r.selected) return r;
  const saved = app.settings?.registryCategories;
  r.selected = new Set(Array.isArray(saved) ? saved : r.categories.map(c => c.id));
  r.defaults = new Set(r.categories.filter(c => c.defaultOn).map(c => c.id));
  return r;
}

export async function scanRegistry() {
  const r = await loadRegistryCategories();
  r.phase = 'scanning'; notify();
  try {
    r.scan = await api('registry.scan', {categories: [...r.selected]});
    // Pre-tick only categories Aster recommends; "review" categories are shown but left for the user to decide.
    r.checked = new Set(r.scan.items.filter(i => !(i.admin && !app.system?.admin) && r.defaults.has(i.type)).map(i => i.id));
    r.phase = 'scanned';
  } catch (e) { r.phase = 'idle'; throw e; } finally { notify(); }
  return r.scan;
}

export async function checkUpdates() {
  const u = shared.updates;
  u.phase = 'checking'; notify();
  try { u.data = await api('updates.check'); u.phase = 'checked'; }
  catch (e) { u.phase = 'error'; u.error = e.message; throw e; } finally { notify(); }
  return u.data;
}
