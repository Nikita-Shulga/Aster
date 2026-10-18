'use strict';
// PowerShell sources for registry work. Renderer data only ever arrives through $in (JSON on stdin).
// {CRLF}/{CR}/{LF} placeholders become PowerShell escapes (backticks cannot live inside template literals).
const ps = (s, ...v) => String.raw(s, ...v).replace(/\{CRLF\}/g, '`r`n').replace(/\{CR\}/g, '`r').replace(/\{LF\}/g, '`n');

const LIB = ps`
$HiveMap = @{
  'HKEY_CLASSES_ROOT' = [Microsoft.Win32.RegistryHive]::ClassesRoot; 'HKCR' = [Microsoft.Win32.RegistryHive]::ClassesRoot
  'HKEY_CURRENT_USER' = [Microsoft.Win32.RegistryHive]::CurrentUser; 'HKCU' = [Microsoft.Win32.RegistryHive]::CurrentUser
  'HKEY_LOCAL_MACHINE' = [Microsoft.Win32.RegistryHive]::LocalMachine; 'HKLM' = [Microsoft.Win32.RegistryHive]::LocalMachine
  'HKEY_USERS' = [Microsoft.Win32.RegistryHive]::Users; 'HKU' = [Microsoft.Win32.RegistryHive]::Users
  'HKEY_CURRENT_CONFIG' = [Microsoft.Win32.RegistryHive]::CurrentConfig; 'HKCC' = [Microsoft.Win32.RegistryHive]::CurrentConfig
}
$LongHive = @{ 'HKCR'='HKEY_CLASSES_ROOT'; 'HKCU'='HKEY_CURRENT_USER'; 'HKLM'='HKEY_LOCAL_MACHINE'; 'HKU'='HKEY_USERS'; 'HKCC'='HKEY_CURRENT_CONFIG' }
function Split-RegPath([string]$p) {
  $parts = $p.Trim('\').Split('\', 2)
  $h = $parts[0].ToUpper()
  if (-not $HiveMap.ContainsKey($h)) { throw "Unknown registry hive: $h" }
  $long = if ($LongHive.ContainsKey($h)) { $LongHive[$h] } else { $h }
  $sub = if ($parts.Count -gt 1) { $parts[1] } else { '' }
  return @{ hive = $HiveMap[$h]; long = $long; sub = $sub }
}
function Open-RegKey([string]$p, [bool]$write = $false) {
  $s = Split-RegPath $p
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($s.hive, [Microsoft.Win32.RegistryView]::Registry64)
  if (-not $s.sub) { return $base }
  $k = $base.OpenSubKey($s.sub, $write)
  $base.Close()
  return $k
}
function Full-RegPath([string]$p) { $s = Split-RegPath $p; if ($s.sub) { return $s.long + '\' + $s.sub } return $s.long }
function Hex([byte[]]$bytes) { if (-not $bytes -or $bytes.Length -eq 0) { return '' } return (($bytes | ForEach-Object { $_.ToString('x2') }) -join ',') }
function Format-RegLine($key, [string]$name) {
  $label = if ($name -eq '') { '@' } else { '"' + $name.Replace('\','\\').Replace('"','\"') + '"' }
  $kind = $key.GetValueKind($name)
  $data = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  switch ($kind) {
    'String' {
      $s = [string]$data
      if ($s.Contains("{CR}") -or $s.Contains("{LF}")) { return $label + '=hex(1):' + (Hex ([Text.Encoding]::Unicode.GetBytes($s + [char]0))) }
      return $label + '="' + $s.Replace('\','\\').Replace('"','\"') + '"'
    }
    'DWord' { return $label + '=dword:' + ([BitConverter]::ToUInt32([BitConverter]::GetBytes([int32]$data), 0)).ToString('x8') }
    'QWord' { return $label + '=hex(b):' + (Hex ([BitConverter]::GetBytes([int64]$data))) }
    'ExpandString' { return $label + '=hex(2):' + (Hex ([Text.Encoding]::Unicode.GetBytes([string]$data + [char]0))) }
    'MultiString' { $j = (@($data) -join [char]0) + [char]0 + [char]0; return $label + '=hex(7):' + (Hex ([Text.Encoding]::Unicode.GetBytes($j))) }
    'Binary' { return $label + '=hex:' + (Hex ([byte[]]$data)) }
    'None' { return $label + '=hex(0):' + (Hex ([byte[]]$data)) }
    default { return $null }
  }
}
function Export-KeyText([string]$p) {
  $tmp = [IO.Path]::GetTempFileName()
  try {
    $full = Full-RegPath $p
    $log = [IO.Path]::GetTempFileName()
    $proc = Start-Process -FilePath "$env:SystemRoot\System32\reg.exe" -ArgumentList @('export', ('"' + $full + '"'), ('"' + $tmp + '"'), '/y', '/reg:64') -NoNewWindow -Wait -PassThru -RedirectStandardOutput $log -RedirectStandardError ($log + '.err')
    Remove-Item -LiteralPath $log, ($log + '.err') -ErrorAction SilentlyContinue
    if ($proc.ExitCode -ne 0) { return $null }
    $text = [IO.File]::ReadAllText($tmp, [Text.Encoding]::Unicode)
    return ($text -replace '^\uFEFF?Windows Registry Editor Version 5\.00\r?\n', '').Trim()
  } finally { Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue }
}
function Write-RegFile([string]$file, [string[]]$blocks) {
  $text = "Windows Registry Editor Version 5.00" + "{CRLF}{CRLF}" + (($blocks | Where-Object { $_ }) -join "{CRLF}{CRLF}") + "{CRLF}"
  [IO.File]::WriteAllText($file, $text, [Text.Encoding]::Unicode)
}
function Delete-RegKey([string]$p) {
  $s = Split-RegPath $p
  if (-not $s.sub -or $s.sub.Split('\').Count -lt 2) { throw 'Refusing to delete a top-level key' }
  $parentPath = $s.sub.Substring(0, $s.sub.LastIndexOf('\'))
  $leaf = $s.sub.Substring($s.sub.LastIndexOf('\') + 1)
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($s.hive, [Microsoft.Win32.RegistryView]::Registry64)
  try {
    $parent = $base.OpenSubKey($parentPath, $true)
    if ($null -eq $parent) { return }
    try { $parent.DeleteSubKeyTree($leaf, $false) } finally { $parent.Close() }
  } finally { $base.Close() }
}
`;

const BACKUP_AND_DELETE = LIB + ps`
# $in: { file, items: [{ path, value (string|null), action: 'deleteKey'|'deleteValue' }] }
$blocks = New-Object System.Collections.Generic.List[string]
foreach ($it in $in.items) {
  try {
    if ($it.action -eq 'deleteKey') { $t = Export-KeyText $it.path; if ($t) { $blocks.Add($t) } }
    else {
      $k = Open-RegKey $it.path $false
      if ($null -ne $k) { try { if ($k.GetValueNames() -contains $it.value) { $line = Format-RegLine $k $it.value; if ($line) { $blocks.Add('[' + (Full-RegPath $it.path) + ']' + "{CRLF}" + $line) } } } finally { $k.Close() } }
    }
  } catch {}
}
Write-RegFile $in.file $blocks.ToArray()
$results = foreach ($it in $in.items) {
  try {
    if ($it.action -eq 'deleteKey') { Delete-RegKey $it.path }
    else { $k = Open-RegKey $it.path $true; if ($null -ne $k) { try { $k.DeleteValue($it.value, $false) } finally { $k.Close() } } }
    [pscustomobject]@{ id = $it.id; ok = $true }
  } catch { [pscustomobject]@{ id = $it.id; ok = $false; error = $_.Exception.Message } }
}
Out-Json @($results)
`;

const SCAN = LIB + ps`
$issues = New-Object System.Collections.Generic.List[object]
$sysWow = Join-Path $env:SystemRoot 'SysWOW64'
$sys32 = Join-Path $env:SystemRoot 'System32'
function Get-TargetPath([string]$cmd) {
  if (-not $cmd) { return $null }
  $c = [Environment]::ExpandEnvironmentVariables($cmd.Trim())
  if ($c.StartsWith('"')) { $end = $c.IndexOf('"', 1); if ($end -gt 1) { return $c.Substring(1, $end - 1) }; return $null }
  if ($c -match '^(?i)(?:[a-z]:\\windows\\system32\\)?rundll32(?:\.exe)?\s+"?([a-z]:\\[^",]+)') { return $Matches[1] }
  if ($c -match '^(?i)([a-z]:\\.*?\.(exe|dll|ocx|cpl|com|bat|cmd|msc|scr|lnk|ico|sys|vbs|ps1|jar))(?=\s|,|$)') { return $Matches[1] }
  if ($c -match '^(?i)[a-z]:\\[^"]*$' -and -not ($c -match '\s/')) { return $c }
  return $null
}
function Test-Missing([string]$p) {
  if (-not $p) { return $false }
  if ($p.Contains('%') -or $p.StartsWith('\\')) { return $false }
  try { if (-not [IO.Path]::IsPathRooted($p)) { return $false } } catch { return $false }
  $root = [IO.Path]::GetPathRoot($p)
  if (-not $root -or -not (Test-Path -LiteralPath $root)) { return $false }
  if (Test-Path -LiteralPath $p) { return $false }
  if ($p -like "$sys32\*" -and (Test-Path -LiteralPath ($sysWow + $p.Substring($sys32.Length)))) { return $false }
  if ($p -like "$sysWow\*" -and (Test-Path -LiteralPath ($sys32 + $p.Substring($sysWow.Length)))) { return $false }
  return $true
}
function Add-Issue($type, $path, $value, $action, $title, $target, $risk = 'low') {
  $admin = $path.StartsWith('HKLM') -or $path.StartsWith('HKEY_LOCAL_MACHINE')
  $issues.Add([pscustomobject]@{ type = $type; path = $path; value = $value; action = $action; title = $title; target = $target; admin = $admin; risk = $risk })
}
function Each-SubKey([string]$p, [scriptblock]$fn) {
  $k = $null; try { $k = Open-RegKey $p $false } catch {}
  if ($null -eq $k) { return }
  try { foreach ($n in $k.GetSubKeyNames()) { $sk = $null; try { $sk = $k.OpenSubKey($n, $false); if ($null -ne $sk) { & $fn $n $sk } } catch {} finally { if ($sk) { $sk.Close() } } } } finally { $k.Close() }
}
function Each-Value([string]$p, [scriptblock]$fn) {
  $k = $null; try { $k = Open-RegKey $p $false } catch {}
  if ($null -eq $k) { return }
  try { foreach ($n in $k.GetValueNames()) { try { & $fn $n $k } catch {} } } finally { $k.Close() }
}
$want = @{}; foreach ($c in @($in.categories)) { $want[$c] = $true }

if ($want['uninstall']) {
  foreach ($root in @('HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall', 'HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall')) {
    Each-SubKey $root { param($n, $sk)
      $u = [string]$sk.GetValue('UninstallString'); $name = [string]$sk.GetValue('DisplayName')
      if (-not $u -or $u -match '(?i)msiexec') { return }
      $t = Get-TargetPath $u
      $loc = [string]$sk.GetValue('InstallLocation')
      if ((Test-Missing $t) -and (-not $loc -or (Test-Missing $loc.Trim('"')))) {
        Add-Issue 'uninstall' ($root + '\' + $n) $null 'deleteKey' $(if ($name) { $name } else { $n }) $t 'medium'
      }
    }
  }
}
if ($want['apppaths']) {
  foreach ($root in @('HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths', 'HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths', 'HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths')) {
    Each-SubKey $root { param($n, $sk)
      $t = Get-TargetPath ([string]$sk.GetValue(''))
      if (Test-Missing $t) { Add-Issue 'apppaths' ($root + '\' + $n) $null 'deleteKey' $n $t }
    }
  }
}
if ($want['shareddlls']) {
  foreach ($root in @('HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\SharedDLLs', 'HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\SharedDLLs')) {
    Each-Value $root { param($n, $k) if (Test-Missing $n) { Add-Issue 'shareddlls' $root $n 'deleteValue' ([IO.Path]::GetFileName($n)) $n } }
  }
}
if ($want['startup']) {
  foreach ($root in @('HKCU\Software\Microsoft\Windows\CurrentVersion\Run', 'HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce', 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run', 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce', 'HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run')) {
    Each-Value $root { param($n, $k) $t = Get-TargetPath ([string]$k.GetValue($n)); if (Test-Missing $t) { Add-Issue 'startup' $root $n 'deleteValue' $n $t 'medium' } }
  }
}
if ($want['muicache']) {
  $root = 'HKCU\Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache'
  Each-Value $root { param($n, $k)
    if ($n -match '^(?i)([a-z]:\\.+\.(exe|dll))\.[A-Za-z]+$') { $t = $Matches[1]; if (Test-Missing $t) { Add-Issue 'muicache' $root $n 'deleteValue' ([IO.Path]::GetFileName($t)) $t } }
  }
}
if ($want['compat']) {
  foreach ($root in @('HKCU\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Compatibility Assistant\Store', 'HKCU\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers')) {
    Each-Value $root { param($n, $k) if ($n -match '^(?i)[a-z]:\\' -and (Test-Missing $n)) { Add-Issue 'compat' $root $n 'deleteValue' ([IO.Path]::GetFileName($n)) $n } }
  }
}
if ($want['installer']) {
  $root = 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Installer\Folders'
  Each-Value $root { param($n, $k) if (Test-Missing $n.TrimEnd('\')) { Add-Issue 'installer' $root $n 'deleteValue' $n $n } }
}
if ($want['fonts']) {
  foreach ($root in @('HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts', 'HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts')) {
    Each-Value $root { param($n, $k) $d = [string]$k.GetValue($n); if ($d -match '^(?i)[a-z]:\\' -and (Test-Missing $d)) { Add-Issue 'fonts' $root $n 'deleteValue' $n $d } }
  }
}
if ($want['help']) {
  foreach ($root in @('HKLM\SOFTWARE\Microsoft\Windows\Help', 'HKLM\SOFTWARE\Microsoft\Windows\HTML Help')) {
    Each-Value $root { param($n, $k) $d = [string]$k.GetValue($n); if ($d -match '^(?i)[a-z]:\\') { $f = Join-Path $d $n; if (Test-Missing $f) { Add-Issue 'help' $root $n 'deleteValue' $n $f } } }
  }
}
if ($want['applications']) {
  $root = 'HKCU\Software\Classes\Applications'
  Each-SubKey $root { param($n, $sk)
    $cmd = $null; try { $c = $sk.OpenSubKey('shell\open\command'); if ($c) { $cmd = [string]$c.GetValue(''); $c.Close() } } catch {}
    $t = Get-TargetPath $cmd
    if (Test-Missing $t) { Add-Issue 'applications' ($root + '\' + $n) $null 'deleteKey' $n $t }
  }
}
if ($want['com']) {
  $root = 'HKCU\Software\Classes\CLSID'
  Each-SubKey $root { param($n, $sk)
    foreach ($server in @('InprocServer32', 'LocalServer32')) {
      $s = $null; try { $s = $sk.OpenSubKey($server) } catch {}
      if ($s) {
        $t = Get-TargetPath ([string]$s.GetValue('')); $s.Close()
        if (Test-Missing $t) { $label = [string]$sk.GetValue(''); Add-Issue 'com' ($root + '\' + $n) $null 'deleteKey' $(if ($label) { $label } else { $n }) $t; break }
      }
    }
  }
}
if ($want['extensions']) {
  $classes = Open-RegKey 'HKCR' $false
  $root = 'HKCU\Software\Classes'
  Each-SubKey $root { param($n, $sk)
    if (-not $n.StartsWith('.') -or $sk.SubKeyCount -gt 0 -or $sk.ValueCount -ne 1) { return }
    $prog = [string]$sk.GetValue('')
    if (-not $prog) { return }
    $p = $classes.OpenSubKey($prog)
    if ($null -eq $p) { Add-Issue 'extensions' ($root + '\' + $n) $null 'deleteKey' $n $prog } else { $p.Close() }
  }
  $classes.Close()
}
if ($want['empty']) {
  $skip = @('Microsoft','Classes','Policies','WOW6432Node','Wow6432Node','Clients','RegisteredApplications','ODBC','Intel','Khronos','Partner','DefaultUserEnvironment','Windows','Aster')
  foreach ($root in @('HKCU\Software', 'HKLM\SOFTWARE')) {
    Each-SubKey $root { param($n, $sk)
      if ($skip -contains $n) { return }
      if ($sk.SubKeyCount -eq 0 -and $sk.ValueCount -eq 0) { Add-Issue 'empty' ($root + '\' + $n) $null 'deleteKey' $n $null; return }
      foreach ($c in $sk.GetSubKeyNames()) { $ck = $null; try { $ck = $sk.OpenSubKey($c); if ($ck -and $ck.SubKeyCount -eq 0 -and $ck.ValueCount -eq 0) { Add-Issue 'empty' ($root + '\' + $n + '\' + $c) $null 'deleteKey' ($n + '\' + $c) $null } } catch {} finally { if ($ck) { $ck.Close() } } }
    }
  }
}
Out-Json @($issues.ToArray())
`;

const LIST = LIB + ps`
# $in: { path }
$k = Open-RegKey $in.path $false
if ($null -eq $k) { throw 'This key no longer exists.' }
try {
  $keys = @($k.GetSubKeyNames() | Sort-Object | Select-Object -First 20000 | ForEach-Object {
    $n = $_; $has = $false
    try { $c = $k.OpenSubKey($n, $false); if ($c) { $has = $c.SubKeyCount -gt 0; $c.Close() } } catch {}
    [pscustomobject]@{ name = $n; hasChildren = $has }
  })
  $values = @($k.GetValueNames() | Sort-Object | ForEach-Object {
    $n = $_; $kind = [string]$k.GetValueKind($n)
    $d = $k.GetValue($n, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    switch ($kind) {
      'DWord' { $d = [BitConverter]::ToUInt32([BitConverter]::GetBytes([int32]$d), 0) }
      'QWord' { $d = ([BitConverter]::ToUInt64([BitConverter]::GetBytes([int64]$d), 0)).ToString() }
      'Binary' { $d = Hex ([byte[]]$d) }
      'None' { $d = Hex ([byte[]]$d) }
      'MultiString' { $d = @($d) }
      default { $d = [string]$d }
    }
    [pscustomobject]@{ name = $n; kind = $kind; data = $d }
  })
  $hasDefault = $k.GetValueNames() -contains ''
  Out-Json ([pscustomobject]@{ path = (Full-RegPath $in.path); keys = $keys; values = $values; hasDefault = $hasDefault })
} finally { $k.Close() }
`;

// Back up the current state (so it can be restored), then apply one edit.
const EDIT = LIB + ps`
# $in: { op: setValue|deleteValue|createKey|deleteKey|renameValue, path, name, newName, kind, data, backup }
$full = Full-RegPath $in.path
$blocks = New-Object System.Collections.Generic.List[string]
if ($in.op -eq 'deleteKey') {
  $t = Export-KeyText $in.path; if ($t) { $blocks.Add($t) }
} elseif ($in.op -eq 'createKey') {
  $blocks.Add('[-' + $full + '\' + $in.name + ']')
} else {
  $k = Open-RegKey $in.path $false
  if ($null -eq $k) { throw 'This key no longer exists.' }
  try {
    $names = @($in.name); if ($in.op -eq 'renameValue') { $names += $in.newName }
    $lines = foreach ($n in $names) {
      if ($k.GetValueNames() -contains $n) { Format-RegLine $k $n } else { $(if ($n -eq '') { '@' } else { '"' + $n.Replace('\','\\').Replace('"','\"') + '"' }) + '=-' }
    }
    $blocks.Add('[' + $full + ']' + "{CRLF}" + ($lines -join "{CRLF}"))
  } finally { $k.Close() }
}
if ($in.backup) { Write-RegFile $in.backup $blocks.ToArray() }

switch ($in.op) {
  'setValue' {
    $k = Open-RegKey $in.path $true
    if ($null -eq $k) { throw 'Cannot open this key for writing. Administrator rights may be required.' }
    try {
      $kind = [Microsoft.Win32.RegistryValueKind]$in.kind
      $d = $in.data
      switch ($in.kind) {
        'DWord' { $d = [int32][BitConverter]::ToInt32([BitConverter]::GetBytes([uint32]$d), 0) }
        'QWord' { $d = [int64][BitConverter]::ToInt64([BitConverter]::GetBytes([uint64]::Parse([string]$d)), 0) }
        'Binary' { $h = ([string]$d) -replace '[^0-9a-fA-F]', ''; $d = [byte[]]@(for ($i = 0; $i -lt $h.Length; $i += 2) { [Convert]::ToByte($h.Substring($i, 2), 16) }) }
        'MultiString' { $d = [string[]]@($d) }
        default { $d = [string]$d }
      }
      $k.SetValue([string]$in.name, $d, $kind)
    } finally { $k.Close() }
  }
  'deleteValue' { $k = Open-RegKey $in.path $true; if ($null -eq $k) { throw 'Cannot open this key for writing. Administrator rights may be required.' }; try { $k.DeleteValue([string]$in.name, $true) } finally { $k.Close() } }
  'renameValue' {
    $k = Open-RegKey $in.path $true; if ($null -eq $k) { throw 'Cannot open this key for writing. Administrator rights may be required.' }
    try {
      if ($k.GetValueNames() -contains $in.newName) { throw 'A value with that name already exists.' }
      $kind = $k.GetValueKind($in.name); $d = $k.GetValue($in.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $k.SetValue([string]$in.newName, $d, $kind); $k.DeleteValue([string]$in.name, $true)
    } finally { $k.Close() }
  }
  'createKey' { $k = Open-RegKey $in.path $true; if ($null -eq $k) { throw 'Cannot open this key for writing. Administrator rights may be required.' }; try { $n = $k.CreateSubKey([string]$in.name); if ($n) { $n.Close() } } finally { $k.Close() } }
  'deleteKey' { Delete-RegKey $in.path }
}
Out-Json ([pscustomobject]@{ ok = $true })
`;

const SEARCH = LIB + ps`
# $in: { path, query, keys, values, data, limit }
$q = [string]$in.query
$limit = [int]$in.limit
$deadline = (Get-Date).AddSeconds(25)
$found = New-Object System.Collections.Generic.List[object]
$stack = New-Object System.Collections.Generic.Stack[string]
$stack.Push((Full-RegPath $in.path))
$visited = 0
while ($stack.Count -gt 0 -and $found.Count -lt $limit -and (Get-Date) -lt $deadline) {
  $p = $stack.Pop(); $k = $null
  try { $k = Open-RegKey $p $false } catch {}
  if ($null -eq $k) { continue }
  $visited++
  try {
    $leaf = $p.Substring($p.LastIndexOf('\') + 1)
    if ($in.keys -and $leaf.IndexOf($q, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $found.Add([pscustomobject]@{ path = $p; kind = 'key'; name = $leaf }) }
    if ($in.values -or $in.data) {
      foreach ($n in $k.GetValueNames()) {
        $hit = $in.values -and $n.IndexOf($q, [StringComparison]::OrdinalIgnoreCase) -ge 0
        if (-not $hit -and $in.data) { try { $d = $k.GetValue($n, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); if ($d -is [string] -and $d.IndexOf($q, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $hit = $true } elseif ($d -is [string[]] -and (($d -join ' ').IndexOf($q, [StringComparison]::OrdinalIgnoreCase) -ge 0)) { $hit = $true } } catch {} }
        if ($hit) { $found.Add([pscustomobject]@{ path = $p; kind = 'value'; name = $n }); if ($found.Count -ge $limit) { break } }
      }
    }
    $subs = $k.GetSubKeyNames(); [Array]::Reverse($subs)
    foreach ($s in $subs) { $stack.Push($p + '\' + $s) }
  } catch {} finally { $k.Close() }
}
Out-Json ([pscustomobject]@{ results = @($found.ToArray()); complete = ($stack.Count -eq 0); visited = $visited })
`;

module.exports = {LIB, BACKUP_AND_DELETE, SCAN, LIST, EDIT, SEARCH};
