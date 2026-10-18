'use strict';
const os = require('node:os');
const {psJson, arr} = require('./ps.cjs');

const SCRIPT = String.raw`
$cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$drives = @([IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady -and ($_.DriveType -eq 'Fixed' -or $_.DriveType -eq 'Removable') } | ForEach-Object {
  [pscustomobject]@{ name = $_.Name.Substring(0,2); label = $_.VolumeLabel; format = $_.DriveFormat; type = [string]$_.DriveType; total = $_.TotalSize; free = $_.AvailableFreeSpace }
})
$gpu = @()
try { $gpu = @(Get-CimInstance Win32_VideoController -Property Name -OperationTimeoutSec 4 | ForEach-Object { $_.Name }) } catch {}
$model = $null
try { $cs = Get-CimInstance Win32_ComputerSystem -Property Manufacturer,Model -OperationTimeoutSec 4; $model = ($cs.Manufacturer + ' ' + $cs.Model).Trim() } catch {}
Out-Json ([pscustomobject]@{
  product = [string]$cv.ProductName; display = [string]$cv.DisplayVersion; build = [string]$cv.CurrentBuild; ubr = $cv.UBR
  admin = $admin; drives = $drives; gpu = $gpu; model = $model
})
`;

let cached = null;
let lastCpu = os.cpus();

function cpuLoad() {
  const now = os.cpus();
  let idle = 0, total = 0;
  now.forEach((c, i) => {
    const p = lastCpu[i] || c;
    const t = k => c.times[k] - p.times[k];
    const sum = t('user') + t('nice') + t('sys') + t('idle') + t('irq');
    idle += t('idle'); total += sum;
  });
  lastCpu = now;
  return total > 0 ? Math.max(0, Math.min(100, Math.round(100 * (1 - idle / total)))) : 0;
}

async function info({refresh = false} = {}) {
  if (!cached || refresh) {
    const data = process.platform === 'win32' ? await psJson(SCRIPT).catch(() => null) : null;
    const build = Number(data?.build || 0);
    let product = data?.product || `${os.type()} ${os.release()}`;
    // The registry still reports "Windows 10" on Windows 11 builds.
    if (build >= 22000) product = product.replace('Windows 10', 'Windows 11');
    cached = {
      os: product,
      osVersion: data?.display ? `${data.display} (build ${data.build}${data.ubr ? '.' + data.ubr : ''})` : os.release(),
      build,
      arch: os.arch(),
      hostname: os.hostname(),
      user: os.userInfo().username,
      model: data?.model || null,
      cpu: os.cpus()[0]?.model?.trim() || 'Unknown CPU',
      cores: os.cpus().length,
      gpu: arr(data?.gpu).filter(Boolean),
      admin: data?.admin === true,
      // Hide tiny system/recovery partitions (e.g. "System Reserved").
      drives: arr(data?.drives).filter(d => d.total >= 2 * 1024 ** 3)
    };
  }
  return {...cached, memory: {total: os.totalmem(), free: os.freemem()}, uptime: os.uptime(), cpuLoad: cpuLoad()};
}

function live() {
  return {memory: {total: os.totalmem(), free: os.freemem()}, cpuLoad: cpuLoad(), uptime: os.uptime()};
}

module.exports = {info, live};
