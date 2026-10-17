'use strict';

const { execFile } = require('node:child_process');
const path = require('node:path');

const MAX_OUTPUT = 6 * 1024 * 1024;

// These strings are application code, never assembled from renderer input.
const WINDOWS_PREAMBLE = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$items = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[string]
`;

const WINDOWS_APPLICATIONS = WINDOWS_PREAMBLE + String.raw`
foreach ($hive in @([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryHive]::LocalMachine)) {
  foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64, [Microsoft.Win32.RegistryView]::Registry32)) {
    $base = $null; $key = $null
    try {
      $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, $view)
      $key = $base.OpenSubKey('SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', $false)
      if ($null -ne $key) {
        foreach ($sub in $key.GetSubKeyNames()) {
          if ($items.Count -ge 2000) { $warnings.Add('Inventory limit reached.'); break }
          $entry = $null
          try {
            $entry = $key.OpenSubKey($sub, $false)
            $name = $entry.GetValue('DisplayName')
            if ($name -and $entry.GetValue('SystemComponent') -ne 1) {
              $items.Add([pscustomobject]@{
                name = [string]$name
                version = [string]$entry.GetValue('DisplayVersion')
                publisher = [string]$entry.GetValue('Publisher')
                path = [string]$entry.GetValue('InstallLocation')
                iconPath = [string]$entry.GetValue('DisplayIcon')
                estimatedSizeKB = $entry.GetValue('EstimatedSize')
                installedOn = [string]$entry.GetValue('InstallDate')
                source = 'Uninstall registry: ' + $hive + '/' + $view
                key = [string]$sub
              })
            }
          } catch { $warnings.Add('An application entry could not be read.') }
          finally { if ($null -ne $entry) { $entry.Close() } }
        }
      }
    } catch { $warnings.Add('A registry inventory source is unavailable.') }
    finally { if ($null -ne $key) { $key.Close() }; if ($null -ne $base) { $base.Close() } }
  }
}
try {
  Get-AppxPackage -PackageTypeFilter Main -ErrorAction Stop | Select-Object -First 2000 | ForEach-Object {
    $items.Add([pscustomobject]@{
      name = [string]$_.Name; version = [string]$_.Version
      publisher = [string]$_.Publisher; path = [string]$_.InstallLocation
      source = 'Current-user app package'; key = [string]$_.PackageFullName
    })
  }
} catch { $warnings.Add('Current-user app package inventory is unavailable.') }
ConvertTo-Json -InputObject ([pscustomobject]@{items = @($items.ToArray()); warnings = @($warnings.ToArray())}) -Depth 4 -Compress
`;

const WINDOWS_STARTUP = WINDOWS_PREAMBLE + String.raw`
foreach ($hive in @([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryHive]::LocalMachine)) {
  foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64, [Microsoft.Win32.RegistryView]::Registry32)) {
    foreach ($section in @('Run', 'RunOnce')) {
      $base = $null; $key = $null
      try {
        $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, $view)
        $key = $base.OpenSubKey(('SOFTWARE\Microsoft\Windows\CurrentVersion\' + $section), $false)
        if ($null -ne $key) {
          foreach ($name in $key.GetValueNames()) {
            if ($items.Count -ge 2000) { $warnings.Add('Inventory limit reached.'); break }
            $kind = $key.GetValueKind($name)
            if ($kind -eq [Microsoft.Win32.RegistryValueKind]::String -or $kind -eq [Microsoft.Win32.RegistryValueKind]::ExpandString) {
              $items.Add([pscustomobject]@{
                name = [string]$name
                source = [string]$hive + '/' + $view + '/' + $section
                key = [string]$name
              })
            }
          }
        }
      } catch { $warnings.Add('A startup registry source is unavailable.') }
      finally { if ($null -ne $key) { $key.Close() }; if ($null -ne $base) { $base.Close() } }
    }
  }
}
foreach ($folderType in @([Environment+SpecialFolder]::Startup, [Environment+SpecialFolder]::CommonStartup)) {
  try {
    $folder = [Environment]::GetFolderPath($folderType)
    if ($folder -and (Test-Path -LiteralPath $folder -PathType Container)) {
      Get-ChildItem -LiteralPath $folder -File -ErrorAction Stop | Select-Object -First 500 | ForEach-Object {
        if ($_.Name -ne 'desktop.ini') {
          $items.Add([pscustomobject]@{
            name = [string]$_.BaseName; path = [string]$_.FullName
            source = 'Startup folder: ' + $folderType; key = [string]$_.FullName
          })
        }
      }
    }
  } catch { $warnings.Add('A startup folder could not be read.') }
}
ConvertTo-Json -InputObject ([pscustomobject]@{items = @($items.ToArray()); warnings = @($warnings.ToArray())}) -Depth 4 -Compress
`;

// Local, read-only CIM queries. Explicit properties avoid serial numbers and user labels.
const WINDOWS_DIAGNOSTICS = WINDOWS_PREAMBLE + String.raw`
$volumes = @(); $batteries = @(); $volumesAvailable = $false; $batteryAvailable = $false
try {
  $volumes = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType = 3' -Property DeviceID,Size,FreeSpace,FileSystem -OperationTimeoutSec 5 -ErrorAction Stop | Select-Object -First 32 | ForEach-Object {
    [pscustomobject]@{ drive = $_.DeviceID; total = $_.Size; free = $_.FreeSpace; fileSystem = $_.FileSystem }
  })
  $volumesAvailable = $true
} catch {}
if (-not $volumesAvailable) {
  try {
    $volumes = @([IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq [IO.DriveType]::Fixed -and $_.IsReady } | Select-Object -First 32 | ForEach-Object {
      [pscustomobject]@{ drive = $_.Name.Substring(0,2); total = $_.TotalSize; free = $_.AvailableFreeSpace; fileSystem = $_.DriveFormat }
    })
    $volumesAvailable = $true
  } catch {}
}
try {
  $batteries = @(Get-CimInstance -ClassName Win32_Battery -Property EstimatedChargeRemaining,BatteryStatus -OperationTimeoutSec 5 -ErrorAction Stop | Select-Object -First 8 | ForEach-Object {
    [pscustomobject]@{ chargePercent = $_.EstimatedChargeRemaining; stateCode = $_.BatteryStatus }
  })
  $batteryAvailable = $true
} catch {}
ConvertTo-Json -InputObject ([pscustomobject]@{volumes = @($volumes); batteries = @($batteries); volumesAvailable = $volumesAvailable; batteryAvailable = $batteryAvailable}) -Depth 4 -Compress
`;

const WINDOWS_DRIVERS = WINDOWS_PREAMBLE + String.raw`
Get-CimInstance Win32_PnPSignedDriver | Select-Object -First 2000 | ForEach-Object {
 $items.Add([pscustomobject]@{name=[string]$_.DeviceName;provider=[string]$_.DriverProviderName;version=[string]$_.DriverVersion;date=if($_.DriverDate){$_.DriverDate.ToString('yyyy-MM-dd')}else{''};signed=[bool]$_.IsSigned;inf=[string]$_.InfName})
}
@{items=@($items.ToArray())} | ConvertTo-Json -Compress -Depth 4
`;

function windowsPowerShell(env = process.env) {
  // Only accept an absolute local Windows directory, never PATH lookup or UNC.
  const root = env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows';
  if (!/^[a-z]:\\Windows\\?$/i.test(root)) {
    const error = new Error('The Windows system directory could not be verified.');
    error.code = 'UNVERIFIED_SYSTEM_DIRECTORY';
    throw error;
  }
  return path.win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

// Fixed, read-only process metadata. Never returns command lines or executable paths.
const WINDOWS_PERFORMANCE = WINDOWS_PREAMBLE + String.raw`
foreach ($process in [Diagnostics.Process]::GetProcesses()) {
  if ($items.Count -ge 1000) { $warnings.Add('Process inventory limit reached.'); break }
  try {
    $cpu = $null; $started = $null; $executable = $null
    try { $cpu = $process.TotalProcessorTime.TotalSeconds } catch {}
    try { $started = $process.StartTime.ToUniversalTime().ToString('o') } catch {}
    try { $executable = $process.MainModule.FileName } catch {}
    $items.Add([pscustomobject]@{ id = $process.Id; name = $process.ProcessName; memoryBytes = $process.WorkingSet64; cpuSeconds = $cpu; startedAt = $started; executablePath = $executable })
  } catch {} finally { $process.Dispose() }
}
ConvertTo-Json -InputObject ([pscustomobject]@{items = @($items.ToArray()); warnings = @($warnings.ToArray())}) -Depth 4 -Compress
`;

function powershellArgs(script) {
  if (![WINDOWS_APPLICATIONS, WINDOWS_STARTUP, WINDOWS_DIAGNOSTICS, WINDOWS_PERFORMANCE, WINDOWS_DRIVERS].includes(script)) throw new Error('Unknown collector');
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
}

function isAllowedCommand(file, args) {
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) return false;
  const same = expected => args.length === expected.length && args.every((value, index) => value === expected[index]);
  if (/^[a-z]:\\Windows\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/i.test(file)) {
    return [WINDOWS_APPLICATIONS, WINDOWS_STARTUP, WINDOWS_DIAGNOSTICS, WINDOWS_PERFORMANCE, WINDOWS_DRIVERS].some(script => same(powershellArgs(script)));
  }
  if (file === '/usr/bin/pmset') return same(['-g', 'batt']);
  if (file === '/usr/sbin/system_profiler') return same(['SPApplicationsDataType', '-json', '-detailLevel', 'mini']);
  if (file === '/usr/bin/plutil') return args.length === 6 && same(['-convert', 'json', '-o', '-', '--', args[5]]) && path.posix.isAbsolute(args[5]) && args[5].endsWith('.plist') && path.posix.normalize(args[5]) === args[5];
  return false;
}

function runCommand(file, args, options = {}) {
  if (!isAllowedCommand(file, args)) return Promise.reject(Object.assign(new Error('Unknown collector command.'), { code: 'COMMAND_DENIED' }));
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      encoding: 'utf8', shell: false, windowsHide: true,
      timeout: Math.min(Math.max(Number(options.timeout) || 15000, 1), 15000), maxBuffer: Math.min(Math.max(Number(options.maxBuffer) || MAX_OUTPUT, 1), MAX_OUTPUT),
      env: { ...process.env, LANG: 'C', LC_ALL: 'C' }
    }, (error, stdout) => {
      if (error) {
        // Do not return stderr, command strings, environment variables, or paths.
        const safe = new Error(error.killed ? 'The collector timed out.' : 'The collector could not complete.');
        safe.code = error.killed ? 'TIMEOUT' : error.code === 'ENOENT' ? 'UNAVAILABLE' : error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'OUTPUT_LIMIT' : 'COLLECTOR_FAILED';
        reject(safe);
      } else resolve(stdout);
    });
  });
}

module.exports = { WINDOWS_DRIVERS, isAllowedCommand, WINDOWS_DIAGNOSTICS, WINDOWS_PERFORMANCE, WINDOWS_APPLICATIONS, WINDOWS_STARTUP, windowsPowerShell, powershellArgs, runCommand, MAX_OUTPUT };
