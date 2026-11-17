'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {psJson, powershell, arr} = require('./ps.cjs');
const S = require('./registry-ps.cjs');
const {t, td} = require('./i18n.cjs');

const LIST = String.raw`
$items = New-Object System.Collections.Generic.List[object]
$roots = @(
  @{ hive = [Microsoft.Win32.RegistryHive]::LocalMachine; path = 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'; label = 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'; scope = 'machine'; arch = 'x64' },
  @{ hive = [Microsoft.Win32.RegistryHive]::LocalMachine; path = 'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; label = 'HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; scope = 'machine'; arch = 'x86' },
  @{ hive = [Microsoft.Win32.RegistryHive]::CurrentUser; path = 'Software\Microsoft\Windows\CurrentVersion\Uninstall'; label = 'HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall'; scope = 'user'; arch = '' }
)
foreach ($r in $roots) {
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($r.hive, [Microsoft.Win32.RegistryView]::Registry64)
  $key = $base.OpenSubKey($r.path)
  if ($null -eq $key) { $base.Close(); continue }
  foreach ($n in $key.GetSubKeyNames()) {
    $e = $null
    try {
      $e = $key.OpenSubKey($n)
      $name = [string]$e.GetValue('DisplayName')
      if (-not $name) { continue }
      if ($e.GetValue('SystemComponent') -eq 1) { continue }
      if ($e.GetValue('ParentKeyName') -or $e.GetValue('ParentDisplayName')) { continue }
      $rt = [string]$e.GetValue('ReleaseType'); if ($rt -match 'Update|Hotfix') { continue }
      $items.Add([pscustomobject]@{
        key = $r.label + '\' + $n; keyName = $n; scope = $r.scope; arch = $r.arch
        name = $name.Trim(); version = [string]$e.GetValue('DisplayVersion'); publisher = ([string]$e.GetValue('Publisher')).Trim()
        installDate = [string]$e.GetValue('InstallDate'); location = ([string]$e.GetValue('InstallLocation')).Trim('"', ' ')
        icon = [string]$e.GetValue('DisplayIcon'); size = $e.GetValue('EstimatedSize')
        uninstall = [string]$e.GetValue('UninstallString'); quiet = [string]$e.GetValue('QuietUninstallString')
        msi = ($e.GetValue('WindowsInstaller') -eq 1); noRemove = ($e.GetValue('NoRemove') -eq 1)
        url = [string]$e.GetValue('URLInfoAbout'); source = [string]$e.GetValue('InstallSource')
      })
    } catch {} finally { if ($e) { $e.Close() } }
  }
  $key.Close(); $base.Close()
}
Out-Json @($items.ToArray())
`;

const LIST_APPX = String.raw`
$items = @(Get-AppxPackage -PackageTypeFilter Main | Where-Object { -not $_.IsFramework -and $_.SignatureKind -ne 'System' -and -not $_.NonRemovable } | ForEach-Object {
  $display = $null; $logo = $null
  try {
    [xml]$m = Get-Content -LiteralPath (Join-Path $_.InstallLocation 'AppxManifest.xml') -Raw -ErrorAction Stop
    $display = [string]$m.Package.Properties.DisplayName
    $logoRel = [string]$m.Package.Properties.Logo
    if ($logoRel) {
      $dir = Join-Path $_.InstallLocation (Split-Path $logoRel)
      $stem = [IO.Path]::GetFileNameWithoutExtension($logoRel)
      $cand = Get-ChildItem -LiteralPath $dir -Filter ($stem + '*.png') -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 1
      if ($cand) { $logo = $cand.FullName }
    }
  } catch {}
  [pscustomobject]@{ key = $_.PackageFullName; family = $_.PackageFamilyName; name = $(if ($display -and -not $display.StartsWith('ms-resource')) { $display } else { $_.Name }); publisher = ($_.Publisher -replace '^CN=([^,]+).*$', '$1'); version = [string]$_.Version; location = $_.InstallLocation; logo = $logo; installDate = $(try { (Get-Item -LiteralPath $_.InstallLocation).CreationTime.ToString('yyyyMMdd') } catch { '' }) }
})
Out-Json $items
`;

const START_UNINSTALL = String.raw`
# $in: { file, args, wait }
$p = if ($in.args) { Start-Process -FilePath $in.file -ArgumentList $in.args -PassThru } else { Start-Process -FilePath $in.file -PassThru }
if ($in.wait) { $p.WaitForExit() }
Out-Json ([pscustomobject]@{ exitCode = $(if ($p.HasExited) { $p.ExitCode } else { $null }) })
`;

const REMOVE_APPX = String.raw`
Remove-AppxPackage -Package $in.key
Out-Json ([pscustomobject]@{ ok = $true })
`;

const KEY_EXISTS = S.LIB + String.raw`
$k = $null; try { $k = Open-RegKey $in.path $false } catch {}
Out-Json ([pscustomobject]@{ exists = ($null -ne $k) })
if ($k) { $k.Close() }
`;

const FIND_KEYS = S.LIB + String.raw`
# $in: { candidates: [path] } -> existing keys with their value/subkey counts
$found = foreach ($p in @($in.candidates)) {
  $k = $null; try { $k = Open-RegKey $p $false } catch {}
  if ($k) { [pscustomobject]@{ path = $p; values = $k.ValueCount; keys = $k.SubKeyCount }; $k.Close() }
}
Out-Json @($found)
`;

// Split "C:\Path\app.exe" /args  or  C:\Path With Spaces\app.exe /args
function splitCommand(cmd) {
  const c = String(cmd || '').trim();
  if (!c) return null;
  if (c.startsWith('"')) { const end = c.indexOf('"', 1); if (end > 1) return {file: c.slice(1, end), args: c.slice(end + 1).trim()}; }
  const m = c.match(/^(.*?\.(exe|cmd|bat|com))(\s+(.*))?$/i);
  if (m) return {file: m[1], args: (m[4] || '').trim()};
  const sp = c.indexOf(' ');
  return sp > 0 ? {file: c.slice(0, sp), args: c.slice(sp + 1)} : {file: c, args: ''};
}

const GENERIC = new Set(['microsoft', 'microsoft corporation', 'windows', 'common files', 'intel', 'nvidia', 'nvidia corporation', 'amd', 'google', 'google llc', 'mozilla', 'adobe', 'apple', 'apple inc.', 'packages', 'programs', 'temp', 'installer', 'package cache', 'internet explorer', 'windowsapps', 'system32', 'users', 'public', 'default', 'inc', 'llc', 'ltd', 'corporation', 'software', 'games', 'steam', 'tools']);

function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(x64|x86|64-bit|32-bit|amd64|arm64|version|v?\d+(\.\d+)+|\d{4})\b/g, ' ')
    .replace(/[®™©,]/g, ' ').replace(/\s+/g, ' ').trim();
}
function publisherName(p) { return normalize(p).replace(/\b(inc|llc|ltd|gmbh|corp|corporation|co|limited|s\.?a\.?|ag|b\.?v\.?)\.?$/g, '').trim(); }

const SIZE_FRESH_MS = 3 * 864e5;

class Programs {
  constructor({store, getIcon, trash}) { this.store = store; this.getIcon = getIcon; this.trash = trash; this.items = new Map(); this.leftovers = new Map(); }

  async list() {
    const [desktop, store] = await Promise.all([psJson(LIST, null, {timeout: 60000}).catch(() => []), psJson(LIST_APPX, null, {timeout: 90000}).catch(() => [])]);
    this.items.clear();
    const seen = new Set();
    const out = [];
    for (const p of arr(desktop)) {
      const dedupe = `${p.name}|${p.version}`.toLowerCase();
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const id = crypto.createHash('sha1').update(p.key).digest('hex').slice(0, 16);
      const item = {id, type: 'desktop', ...p, size: p.size > 0 ? p.size * 1024 : null, installDate: parseDate(p.installDate), canUninstall: !!(p.uninstall || p.quiet) && !p.noRemove, broken: false};
      const cmd = splitCommand(p.uninstall);
      if (cmd && !/msiexec/i.test(cmd.file) && path.isAbsolute(cmd.file) && !fs.existsSync(cmd.file)) item.broken = true;
      item.drive = driveOf(p.location) || (cmd && !/msiexec/i.test(cmd.file) ? driveOf(cmd.file) : null) || driveOf(String(p.icon || '').replace(/^"/, '')) || driveOf(p.source);
      this.applySize(item);
      item.drive = item.drive || driveOf(item.sizeRoot);
      this.items.set(id, item); out.push(item);
    }
    for (const p of arr(store)) {
      const id = crypto.createHash('sha1').update(p.key).digest('hex').slice(0, 16);
      const item = {id, type: 'store', ...p, installDate: parseDate(p.installDate), size: null, canUninstall: true, drive: driveOf(p.location)};
      this.applySize(item);
      this.items.set(id, item); out.push(item);
    }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
    return {items: out.map(publicItem)};
  }

  async icons({ids}) {
    const result = {};
    await Promise.all(arr(ids).slice(0, 200).map(async id => {
      const item = this.items.get(id);
      if (!item) return;
      const file = iconFile(item);
      if (file) result[id] = await this.getIcon(file).catch(() => null);
    }));
    return result;
  }

  // A size comes from the program's own uninstall entry when it has one. Otherwise the page measures the install
  // folder (where the program lives, see resolveSizeRoot) and the result is remembered between sessions, so the
  // table is filled at once next time; after a few days it is measured again.
  applySize(item) {
    item.sizeRoot = resolveSizeRoot(item);
    item.measurable = !!item.sizeRoot;
    if (item.size > 0) return;
    item.size = null;
    const hit = this.savedSizes().get(item.id);
    if (hit && hit.root === item.sizeRoot) { item.size = hit.size; item.sizePartial = !!hit.partial; item.sizeStale = Date.now() - hit.at > SIZE_FRESH_MS; }
  }

  savedSizes() {
    if (this.sizes) return this.sizes;
    this.sizes = new Map();
    try { for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(this.sizesFile(), 'utf8')))) this.sizes.set(id, v); } catch {}
    return this.sizes;
  }
  sizesFile() { return this.store?.root ? path.join(this.store.root, 'program-sizes.json') : null; }
  saveSizes() {
    const file = this.sizesFile();
    if (!file) return;
    clearTimeout(this.sizesTimer);
    this.sizesTimer = setTimeout(() => { try { fs.writeFileSync(file, JSON.stringify(Object.fromEntries(this.sizes))); } catch {} }, 1500);
  }

  async folderSize({id}) {
    const item = this.items.get(id);
    const root = item && (item.sizeRoot || resolveSizeRoot(item));
    if (!root) return {size: null};
    const r = await measureDir(root, 120000);
    this.savedSizes().set(id, {size: r.size, partial: r.partial, at: Date.now(), root});
    this.saveSizes();
    return {size: r.size, partial: r.partial};
  }

  async uninstall({id, quiet = false}) {
    const item = this.items.get(id);
    if (!item) throw new Error('Refresh the program list and try again.');
    if (item.type === 'store') {
      await psJson(REMOVE_APPX, {key: item.key}, {timeout: 300000});
      this.store.log({kind: 'uninstall', key: 'activity.uninstalled', vars: {name: item.name}});
      return {removed: true};
    }
    const command = (quiet && item.quiet) ? item.quiet : (item.uninstall || item.quiet);
    let cmd = splitCommand(command);
    if (!cmd) throw new Error('This program does not provide an uninstaller.');
    if (/msiexec/i.test(cmd.file)) {
      // MSI entries often say /I (modify); /X is the uninstall verb.
      cmd = {file: 'msiexec.exe', args: cmd.args.replace(/\/I\s*(\{[0-9A-F-]+\})/i, '/X$1')};
    }
    if (path.isAbsolute(cmd.file) && !fs.existsSync(cmd.file)) throw new Error('The uninstaller file is missing. Use "Remove entry" and scan for leftovers instead.');
    await psJson(START_UNINSTALL, {file: cmd.file, args: cmd.args, wait: true}, {timeout: 3600000});
    // Many uninstallers relaunch themselves from %TEMP% and return immediately: poll for the entry to disappear.
    let removed = false;
    for (let i = 0; i < 6; i++) {
      removed = !(await psJson(KEY_EXISTS, {path: item.key})).exists;
      if (removed) break;
      await new Promise(r => setTimeout(r, 1500));
    }
    if (removed) this.store.log({kind: 'uninstall', key: 'activity.uninstalled', vars: {name: item.name}});
    return {removed};
  }

  async removeEntry({id}) {
    const item = this.items.get(id);
    if (!item || item.type !== 'desktop') throw new Error('Refresh the program list and try again.');
    const backup = this.store.newBackupFile('uninstall-entry');
    const r = arr(await psJson(S.BACKUP_AND_DELETE, {file: backup.file, items: [{id, path: item.key, action: 'deleteKey'}]}));
    if (!r[0]?.ok) throw new Error(r[0]?.error || 'Could not remove the entry. Administrator rights may be required.');
    this.store.log({kind: 'uninstall', key: 'activity.entryRemoved', vars: {name: item.name}, backup: backup.name});
    return {ok: true, backup: backup.name};
  }

  // Look for folders and registry keys left behind by a program.
  async scanLeftovers({id}) {
    const item = this.items.get(id);
    if (!item) throw new Error('Refresh the program list and try again.');
    const env = process.env;
    const name = normalize(item.name);
    const pub = publisherName(item.publisher);
    const nameVariants = new Set([name, name.replace(/\s+/g, ''), item.name.toLowerCase().trim()]);
    if (pub && name.startsWith(pub + ' ')) nameVariants.add(name.slice(pub.length + 1));
    const words = name.split(' ').filter(w => w.length >= 3 && !GENERIC.has(w));
    const matches = n => { const x = normalize(n); return x && !GENERIC.has(x) && (nameVariants.has(x) || nameVariants.has(x.replace(/\s+/g, '')) || (words.length === 1 && x === words[0])); };

    // Protect folders that belong to other installed programs.
    const others = [...this.items.values()].filter(o => o.id !== id && o.location).map(o => o.location.toLowerCase().replace(/[\\/]+$/, ''));
    const ownedByOther = p => { const l = p.toLowerCase(); return others.some(o => o === l || o.startsWith(l + '\\') || l.startsWith(o + '\\')); };

    const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramData, env.APPDATA, env.LOCALAPPDATA, path.join(path.dirname(env.LOCALAPPDATA || ''), 'LocalLow'), path.join(env.LOCALAPPDATA || '', 'Programs'),
      path.join(env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), path.join(env.ProgramData || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')].filter(Boolean);
    const folders = new Map();
    const add = (p, reason) => { if (!folders.has(p.toLowerCase()) && !ownedByOther(p)) folders.set(p.toLowerCase(), {path: p, reason}); };
    if (item.location && fs.existsSync(item.location) && path.parse(item.location).root !== item.location && item.location.split(/[\\/]/).filter(Boolean).length >= 2) add(item.location, 'Install folder');
    for (const root of roots) {
      for (const d of await readDirs(root)) {
        if (matches(d)) add(path.join(root, d), 'Matches program name');
        else if (pub && (normalize(d) === pub || publisherName(d) === pub)) {
          for (const sub of await readDirs(path.join(root, d))) if (matches(sub)) add(path.join(root, d, sub), 'Matches publisher and program name');
        }
      }
    }
    const folderList = [];
    for (const f of folders.values()) folderList.push({...f, kind: 'folder', size: await dirSize(f.path, 4000)});

    // Shortcuts on desktops that point nowhere / match the name.
    for (const desk of [path.join(env.USERPROFILE || '', 'Desktop'), path.join(env.PUBLIC || 'C:\\Users\\Public', 'Desktop')]) {
      for (const f of await readFiles(desk)) if (/\.lnk$/i.test(f) && matches(f.replace(/\.lnk$/i, ''))) folderList.push({kind: 'file', path: path.join(desk, f), reason: 'Desktop shortcut', size: 0});
    }

    // Registry keys.
    const pubKey = item.publisher ? item.publisher.trim() : '';
    const nm = item.name.trim();
    const regCandidates = new Set();
    for (const base of ['HKCU\\Software', 'HKLM\\SOFTWARE', 'HKLM\\SOFTWARE\\WOW6432Node']) {
      regCandidates.add(`${base}\\${nm}`);
      if (words.length === 1) regCandidates.add(`${base}\\${words[0]}`);
      for (const p of new Set([pubKey, pub].filter(Boolean))) {
        regCandidates.add(`${base}\\${p}\\${nm}`);
        for (const w of nameVariants) regCandidates.add(`${base}\\${p}\\${w}`);
      }
    }
    if (item.type === 'desktop') regCandidates.add(item.key);
    const keys = arr(await psJson(FIND_KEYS, {candidates: [...regCandidates].filter(k => !/\\(Microsoft|Classes|Policies|WOW6432Node)$/i.test(k))}).catch(() => []));
    const regList = keys.filter(k => k.path.split('\\').length >= 3).map(k => ({kind: 'registry', path: k.path, reason: k.path === item.key ? 'Uninstall entry' : 'Program settings', detail: `${t('programs.leftoverValues', {count: String(k.values)})}, ${t('programs.leftoverSubkeys', {count: String(k.keys)})}`}));

    const all = [...folderList, ...regList].map(x => ({...x, id: crypto.createHash('sha1').update(x.kind + x.path).digest('hex').slice(0, 16)}));
    this.leftovers.set(id, new Map(all.map(x => [x.id, x])));
    // Reasons stay English in the cache and are translated on the way out; installFolder marks the item
    // the renderer leaves unticked before the uninstall (it used to compare the English reason).
    return {program: publicItem(item), items: all.map(x => ({...x, reason: td(x.reason), ...(x.reason === 'Install folder' ? {installFolder: true} : {})}))};
  }

  async removeLeftovers({programId, ids}) {
    const map = this.leftovers.get(programId);
    if (!map) throw new Error('Scan for leftovers again.');
    const chosen = arr(ids).map(i => map.get(i)).filter(Boolean);
    const files = chosen.filter(x => x.kind !== 'registry');
    const regs = chosen.filter(x => x.kind === 'registry');
    const failed = [];
    let removed = 0, bytes = 0;
    for (const f of files) {
      try { await this.trash(f.path); removed++; bytes += f.size || 0; } catch (e) { failed.push({path: f.path, error: e.message}); }
    }
    let backup = null;
    if (regs.length) {
      const b = this.store.newBackupFile('leftovers');
      const r = arr(await psJson(S.BACKUP_AND_DELETE, {file: b.file, items: regs.map(x => ({id: x.id, path: x.path, action: 'deleteKey'}))}));
      backup = b.name;
      for (const x of r) { if (x.ok) removed++; else failed.push({path: map.get(x.id)?.path, error: x.error}); }
    }
    const program = this.items.get(programId);
    this.store.log({kind: 'leftovers', key: program?.name ? 'activity.leftoversOf' : 'activity.leftoversOfProgram', vars: {count: removed, name: program?.name}, count: removed, bytes, backup});
    return {removed, failed, bytes, backup};
  }
}

// "C:\\..." or "%ProgramFiles%\\..." -> "C:"
function driveOf(p) {
  const s = String(p || '').replace(/%([^%]+)%/g, (_, k) => process.env[k] || '').trim();
  const m = /^([a-z]):[\\/]/i.exec(s);
  return m ? m[1].toUpperCase() + ':' : null;
}

function publicItem(i) {
  const {uninstall, quiet, sizeRoot, ...rest} = i;
  return {...rest, hasQuiet: !!quiet};
}
function parseDate(s) {
  const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = Date.parse(s);
  return Number.isFinite(d) ? new Date(d).toISOString().slice(0, 10) : null;
}
function iconFile(item) {
  if (item.type === 'store') return item.logo || null;
  const raw = String(item.icon || '').replace(/^"|"$/g, '').replace(/,\s*-?\d+$/, '').replace(/^"|"$/g, '');
  const expanded = raw.replace(/%([^%]+)%/g, (_, k) => process.env[k] || '');
  if (expanded && fs.existsSync(expanded)) return expanded;
  const cmd = splitCommand(item.uninstall);
  if (cmd && path.isAbsolute(cmd.file) && fs.existsSync(cmd.file) && !/msiexec/i.test(cmd.file)) return cmd.file;
  return null;
}
async function readDirs(p) { try { return (await fsp.readdir(p, {withFileTypes: true})).filter(d => d.isDirectory() && !d.isSymbolicLink()).map(d => d.name); } catch { return []; } }
async function readFiles(p) { try { return (await fsp.readdir(p, {withFileTypes: true})).filter(d => d.isFile()).map(d => d.name); } catch { return []; } }
// Walks a folder within a time limit. partial: the limit was hit, so the size is only a lower bound.
async function measureDir(root, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let total = 0, partial = false;
  const stack = [root];
  while (stack.length) {
    if (Date.now() > deadline) { partial = true; break; }
    const d = stack.pop();
    let entries;
    try { entries = await fsp.readdir(d, {withFileTypes: true}); } catch { continue; }
    const files = [];
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) stack.push(full); else if (e.isFile()) files.push(full);
    }
    for (let i = 0; i < files.length; i += 64) {
      for (const n of await Promise.all(files.slice(i, i + 64).map(f => fsp.lstat(f).then(s => s.size, () => 0)))) total += n;
    }
  }
  return {size: total, partial};
}
async function dirSize(root, budgetMs) { return (await measureDir(root, budgetMs)).size; }

// ---------------------------------------------------------------------------------------------------------
// Where a program lives, for measuring it. Many installers leave InstallLocation empty, so the folders of the
// uninstaller and of the icon are tried too. Shared or system folders are never measured as a program.
// ---------------------------------------------------------------------------------------------------------
const envDir = k => String(process.env[k] || '').toLowerCase().replace(/[\\/]+$/, '');
const lowerPath = p => path.resolve(p).toLowerCase().replace(/[\\/]+$/, '');
function tooBroad(dir) {
  const l = lowerPath(dir);
  const parts = l.split(/[\\/]+/).filter(Boolean);
  if (parts.length < 2) return true; // a drive root or a top-level folder
  const win = envDir('SystemRoot') || 'c:\\windows';
  const pd = envDir('ProgramData') || 'c:\\programdata';
  if (l === win || l.startsWith(win + '\\')) return true; // Windows itself
  if (l === pd + '\\package cache' || l.startsWith(pd + '\\package cache\\')) return true; // installer copies, not the program
  const home = envDir('USERPROFILE');
  const containers = [envDir('ProgramFiles'), envDir('ProgramFiles(x86)'), envDir('ProgramW6432'), pd, home, envDir('APPDATA'), envDir('LOCALAPPDATA'), envDir('LOCALAPPDATA') && path.dirname(envDir('LOCALAPPDATA')), path.dirname(home || ''), home && home + '\\documents', home && home + '\\downloads', home && home + '\\desktop', 'c:\\program files\\windowsapps', 'c:\\program files\\common files', 'c:\\program files (x86)\\common files'].filter(Boolean);
  return containers.includes(l);
}
function folderFromCommand(cmd) {
  const c = splitCommand(cmd);
  if (!c || !path.isAbsolute(c.file) || /^(msiexec|rundll32|cmd|powershell|regsvr32|wscript|cscript)(\.exe)?$/i.test(path.basename(c.file))) return null;
  return path.dirname(c.file);
}
function resolveSizeRoot(item) {
  const raw = String(item.icon || '').replace(/^"|"$/g, '').replace(/,\s*-?\d+$/, '').replace(/^"|"$/g, '').replace(/%([^%]+)%/g, (_, k) => process.env[k] || '');
  const fromIcon = path.isAbsolute(raw) ? path.dirname(raw) : null;
  for (const c of [item.location, folderFromCommand(item.uninstall), fromIcon]) {
    const dir = String(c || '').replace(/^"|"$/g, '').replace(/%([^%]+)%/g, (_, k) => process.env[k] || '').trim();
    if (!dir || !path.isAbsolute(dir) || tooBroad(dir)) continue;
    try { if (fs.statSync(dir).isDirectory()) return path.resolve(dir); } catch {}
  }
  return null;
}

module.exports = {Programs, splitCommand, normalize, dirSize, measureDir, resolveSizeRoot, tooBroad};
