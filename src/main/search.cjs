'use strict';
// Windows Search doctor. Windows Search finds apps only through their Start menu shortcuts, and finds files only
// while the indexer service runs and its index answers. This checks those pieces, lists programs that have no
// Start menu entry (common for apps on a second drive or left from an earlier Windows install) and fixes what it can.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {psJson, powershell} = require('./ps.cjs');

const STATUS = String.raw`
$svc = Get-Service WSearch -ErrorAction SilentlyContinue
$start = $null
if ($svc) { $start = [string](Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\WSearch' -ErrorAction SilentlyContinue).Start }
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$menus = @([Environment]::GetFolderPath('CommonPrograms'), [Environment]::GetFolderPath('Programs'))
$wsh = New-Object -ComObject WScript.Shell
$targets = New-Object System.Collections.Generic.List[string]
$lnkCount = 0
foreach ($m in $menus) {
  foreach ($f in Get-ChildItem -LiteralPath $m -Recurse -Filter *.lnk -ErrorAction SilentlyContinue) {
    $lnkCount++
    try { $t = $wsh.CreateShortcut($f.FullName).TargetPath; if ($t) { $targets.Add($t) } } catch {}
  }
}
# The index answers when the Search provider runs a query; Start menu items in the result mean apps are searchable.
$index = $false; $startIndexed = $false; $indexError = $null
if ($svc -and $svc.Status -eq 'Running') {
  try {
    $c = New-Object -ComObject ADODB.Connection
    $c.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
    $r = $c.Execute("SELECT TOP 1 System.ItemPathDisplay FROM SystemIndex")
    $index = $true
    foreach ($m in $menus) {
      $scope = 'file:' + $m.Replace('\', '/')
      $r = $c.Execute("SELECT TOP 1 System.ItemPathDisplay FROM SystemIndex WHERE SCOPE='" + $scope.Replace("'", "''") + "'")
      if (-not $r.EOF) { $startIndexed = $true; break }
    }
    $c.Close()
  } catch { $indexError = $_.Exception.Message }
}
$ui = @(Get-Process SearchHost, SearchApp, SearchUI -ErrorAction SilentlyContinue).Count -gt 0
Out-Json ([pscustomobject]@{
  service = if ($svc) { [string]$svc.Status } else { 'Missing' }; start = $start; admin = $admin
  index = $index; startIndexed = $startIndexed; indexError = $indexError; ui = $ui
  menus = $menus; lnkCount = $lnkCount; targets = @($targets)
})`;

const VERSIONS = String.raw`
$out = foreach ($f in @($in.files)) {
  try { $v = [Diagnostics.FileVersionInfo]::GetVersionInfo($f); [pscustomobject]@{ file = $f; product = $v.ProductName; description = $v.FileDescription; company = $v.CompanyName; version = $v.ProductVersion } }
  catch { [pscustomobject]@{ file = $f } }
}
Out-Json @($out)`;

const ADD = String.raw`
$dir = [Environment]::GetFolderPath('Programs')
$wsh = New-Object -ComObject WScript.Shell
$made = foreach ($a in @($in.apps)) {
  $name = $a.name
  $lnk = Join-Path $dir ($name + '.lnk')
  if (Test-Path -LiteralPath $lnk) { $lnk = Join-Path $dir ($name + ' (' + $a.drive.TrimEnd(':') + ').lnk') }
  if (Test-Path -LiteralPath $lnk) { continue }
  $s = $wsh.CreateShortcut($lnk)
  $s.TargetPath = $a.exe
  $s.WorkingDirectory = Split-Path -Parent $a.exe
  $s.IconLocation = $a.exe + ',0'
  $s.Description = 'Added by Aster so Windows Search can find this app'
  $s.Save()
  [pscustomobject]@{ id = $a.id; lnk = $lnk }
}
Out-Json @($made)`;

// Admin-only repairs. Fixed scripts, no input: run directly when Aster is elevated, otherwise through a UAC prompt.
const FIXES = {
  // "Automatic (Delayed Start)" is the Windows default for the indexer.
  service: `Set-Service WSearch -StartupType Automatic; & sc.exe config WSearch start= delayed-auto | Out-Null; Start-Service WSearch`,
  // Microsoft's documented reset: the indexer sees an unfinished setup, deletes its database and rebuilds it with
  // the default locations (Start menu, user folders) on the next start.
  rebuild: String.raw`Stop-Service WSearch -Force -ErrorAction SilentlyContinue
Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows Search' -Name SetupCompletedSuccessfully -Value 0 -Type DWord
Set-Service WSearch -StartupType Automatic; & sc.exe config WSearch start= delayed-auto | Out-Null
Start-Service WSearch`
};
// Restarting the search box needs no rights: it belongs to the signed-in user and Windows starts it again at once.
const RESTART_UI = String.raw`
foreach ($n in 'SearchHost', 'SearchApp', 'SearchUI', 'StartMenuExperienceHost') { Get-Process $n -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq (Get-Process -Id $PID).SessionId } | Stop-Process -Force -ErrorAction SilentlyContinue }
if ($in.admin) { Restart-Service WSearch -Force -ErrorAction SilentlyContinue }
Out-Json ([pscustomobject]@{ ok = $true })`;

// Folders inside Program Files that hold Windows parts, shared runtimes or drivers rather than apps.
const SKIP_TOP = /^(common files|windows[\w\s.-]*|microsoft[\w\s.-]*|internet explorer|dotnet|reference assemblies|msbuild|uninstall information|windowspowershell|packagemanagement|modifiablewindowsapps|windowsapps|installshield[\w\s]*|nvidia corporation|intel|amd|realtek|steam|java|iis[\w\s]*|wsl|online services|dell|hp|lenovo)$/i;
// Folders apps keep data, add-ons and runtimes in: no main program lives there.
const SKIP_DIR = /^(locales?|resources?|res|plugins?|data|assets|content|paks|movies|samples?|sdk|docs?|help|manuals?|drivers?|redist(ributables?)?|_?commonredist|prerequisites|installers?|uninstall|setup|lib|libs|share|include|src|node_modules|cache|logs?|te?mp|i386|arm64|\.git|third[ _-]?party|extensions?|modules?|translations|lang(uages)?|fonts|skins?|themes|sounds?|music|videos?|images?|textures|maps|saves?|shaders?|scripts?|crashpad|swiftshader|dictionaries|mono|python\d*|jre|jdk|runtime|vc_?redist|directx|dotnet|update|updater|tools)$/i;
// Executables that are installers, updaters, helpers, services or command-line tools.
const SKIP_EXE = /(unins|uninst|setup|install|update|crash|report|helper|service|svc|elevat|redist|dxsetup|prereq|bootstrap|cef|webhelper|notif|broker|agent|daemon|diag|repair|regist|upload|sandbox|worker|watchdog|server|^cli$|console|launcherprereq|stub|wrapper|shim|host$|^7z|ffmpeg|ffprobe|^python|^node$|^java|^perl|^ruby|^git(-\w+)?$|^ssh|curl|wget|test|collector|scheduler|vbox|benchmark|sample|debug|devcon|dpinst|vcredist|unpack|nacl|plink|pageant|^pscp|^psftp|vulkan|proxy|tray$|overlay|coresync|ccxprocess|bridge)/i;
// Descriptions that give away a background part.
const SKIP_DESC = /(service|driver|helper|installer|setup|updater|update|uninstall|sample|daemon|background|crash|command[- ]line|console|redistributable|runtime|plug-?in|elevat|synchroni[sz]er|content manager|proxy|tray|bridge|overlay|virtual channel|stub|scheduler|collector)/i;
const GENERIC = /^(unreal engine|microsoft.*(windows|operating system)|.*операционная система.*|application|launcher|program|app|client|main|game|win(32|64)?|x(64|86)|\d[\d.\s-]*)$/i;

const words = s => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9а-яё]+/i).filter(w => w.length >= 3 && !/^(the|for|and|win32|win64|x64|x86|bin|binaries|files?|program|inc|ltd|corp|software)$/.test(w));
const squash = s => String(s || '').toLowerCase().replace(/[^a-z0-9а-яё]/gi, '');
// Do two names point at the same thing ("EpicGamesLauncher" and "Epic Games\Launcher")?
function related(a, b) {
  const sa = squash(a), sb = squash(b);
  if (sa.length >= 3 && sb.length >= 3 && (sa.includes(sb) || sb.includes(sa))) return true;
  const wb = new Set(words(b));
  return words(a).some(w => wb.has(w));
}
// "EpicGamesLauncher" → "Epic Games Launcher"; names like "TeamViewer", "iTunes" or "WinDjView" stay as they are.
function spaced(s) {
  if (!s || /\s/.test(s)) return s;
  const parts = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(' ');
  return parts.length >= 3 && parts.every(p => p.length >= 3) ? parts.join(' ') : s;
}
const clean = s => String(s || '').replace(/[®™©]/g, '').replace(/\s+/g, ' ').trim();

// A friendly shortcut name from the version info, checked against the folder and file names.
function appName({product, description, exe, appRoot}) {
  const context = `${path.basename(exe, '.exe')} ${path.basename(appRoot)} ${path.basename(path.dirname(appRoot))}`;
  const ok = s => s && s.length <= 40 && /[a-zа-я]/i.test(s) && !GENERIC.test(s) && !/\d{4}-\d\d-\d\d/.test(s) && related(s, context);
  const p = clean(product), d = clean(description);
  for (const s of [spaced(p), spaced(d)]) if (ok(s)) return s.replace(/[\\/:*?"<>|]/g, '');
  const folder = path.basename(appRoot);
  return clean(!GENERIC.test(folder) && /[a-z]/i.test(folder) ? folder : spaced(path.basename(exe, '.exe'))).replace(/[\\/:*?"<>|]/g, '');
}

// Windows programs are GUI (2) or console (3) apps; the subsystem sits in the PE optional header.
async function subsystem(file) {
  let fh;
  try {
    fh = await fsp.open(file, 'r');
    const buf = Buffer.alloc(1024);
    const {bytesRead} = await fh.read(buf, 0, 1024, 0);
    if (bytesRead < 64 || buf.readUInt16LE(0) !== 0x5a4d) return 0;
    const pe = buf.readUInt32LE(0x3c);
    if (pe + 24 + 70 > bytesRead || buf.readUInt32LE(pe) !== 0x4550) return 0;
    return buf.readUInt16LE(pe + 24 + 68);
  } catch { return 0; } finally { await fh?.close().catch(() => {}); }
}

// Executables up to `depth` folders below dir, skipping data and add-on folders.
async function findExes(dir, depth, out, budget) {
  let entries;
  try { entries = await fsp.readdir(dir, {withFileTypes: true}); } catch { return; }
  for (const e of entries) {
    if (budget.left-- <= 0) return;
    const full = path.join(dir, e.name);
    if (e.isFile() && /\.exe$/i.test(e.name) && !SKIP_EXE.test(path.basename(e.name, '.exe'))) out.push(full);
    else if (e.isDirectory() && !e.isSymbolicLink() && depth > 0 && !SKIP_DIR.test(e.name)) await findExes(full, depth - 1, out, budget);
  }
}

const lower = p => path.resolve(p).toLowerCase();
const within = (file, dir) => lower(file).startsWith(lower(dir) + '\\');

class Search {
  constructor({store, getIcon, getDrives, trash}) {
    this.store = store; this.getIcon = getIcon; this.getDrives = getDrives; this.trash = trash;
    this.found = new Map();
  }

  async status() { return psJson(STATUS, null, {timeout: 60000}); }

  // Program folders on every fixed drive (and per-user installs) whose app has no Start menu shortcut at all.
  async missingApps(targets) {
    const drives = (await this.getDrives().catch(() => [])).filter(d => d.type === 'Fixed').map(d => `${d.name}\\`);
    if (!drives.length) drives.push(`${process.env.SystemDrive || 'C:'}\\`);
    const roots = [];
    for (const d of drives) for (const p of ['Program Files', 'Program Files (x86)']) roots.push(path.join(d, p));
    if (process.env.LOCALAPPDATA) roots.push(path.join(process.env.LOCALAPPDATA, 'Programs'));
    const tops = [];
    for (const root of roots) {
      let entries;
      try { entries = await fsp.readdir(root, {withFileTypes: true}); } catch { continue; }
      for (const e of entries) {
        if (!e.isDirectory() || e.isSymbolicLink() || SKIP_TOP.test(e.name) || /install|setup|redist/i.test(e.name)) continue;
        const dir = path.join(root, e.name);
        // Any shortcut into this folder means the app (or its vendor's suite) is already in Start.
        if (!targets.some(t => within(t, dir))) tops.push({root, dir});
      }
    }
    // Candidate programs per app folder: "Vendor\App" when the exe sits deeper, otherwise the top folder.
    const groups = new Map();
    await Promise.all(tops.map(async ({root, dir}) => {
      const exes = [];
      await findExes(dir, 4, exes, {left: 4000});
      for (const exe of exes) {
        const parts = path.relative(root, exe).split('\\');
        const appRoot = parts.length >= 3 ? path.join(root, parts[0], parts[1]) : path.join(root, parts[0]);
        if (!groups.has(appRoot)) groups.set(appRoot, []);
        groups.get(appRoot).push(exe);
      }
    }));
    // Keep GUI programs and rank them: named like their folder, 64-bit, shallow, large.
    const picks = [];
    await Promise.all([...groups].map(async ([appRoot, exes]) => {
      const scored = [];
      for (const exe of exes.slice(0, 40)) {
        if (await subsystem(exe) !== 2) continue;
        const rel = path.relative(appRoot, exe);
        const st = await fsp.stat(exe).catch(() => null);
        const size = st?.size || 0;
        let score = Math.min(size / 20e6, 3) - rel.split('\\').length * 0.6;
        if (related(path.basename(exe, '.exe'), `${path.basename(appRoot)} ${path.basename(path.dirname(appRoot))}`)) score += 4;
        if (/\\(win64|x64|64bit)\\/i.test(exe)) score += 1;
        if (/\\(engine|win32|x86|32bit)\\/i.test(exe)) score -= 2;
        scored.push({exe, appRoot, score, size, mtime: st?.mtimeMs || 0});
      }
      scored.sort((a, b) => b.score - a.score);
      picks.push(...scored.slice(0, 4));
    }));
    if (!picks.length) return [];
    const info = new Map((await psJson(VERSIONS, {files: picks.map(p => p.exe)}, {timeout: 60000}) || []).map(v => [lower(v.file), v]));
    const best = new Map();
    for (const p of picks) {
      const v = info.get(lower(p.exe)) || {};
      const desc = `${v.description || ''} ${v.product || ''}`;
      if (SKIP_DESC.test(desc) || /microsoft.*windows.*operating system|операционная система/i.test(v.product || '')) continue;
      const named = !!(v.product || v.description);
      const cur = best.get(p.appRoot);
      const score = p.score + (named ? 2 : 0) + (related(desc, `${path.basename(p.appRoot)} ${path.basename(path.dirname(p.appRoot))}`) ? 3 : 0);
      if (!cur || score > cur.score) best.set(p.appRoot, {...p, ...v, score, named});
    }
    // A program in the top folder speaks for the whole folder: "PokerStars.NET/br" is part of PokerStars.
    for (const appRoot of [...best.keys()]) if (best.has(path.dirname(appRoot)) && !/program files/i.test(path.basename(path.dirname(appRoot)))) best.delete(appRoot);
    // One entry per app; the same program on two drives stays as two entries, each with its drive.
    const apps = [...best.values()].map(p => {
      const name = appName(p);
      const likely = p.named && related(`${name} ${path.basename(p.exe, '.exe')}`, `${path.basename(p.appRoot)} ${path.basename(path.dirname(p.appRoot))}`);
      return {
        id: crypto.createHash('sha1').update(lower(p.exe)).digest('hex').slice(0, 16),
        name, exe: p.exe, folder: p.appRoot, drive: p.exe.slice(0, 2).toUpperCase(),
        company: clean(p.company) || null, version: clean(p.version) || null, size: p.size, mtime: p.mtime, likely
      };
    });
    // The same app on several drives (often a copy from an earlier Windows): suggest only the newest one.
    for (const a of apps) if (apps.some(b => b !== a && b.name.toLowerCase() === a.name.toLowerCase() && b.likely && b.mtime > a.mtime)) { a.likely = false; a.older = true; }
    apps.sort((a, b) => (b.likely - a.likely) || a.name.localeCompare(b.name));
    return apps.slice(0, 80);
  }

  // Shortcuts Aster added earlier that are still in the Start menu.
  added() {
    const out = [];
    for (const a of this.store.activity) for (const lnk of a.searchShortcuts || []) if (typeof lnk === 'string' && fs.existsSync(lnk) && !out.includes(lnk)) out.push(lnk);
    return out.map(lnk => ({lnk, name: path.basename(lnk, '.lnk')}));
  }

  async check() {
    const st = await this.status();
    const targets = (st.targets || []).filter(t => typeof t === 'string' && path.isAbsolute(t));
    const apps = await this.missingApps(targets);
    this.found = new Map(apps.map(a => [a.id, a]));
    await Promise.all(apps.map(async a => { a.icon = await this.getIcon(a.exe).catch(() => null); }));
    // Start value 4 = disabled, 2 = automatic (delayed or not), 3 = manual (starts on demand).
    const disabled = st.start === '4' || st.service === 'Missing';
    return {
      platform: 'win32', admin: !!st.admin,
      service: {status: st.service, disabled, ok: st.service === 'Running' && !disabled},
      index: {ok: !!st.index, error: st.indexError || null},
      startMenu: {ok: !!st.startIndexed, shortcuts: st.lnkCount || 0},
      ui: !!st.ui, apps, added: this.added(), checkedAt: new Date().toISOString()
    };
  }

  async addApps({ids}) {
    const apps = (Array.isArray(ids) ? ids : []).map(id => this.found.get(id)).filter(Boolean)
      .filter(a => fs.existsSync(a.exe) && a.name && a.name.length <= 60);
    if (!apps.length) throw new Error('Check search again: the list is out of date.');
    const made = await psJson(ADD, {apps: apps.map(a => ({id: a.id, exe: a.exe, name: a.name, drive: a.drive}))}, {timeout: 60000}) || [];
    for (const m of made) this.found.delete(m.id);
    if (made.length) this.store.log({kind: 'tool', key: 'activity.searchShortcuts', vars: {count: made.length}, count: made.length, searchShortcuts: made.map(m => m.lnk)});
    return {added: made.length, shortcuts: made.map(m => m.lnk)};
  }

  // Sends Aster's shortcuts to the Recycle Bin; only shortcuts Aster recorded creating, inside the Start menu.
  async removeAdded() {
    const menu = path.join(process.env.APPDATA || os.homedir(), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    let n = 0;
    for (const {lnk} of this.added()) {
      if (!/\.lnk$/i.test(lnk) || !within(lnk, menu)) continue;
      await this.trash(lnk); n++;
    }
    if (n) this.store.log({kind: 'tool', key: 'activity.searchShortcutsRemoved', vars: {count: n}, count: n});
    return {removed: n};
  }

  async fix({id}) {
    if (id === 'restart') {
      const admin = (await this.status().catch(() => ({}))).admin;
      await psJson(RESTART_UI, {admin: !!admin}, {timeout: 60000});
      this.store.log({kind: 'tool', key: 'activity.searchRestarted'});
      return {ok: true};
    }
    const script = FIXES[id];
    if (!script) throw new Error('Unknown action');
    await this.elevated(script);
    this.store.log({kind: 'tool', key: id === 'rebuild' ? 'activity.searchRebuilt' : 'activity.searchServiceOn'});
    return {ok: true};
  }

  // Runs a fixed script as administrator: directly when Aster already is, otherwise behind Windows' UAC prompt.
  async elevated(script) {
    const isAdmin = (await this.status().catch(() => ({}))).admin;
    if (isAdmin) return powershell(`${script}\nOut-Json ([pscustomobject]@{ ok = $true })`, {timeout: 120000});
    const encoded = Buffer.from(`$ErrorActionPreference = 'Stop'\n${script}`, 'utf16le').toString('base64');
    const r = await psJson(String.raw`
try { $p = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', $in.cmd) -Verb RunAs -WindowStyle Hidden -Wait -PassThru }
catch { Out-Json ([pscustomobject]@{ cancelled = $true }); return }
Out-Json ([pscustomobject]@{ code = $p.ExitCode })`, {cmd: encoded}, {timeout: 180000});
    if (r?.cancelled) throw new Error('Windows did not get permission: the administrator prompt was cancelled.');
    if (r?.code) throw new Error('The repair did not finish. Try again with “Restart as administrator”.');
    return r;
  }
}

module.exports = {Search, appName, related, spaced, SKIP_EXE, SKIP_DIR};
