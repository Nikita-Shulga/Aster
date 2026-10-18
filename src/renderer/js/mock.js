// Sample data used only when the UI runs outside Electron (browser preview / screenshots).
const MAC = new URLSearchParams(location.search).get('platform') === 'darwin';
const listeners = new Set();
const emit = e => listeners.forEach(fn => fn(e));
const wait = ms => new Promise(r => setTimeout(r, ms));
const GB = 1024 ** 3, MB = 1024 ** 2;

let settings = {theme: 'system', closeAppsBeforeCleaning: false, confirmBeforeCleaning: true, exclusions: [], cleanerSelection: null, registryCategories: null};
const activity = [
  {id: 'a1', at: new Date(Date.now() - 864e5 * 2).toISOString(), kind: 'clean', title: 'Cleaned 18,204 files', bytes: 3.1 * GB},
  {id: 'a2', at: new Date(Date.now() - 864e5 * 2).toISOString(), kind: 'registry', title: 'Fixed 212 registry issues', count: 212, backup: 'x.reg', backupExists: true},
  {id: 'a3', at: new Date(Date.now() - 864e5 * 5).toISOString(), kind: 'uninstall', title: 'Uninstalled Old Toolbar'},
  {id: 'a4', at: new Date(Date.now() - 864e5 * 5).toISOString(), kind: 'startup', title: 'Disabled Spotify at startup'}
];

const R = (id, group, app, appId, name, description, bytes, extra = {}) => ({id, group, app, appId, name, description, defaultOn: true, admin: false, privacy: false, caution: false, processes: [], installed: true, bytes, verdict: extra.caution ? 'keep' : extra.privacy || extra.defaultOn === false ? 'review' : 'safe', contains: description + ' It does not contain passwords, bookmarks or logins.', ifDeleted: 'Rebuilt automatically; things may load slightly slower the first time.', advice: 'Safe to clean anytime.', ...extra});
const rules = [
  R('windows.temp', 'windows', 'Windows', 'windows', 'Temporary files', 'Files apps left in your temp folder.', 2.4 * GB),
  R('windows.systemp', 'windows', 'Windows', 'windows', 'System temporary files', 'Windows temp folder.', 820 * MB, {admin: true}),
  R('windows.recyclebin', 'windows', 'Windows', 'windows', 'Recycle Bin', 'Permanently removes everything in the Recycle Bin.', 1.3 * GB),
  R('windows.thumbcache', 'windows', 'Windows', 'windows', 'Thumbnail cache', 'Explorer thumbnail caches.', 214 * MB),
  R('windows.wer', 'windows', 'Windows', 'windows', 'Error reports', 'Crash reports.', 96 * MB),
  R('windows.dumps', 'windows', 'Windows', 'windows', 'Crash dumps', 'Memory dumps.', 640 * MB),
  R('windows.shadercache', 'windows', 'Windows', 'windows', 'Graphics shader cache', 'Shader caches.', 1.1 * GB),
  R('windows.updatecache', 'windows', 'Windows', 'windows', 'Windows Update downloads', 'Installed update packages.', 3.6 * GB, {admin: true}),
  R('windows.recent', 'windows', 'Windows', 'windows', 'Recent files list', 'Quick Access recent items.', 1 * MB, {defaultOn: false, privacy: true}),
  R('chrome.cache', 'browsers', 'Google Chrome', 'chrome', 'Cache', 'Cached images and scripts.', 1.8 * GB, {processes: ['chrome.exe']}),
  R('chrome.history', 'browsers', 'Google Chrome', 'chrome', 'Browsing history', 'Visited sites.', 64 * MB, {defaultOn: false, privacy: true}),
  R('chrome.cookies', 'browsers', 'Google Chrome', 'chrome', 'Cookies', 'Signs you out of websites.', 12 * MB, {defaultOn: false, privacy: true, caution: true}),
  R('edge.cache', 'browsers', 'Microsoft Edge', 'edge', 'Cache', 'Cached web content.', 690 * MB),
  R('firefox.cache', 'browsers', 'Mozilla Firefox', 'firefox', 'Cache', 'Cached web content.', 410 * MB),
  R('apps.discord', 'apps', 'Discord', 'discord', 'Cache', 'Cached data the app rebuilds.', 520 * MB, {processes: ['discord.exe']}),
  R('apps.spotify', 'apps', 'Spotify', 'spotify', 'Cache', 'Streamed music cache.', 2.2 * GB),
  R('apps.vscode', 'apps', 'Visual Studio Code', 'vscode', 'Cache', 'Editor caches and logs.', 380 * MB),
  R('apps.npm', 'apps', 'npm', 'npm', 'Cache', 'Downloaded package cache.', 1.6 * GB, {defaultOn: false})
];

const cats = ['uninstall', 'startup', 'apppaths', 'shareddlls', 'applications', 'extensions', 'com', 'muicache', 'compat', 'installer', 'fonts', 'help', 'empty'];
const catNames = {uninstall: 'Broken uninstall entries', startup: 'Invalid startup entries', apppaths: 'Invalid application paths', shareddlls: 'Missing shared DLLs', applications: 'Obsolete "Open with" apps', extensions: 'Unused file extensions', com: 'Broken COM registrations', muicache: 'MUI cache', compat: 'Compatibility records', installer: 'Installer folders', fonts: 'Missing fonts', help: 'Missing help files', empty: 'Empty software keys'};
const issues = [];
const sample = {uninstall: 2, startup: 1, shareddlls: 12, muicache: 48, compat: 31, installer: 14, empty: 9, extensions: 4};
for (const [type, n] of Object.entries(sample)) for (let i = 0; i < n; i++) issues.push({id: `${type}${i}`, type, path: type === 'muicache' ? 'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache' : type === 'uninstall' ? `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\App${i}` : 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Compatibility Assistant\\Store', value: type === 'uninstall' ? null : `C:\\Users\\Alex\\Downloads\\setup_${i}.exe`, action: 'deleteValue', title: type === 'uninstall' ? ['Old Game Launcher', 'PDF Toolbar'][i] : `setup_${i}.exe`, target: `C:\\Users\\Alex\\Downloads\\setup_${i}.exe`, admin: type === 'uninstall' || type === 'shareddlls' || type === 'installer', risk: type === 'uninstall' ? 'medium' : 'low'});

const P = (name, publisher, version, size, date, extra = {}) => ({id: name.replace(/\W/g, ''), type: 'desktop', name, publisher, version, size: size && size * MB, installDate: date, location: `C:\\Program Files\\${name}`, drive: name.length % 3 ? 'C:' : 'D:', canUninstall: true, broken: false, ...extra});
const programs = [
  P('Adobe Photoshop 2026', 'Adobe Inc.', '27.4.1', 4200, '2026-08-12'), P('Blender', 'Blender Foundation', '4.6.2', 1180, '2026-09-30'),
  P('Discord', 'Discord Inc.', '1.0.9201', 410, '2026-10-02'), P('Git', 'The Git Development Community', '2.51.0', 330, '2026-07-21'),
  P('Google Chrome', 'Google LLC', '141.0.7390', 690, '2026-10-10'), P('Mozilla Firefox', 'Mozilla', '144.0', 260, '2026-10-01'),
  P('Notion', 'Notion Labs', '4.12.0', 380, '2026-06-18'), P('Old Game Launcher', 'Unknown', '2.1', null, '2023-02-11', {broken: true}),
  P('OBS Studio', 'OBS Project', '31.1.0', 520, '2026-05-02'), P('Spotify', 'Spotify AB', '1.2.71', 340, '2026-09-11'),
  P('Steam', 'Valve Corporation', '2.10.91', 780, '2025-12-04'), P('Visual Studio Code', 'Microsoft Corporation', '1.105.0', 410, '2026-10-08'),
  P('VLC media player', 'VideoLAN', '3.0.21', 160, '2025-11-23'), P('WinRAR 7.20', 'win.rar GmbH', '7.20.0', 9, '2025-08-30'), P('Zoom Workplace', 'Zoom Video Communications', '7.1.9', 290, '2026-04-14'),
  {...P('Microsoft To Do', 'Microsoft Corporation', '2.148', null, '2026-03-02'), type: 'store'}, {...P('WhatsApp', 'WhatsApp Inc.', '2.2540', null, '2026-09-19'), type: 'store'}
];

const S = (name, publisher, command, type, source, enabled, extra = {}) => ({id: name.replace(/\W/g, ''), name, publisher, command, type, source, enabled, canToggle: true, exists: true, file: command, scope: 'user', ...extra});
const startup = [
  S('Discord', 'Discord Inc.', 'C:\\Users\\Alex\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe', 'registry', 'Registry · Current user', true),
  S('Spotify', 'Spotify AB', 'C:\\Users\\Alex\\AppData\\Roaming\\Spotify\\Spotify.exe /minimized', 'registry', 'Registry · Current user', false),
  S('Steam', 'Valve Corporation', '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent', 'registry', 'Registry · Current user', true),
  S('OneDrive', 'Microsoft Corporation', '"C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe" /background', 'registry', 'Registry · Current user', true),
  S('SecurityHealth', 'Microsoft Corporation', '%windir%\\system32\\SecurityHealthSystray.exe', 'registry', 'Registry · All users', true, {scope: 'machine', admin: true}),
  S('Old Updater', null, 'C:\\Program Files\\OldApp\\updater.exe', 'registry', 'Registry · Current user', true, {exists: false}),
  S('Notion', 'Notion Labs', 'C:\\Users\\Alex\\AppData\\Local\\Programs\\Notion\\Notion.exe', 'folder', 'Startup folder · Current user', true),
  S('GoogleUpdateTaskMachineUA', 'Google LLC', '"C:\\Program Files (x86)\\Google\\Update\\GoogleUpdate.exe" /ua', 'task', 'Scheduled task · At sign-in', true),
  S('Adobe Update Service', 'Adobe Inc.', '"C:\\Program Files (x86)\\Common Files\\Adobe\\ARM\\armsvc.exe"', 'service', 'Service · Auto', true, {state: 'Running', admin: true, scope: 'machine'})
];

const updates = {checkedAt: new Date().toISOString(), items: [
  {name: 'Visual Studio Code', id: 'Microsoft.VisualStudioCode', installed: '1.105.0', available: '1.106.2'},
  {name: 'Zoom Workplace', id: 'Zoom.Zoom', installed: '7.1.9', available: '7.2.1'},
  {name: 'WinRAR 7.20', id: 'RARLab.WinRAR', installed: '7.20.0', available: '7.23.0'},
  {name: 'OBS Studio', id: 'OBSProject.OBSStudio', installed: '31.1.0', available: '32.0.1'}
]};

const tree = {
  'C:\\': [['Users', 182 * GB, 412000], ['Windows', 31 * GB, 190000], ['Program Files', 48 * GB, 88000], ['Program Files (x86)', 22 * GB, 51000], ['ProgramData', 9 * GB, 21000], ['Games', 96 * GB, 6100]],
  'C:\\Users': [['Alex', 178 * GB, 405000], ['Public', 4 * GB, 7000]],
  'C:\\Users\\Alex': [['Videos', 64 * GB, 380], ['AppData', 41 * GB, 310000], ['Downloads', 28 * GB, 2100], ['Documents', 19 * GB, 48000], ['Pictures', 14 * GB, 31000], ['Desktop', 7 * GB, 410], ['Music', 5 * GB, 2800]]
};

const api = {
  'app.info': () => ({version: '1.0.0', electron: '44.8.0', dataPath: 'C:\\Users\\Alex\\AppData\\Roaming\\Aster'}),
  'system.info': () => MAC ? ({os: 'macOS Sequoia', osVersion: '15.6 (24G84)', build: 15, arch: 'arm64', hostname: 'Alex-MacBook-Pro', user: 'alex', model: 'MacBook Pro (Mac15,6)', cpu: 'Apple M3 Pro', cores: 12, gpu: ['Apple M3 Pro'], admin: false, mac: true, fda: false, memory: {total: 18 * GB, free: 3.1 * GB}, uptime: 302000, cpuLoad: 9,
    drives: [{name: 'Macintosh HD', root: '/', label: 'Macintosh HD', format: 'APFS', type: 'Fixed', total: 994 * GB, free: 212 * GB}, {name: 'Backup', root: '/Volumes/Backup', label: 'Backup', type: 'Removable', total: 2000 * GB, free: 1210 * GB}]}) : ({os: 'Windows 11 Pro', osVersion: '25H2 (build 26200.6899)', arch: 'x64', hostname: 'ALEX-DESKTOP', user: 'alex', model: 'ASUS ROG Strix G16', cpu: 'AMD Ryzen 9 7945HX with Radeon Graphics', cores: 32, gpu: ['NVIDIA GeForce RTX 4070 Laptop GPU'], admin: false, memory: {total: 32 * GB, free: 13.4 * GB}, uptime: 192000, cpuLoad: 14,
    drives: [{name: 'C:', label: 'Windows', format: 'NTFS', type: 'Fixed', total: 1000 * GB, free: 214 * GB}, {name: 'D:', label: 'Data', format: 'NTFS', type: 'Fixed', total: 2000 * GB, free: 1480 * GB}]}),
  'system.live': () => ({memory: {total: 32 * GB, free: (12 + Math.random() * 2) * GB}, cpuLoad: Math.round(8 + Math.random() * 18), uptime: 192000}),
  'system.relaunchAdmin': () => ({ok: true}),
  'settings.get': () => settings,
  'settings.update': p => (settings = {...settings, ...p}),
  'settings.pickExclusion': () => 'D:\\Projects',
  'cleaner.rules': () => ({groups: [{id: 'windows', name: 'Windows'}, {id: 'browsers', name: 'Browsers'}, {id: 'apps', name: 'Applications'}], rules}),
  'cleaner.analyze': async ({ids}) => {
    for (let i = 0; i < ids.length; i++) { emit({channel: 'cleaner', index: i, total: ids.length, label: rules.find(r => r.id === ids[i])?.app + ' · ' + rules.find(r => r.id === ids[i])?.name}); await wait(90); }
    const results = ids.map(id => { const r = rules.find(x => x.id === id); return {id, bytes: Math.round(r.bytes), files: Math.round(r.bytes / 180000), running: r.processes.length && id === 'chrome.cache' ? ['chrome.exe'] : [], locations: [{label: r.name + ' folder', path: `C:\\Users\\Alex\\AppData\\Local\\${r.app}\\Cache`, drive: 'C:', bytes: Math.round(r.bytes * .8), files: Math.round(r.bytes / 220000)}, {label: 'Secondary cache', path: `D:\\Cache\\${r.app}`, drive: 'D:', bytes: Math.round(r.bytes * .2), files: Math.round(r.bytes / 900000)}], sample: [{path: `C:\\Users\\Alex\\AppData\\Local\\Temp\\${id}\\data_1.bin`, size: r.bytes / 6}, {path: `C:\\Users\\Alex\\AppData\\Local\\Temp\\${id}\\f_000231`, size: r.bytes / 9}]}; });
    return {results, totalBytes: results.reduce((n, r) => n + r.bytes, 0), totalFiles: results.reduce((n, r) => n + r.files, 0)};
  },
  'cleaner.clean': async ({ids}) => { for (let i = 0; i < ids.length; i++) { emit({channel: 'cleaner', index: i, total: ids.length, label: ids[i]}); await wait(120); } const freed = ids.reduce((n, id) => n + (rules.find(r => r.id === id)?.bytes || 0), 0); return {results: [], freed, deleted: Math.round(freed / 180000), skipped: 37}; },
  'cleaner.cancel': () => ({ok: true}),
  'registry.categories': () => cats.map(id => ({id, name: catNames[id], description: 'References to files or programs that no longer exist.', verdict: ['extensions', 'com', 'installer'].includes(id) ? 'review' : 'safe', defaultOn: !['extensions', 'com', 'installer'].includes(id), contains: 'Entries left behind by programs that were removed.', ifDeleted: 'Nothing visible; Windows stops referring to missing files.', advice: 'Safe housekeeping.'})),
  'registry.scan': async () => { await wait(1400); return {items: issues.map(i => ({...i})), scannedAt: new Date().toISOString()}; },
  'registry.fix': async ({ids}) => { await wait(600); return {fixed: ids, failed: [], backup: 'x.reg'}; },
  'registry.list': ({path}) => !path ? {path: '', keys: ['HKEY_CLASSES_ROOT', 'HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE', 'HKEY_USERS', 'HKEY_CURRENT_CONFIG'].map(name => ({name, hasChildren: true})), values: []}
    : {path, hasDefault: false, keys: ['7-Zip', 'Adobe', 'Discord', 'Google', 'Microsoft', 'Mozilla', 'Spotify', 'Valve'].map(name => ({name, hasChildren: true})), values: [{name: 'Version', kind: 'String', data: '1.4.2'}, {name: 'InstallPath', kind: 'ExpandString', data: '%LOCALAPPDATA%\\Programs\\App'}, {name: 'Enabled', kind: 'DWord', data: 1}, {name: 'LastRun', kind: 'QWord', data: '133712345678901234'}, {name: 'Recent', kind: 'MultiString', data: ['one.txt', 'two.txt']}, {name: 'Blob', kind: 'Binary', data: '01,00,ff,a0,3c'}]},
  'registry.edit': () => ({ok: true}),
  'registry.search': async () => { await wait(500); return {results: [{path: 'HKEY_CURRENT_USER\\Software\\Spotify', kind: 'key', name: 'Spotify'}], complete: true}; },
  'programs.list': async () => { await wait(400); return {items: programs}; },
  'programs.icons': () => ({}),
  'programs.size': () => ({size: 123 * MB}),
  'programs.uninstall': async () => { await wait(1500); return {removed: true}; },
  'programs.leftovers': async () => { await wait(700); return {items: [{id: 'l1', kind: 'folder', path: 'C:\\Users\\Alex\\AppData\\Roaming\\Old Game Launcher', reason: 'Matches program name', size: 214 * MB}, {id: 'l2', kind: 'registry', path: 'HKCU\\Software\\Old Game Launcher', reason: 'Program settings', detail: '12 values, 3 subkeys'}]}; },
  'programs.removeLeftovers': () => ({removed: 2, failed: [], bytes: 214 * MB}),
  'programs.removeEntry': () => ({ok: true}),
  'startup.list': async () => { await wait(300); return {items: startup}; },
  'startup.icons': () => ({}),
  'startup.toggle': () => ({ok: true}),
  'startup.remove': () => ({ok: true}),
  'startup.add': () => ({cancelled: true}),
  'updates.available': () => ({available: true}),
  'updates.check': async () => { await wait(900); return updates; },
  'updates.last': () => null,
  'updates.update': async ({id}) => { for (const l of ['Found package', 'Downloading…', 'Successfully verified installer hash', 'Starting package install…']) { emit({channel: 'updates', id, line: l}); await wait(500); } updates.items = updates.items.filter(i => i.id !== id); return {ok: true}; },
  'disk.pickFolder': () => 'C:\\',
  'disk.analyze': async () => { for (let i = 1; i <= 8; i++) { emit({channel: 'disk', files: i * 51234, bytes: i * 48 * GB, current: 'C:\\Users\\Alex\\AppData\\Local\\Packages'}); await wait(150); } return {root: 'C:\\', size: 388 * GB, files: 768000, top: [{path: 'C:\\Users\\Alex\\Videos\\Trip 2026 (4K).mp4', size: 18.4 * GB, mtime: Date.now() - 864e5 * 40}, {path: 'C:\\hiberfil.sys', size: 12.8 * GB}, {path: 'C:\\Games\\Cyberpunk\\archive\\pc\\content\\basegame_4_gamedata.archive', size: 9.6 * GB}, {path: 'C:\\Users\\Alex\\Downloads\\ubuntu-26.04-desktop-amd64.iso', size: 6.1 * GB}], types: [{name: 'Video', bytes: 92 * GB, count: 410, exts: []}, {name: 'Programs', bytes: 71 * GB, count: 88000, exts: []}, {name: 'Disk images', bytes: 64 * GB, count: 2100, exts: []}, {name: 'Images', bytes: 22 * GB, count: 41000, exts: []}, {name: 'Archives', bytes: 18 * GB, count: 900, exts: []}, {name: 'Documents', bytes: 8 * GB, count: 12000, exts: []}, {name: 'Other', bytes: 113 * GB, count: 600000, exts: []}]}; },
  'disk.children': ({path}) => { const key = path.replace(/\\$/, '') || 'C:'; const kids = tree[path] || tree[key] || tree[key + '\\'] || [['Cache', 2 * GB, 4000], ['Data', 1 * GB, 1000]]; const items = kids.map(([name, size, files]) => ({name, path: (path.endsWith('\\') ? path : path + '\\') + name, size, files, dir: true})); items.push({name: 'pagefile.sys', path: path + '\\pagefile.sys', size: 8 * GB, dir: false, mtime: Date.now()}); const size = items.reduce((n, i) => n + i.size, 0); return {path, size, files: items.reduce((n, i) => n + (i.files || 1), 0), items}; },
  'disk.duplicates': async () => { await wait(1200); return {files: 48210, bytes: 210 * GB, wasted: 4.3 * GB, groups: [{size: 1.2 * GB, files: [{path: 'D:\\Backup\\Videos\\Wedding.mp4', mtime: Date.now() - 864e5 * 300}, {path: 'C:\\Users\\Alex\\Videos\\Wedding.mp4', mtime: Date.now() - 864e5 * 20}]}, {size: 640 * MB, files: [{path: 'C:\\Users\\Alex\\Downloads\\installer.iso', mtime: Date.now() - 864e5 * 90}, {path: 'C:\\Users\\Alex\\Downloads\\installer (1).iso', mtime: Date.now() - 864e5 * 10}, {path: 'D:\\ISO\\installer.iso', mtime: Date.now() - 864e5 * 200}]}]}; },
  'disk.cancel': () => ({ok: true}),
  'disk.trash': ({paths}) => ({done: paths, failed: [], bytes: 1.2 * GB}),
  'disk.identify': ({items}) => Object.fromEntries(items.map(i => [i.path, /pagefile/i.test(i.path) ? {verdict: 'keep', kind: 'Windows virtual memory', owner: 'Windows', what: 'Windows uses this file as extra memory when RAM is full.', advice: 'Do not delete it.'} : /\.iso$/i.test(i.path) ? {verdict: 'safe', kind: 'Disk image', owner: 'Your downloads', what: 'An installer image.', advice: 'Safe to delete once installed.'} : /Games|Program/i.test(i.path) ? {verdict: 'keep', kind: 'Program folder', owner: 'Installed programs', what: 'Program files.', advice: 'Uninstall the program instead.'} : {verdict: 'review', kind: i.dir ? 'Folder' : 'Video', owner: i.dir ? null : 'You', what: 'Your own files.', advice: 'Delete only if you are sure.'}])),
  'tweaks.list': ({groups}) => ({groups: {performance: 'Performance', gaming: 'Gaming', privacy: 'Privacy & ads', appearance: 'Appearance', explorer: 'File Explorer', taskbar: 'Taskbar & input'}, items: MOCK_TWEAKS.filter(t => groups.includes(t.group))}),
  'tweaks.set': ({id, value}) => { const t = MOCK_TWEAKS.find(x => x.id === id); t.value = value; return {ok: true, value}; },
  'power.get': () => power, 'power.set': p => { if (p.guid) power.plans.forEach(x => { x.active = x.guid === p.guid; }); return power; }, 'power.addHigh': () => power,
  'processes.list': () => ({items: [{name: 'chrome', description: 'Google Chrome', company: 'Google LLC', count: 37, memory: 4.4 * GB}, {name: 'Discord', description: 'Discord', company: 'Discord Inc.', count: 6, memory: 820 * MB}, {name: 'Code', description: 'Visual Studio Code', company: 'Microsoft Corporation', count: 12, memory: 1.3 * GB}, {name: 'dwm', description: 'Desktop Window Manager', company: 'Microsoft Corporation', count: 1, memory: 310 * MB, protected: true}]}),
  'processes.end': () => ({ok: true}), 'explorer.restart': () => ({ok: true}),
  'display.list': () => ({items: [{device: '\\\\.\\DISPLAY1', name: 'Dell AW3423DW', primary: true, width: 3440, height: 1440, freq: 60, modes: [175, 144, 120, 100, 60].map(f => ({w: 3440, h: 1440, f})).concat([{w: 2560, h: 1080, f: 60}, {w: 1920, h: 1080, f: 60}])}]}),
  'display.set': () => ({ok: true}),
  'tools.catalog': () => ({actions: MAC ? [{id: 'snapshot', icon: 'restore', tone: 'blue', title: 'Create a Time Machine snapshot', text: 'Saves a local snapshot you can restore from.'}, {id: 'thin', icon: 'drive', tone: 'green', title: 'Free space used by local snapshots', text: 'Removes Time Machine local snapshots.'}, {id: 'dns', icon: 'network', tone: 'green', title: 'Flush DNS cache', text: 'Fixes sites that fail to load.', admin: true}, {id: 'bin', icon: 'trash', tone: 'amber', title: 'Empty the Trash', text: 'Permanently deletes everything in the Trash.'}] : [{id: 'restore', icon: 'restore', tone: 'blue', title: 'Create a restore point', text: 'Snapshot system settings before big changes.', admin: true}, {id: 'dns', icon: 'network', tone: 'green', title: 'Flush DNS cache', text: 'Fixes sites that fail to load after network changes.'}, {id: 'bin', icon: 'trash', tone: 'amber', title: 'Empty Recycle Bin', text: 'Permanently delete everything in the Recycle Bin.'}, {id: 'admin', icon: 'shield', tone: '', title: 'Restart as administrator', text: 'Unlock system-wide cleaning.'}],
    launchers: MAC ? [['activity', 'Activity Monitor', 'gauge'], ['diskutil', 'Disk Utility', 'drive'], ['console', 'Console', 'list'], ['terminal', 'Terminal', 'terminal']] : [['taskmgr', 'Task Manager', 'gauge'], ['services', 'Services', 'sliders'], ['devmgmt', 'Device Manager', 'monitor'], ['regedit', 'Registry Editor', 'key']],
    settings: MAC ? [['storage', 'Storage', 'pie'], ['update', 'Software Update', 'refresh'], ['loginitems', 'Login Items', 'power']] : [['storage', 'Storage Sense', 'pie'], ['update', 'Windows Update', 'refresh']], binRule: MAC ? 'macos.trash' : 'windows.recyclebin'}),
  'tools.run': async () => { await wait(500); return {ok: true, message: 'Done'}; },
  'tools.launch': () => ({ok: true}), 'tools.flushDns': async () => { await wait(500); return {ok: true}; }, 'tools.restorePoint': () => ({ok: true}),
  'activity.list': () => activity, 'activity.stats': () => ({cleaned: 14.2 * GB, fixed: 968, lastClean: activity[0].at}),
  'backups.restore': () => ({ok: true}), 'backups.openFolder': () => ({ok: true}),
  'shell.reveal': () => ({ok: true}), 'shell.openUrl': () => ({ok: true})
};

const TW = (id, group, title, value, recommended, verdict, extra = {}) => ({id, group, title, type: 'toggle', value, recommended, verdict, what: 'Explains what this setting changes in Windows.', pro: 'What you gain from it.', con: 'What you give up.', on: 'On', off: 'Off', admin: false, restart: null, ...extra});
const MOCK_TWEAKS = [
  TW('startupDelay', 'performance', 'Start apps right after sign-in', false, true, 'recommended', {on: 'No delay', off: 'Windows default delay'}),
  TW('menuDelay', 'performance', 'Faster menus', false, true, 'recommended'),
  TW('animations', 'performance', 'Turn off animation effects', false, null, 'situational'),
  TW('hibernation', 'performance', 'Turn off hibernation', false, null, 'situational', {admin: true, extra: {bytes: 12.8 * GB}}),
  TW('gameMode', 'gaming', 'Game Mode', true, true, 'recommended'),
  TW('gameDvr', 'gaming', 'Turn off background game recording', false, true, 'recommended'),
  TW('hags', 'gaming', 'Hardware-accelerated GPU scheduling', false, null, 'optional', {admin: true, restart: 'reboot'}),
  TW('adId', 'privacy', 'Turn off advertising ID', false, true, 'recommended'),
  TW('tips', 'privacy', 'Turn off tips, suggestions and lock-screen ads', false, true, 'recommended'),
  {...TW('appTheme', 'appearance', 'App colour mode', 'light', null, 'preference'), type: 'choice', options: [{value: 'light', label: 'Light'}, {value: 'dark', label: 'Dark'}]},
  TW('showExt', 'explorer', 'Show file extensions', false, true, 'recommended', {restart: 'explorer', on: 'Shown', off: 'Hidden'}),
  TW('classicMenu', 'explorer', 'Classic right-click menu', false, null, 'preference', {restart: 'explorer'}),
  {...TW('taskbarAlign', 'taskbar', 'Taskbar alignment', 'center', null, 'preference'), type: 'choice', options: [{value: 'center', label: 'Center'}, {value: 'left', label: 'Left'}], pro: null, con: null},
  TW('clipboardHistory', 'taskbar', 'Clipboard history (Win+V)', false, true, 'recommended')
];
const power = {plans: [{guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Balanced', active: true}, {guid: 'a1841308-3541-4fab-bc81-f71556f20b4a', name: 'Power saver', active: false}], screenAc: 600, screenDc: 300, sleepAc: 1800, sleepDc: 900, battery: false};

export const mockApi = {
  async invoke(method, args) {
    const fn = api[method];
    if (!fn) throw new Error(`Preview: ${method} is not available`);
    await wait(60);
    return structuredClone(await fn(args || {}));
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
};
