'use strict';
// Fix search: naming and matching run everywhere; the live check runs on Windows (macOS has its own in mac.test.cjs).
const test = require('node:test');
const assert = require('node:assert');
const {appName, related, spaced, SKIP_EXE, SKIP_DIR} = require('../src/main/search.cjs');

test('shortcut names come from the version info when it matches the folder', () => {
  // Epic's ProductName is "Unreal Engine": generic, so the description is used and split into words.
  assert.strictEqual(appName({product: 'Unreal Engine', description: 'EpicGamesLauncher', exe: 'H:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe', appRoot: 'H:\\Program Files (x86)\\Epic Games\\Launcher'}), 'Epic Games Launcher');
  assert.strictEqual(appName({product: 'VLC media player', description: 'VLC media player', exe: 'G:\\Program Files\\VideoLAN\\VLC\\vlc.exe', appRoot: 'G:\\Program Files\\VideoLAN\\VLC'}), 'VLC media player');
  assert.strictEqual(appName({product: 'Ubisoft Connect', description: '', exe: 'H:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\UbisoftConnect.exe', appRoot: 'H:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher'}), 'Ubisoft Connect');
  // No version info: the folder name.
  assert.strictEqual(appName({exe: 'H:\\Program Files\\HeidiSQL\\heidisql.exe', appRoot: 'H:\\Program Files\\HeidiSQL'}), 'HeidiSQL');
  // Characters Windows forbids in file names never reach the shortcut name.
  assert.doesNotMatch(appName({product: 'Joxi: capture / share', exe: 'C:\\Program Files\\Joxi\\joxi.exe', appRoot: 'C:\\Program Files\\Joxi'}), /[\\/:*?"<>|]/);
});

test('brand names keep their spelling; only long run-together names are split', () => {
  assert.strictEqual(spaced('EpicGamesLauncher'), 'Epic Games Launcher');
  for (const name of ['TeamViewer', 'iTunes', 'WinRAR', 'WinDjView', 'MSIAfterburner', 'Already spaced']) assert.strictEqual(spaced(name), name);
});

test('names match across spelling: words, run-together names and folders', () => {
  assert.ok(related('EpicGamesLauncher', 'Launcher Epic Games'));
  assert.ok(related('Ubisoft Connect', 'Ubisoft Game Launcher Ubisoft'));
  assert.ok(!related('Unreal Engine', 'EpicGamesLauncher Launcher Epic Games'));
});

test('installers, updaters and helpers are not offered as apps', () => {
  for (const exe of ['unins000', 'Setup', 'EpicWebHelper', 'CrashReportClient', 'UnityCrashHandler64', 'vc_redist.x64', 'GoogleUpdate', 'git', 'git-bash']) assert.match(exe, SKIP_EXE, exe);
  for (const exe of ['EpicGamesLauncher', 'vlc', 'GitHubDesktop', 'TeamViewer', 'WinRAR', 'Audacity']) assert.doesNotMatch(exe, SKIP_EXE, exe);
  for (const dir of ['locales', 'resources', 'Redist', '_CommonRedist', 'plugins']) assert.match(dir, SKIP_DIR, dir);
  for (const dir of ['Portal', 'Binaries', 'Win64', 'Launcher']) assert.doesNotMatch(dir, SKIP_DIR, dir);
});

test('the live check reports the service, the index and apps without a Start menu entry', {skip: process.platform !== 'win32' && 'Windows only', timeout: 120000}, async () => {
  const {Search} = require('../src/main/search.cjs');
  const system = require('../src/main/system.cjs');
  const s = new Search({store: {activity: [], log() {}}, getIcon: async () => null, getDrives: async () => (await system.info()).drives, trash: async () => {}});
  const r = await s.check();
  assert.strictEqual(r.platform, 'win32');
  for (const k of ['service', 'index', 'startMenu']) assert.strictEqual(typeof r[k].ok, 'boolean', k);
  assert.ok(Array.isArray(r.apps) && Array.isArray(r.added));
  for (const a of r.apps) {
    assert.match(a.exe, /^[A-Z]:\\.+\.exe$/i);
    assert.ok(a.name && !/[\\/:*?"<>|]/.test(a.name), a.name);
    assert.match(a.drive, /^[A-Z]:$/);
  }
  // Only apps from the last check can be added.
  await assert.rejects(s.addApps({ids: ['not-from-the-list']}), /out of date/);
});
