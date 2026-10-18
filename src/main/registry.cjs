'use strict';
const crypto = require('node:crypto');
const {psJson, arr, run, sys32} = require('./ps.cjs');
const S = require('./registry-ps.cjs');

// verdict: safe = fix without worry · review = harmless to keep, small chance of side effects when removed
const CATEGORIES = [
  {id: 'uninstall', name: 'Broken uninstall entries', verdict: 'safe', defaultOn: true,
    description: 'Programs listed as installed whose uninstaller and folder are gone.',
    contains: 'Entries in Settings → Installed apps for programs that were deleted without uninstalling. Clicking "Uninstall" on them only shows an error.',
    ifDeleted: 'The ghost entry disappears from the apps list. Nothing else changes.',
    advice: 'Worth fixing. Programs on a drive that is currently unplugged are skipped automatically, so they are not flagged.'},
  {id: 'startup', name: 'Invalid startup entries', verdict: 'safe', defaultOn: true,
    description: 'Programs set to run at sign-in that no longer exist.',
    contains: 'Instructions to start a program at sign-in, where the program file no longer exists.',
    ifDeleted: 'Windows stops trying to start a missing program — no more error pop-ups at sign-in.',
    advice: 'Worth fixing.'},
  {id: 'apppaths', name: 'Invalid application paths', verdict: 'safe', defaultOn: true,
    description: 'App shortcuts registered with Windows that point to missing files.',
    contains: 'Registrations that let you start apps by name (Win+R → "chrome") for apps that were removed.',
    ifDeleted: 'Typing the removed app’s name in Run no longer gives an error.',
    advice: 'Safe housekeeping.'},
  {id: 'shareddlls', name: 'Missing shared DLLs', verdict: 'safe', defaultOn: true,
    description: 'Shared library counters for files that were removed.',
    contains: 'Counters installers use to know how many programs share a library file — for files that no longer exist.',
    ifDeleted: 'Nothing visible; just tidier records.',
    advice: 'Safe, but gives no noticeable benefit. Fix or skip as you like.'},
  {id: 'applications', name: 'Obsolete "Open with" apps', verdict: 'safe', defaultOn: true,
    description: 'Applications offered in "Open with" that were uninstalled.',
    contains: 'Entries for removed programs that still appear in the "Open with" menu.',
    ifDeleted: 'Removed programs stop appearing in "Open with".',
    advice: 'Worth fixing.'},
  {id: 'extensions', name: 'Unused file extensions', verdict: 'review', defaultOn: false,
    description: 'File types linked to programs that are not registered anymore.',
    contains: 'File types (like .xyz) that point to a program type Windows no longer knows.',
    ifDeleted: 'Those file types become "unknown" — which they effectively already are. Rarely, an app re-creates the link the next time it starts.',
    advice: 'Optional. Harmless either way; not selected by default.'},
  {id: 'com', name: 'Broken COM registrations', verdict: 'review', defaultOn: false,
    description: 'Per-user ActiveX/COM components whose files were removed.',
    contains: 'Registrations of program components (plug-ins, shell extensions) whose files are gone — usually from uninstalled apps.',
    ifDeleted: 'Usually nothing. In rare cases a program that installs components on demand has to re-register them.',
    advice: 'Only fix if a program shows "class not registered" errors. Not selected by default.'},
  {id: 'muicache', name: 'MUI cache', verdict: 'safe', defaultOn: true,
    description: 'Cached program names for executables that were deleted.',
    contains: 'A cache of display names for programs you ran, used by Windows menus — for programs that no longer exist.',
    ifDeleted: 'Nothing. It is a pure cache that Windows refills.',
    advice: 'Safe to fix. Mostly a privacy cleanup: it reveals which programs you ran.'},
  {id: 'compat', name: 'Compatibility records', verdict: 'safe', defaultOn: true,
    description: 'Compatibility Assistant entries for programs that no longer exist.',
    contains: 'Notes Windows keeps about programs you ran (often installers in Downloads) to apply compatibility fixes — for files that are gone.',
    ifDeleted: 'Nothing. Records for existing programs are never touched.',
    advice: 'Safe to fix. Also a privacy cleanup.'},
  {id: 'installer', name: 'Installer folders', verdict: 'review', defaultOn: false,
    description: 'Windows Installer references to folders that were removed.',
    contains: 'Windows Installer’s list of folders it created for installed programs, where the folder is now missing.',
    ifDeleted: 'Usually nothing. If a program’s folder was removed by mistake, its "Repair" option may no longer work.',
    advice: 'Optional; not selected by default. Gives no speed benefit.'},
  {id: 'fonts', name: 'Missing fonts', verdict: 'safe', defaultOn: true,
    description: 'Font registrations pointing to deleted font files.',
    contains: 'Fonts registered with Windows whose font file was deleted.',
    ifDeleted: 'Windows stops trying to load fonts that don’t exist.',
    advice: 'Worth fixing.'},
  {id: 'help', name: 'Missing help files', verdict: 'safe', defaultOn: true,
    description: 'Help file references to files that were removed.',
    contains: 'Links to help documents of uninstalled programs.',
    ifDeleted: 'Nothing visible.',
    advice: 'Safe housekeeping.'},
  {id: 'empty', name: 'Empty software keys', verdict: 'safe', defaultOn: true,
    description: 'Leftover program keys with no values or subkeys.',
    contains: 'Completely empty folders in the registry left behind by uninstalled programs.',
    ifDeleted: 'Nothing — they hold no data.',
    advice: 'Safe housekeeping.'}
];

const ROOT_GUARD = /^(HKEY_LOCAL_MACHINE|HKLM)\\(SYSTEM|SAM|SECURITY|HARDWARE|BCD00000000)(\\[^\\]+)?$|^(HKEY_LOCAL_MACHINE|HKLM|HKEY_CURRENT_USER|HKCU)\\(SOFTWARE|Software)(\\(Microsoft|Classes|Policies|WOW6432Node))?$/i;

const validPath = p => {
  if (typeof p !== 'string' || p.length > 2048 || /[\x00]/.test(p)) throw new Error('Invalid registry path');
  if (!/^(HKEY_CLASSES_ROOT|HKEY_CURRENT_USER|HKEY_LOCAL_MACHINE|HKEY_USERS|HKEY_CURRENT_CONFIG|HKCR|HKCU|HKLM|HKU|HKCC)(\\.*)?$/i.test(p)) throw new Error('Invalid registry path');
  return p.replace(/\\+$/, '');
};

class Registry {
  constructor({store}) { this.store = store; this.issues = new Map(); }

  categories() { return CATEGORIES; }

  async scan({categories}) {
    const ids = (Array.isArray(categories) && categories.length ? categories : CATEGORIES.map(c => c.id)).filter(id => CATEGORIES.some(c => c.id === id));
    const raw = arr(await psJson(S.SCAN, {categories: ids}, {timeout: 180000}));
    this.issues.clear();
    const items = raw.map(i => {
      const id = crypto.createHash('sha1').update([i.type, i.path, i.value ?? ''].join('|')).digest('hex').slice(0, 16);
      const item = {id, type: i.type, path: i.path, value: i.value ?? null, action: i.action, title: i.title || i.value || i.path.split('\\').pop(), target: i.target || null, admin: !!i.admin, risk: i.risk || 'low'};
      this.issues.set(id, item);
      return item;
    });
    return {items, scannedAt: new Date().toISOString()};
  }

  async fix({ids}) {
    const items = arr(ids).map(id => this.issues.get(id)).filter(Boolean);
    if (!items.length) throw new Error('Scan again before fixing issues.');
    const backup = this.store.newBackupFile('registry-cleanup');
    const results = arr(await psJson(S.BACKUP_AND_DELETE, {file: backup.file, items: items.map(i => ({id: i.id, path: i.path, value: i.value, action: i.action}))}, {timeout: 180000}));
    const ok = results.filter(r => r.ok).map(r => r.id);
    ok.forEach(id => this.issues.delete(id));
    const failed = results.filter(r => !r.ok);
    this.store.log({kind: 'registry', title: `Fixed ${ok.length} registry issue${ok.length === 1 ? '' : 's'}`, count: ok.length, backup: backup.name});
    return {fixed: ok, failed, backup: backup.name};
  }

  async list({path}) {
    if (!path) return {path: '', keys: ['HKEY_CLASSES_ROOT', 'HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE', 'HKEY_USERS', 'HKEY_CURRENT_CONFIG'].map(name => ({name, hasChildren: true})), values: []};
    const r = await psJson(S.LIST, {path: validPath(path)}, {timeout: 30000});
    return {path: r.path, keys: arr(r.keys), values: arr(r.values).map(v => ({...v, data: v.kind === 'MultiString' ? arr(v.data) : v.data})), hasDefault: r.hasDefault};
  }

  async edit(input) {
    const op = input?.op;
    if (!['setValue', 'deleteValue', 'createKey', 'deleteKey', 'renameValue'].includes(op)) throw new Error('Unsupported registry operation');
    const path = validPath(input.path);
    if (op === 'deleteKey' && (ROOT_GUARD.test(path) || path.split('\\').length < 3)) throw new Error('This key is protected because deleting it would damage Windows.');
    const name = typeof input.name === 'string' ? input.name : '';
    if (name.length > 16383) throw new Error('Name too long');
    if (op === 'createKey' && (!name || name.includes('\\'))) throw new Error('Enter a key name without backslashes.');
    if (op === 'setValue' && !['String', 'ExpandString', 'DWord', 'QWord', 'Binary', 'MultiString'].includes(input.kind)) throw new Error('Unsupported value type');
    const backup = this.store.newBackupFile('registry-edit');
    await psJson(S.EDIT, {op, path, name, newName: input.newName, kind: input.kind, data: input.data, backup: backup.file}, {timeout: 60000});
    const label = {setValue: `Set value "${name || '(Default)'}"`, deleteValue: `Deleted value "${name || '(Default)'}"`, createKey: `Created key "${name}"`, deleteKey: 'Deleted key', renameValue: `Renamed value "${name}" to "${input.newName}"`}[op];
    this.store.log({kind: 'registry-edit', title: label, detail: path, backup: backup.name});
    return {ok: true, backup: backup.name};
  }

  async search({path, query, keys = true, values = true, data = false}) {
    if (typeof query !== 'string' || !query.trim()) throw new Error('Enter text to search for.');
    const r = await psJson(S.SEARCH, {path: validPath(path || 'HKEY_CURRENT_USER'), query: query.trim(), keys, values, data, limit: 300}, {timeout: 40000});
    return {results: arr(r.results), complete: !!r.complete, visited: r.visited};
  }

  async exportKey({path, file}) {
    const full = validPath(path);
    await run(sys32('reg.exe'), ['export', full, file, '/y', '/reg:64'], {timeout: 120000});
    return {ok: true, file};
  }

  async importFile({file}) {
    try { await run(sys32('reg.exe'), ['import', file, '/reg:64'], {timeout: 120000}); }
    catch (e) { throw new Error(String(e.stderr || '').trim() || 'The file could not be imported.'); }
    this.store.log({kind: 'registry-edit', title: 'Imported registry file', detail: file});
    return {ok: true};
  }
}

module.exports = {Registry, CATEGORIES, validPath};
