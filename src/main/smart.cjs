'use strict';
// Smart cleaning rules: some folders hold two kinds of files, ones nobody uses any more and ones that installed
// programs still need. A normal rule treats every file the same. A smart rule has a `classify` function that
// looks at the machine (the registry, the folders next to the files) and sorts each file into
//   • removable — nothing refers to it any more, or a newer copy replaced it
//   • kept      — something still needs it
// and the cleaner only ever counts, lists or deletes the removable ones. The rule is built to fail safe: when
// the evidence can't be read completely, or something that could change the answer is running, everything is kept.
//
// classify({procs, signal}) → {
//   state:      null | 'busy' | 'unreadable'   why nothing can be removed right now (shown to the user)
//   processes:  lower-case names of programs that must not be running while their files are removed
//   removable(file, stat) → boolean
//   note(file)      → short reason shown next to a removable file
//   keptNote(file)  → short reason shown next to a file that stays
//   prune?(dir)     → may this (now empty) folder be removed?
// }
const fs = require('node:fs');
const path = require('node:path');
const {psJson} = require('./ps.cjs');
const {t} = require('./i18n.cjs');

const norm = p => path.resolve(String(p)).toLowerCase();
const DAY = 24 * 3600e3;

// ---------------------------------------------------------------------------------------------------------
// Windows Installer cache (C:\Windows\Installer)
//
// Every program installed with Windows Installer leaves its .msi there, and every update leaves an .msp. They are
// needed to repair, update or uninstall that program, so Windows registers each one (the "LocalPackage" value of
// the product or patch). When a program is removed badly, or an update is superseded, the file stays behind with no
// registration: nothing will ever read it. Those are the orphans. The registered files must never be touched.
// ---------------------------------------------------------------------------------------------------------

// Reads every file the installed products and patches are registered with. Registry is the source of truth Windows
// Installer itself uses; the Windows Installer COM API is asked as well and its answers are added (more kept files
// can never hurt). Any key that can't be opened is counted: the caller then refuses to classify.
const READ_INSTALLER_REFS = String.raw`
$hklm = [Microsoft.Win32.RegistryKey]::OpenBaseKey('LocalMachine', 'Registry64')
$problems = 0
$refs = New-Object System.Collections.ArrayList
function Open($key, $name) { try { return $key.OpenSubKey($name) } catch { $script:problems++; return $null } }
function Value($key, $name) { try { return $key.GetValue($name) } catch { $script:problems++; return $null } }
$root = $hklm.OpenSubKey('SOFTWARE\Microsoft\Windows\CurrentVersion\Installer\UserData')
if ($null -eq $root) { Out-Json @{ok = $false; reason = 'no UserData'; refs = @(); problems = 0}; return }
foreach ($sidName in $root.GetSubKeyNames()) {
  $sid = Open $root $sidName
  if ($null -eq $sid) { continue }
  $products = Open $sid 'Products'
  if ($products) {
    foreach ($guid in $products.GetSubKeyNames()) {
      $p = Open $products $guid
      if ($null -eq $p) { continue }
      $ip = Open $p 'InstallProperties'
      if ($null -eq $ip) { continue }
      $lp = Value $ip 'LocalPackage'
      if ($lp) { [void]$refs.Add(@{p = [string]$lp; n = [string](Value $ip 'DisplayName'); k = 'product'}) }
    }
  }
  $patches = Open $sid 'Patches'
  if ($patches) {
    foreach ($guid in $patches.GetSubKeyNames()) {
      $pk = Open $patches $guid
      if ($null -eq $pk) { continue }
      $lp = Value $pk 'LocalPackage'
      if ($lp) { [void]$refs.Add(@{p = [string]$lp; n = [string](Value $pk 'DisplayName'); k = 'patch'}) }
    }
  }
}
try {
  $inst = New-Object -ComObject WindowsInstaller.Installer
  try { foreach ($pr in $inst.ProductsEx('', '', 7)) { try { $lp = $pr.InstallProperty('LocalPackage'); if ($lp) { [void]$refs.Add(@{p = [string]$lp; n = [string]$pr.InstallProperty('ProductName'); k = 'product'}) } } catch {} } } catch {}
  try { foreach ($pa in $inst.PatchesEx('', '', 7, 1)) { try { $lp = $pa.PatchProperty('LocalPackage'); if ($lp) { [void]$refs.Add(@{p = [string]$lp; n = [string]$pa.PatchProperty('DisplayName'); k = 'patch'}) } } catch {} } } catch {}
} catch {}
Out-Json @{ok = $true; refs = @($refs); problems = $problems}
`;

async function readInstallerRefs() {
  return psJson(READ_INSTALLER_REFS, null, {timeout: 90000});
}

// What a classifier asks the machine. Tests replace these so they can use fixtures instead of the real registry and clock.
// procs: a Set that stands in for the list of running programs.
const hooks = {readRefs: readInstallerRefs, now: () => Date.now(), procs: null};

// Programs that mean Windows is installing or servicing something right now.
const INSTALLER_BUSY = ['msiexec.exe', 'tiworker.exe'];

async function installerCache({dir, procs: running = new Set(), readRefs = hooks.readRefs, now = hooks.now()}) {
  const procs = hooks.procs || running;
  const here = norm(dir);
  const none = state => ({state, processes: [], removable: () => false, note: () => '', keptNote: () => t(`smart.state.${state}`)});
  if ([...procs].some(p => INSTALLER_BUSY.includes(p))) return none('busy');
  let data;
  try { data = await readRefs(); } catch { return none('unreadable'); }
  // Unreadable keys, an empty list or a missing registry branch mean the list may be incomplete: keep everything.
  if (!data || !data.ok || data.problems > 0 || !Array.isArray(data.refs) || !data.refs.length) return none('unreadable');

  const refs = new Map(); // normalised path → {name, kind}
  for (const r of data.refs) {
    if (!r || typeof r.p !== 'string' || !r.p.trim()) continue;
    const key = norm(r.p);
    if (!refs.has(key) || (!refs.get(key).name && r.n)) refs.set(key, {name: r.n || '', kind: r.k});
  }
  if (!refs.size) return none('unreadable');

  const recent = st => Math.max(st?.mtimeMs || 0, st?.birthtimeMs || 0) > now - DAY;
  const inFolder = file => norm(path.dirname(file)) === here && /\.(msi|msp)$/i.test(file);
  const removable = (file, st) => inFolder(file) && !refs.has(norm(file)) && !recent(st);
  return {
    state: null,
    processes: [],
    removable,
    note: () => t('smart.installer.orphan'),
    keptNote(file, st) {
      const ref = refs.get(norm(file));
      if (ref) {
        if (ref.kind === 'patch') return ref.name ? t('smart.installer.patch', {name: ref.name}) : t('smart.installer.patchUnnamed');
        return ref.name ? t('smart.installer.product', {name: ref.name}) : t('smart.installer.productUnnamed');
      }
      if (recent(st)) return t('smart.installer.recent');
      return t('smart.installer.other');
    }
  };
}

// ---------------------------------------------------------------------------------------------------------
// Old versions of self-updating apps (Squirrel: Discord, Slack, GitHub Desktop, Postman, …)
//
// These apps keep each version in <root>\app-<version> and start the newest one through <root>\Update.exe. After an
// update the previous version is meant to be deleted, but is often left behind. Only the folders of versions older
// than the newest are removable; the newest version, Update.exe and the downloaded packages always stay.
// ---------------------------------------------------------------------------------------------------------

const APP_DIR = /^app-(\d+(?:\.\d+)*)(?:-(.+))?$/i;

// Compares version strings like "1.0.9164" or "4.36.140"; a version with a suffix ("-rc1") is older than the same without.
function compareVersions(a, b) {
  const [na, sa] = [a.numbers, a.suffix], [nb, sb] = [b.numbers, b.suffix];
  for (let i = 0; i < Math.max(na.length, nb.length); i++) { const d = (na[i] || 0) - (nb[i] || 0); if (d) return d; }
  if (!sa !== !sb) return sa ? -1 : 1;
  return (sa || '').localeCompare(sb || '');
}

const readdir = p => { try { return fs.readdirSync(p, {withFileTypes: true}); } catch { return []; } };

// Folders under `base` that look like a Squirrel app: Update.exe plus app-<version> folders.
function squirrelApps(base) {
  const apps = [];
  for (const d of readdir(base)) {
    if (!d.isDirectory() || d.isSymbolicLink()) continue;
    const root = path.join(base, d.name);
    const entries = readdir(root);
    if (!entries.some(e => e.isFile() && /^update\.exe$/i.test(e.name))) continue;
    const versions = entries.filter(e => e.isDirectory() && !e.isSymbolicLink() && APP_DIR.test(e.name)).map(e => {
      const m = APP_DIR.exec(e.name);
      return {name: e.name, version: m[1] + (m[2] ? `-${m[2]}` : ''), numbers: m[1].split('.').map(Number), suffix: m[2] || '', dir: path.join(root, e.name)};
    }).sort((x, y) => compareVersions(y, x));
    if (!versions.length) continue;
    const newest = versions[0];
    // The newest folder must be a finished install (it holds the app's own program), or nothing is removable.
    const finished = readdir(newest.dir).some(e => e.isFile() && /\.exe$/i.test(e.name));
    const exes = readdir(newest.dir).filter(e => e.isFile() && /\.exe$/i.test(e.name)).map(e => e.name.toLowerCase());
    apps.push({name: d.name, root, newest, old: finished ? versions.slice(1) : [], exes});
  }
  return apps;
}

async function squirrelOldVersions({base, procs: running = new Set()}) {
  const procs = hooks.procs || running;
  const apps = squirrelApps(base);
  const oldDirs = apps.flatMap(a => a.old.map(o => ({dir: norm(o.dir), version: o.version, latest: a.newest.version, root: norm(a.root)})));
  const updating = procs.has('update.exe');
  const find = file => { const f = norm(file); return oldDirs.find(o => f.startsWith(o.dir + path.sep)); };
  return {
    state: updating ? 'busy' : null,
    processes: [...new Set(apps.flatMap(a => a.exes))],
    removable: file => !updating && !!find(file),
    note(file) { const o = find(file); return o ? t('smart.squirrel.old', {version: o.version, latest: o.latest}) : ''; },
    keptNote(file) {
      if (updating) return t('smart.state.busy');
      const f = norm(file);
      const app = apps.find(a => f.startsWith(norm(a.newest.dir) + path.sep));
      return app ? t('smart.squirrel.current', {version: app.newest.version}) : t('smart.squirrel.updater');
    },
    prune: dir => !!find(path.join(dir, 'x')) || oldDirs.some(o => norm(dir) === o.dir)
  };
}

module.exports = {hooks, installerCache, squirrelOldVersions, squirrelApps, compareVersions, readInstallerRefs, INSTALLER_BUSY};
