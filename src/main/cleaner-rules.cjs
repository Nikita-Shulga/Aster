'use strict';
// Cleaning rules. Each rule resolves to concrete targets on this machine:
//   {dir, label, recursive?, match?: RegExp (file name), minAgeHours?} — delete matching files inside dir (dir is kept)
//   {file, label}                                                      — delete one file
// Every rule explains itself in plain language:
//   verdict  'safe'   — delete without thinking twice
//            'review' — fine to delete, but you lose something you may notice
//            'keep'   — better left alone unless you have a specific reason
//   contains — what is actually stored there
//   ifDeleted — what you will notice afterwards
//   advice   — when cleaning it makes sense
// Special rules (recycle bin) are handled by the engine.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const env = k => process.env[k] || '';
const LOCAL = env('LOCALAPPDATA') || path.join(os.homedir(), 'AppData', 'Local');
const ROAMING = env('APPDATA') || path.join(os.homedir(), 'AppData', 'Roaming');
const LOCALLOW = path.join(path.dirname(LOCAL), 'LocalLow');
const WIN = env('SystemRoot') || 'C:\\Windows';
const PROGRAMDATA = env('ProgramData') || 'C:\\ProgramData';
const TEMP = env('TEMP') || path.join(LOCAL, 'Temp');

const exists = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const subdirs = p => { try { return fs.readdirSync(p, {withFileTypes: true}).filter(d => d.isDirectory()).map(d => path.join(p, d.name)); } catch { return []; } };

// Chromium keeps one folder per profile: Default, Profile 1, Guest Profile, ...
function chromiumProfiles(userData) {
  return subdirs(userData).filter(p => /^(Default|Profile \d+|Guest Profile)$/i.test(path.basename(p)) || fs.existsSync(path.join(p, 'Preferences')));
}
const profileName = p => { const b = path.basename(p); return b === 'Default' ? 'main profile' : b.toLowerCase(); };

const CHROMIUM = [
  {id: 'chrome', name: 'Google Chrome', data: path.join(LOCAL, 'Google', 'Chrome', 'User Data'), process: 'chrome.exe'},
  {id: 'edge', name: 'Microsoft Edge', data: path.join(LOCAL, 'Microsoft', 'Edge', 'User Data'), process: 'msedge.exe'},
  {id: 'brave', name: 'Brave', data: path.join(LOCAL, 'BraveSoftware', 'Brave-Browser', 'User Data'), process: 'brave.exe'},
  {id: 'vivaldi', name: 'Vivaldi', data: path.join(LOCAL, 'Vivaldi', 'User Data'), process: 'vivaldi.exe'},
  {id: 'yandex', name: 'Yandex Browser', data: path.join(LOCAL, 'Yandex', 'YandexBrowser', 'User Data'), process: 'browser.exe'},
  {id: 'opera', name: 'Opera', data: path.join(ROAMING, 'Opera Software', 'Opera Stable'), cache: path.join(LOCAL, 'Opera Software', 'Opera Stable'), process: 'opera.exe', single: true},
  {id: 'operagx', name: 'Opera GX', data: path.join(ROAMING, 'Opera Software', 'Opera GX Stable'), cache: path.join(LOCAL, 'Opera Software', 'Opera GX Stable'), process: 'opera.exe', single: true}
];

// What each Chromium cache folder actually holds.
const CACHE_DIRS = [
  ['Cache', 'Page cache — images, scripts and styles of sites you visited'],
  ['Code Cache', 'Compiled JavaScript, so sites start faster'],
  ['GPUCache', 'Graphics card shader cache for web pages'],
  ['DawnCache', 'WebGPU shader cache'],
  ['DawnGraphiteCache', 'WebGPU shader cache'],
  ['DawnWebGPUCache', 'WebGPU shader cache'],
  [path.join('Service Worker', 'CacheStorage'), 'Offline copies saved by web apps (service workers)'],
  [path.join('Service Worker', 'ScriptCache'), 'Background scripts of web apps']
];
const SHARED_CACHE = [['ShaderCache', 'Shared graphics shader cache'], ['GrShaderCache', 'Shared graphics shader cache'], ['GraphiteDawnCache', 'Shared WebGPU shader cache']];

function chromiumRules(b) {
  const profiles = () => b.single ? [b.data] : chromiumProfiles(b.data);
  const installed = () => exists(b.data);
  const suffix = p => b.single ? '' : ` (${profileName(p)})`;
  const rule = (key, props, resolve) => ({id: `${b.id}.${key}`, group: 'browsers', app: b.name, appId: b.id, processes: [b.process], installed, resolve, ...props});
  return [
    rule('cache', {
      name: 'Cache', verdict: 'safe', defaultOn: true,
      contains: `Temporary copies of images, scripts and pages from websites you visited, compiled JavaScript, graphics shaders and offline data saved by web apps. It does NOT contain your passwords, bookmarks, history, cookies or logins.`,
      ifDeleted: 'Websites load slightly slower the first time you open them again while the cache refills. You stay signed in everywhere.',
      advice: 'Safe to clean anytime. Especially useful if a site looks broken or outdated.'
    }, () => [
      ...profiles().flatMap(p => CACHE_DIRS.map(([d, label]) => ({dir: path.join(p, d), recursive: true, label: label + suffix(p)}))),
      ...(b.cache ? CACHE_DIRS.map(([d, label]) => ({dir: path.join(b.cache, d), recursive: true, label})) : []),
      ...(b.single ? [] : SHARED_CACHE.map(([d, label]) => ({dir: path.join(b.data, d), recursive: true, label})))
    ]),
    rule('history', {
      name: 'Browsing history', verdict: 'review', defaultOn: false, privacy: true,
      contains: 'The list of sites you visited, your download list and the address-bar suggestions built from them.',
      ifDeleted: 'The address bar stops suggesting sites you visited and "Most visited" tiles reset. Bookmarks, passwords, cookies and logins are kept.',
      advice: 'Clean for privacy — for example on a shared PC. It frees little space and does not speed anything up.'
    }, () => profiles().flatMap(p => ['History', 'History-journal', 'Visited Links', 'Top Sites', 'Top Sites-journal', 'Shortcuts', 'Shortcuts-journal'].map(f => ({file: path.join(p, f), label: 'History database' + suffix(p)})))),
    rule('cookies', {
      name: 'Cookies & site logins', verdict: 'keep', defaultOn: false, privacy: true, caution: true,
      contains: 'Small files websites use to keep you signed in and to remember settings such as language, shopping cart and cookie-banner choices.',
      ifDeleted: 'You are signed out of every website and must log in again, often with two-factor codes. Cookie banners come back.',
      advice: 'Usually keep. Clean only if you want to sign out everywhere or to fix a site that misbehaves.'
    }, () => profiles().flatMap(p => [path.join(p, 'Network', 'Cookies'), path.join(p, 'Network', 'Cookies-journal'), path.join(p, 'Cookies'), path.join(p, 'Cookies-journal')].map(f => ({file: f, label: 'Cookie database' + suffix(p)})))),
    rule('session', {
      name: 'Open tabs (session)', verdict: 'review', defaultOn: false, privacy: true, caution: true,
      contains: 'The tabs and windows the browser reopens when you start it again.',
      ifDeleted: 'Your previously open tabs will not be restored on the next launch.',
      advice: 'Clean only if the browser keeps reopening tabs you do not want, or for privacy.'
    }, () => profiles().flatMap(p => [{dir: path.join(p, 'Sessions'), recursive: true, label: 'Saved sessions' + suffix(p)}, ...['Current Session', 'Current Tabs', 'Last Session', 'Last Tabs'].map(f => ({file: path.join(p, f), label: 'Saved sessions' + suffix(p)}))]))
  ];
}

function firefoxRules() {
  const roamingProfiles = path.join(ROAMING, 'Mozilla', 'Firefox', 'Profiles');
  const localProfiles = path.join(LOCAL, 'Mozilla', 'Firefox', 'Profiles');
  const installed = () => exists(roamingProfiles);
  const base = {group: 'browsers', app: 'Mozilla Firefox', appId: 'firefox', processes: ['firefox.exe'], installed};
  return [
    {...base, id: 'firefox.cache', name: 'Cache', verdict: 'safe', defaultOn: true,
      contains: 'Temporary copies of web pages, images and scripts, plus page thumbnails. No passwords, bookmarks, history or logins.',
      ifDeleted: 'Sites load slightly slower the first time you revisit them. You stay signed in.',
      advice: 'Safe to clean anytime.',
      resolve: () => subdirs(localProfiles).flatMap(p => [{dir: path.join(p, 'cache2'), recursive: true, label: 'Page cache'}, {dir: path.join(p, 'startupCache'), recursive: true, label: 'Startup cache'}, {dir: path.join(p, 'thumbnails'), recursive: true, label: 'Page thumbnails'}])},
    {...base, id: 'firefox.cookies', name: 'Cookies & site logins', verdict: 'keep', defaultOn: false, privacy: true, caution: true,
      contains: 'Small files websites use to keep you signed in and remember your preferences.',
      ifDeleted: 'You are signed out of every website.',
      advice: 'Usually keep. Clean only to sign out everywhere or fix a broken site.',
      resolve: () => subdirs(roamingProfiles).flatMap(p => ['cookies.sqlite', 'cookies.sqlite-wal', 'cookies.sqlite-shm'].map(f => ({file: path.join(p, f), label: 'Cookie database'})))},
    {...base, id: 'firefox.session', name: 'Open tabs (session)', verdict: 'review', defaultOn: false, privacy: true, caution: true,
      contains: 'The tabs and windows Firefox restores on the next start.',
      ifDeleted: 'Previously open tabs will not be restored.',
      advice: 'Clean only if Firefox keeps restoring tabs you do not want.',
      resolve: () => subdirs(roamingProfiles).flatMap(p => [{file: path.join(p, 'sessionstore.jsonlz4'), label: 'Saved session'}, {dir: path.join(p, 'sessionstore-backups'), recursive: true, label: 'Session backups'}])}
  ];
}

const win = (id, name, props, resolve) => ({id: `windows.${id}`, group: 'windows', app: 'Windows', appId: 'windows', name, resolve, defaultOn: true, verdict: 'safe', ...props});
const WINDOWS = [
  win('temp', 'Temporary files', {
    contains: 'Scratch files that programs create while working: unpacked installers, update downloads, previews and leftovers. Programs are supposed to delete them, but often forget.',
    ifDeleted: 'Nothing. Only files older than 24 hours are removed, so programs that are running right now are not affected.',
    advice: 'Safe to clean regularly. This is usually one of the biggest wins.'
  }, () => [{dir: TEMP, recursive: true, minAgeHours: 24, label: 'Your temporary folder'}]),
  win('systemp', 'System temporary files', {
    admin: true,
    contains: 'The Windows-wide temporary folder used by installers, drivers and services.',
    ifDeleted: 'Nothing. Only files older than 24 hours are removed.',
    advice: 'Safe to clean. Requires administrator rights.'
  }, () => [{dir: path.join(WIN, 'Temp'), recursive: true, minAgeHours: 24, label: 'Windows temporary folder'}]),
  win('recyclebin', 'Recycle Bin', {
    special: 'recyclebin', verdict: 'review',
    contains: 'Files you deleted yourself. Windows keeps them so you can still restore them.',
    ifDeleted: 'Those files are gone for good and cannot be restored.',
    advice: 'Open the Recycle Bin first if you might still need something from it.'
  }, null),
  win('thumbcache', 'Thumbnail cache', {
    contains: 'Small preview pictures that File Explorer shows for photos, videos and documents.',
    ifDeleted: 'Folders with many pictures show previews a bit slower the first time while they are rebuilt.',
    advice: 'Safe. Also fixes wrong or broken thumbnails. Files in use by Explorer are skipped.'
  }, () => [{dir: path.join(LOCAL, 'Microsoft', 'Windows', 'Explorer'), match: /^(thumbcache|iconcache)_.*\.db$/i, label: 'Explorer thumbnail and icon cache'}]),
  win('inetcache', 'Internet cache', {
    contains: 'Web content cached by Windows itself, Office, Outlook and older programs that use the Internet Explorer engine.',
    ifDeleted: 'Nothing noticeable; content is downloaded again when needed.',
    advice: 'Safe to clean.'
  }, () => [{dir: path.join(LOCAL, 'Microsoft', 'Windows', 'INetCache'), recursive: true, label: 'Windows internet cache'}]),
  win('wer', 'Error reports', {
    contains: 'Diagnostic reports Windows writes after a program or Windows itself crashed, for sending to Microsoft or the app developer.',
    ifDeleted: 'Nothing you would use day to day. Only developers investigating a crash need them.',
    advice: 'Safe to clean.'
  }, () => [
    {dir: path.join(LOCAL, 'Microsoft', 'Windows', 'WER'), recursive: true, label: 'Your error reports'},
    {dir: path.join(PROGRAMDATA, 'Microsoft', 'Windows', 'WER', 'ReportArchive'), recursive: true, label: 'Sent error reports'},
    {dir: path.join(PROGRAMDATA, 'Microsoft', 'Windows', 'WER', 'ReportQueue'), recursive: true, label: 'Queued error reports'}
  ]),
  win('dumps', 'Crash dumps', {
    contains: 'Snapshots of memory saved when a program crashed or Windows showed a blue screen. A single dump can be several gigabytes.',
    ifDeleted: 'You lose the evidence needed to analyse why a crash happened. Your programs and data are not affected.',
    advice: 'Delete them — unless you are currently troubleshooting repeated crashes or blue screens with a technician or the app developer.'
  }, () => [
    {dir: path.join(LOCAL, 'CrashDumps'), recursive: true, label: 'App crash dumps'},
    {dir: path.join(WIN, 'Minidump'), recursive: true, label: 'Blue screen mini dumps'},
    {file: path.join(WIN, 'MEMORY.DMP'), label: 'Full blue screen memory dump'}
  ]),
  win('shadercache', 'Graphics shader cache', {
    verdict: 'review', defaultOn: false,
    contains: 'Graphics programs (shaders) that games and apps compiled for your specific graphics card, stored by DirectX, NVIDIA and AMD drivers.',
    ifDeleted: 'Games may stutter or load slower the first time you play them again while shaders are rebuilt.',
    advice: 'Keep it normally — it makes games smoother. Clean after a graphics driver update or if a game shows visual glitches.'
  }, () => [
    {dir: path.join(LOCAL, 'D3DSCache'), recursive: true, label: 'DirectX shader cache'},
    {dir: path.join(LOCAL, 'NVIDIA', 'DXCache'), recursive: true, label: 'NVIDIA DirectX shader cache'},
    {dir: path.join(LOCAL, 'NVIDIA', 'GLCache'), recursive: true, label: 'NVIDIA OpenGL shader cache'},
    {dir: path.join(LOCAL, 'AMD', 'DxCache'), recursive: true, label: 'AMD DirectX shader cache'},
    {dir: path.join(LOCAL, 'AMD', 'DxcCache'), recursive: true, label: 'AMD DirectX shader cache'},
    {dir: path.join(LOCAL, 'AMD', 'GLCache'), recursive: true, label: 'AMD OpenGL shader cache'}
  ]),
  win('updatecache', 'Windows Update downloads', {
    admin: true,
    contains: 'Update packages that Windows Update downloaded and has already installed.',
    ifDeleted: 'Nothing. If an update needs a file again, Windows downloads it.',
    advice: 'Safe. Avoid cleaning while Windows is in the middle of installing updates.'
  }, () => [{dir: path.join(WIN, 'SoftwareDistribution', 'Download'), recursive: true, label: 'Windows Update download folder'}]),
  win('deliveryopt', 'Delivery Optimization cache', {
    admin: true,
    contains: 'Pieces of Windows and Store updates that your PC keeps to share with other PCs on your network or the internet.',
    ifDeleted: 'Nothing for you; other PCs simply download from Microsoft instead.',
    advice: 'Safe to clean.'
  }, () => [{dir: path.join(WIN, 'ServiceProfiles', 'NetworkService', 'AppData', 'Local', 'Microsoft', 'Windows', 'DeliveryOptimization', 'Cache'), recursive: true, label: 'Delivery Optimization cache'}]),
  win('logs', 'Windows log files', {
    admin: true,
    contains: 'Setup, update and maintenance logs older than 7 days.',
    ifDeleted: 'Old troubleshooting history for past Windows updates is gone. Nothing else changes.',
    advice: 'Safe to clean.'
  }, () => [
    {dir: path.join(WIN, 'Logs'), recursive: true, match: /\.(log|etl|cab)$/i, minAgeHours: 168, label: 'Windows logs'},
    {dir: path.join(WIN, 'Panther'), recursive: true, match: /\.log$/i, minAgeHours: 168, label: 'Windows setup logs'}
  ]),
  win('recent', 'Recent files list', {
    verdict: 'review', defaultOn: false, privacy: true,
    contains: 'Shortcuts to documents you opened recently, shown in Quick Access and Start. The documents themselves are not stored here.',
    ifDeleted: 'The "Recent" list in Explorer and Start becomes empty. Your files are untouched.',
    advice: 'Clean for privacy only — it frees almost no space.'
  }, () => [{dir: path.join(ROAMING, 'Microsoft', 'Windows', 'Recent'), match: /\.lnk$/i, label: 'Recent items shortcuts'}]),
  win('jumplists', 'Jump lists', {
    verdict: 'review', defaultOn: false, privacy: true,
    contains: 'Recent files and pinned items you see when right-clicking an app on the taskbar.',
    ifDeleted: 'Those right-click lists become empty, including items you pinned there.',
    advice: 'Clean for privacy only.'
  }, () => [
    {dir: path.join(ROAMING, 'Microsoft', 'Windows', 'Recent', 'AutomaticDestinations'), recursive: true, label: 'Automatic jump lists'},
    {dir: path.join(ROAMING, 'Microsoft', 'Windows', 'Recent', 'CustomDestinations'), recursive: true, label: 'Custom jump lists'}
  ]),
  win('prefetch', 'Prefetch data', {
    admin: true, defaultOn: false, caution: true, verdict: 'keep',
    contains: 'Notes Windows keeps about how each program starts, so it can load it faster next time.',
    ifDeleted: 'Windows and your programs start slower for a while until Windows learns again.',
    advice: 'Not recommended. Windows limits its size automatically, and cleaning it makes the PC slower, not faster.'
  }, () => [{dir: path.join(WIN, 'Prefetch'), match: /\.pf$/i, label: 'Prefetch folder'}])
];

const appRule = (appId, app, processes, resolve, props = {}) => ({id: `apps.${appId}`, group: 'apps', app, appId, name: props.name || 'Cache', processes, resolve, defaultOn: true, verdict: 'safe', ...props});
const electronCache = (root, what = 'App') => [
  ['Cache', `${what} cache — images and files you viewed`], ['Code Cache', 'Compiled app code'], ['GPUCache', 'Graphics shader cache'],
  ['DawnCache', 'Graphics shader cache'], ['DawnGraphiteCache', 'Graphics shader cache'], [path.join('Service Worker', 'CacheStorage'), 'Offline web data']
].map(([d, label]) => ({dir: path.join(root, d), recursive: true, label}));
const APPS = [
  appRule('discord', 'Discord', ['discord.exe'], () => electronCache(path.join(ROAMING, 'discord'), 'Media'), {
    installed: () => exists(path.join(ROAMING, 'discord')),
    contains: 'Images, videos, GIFs and emojis from chats and servers you scrolled through.',
    ifDeleted: 'Media loads again when you scroll back. Messages, servers and your login are unaffected.',
    advice: 'Safe to clean. Discord’s cache grows quickly if you use many servers.'
  }),
  appRule('spotify', 'Spotify', ['spotify.exe'], () => [{dir: path.join(LOCAL, 'Spotify', 'Storage'), recursive: true, label: 'Streamed songs cache'}, {dir: path.join(LOCAL, 'Spotify', 'Data'), recursive: true, label: 'Downloaded content and app data'}], {
    installed: () => exists(path.join(LOCAL, 'Spotify')),
    verdict: 'review',
    contains: 'Songs you streamed recently, kept so they play instantly without downloading again. This also includes songs you downloaded for offline listening.',
    ifDeleted: 'Recently played songs stream again (uses internet). Playlists marked for offline download must download again.',
    advice: 'Safe if you do not rely on offline playlists. Your playlists and account are not affected.'
  }),
  appRule('slack', 'Slack', ['slack.exe'], () => electronCache(path.join(ROAMING, 'Slack')), {
    installed: () => exists(path.join(ROAMING, 'Slack')),
    contains: 'Cached images, file previews and the app’s code.',
    ifDeleted: 'Slack starts a little slower once and re-downloads previews. Messages and login are kept.',
    advice: 'Safe to clean. Also fixes many Slack display problems.'
  }),
  appRule('teams', 'Microsoft Teams', ['ms-teams.exe', 'teams.exe'], () => [
    ...electronCache(path.join(ROAMING, 'Microsoft', 'Teams')),
    ...electronCache(path.join(LOCAL, 'Packages', 'MSTeams_8wekyb3d8bbwe', 'LocalCache', 'Microsoft', 'MSTeams', 'EBWebView', 'Default'))
  ], {
    installed: () => exists(path.join(ROAMING, 'Microsoft', 'Teams')) || exists(path.join(LOCAL, 'Packages', 'MSTeams_8wekyb3d8bbwe')),
    contains: 'Cached images, profile pictures, file previews and app code.',
    ifDeleted: 'Teams starts slower once. Chats, files and your login are kept.',
    advice: 'Safe to clean. Microsoft recommends it when Teams misbehaves.'
  }),
  appRule('vscode', 'Visual Studio Code', ['code.exe'], () => [...electronCache(path.join(ROAMING, 'Code')), {dir: path.join(ROAMING, 'Code', 'CachedData'), recursive: true, label: 'Cached editor code'}, {dir: path.join(ROAMING, 'Code', 'CachedExtensionVSIXs'), recursive: true, label: 'Downloaded extension installers'}, {dir: path.join(ROAMING, 'Code', 'logs'), recursive: true, label: 'Logs'}], {
    installed: () => exists(path.join(ROAMING, 'Code')),
    contains: 'Editor caches, old extension installer files and logs.',
    ifDeleted: 'VS Code starts slightly slower once. Settings, extensions, projects and unsaved work are kept.',
    advice: 'Safe to clean.'
  }),
  appRule('steam', 'Steam', ['steamwebhelper.exe', 'steam.exe'], () => [{dir: path.join(LOCAL, 'Steam', 'htmlcache'), recursive: true, label: 'Store and community web cache'}], {
    installed: () => exists(path.join(LOCAL, 'Steam')),
    contains: 'Cached Store, Library and Community web pages. Not your games or saves.',
    ifDeleted: 'Store pages load slower once. Games, saves and login are unaffected.',
    advice: 'Safe to clean. Fixes a Store that shows blank or outdated pages.'
  }),
  appRule('epic', 'Epic Games Launcher', ['EpicGamesLauncher.exe'], () => subdirs(path.join(LOCAL, 'EpicGamesLauncher', 'Saved')).filter(p => /^webcache/i.test(path.basename(p))).map(dir => ({dir, recursive: true, label: 'Launcher web cache'})), {
    installed: () => exists(path.join(LOCAL, 'EpicGamesLauncher')),
    contains: 'Cached store pages and images of the launcher. Not your games.',
    ifDeleted: 'The launcher loads pages slower once.',
    advice: 'Safe to clean.'
  }),
  appRule('java', 'Java', [], () => [{dir: path.join(LOCALLOW, 'Sun', 'Java', 'Deployment', 'cache'), recursive: true, label: 'Java applet cache'}], {
    installed: () => exists(path.join(LOCALLOW, 'Sun', 'Java')),
    contains: 'Downloaded Java web applets and apps.',
    ifDeleted: 'Java web apps download again when you start them.',
    advice: 'Safe to clean.'
  }),
  appRule('office', 'Microsoft Office', ['winword.exe', 'excel.exe', 'powerpnt.exe', 'outlook.exe'], () => [{dir: path.join(LOCAL, 'Microsoft', 'Office', '16.0', 'OfficeFileCache'), recursive: true, label: 'Office upload cache'}, {dir: path.join(LOCAL, 'Microsoft', 'Office', 'OTele'), recursive: true, label: 'Office telemetry'}], {
    installed: () => exists(path.join(LOCAL, 'Microsoft', 'Office')), defaultOn: false, verdict: 'review',
    contains: 'Local copies of documents Office uploads to OneDrive or SharePoint, plus usage telemetry.',
    ifDeleted: 'Changes that were not uploaded yet could be lost.',
    advice: 'Only clean when all your Office documents show as saved/synced.'
  }),
  ...[['npm', 'npm', path.join(LOCAL, 'npm-cache')], ['pip', 'pip (Python)', path.join(LOCAL, 'pip', 'Cache')], ['yarn', 'Yarn', path.join(LOCAL, 'Yarn', 'Cache')], ['nuget', 'NuGet (.NET)', path.join(LOCAL, 'NuGet', 'v3-cache')]].map(([id, name, dir]) => appRule(id, name, [], () => [{dir, recursive: true, label: `${name} package cache`}], {
    installed: () => exists(dir), defaultOn: false, verdict: 'review',
    contains: 'Software packages a developer tool downloaded, kept so future installs do not download them again.',
    ifDeleted: 'The next project install downloads these packages again (slower, uses internet). Your projects are not affected.',
    advice: 'For developers: clean when you need space. Not needed otherwise.'
  }))
];

function allRules() {
  return [...WINDOWS, ...CHROMIUM.flatMap(chromiumRules), ...firefoxRules(), ...APPS];
}

const GROUPS = [
  {id: 'windows', name: 'Windows'},
  {id: 'browsers', name: 'Browsers'},
  {id: 'apps', name: 'Applications'}
];

module.exports = {allRules, GROUPS};
