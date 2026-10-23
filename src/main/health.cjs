'use strict';
// Drive health from the disks' own self-monitoring (S.M.A.R.T.), as Windows reports it: overall status for every
// physical disk, plus temperature, wear and running hours when Windows shares them (usually only with admin rights).
const {psJson, arr} = require('./ps.cjs');

const SCRIPT = String.raw`
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$disks = @(Get-PhysicalDisk -ErrorAction Stop | ForEach-Object {
  $d = $_
  $r = $null
  try { $r = $d | Get-StorageReliabilityCounter -ErrorAction Stop } catch {}
  $letters = @(Get-Partition -DiskNumber $d.DeviceId -ErrorAction SilentlyContinue | Where-Object { $_.DriveLetter } | ForEach-Object { [string]$_.DriveLetter + ':' })
  [pscustomobject]@{
    id = [string]$d.DeviceId; name = [string]$d.FriendlyName; media = [string]$d.MediaType; bus = [string]$d.BusType
    health = [string]$d.HealthStatus; status = (@($d.OperationalStatus) -join ', '); size = [int64]$d.Size; letters = $letters
    temperature = if ($r -and $r.Temperature) { [int]$r.Temperature } else { $null }
    wear = if ($r -and $null -ne $r.Wear) { [int]$r.Wear } else { $null }
    hours = if ($r -and $r.PowerOnHours) { [int64]$r.PowerOnHours } else { $null }
    readErrors = if ($r -and $null -ne $r.ReadErrorsUncorrected) { [int64]$r.ReadErrorsUncorrected } else { $null }
  }
})
Out-Json ([pscustomobject]@{ admin = $admin; disks = $disks })`;

// "Healthy" / "Warning" / "Unhealthy" from Windows; an SSD worn past 90% or uncorrected read errors count as a warning.
function verdict(d) {
  if (/unhealthy/i.test(d.health)) return 'failing';
  if (/warning/i.test(d.health) || (d.wear != null && d.wear >= 90) || (d.readErrors > 0)) return 'warning';
  if (/healthy/i.test(d.health)) return 'good';
  return 'unknown';
}

async function disks() {
  const r = await psJson(SCRIPT, null, {timeout: 60000});
  return {
    admin: !!r?.admin, details: arr(r?.disks).some(d => d.temperature != null || d.wear != null || d.hours != null),
    disks: arr(r?.disks).map(d => ({
      id: d.id, name: (d.name || '').trim() || 'Disk ' + d.id, size: d.size || 0, letters: arr(d.letters),
      kind: /ssd/i.test(d.media) ? (/nvme/i.test(d.bus) ? 'nvme' : 'ssd') : /hdd/i.test(d.media) ? 'hdd' : /usb/i.test(d.bus) ? 'usb' : 'disk',
      bus: d.bus || null, health: d.health || null, verdict: verdict(d),
      temperature: d.temperature, wear: d.wear, hours: d.hours, readErrors: d.readErrors
    }))
  };
}

module.exports = {disks, verdict};
