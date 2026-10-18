'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {psJson, arr} = require('./ps.cjs');
const S = require('./registry-ps.cjs');

// Windows itself (Task Manager, Settings) stores the enabled state of Run entries and
// startup-folder shortcuts in Explorer\StartupApproved. Aster uses the same mechanism.
const LIST = S.LIB + String.raw`
$items = New-Object System.Collections.Generic.List[object]
$approvedBase = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved'
function Get-Approved($hive, $sub, $name) {
  $k = $null
  try { $k = (Open-RegKey ($hive + '\' + $approvedBase + '\' + $sub) $false) } catch {}
  if ($null -eq $k) { return $true }
  try { $v = $k.GetValue($name); if ($v -is [byte[]] -and $v.Length -gt 0) { return (($v[0] -band 1) -eq 0) } return $true } finally { $k.Close() }
}
function Get-Exe([string]$cmd) {
  if (-not $cmd) { return $null }
  $c = [Environment]::ExpandEnvironmentVariables($cmd.Trim())
  if ($c.StartsWith('"')) { $e = $c.IndexOf('"', 1); if ($e -gt 1) { return $c.Substring(1, $e - 1) } }
  if ($c -match '^(?i)(.+?\.(exe|bat|cmd|com|lnk|vbs|ps1))(\s|$)') { return $Matches[1] }
  return $c
}
function Get-Company([string]$p) { try { if ($p -and (Test-Path -LiteralPath $p -PathType Leaf)) { return (Get-Item -LiteralPath $p).VersionInfo.CompanyName } } catch {}; return $null }
function Add-Item($h) {
  $exe = Get-Exe $h.command
  $exists = $false; try { $exists = [bool]($exe -and (Test-Path -LiteralPath $exe)) } catch {}
  $h.file = $exe; $h.exists = $exists; $h.publisher = Get-Company $exe
  $items.Add([pscustomobject]$h)
}
$regs = @(
  @{ hive = 'HKCU'; path = 'Software\Microsoft\Windows\CurrentVersion\Run'; approved = 'Run'; scope = 'user'; label = 'Registry · Current user' },
  @{ hive = 'HKLM'; path = 'SOFTWARE\Microsoft\Windows\CurrentVersion\Run'; approved = 'Run'; scope = 'machine'; label = 'Registry · All users' },
  @{ hive = 'HKLM'; path = 'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; approved = 'Run32'; scope = 'machine'; label = 'Registry · All users (32-bit)' },
  @{ hive = 'HKCU'; path = 'Software\Microsoft\Windows\CurrentVersion\RunOnce'; approved = $null; scope = 'user'; label = 'Run once · Current user' },
  @{ hive = 'HKLM'; path = 'SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce'; approved = $null; scope = 'machine'; label = 'Run once · All users' }
)
foreach ($r in $regs) {
  $k = $null; try { $k = Open-RegKey ($r.hive + '\' + $r.path) $false } catch {}
  if ($null -eq $k) { continue }
  try {
    foreach ($n in $k.GetValueNames()) {
      if (-not $n) { continue }
      $cmd = [string]$k.GetValue($n, '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $enabled = if ($r.approved) { Get-Approved $r.hive $r.approved $n } else { $true }
      Add-Item @{ type = 'registry'; name = $n; command = $cmd; location = $r.hive + '\' + $r.path; approvedKey = $(if ($r.approved) { $r.hive + '\' + $approvedBase + '\' + $r.approved } else { $null }); scope = $r.scope; source = $r.label; enabled = $enabled; canToggle = [bool]$r.approved }
    }
  } finally { $k.Close() }
}
$folders = @(
  @{ path = [Environment]::GetFolderPath('Startup'); hive = 'HKCU'; scope = 'user'; label = 'Startup folder · Current user' },
  @{ path = [Environment]::GetFolderPath('CommonStartup'); hive = 'HKLM'; scope = 'machine'; label = 'Startup folder · All users' }
)
$shell = New-Object -ComObject WScript.Shell
foreach ($f in $folders) {
  if (-not $f.path -or -not (Test-Path -LiteralPath $f.path)) { continue }
  Get-ChildItem -LiteralPath $f.path -File -Force | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object {
    $target = $_.FullName
    if ($_.Extension -eq '.lnk') { try { $lnk = $shell.CreateShortcut($_.FullName); if ($lnk.TargetPath) { $target = '"' + $lnk.TargetPath + '" ' + $lnk.Arguments } } catch {} }
    Add-Item @{ type = 'folder'; name = $_.BaseName; command = $target.Trim(); location = $_.FullName; approvedKey = ($f.hive + '\' + $approvedBase + '\StartupFolder'); approvedName = $_.Name; scope = $f.scope; source = $f.label; enabled = (Get-Approved $f.hive 'StartupFolder' $_.Name); canToggle = $true }
  }
}
try {
  Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskPath -notlike '\Microsoft\*' } | ForEach-Object {
    $t = $_
    $trig = @($t.Triggers | Where-Object { $_.CimClass.CimClassName -match 'Logon|Boot' })
    if ($trig.Count -eq 0) { return }
    $a = @($t.Actions | Where-Object { $_.Execute }) | Select-Object -First 1
    if (-not $a) { return }
    $cmd = ('"' + $a.Execute.Trim('"') + '" ' + $a.Arguments).Trim()
    $when = if ($trig[0].CimClass.CimClassName -match 'Boot') { 'At startup' } else { 'At sign-in' }
    Add-Item @{ type = 'task'; name = $t.TaskName; command = $cmd; location = $t.TaskPath + $t.TaskName; taskPath = $t.TaskPath; scope = 'machine'; source = 'Scheduled task · ' + $when; enabled = ($t.State -ne 'Disabled'); canToggle = $true; author = [string]$t.Author }
  }
} catch {}
try {
  Get-CimInstance Win32_Service -Property Name,DisplayName,StartMode,State,PathName,Description -OperationTimeoutSec 10 -ErrorAction Stop |
    Where-Object { $_.PathName -and $_.PathName -notmatch '(?i)\\Windows\\(System32|SysWOW64)\\(svchost|lsass|services)' -and $_.PathName -notmatch '(?i)^"?[a-z]:\\Windows\\' -and $_.StartMode -in @('Auto', 'Manual', 'Disabled') } | ForEach-Object {
    $s = $_
    $h = @{ type = 'service'; name = $s.DisplayName; serviceName = $s.Name; command = $s.PathName; location = 'HKLM\SYSTEM\CurrentControlSet\Services\' + $s.Name; scope = 'machine'; source = 'Service · ' + $s.StartMode; enabled = ($s.StartMode -eq 'Auto'); canToggle = ($s.StartMode -ne 'Disabled'); state = [string]$s.State; description = [string]$s.Description; startMode = [string]$s.StartMode }
    Add-Item $h
  }
} catch {}
Out-Json @($items.ToArray())
`;

const SET_APPROVED = S.LIB + String.raw`
# $in: { key, name, enabled }
$s = Split-RegPath $in.key
$base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($s.hive, [Microsoft.Win32.RegistryView]::Registry64)
try { $sub = $base.CreateSubKey($s.sub, $true) } catch { $sub = $null } finally { $base.Close() }
if ($null -eq $sub) { throw 'Access denied. Administrator rights are required for entries that apply to all users.' }
try {
  if ($in.enabled) { $bytes = [byte[]](2,0,0,0,0,0,0,0,0,0,0,0) }
  else { $bytes = [byte[]](@(3,0,0,0) + [BitConverter]::GetBytes([DateTime]::Now.ToFileTime())) }
  $sub.SetValue([string]$in.name, $bytes, [Microsoft.Win32.RegistryValueKind]::Binary)
} finally { $sub.Close() }
Out-Json ([pscustomobject]@{ ok = $true })
`;

const TASK = String.raw`
# $in: { op: enable|disable|delete|export, path, name, file }
switch ($in.op) {
  'enable' { Enable-ScheduledTask -TaskPath $in.path -TaskName $in.name | Out-Null }
  'disable' { Disable-ScheduledTask -TaskPath $in.path -TaskName $in.name | Out-Null }
  'delete' {
    if ($in.file) { Export-ScheduledTask -TaskPath $in.path -TaskName $in.name | Set-Content -LiteralPath $in.file -Encoding Unicode }
    Unregister-ScheduledTask -TaskPath $in.path -TaskName $in.name -Confirm:$false
  }
}
Out-Json ([pscustomobject]@{ ok = $true })
`;

const SERVICE = String.raw`
# $in: { name, mode: Automatic|Manual }
Set-Service -Name $in.name -StartupType $in.mode
Out-Json ([pscustomobject]@{ ok = $true })
`;

const ADD = S.LIB + String.raw`
# $in: { name, command }
$k = Open-RegKey 'HKCU\Software\Microsoft\Windows\CurrentVersion\Run' $true
try { if ($k.GetValueNames() -contains $in.name) { throw 'An entry with this name already exists.' }; $k.SetValue([string]$in.name, [string]$in.command, [Microsoft.Win32.RegistryValueKind]::String) } finally { $k.Close() }
Out-Json ([pscustomobject]@{ ok = $true })
`;

const accessHint = e => {
  const m = String(e?.message || e);
  return /access|denied|unauthori[sz]ed|0x80070005|requested registry access/i.test(m) ? new Error('Administrator rights are required for this entry. Use "Restart as administrator".') : e;
};

class Startup {
  constructor({store, getIcon, trash}) { this.store = store; this.getIcon = getIcon; this.trash = trash; this.items = new Map(); }

  async list() {
    const raw = arr(await psJson(LIST, null, {timeout: 90000}));
    this.items.clear();
    const items = raw.map(r => {
      const id = crypto.createHash('sha1').update([r.type, r.location, r.name].join('|')).digest('hex').slice(0, 16);
      const item = {id, ...r, admin: r.scope === 'machine'};
      this.items.set(id, item);
      return item;
    });
    return {items};
  }

  async icons({ids}) {
    const out = {};
    await Promise.all(arr(ids).slice(0, 200).map(async id => {
      const it = this.items.get(id);
      if (it?.file && it.exists && fs.existsSync(it.file)) out[id] = await this.getIcon(it.file).catch(() => null);
    }));
    return out;
  }

  async toggle({id, enabled}) {
    const it = this.items.get(id);
    if (!it || !it.canToggle) throw new Error('This entry cannot be toggled. Refresh the list.');
    try {
      if (it.type === 'registry' || it.type === 'folder') await psJson(SET_APPROVED, {key: it.approvedKey, name: it.type === 'folder' ? it.approvedName : it.name, enabled: !!enabled});
      else if (it.type === 'task') await psJson(TASK, {op: enabled ? 'enable' : 'disable', path: it.taskPath, name: it.name});
      else if (it.type === 'service') await psJson(SERVICE, {name: it.serviceName, mode: enabled ? 'Automatic' : 'Manual'});
    } catch (e) { throw accessHint(e); }
    it.enabled = !!enabled;
    this.store.log({kind: 'startup', title: `${enabled ? 'Enabled' : 'Disabled'} ${it.name} at startup`});
    return {ok: true};
  }

  async remove({id}) {
    const it = this.items.get(id);
    if (!it) throw new Error('Refresh the list and try again.');
    let backup = null;
    try {
      if (it.type === 'registry') {
        const b = this.store.newBackupFile('startup');
        const r = arr(await psJson(S.BACKUP_AND_DELETE, {file: b.file, items: [{id, path: it.location, value: it.name, action: 'deleteValue'}]}));
        if (!r[0]?.ok) throw new Error(r[0]?.error || 'Could not delete the entry.');
        backup = b.name;
      } else if (it.type === 'folder') {
        await this.trash(it.location);
      } else if (it.type === 'task') {
        const b = this.store.newBackupFile('task');
        await psJson(TASK, {op: 'delete', path: it.taskPath, name: it.name, file: b.file.replace(/\.reg$/, '.xml')});
      } else throw new Error('Services can be switched to manual start but not deleted.');
    } catch (e) { throw accessHint(e); }
    this.items.delete(id);
    this.store.log({kind: 'startup', title: `Removed ${it.name} from startup`, backup});
    return {ok: true, backup};
  }

  async add({name, command}) {
    if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('Enter a name for the entry.');
    if (typeof command !== 'string' || !command.trim()) throw new Error('Choose a program.');
    await psJson(ADD, {name: name.trim(), command: command.trim()});
    this.store.log({kind: 'startup', title: `Added ${name.trim()} to startup`});
    return {ok: true};
  }

  fileOf(id) { const it = this.items.get(id); return it?.type === 'folder' ? it.location : it?.file && path.isAbsolute(it.file) ? it.file : null; }
}

module.exports = {Startup};
