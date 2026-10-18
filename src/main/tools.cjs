'use strict';
const {spawn} = require('node:child_process');
const {powershell, run, sys32, SYSTEM_ROOT} = require('./ps.cjs');
const path = require('node:path');

// Fixed launch targets only; the renderer passes an id, never a command.
const LAUNCH = {
  taskmgr: [sys32('taskmgr.exe')],
  devmgmt: [sys32('mmc.exe'), 'devmgmt.msc'],
  services: [sys32('mmc.exe'), 'services.msc'],
  eventvwr: [sys32('mmc.exe'), 'eventvwr.msc'],
  diskmgmt: [sys32('mmc.exe'), 'diskmgmt.msc'],
  regedit: [path.join(SYSTEM_ROOT, 'regedit.exe')],
  msconfig: [sys32('msconfig.exe')],
  resmon: [sys32('resmon.exe')],
  msinfo: [sys32('msinfo32.exe')],
  cleanmgr: [sys32('cleanmgr.exe')],
  sysprops: [sys32('SystemPropertiesAdvanced.exe')],
  restore: [sys32('rstrui.exe')],
  ncpa: [sys32('control.exe'), 'ncpa.cpl'],
  power: [sys32('control.exe'), 'powercfg.cpl'],
  appwiz: [sys32('control.exe'), 'appwiz.cpl']
};
const SETTINGS = {
  storage: 'ms-settings:storagesense', update: 'ms-settings:windowsupdate', apps: 'ms-settings:appsfeatures',
  startup: 'ms-settings:startupapps', security: 'windowsdefender:', privacy: 'ms-settings:privacy', defaultapps: 'ms-settings:defaultapps'
};

const CATALOG = {
  actions: [
    {id: 'restore', icon: 'restore', tone: 'blue', title: 'Create a restore point', text: 'Snapshot system settings before big changes. Requires administrator rights.', admin: true},
    {id: 'dns', icon: 'network', tone: 'green', title: 'Flush DNS cache', text: 'Fixes sites that fail to load after network or DNS changes.'},
    {id: 'bin', icon: 'trash', tone: 'amber', title: 'Empty Recycle Bin', text: 'Permanently delete everything in the Recycle Bin on all drives.'},
    {id: 'admin', icon: 'shield', tone: '', title: 'Restart as administrator', text: 'Unlock system-wide cleaning, registry fixes and service control.'}
  ],
  launchers: [['taskmgr', 'Task Manager', 'gauge'], ['resmon', 'Resource Monitor', 'cpu'], ['services', 'Services', 'sliders'], ['devmgmt', 'Device Manager', 'monitor'],
    ['eventvwr', 'Event Viewer', 'list'], ['diskmgmt', 'Disk Management', 'drive'], ['cleanmgr', 'Disk Cleanup', 'broom'], ['regedit', 'Registry Editor', 'key'],
    ['msconfig', 'System Configuration', 'wrench'], ['msinfo', 'System Information', 'info'], ['sysprops', 'Advanced system settings', 'windows'], ['restore', 'System Restore', 'restore'],
    ['ncpa', 'Network connections', 'network'], ['power', 'Power options', 'zap'], ['appwiz', 'Programs and Features', 'apps']],
  settings: [['storage', 'Storage Sense', 'pie'], ['update', 'Windows Update', 'refresh'], ['apps', 'Installed apps', 'apps'], ['startup', 'Startup apps', 'power'], ['security', 'Windows Security', 'shield'], ['privacy', 'Privacy & security', 'lock'], ['defaultapps', 'Default apps', 'star']],
  binRule: 'windows.recyclebin'
};

class Tools {
  constructor({store, shell}) { this.store = store; this.shell = shell; }

  catalog() { return CATALOG; }
  async run({id}) {
    if (id === 'restore') { await this.restorePoint({description: 'Aster checkpoint'}); return {ok: true, message: 'Restore point created'}; }
    if (id === 'dns') { await this.flushDns(); return {ok: true, message: 'DNS cache flushed'}; }
    throw new Error('Unknown action');
  }

  async launch({id}) {
    if (SETTINGS[id]) { await this.shell.openExternal(SETTINGS[id]); return {ok: true}; }
    const target = LAUNCH[id];
    if (!target) throw new Error('Unknown tool');
    const child = spawn(target[0], target.slice(1), {detached: true, stdio: 'ignore', windowsHide: false});
    child.on('error', () => {});
    child.unref();
    return {ok: true};
  }

  async flushDns() {
    await run(sys32('ipconfig.exe'), ['/flushdns'], {timeout: 20000});
    this.store.log({kind: 'tool', title: 'Flushed DNS cache'});
    return {ok: true};
  }

  async restorePoint({description = 'Aster checkpoint'} = {}) {
    // Windows allows one restore point per 24 h by default; temporarily lift that for this request.
    const script = String.raw`
$key = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore'
$old = (Get-ItemProperty -Path $key -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue).SystemRestorePointCreationFrequency
Set-ItemProperty -Path $key -Name SystemRestorePointCreationFrequency -Value 0 -Type DWord
try { Checkpoint-Computer -Description ([string]$in.description) -RestorePointType 'MODIFY_SETTINGS' }
finally { if ($null -eq $old) { Remove-ItemProperty -Path $key -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue } else { Set-ItemProperty -Path $key -Name SystemRestorePointCreationFrequency -Value $old -Type DWord } }
Out-Json ([pscustomobject]@{ ok = $true })`;
    try { await powershell(script, {input: {description: String(description).slice(0, 200)}, timeout: 300000}); }
    catch (e) {
      const m = e.message || '';
      if (/access|denied|administrator/i.test(m)) throw new Error('Creating a restore point requires administrator rights.');
      if (/disabled|service cannot be started/i.test(m)) throw new Error('System Protection is turned off for your system drive. Enable it in System Properties → System Protection.');
      throw e;
    }
    this.store.log({kind: 'tool', title: 'Created a system restore point'});
    return {ok: true};
  }
}

module.exports = {Tools};
