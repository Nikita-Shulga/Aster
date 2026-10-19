'use strict';
// Monitor resolution and refresh rate through the Win32 display-settings API.
const {psJson, arr} = require('./ps.cjs');
const {td} = require('./i18n.cjs');

const NATIVE = String.raw`
if (-not ('AsterDisplay' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class AsterDisplay {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra; public int dmFields;
    public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput;
    public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight; public int dmDisplayFlags; public int dmDisplayFrequency;
    public int dmICMMethod; public int dmICMIntent; public int dmMediaType; public int dmDitherType; public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
  }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool EnumDisplayDevices(string device, uint num, ref DISPLAY_DEVICE dd, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool EnumDisplaySettings(string device, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int ChangeDisplaySettingsEx(string device, ref DEVMODE dm, IntPtr hwnd, uint flags, IntPtr lParam);
  public static DEVMODE NewMode() { DEVMODE d = new DEVMODE(); d.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE)); return d; }
  public static DISPLAY_DEVICE NewDevice() { DISPLAY_DEVICE d = new DISPLAY_DEVICE(); d.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE)); return d; }
}
'@
}
`;

const LIST = NATIVE + String.raw`
$names = @{}
try { Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -OperationTimeoutSec 4 -ErrorAction Stop | ForEach-Object { $n = -join ($_.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }); if ($n) { $names[$_.InstanceName.Split('\')[1]] = $n } } } catch {}
$out = @()
for ($i = 0; $i -lt 16; $i++) {
  $d = [AsterDisplay]::NewDevice()
  if (-not [AsterDisplay]::EnumDisplayDevices([NullString]::Value, [uint32]$i, [ref]$d, 0)) { break }
  if (($d.StateFlags -band 1) -eq 0) { continue }
  $mon = [AsterDisplay]::NewDevice(); $monName = $null; $monId = $null
  if ([AsterDisplay]::EnumDisplayDevices($d.DeviceName, 0, [ref]$mon, 0)) { $monName = $mon.DeviceString; $monId = ($mon.DeviceID -split '\\')[1] }
  if ($monId -and $names.ContainsKey($monId)) { $monName = $names[$monId] }
  $cur = [AsterDisplay]::NewMode(); [void][AsterDisplay]::EnumDisplaySettings($d.DeviceName, -1, [ref]$cur)
  $modes = @{}
  for ($m = 0; $m -lt 2000; $m++) {
    $dm = [AsterDisplay]::NewMode()
    if (-not [AsterDisplay]::EnumDisplaySettings($d.DeviceName, $m, [ref]$dm)) { break }
    if ($dm.dmBitsPerPel -lt 32 -or $dm.dmDisplayFrequency -le 1) { continue }
    $modes["$($dm.dmPelsWidth)x$($dm.dmPelsHeight)@$($dm.dmDisplayFrequency)"] = [pscustomobject]@{ w = $dm.dmPelsWidth; h = $dm.dmPelsHeight; f = $dm.dmDisplayFrequency }
  }
  $out += [pscustomobject]@{ device = $d.DeviceName; adapter = $d.DeviceString; name = $(if ($monName) { $monName } else { 'Display ' + ($i + 1) }); primary = (($d.StateFlags -band 4) -ne 0); width = $cur.dmPelsWidth; height = $cur.dmPelsHeight; freq = $cur.dmDisplayFrequency; modes = @($modes.Values) }
}
Out-Json @($out)
`;

const SET = NATIVE + String.raw`
$dm = [AsterDisplay]::NewMode()
if (-not [AsterDisplay]::EnumDisplaySettings($in.device, -1, [ref]$dm)) { throw 'Display not found' }
$dm.dmPelsWidth = [int]$in.width; $dm.dmPelsHeight = [int]$in.height; $dm.dmDisplayFrequency = [int]$in.freq
$dm.dmFields = 0x80000 -bor 0x100000 -bor 0x400000
$test = [AsterDisplay]::ChangeDisplaySettingsEx($in.device, [ref]$dm, [IntPtr]::Zero, 2, [IntPtr]::Zero)
if ($test -ne 0) { throw "This display mode is not supported (code $test)." }
$r = [AsterDisplay]::ChangeDisplaySettingsEx($in.device, [ref]$dm, [IntPtr]::Zero, 1, [IntPtr]::Zero)
Out-Json ([pscustomobject]@{ result = $r })
`;

class Display {
  constructor({store}) { this.store = store; }
  async list() {
    // Monitors without a reported name are called "Display 1", "Display 2"… by the script.
    const name = n => { const m = /^Display (\d+)$/.exec(n || ''); return m ? td('Display {n}', {n: m[1]}) : n; };
    const items = arr(await psJson(LIST, null, {timeout: 40000})).map(d => ({...d, name: name(d.name), modes: arr(d.modes).sort((a, b) => b.w * b.h - a.w * a.h || b.f - a.f)}));
    return {items};
  }
  async set({device, width, height, freq}) {
    if (typeof device !== 'string' || !/^\\\\\.\\DISPLAY\d+$/i.test(device)) throw new Error('Invalid display');
    const [w, h, f] = [width, height, freq].map(Number);
    if (![w, h, f].every(n => Number.isInteger(n) && n > 0 && n < 20000)) throw new Error('Invalid display mode');
    const r = await psJson(SET, {device, width: w, height: h, freq: f}, {timeout: 30000}).catch(e => {
      const m = /^This display mode is not supported \(code (-?\d+)\)\.$/.exec(e?.message || '');
      throw m ? new Error(td('This display mode is not supported (code {code}).', {code: m[1]})) : e;
    });
    this.store.log({kind: 'tweak', key: 'activity.display', vars: {w: String(w), h: String(h), f: String(f)}});
    return {ok: true, restartNeeded: r?.result === 1};
  }
}

module.exports = {Display};
