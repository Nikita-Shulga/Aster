'use strict';
// Automatic cleaning: a Windows scheduled task or a macOS launch agent starts Aster with --auto-clean daily or weekly.
// That run opens no window: it cleans the Cleaner items you selected that are marked Safe, skips apps that are
// running (and items that need admin rights or Full Disk Access), writes the result to History and quits.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const isMac = process.platform === 'darwin';

const TASK = 'Aster automatic cleaning';
const LABEL = 'com.nikitashulga.aster.autoclean';
const AGENT = () => path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const FREQUENCIES = ['daily', 'weekly'];
const HOUR = 12; // noon: the computer is usually on; a missed run starts as soon as it is

// What the task runs: the installed (or portable) Aster, or Electron with the app folder during development.
function command(app) {
  if (app.isPackaged) return {file: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: ['--auto-clean']};
  return {file: process.execPath, args: [app.getAppPath(), '--auto-clean']};
}

const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

class Schedule {
  constructor({app, store}) { this.app = app; this.store = store; }

  get() {
    const s = this.store.getSettings().autoClean || {};
    const last = this.store.activity.find(a => a.key === 'activity.autoClean');
    return {enabled: !!s.enabled, frequency: FREQUENCIES.includes(s.frequency) ? s.frequency : 'weekly', notify: s.notify !== false, last: last ? {at: last.at, bytes: last.bytes || 0} : null, installed: this.installed()};
  }

  installed() {
    if (isMac) return fs.existsSync(AGENT());
    return !!this.store.getSettings().autoClean?.enabled;
  }

  async set({enabled, frequency, notify}) {
    const next = {enabled: enabled === true, frequency: FREQUENCIES.includes(frequency) ? frequency : 'weekly', notify: notify !== false};
    if (next.enabled) await this.install(next.frequency); else await this.remove();
    this.store.updateSettings({autoClean: next});
    return this.get();
  }

  async install(frequency) {
    const {file, args} = command(this.app);
    if (isMac) {
      const {sh, uid} = require('./mac/sh.cjs');
      const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>${[file, ...args].map(a => `<string>${xml(a)}</string>`).join('')}</array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>${HOUR}</integer><key>Minute</key><integer>0</integer>${frequency === 'weekly' ? '<key>Weekday</key><integer>0</integer>' : ''}</dict>
  <key>ProcessType</key><string>Background</string>
</dict></plist>
`;
      fs.mkdirSync(path.dirname(AGENT()), {recursive: true});
      await sh('/bin/launchctl', ['bootout', `gui/${uid()}`, AGENT()]).catch(() => {});
      fs.writeFileSync(AGENT(), plist);
      await sh('/bin/launchctl', ['bootstrap', `gui/${uid()}`, AGENT()]).catch(() => {});
      return;
    }
    const {psJson} = require('./ps.cjs');
    await psJson(String.raw`
$action = New-ScheduledTaskAction -Execute $in.file -Argument (($in.args | ForEach-Object { '"' + $_ + '"' }) -join ' ')
$at = (Get-Date).Date.AddHours($in.hour)
$trigger = if ($in.frequency -eq 'daily') { New-ScheduledTaskTrigger -Daily -At $at } else { New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At $at }
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $in.name -Action $action -Trigger $trigger -Settings $settings -Description 'Cleans the junk you selected in Aster (Safe items only). Change it in Aster → Settings.' -Force | Out-Null
Out-Json ([pscustomobject]@{ ok = $true })`, {file, args, frequency, hour: HOUR, name: TASK}, {timeout: 60000});
  }

  async remove() {
    if (isMac) {
      const {sh, uid} = require('./mac/sh.cjs');
      await sh('/bin/launchctl', ['bootout', `gui/${uid()}`, AGENT()]).catch(() => {});
      fs.rmSync(AGENT(), {force: true});
      return;
    }
    const {psJson} = require('./ps.cjs');
    await psJson(`Unregister-ScheduledTask -TaskName $in.name -Confirm:$false -ErrorAction SilentlyContinue; Out-Json ([pscustomobject]@{ ok = $true })`, {name: TASK}, {timeout: 60000});
  }
}

// The windowless run. Returns the clean result (or null when there was nothing to do).
async function runAutoClean({store, cleaner, admin = false, fda = true}) {
  const {rules} = cleaner.rules();
  const saved = store.getSettings().cleanerSelection;
  const chosen = new Set(Array.isArray(saved) ? saved : rules.filter(r => r.defaultOn).map(r => r.id));
  const ids = rules.filter(r => chosen.has(r.id) && r.installed && r.verdict === 'safe' && (!r.admin || admin) && (!r.fda || fda)).map(r => r.id);
  if (!ids.length) return null;
  const r = await cleaner.clean({ids, closeApps: false});
  store.log({kind: 'clean', key: 'activity.autoClean', vars: {count: r.deleted}, bytes: r.freed, count: r.deleted});
  return r;
}

module.exports = {Schedule, runAutoClean, TASK, LABEL};
