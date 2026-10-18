'use strict';
// macOS cleaning rules — same format and explanation style as the Windows rules.
// fda: true marks locations macOS protects; they need Full Disk Access.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {execFileSync} = require('node:child_process');

const HOME = os.homedir();
const LIB = path.join(HOME, 'Library');
const SUPPORT = path.join(LIB, 'Application Support');
const CACHES = path.join(LIB, 'Caches');
const exists = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const subdirs = p => { try { return fs.readdirSync(p, {withFileTypes: true}).filter(d => d.isDirectory()).map(d => path.join(p, d.name)); } catch { return []; } };
const uid = () => process.getuid?.() ?? 501;
function userCacheDir() { try { return execFileSync('/usr/bin/getconf', ['DARWIN_USER_CACHE_DIR'], {encoding: 'utf8', timeout: 3000}).trim(); } catch { return null; } }

const CACHE_DIRS = [
  ['Cache', 'Page cache — images, scripts and styles of sites you visited'],
  ['Code Cache', 'Compiled JavaScript, so sites start faster'],
  ['GPUCache', 'Graphics shader cache for web pages'],
  ['DawnCache', 'WebGPU shader cache'], ['DawnGraphiteCache', 'WebGPU shader cache'], ['DawnWebGPUCache', 'WebGPU shader cache'],
  [path.join('Service Worker', 'CacheStorage'), 'Offline copies saved by web apps (service workers)'],
  [path.join('Service Worker', 'ScriptCache'), 'Background scripts of web apps']
];

const CHROMIUM = [
  {id: 'chrome', name: 'Google Chrome', data: path.join(SUPPORT, 'Google', 'Chrome'), cache: path.join(CACHES, 'Google', 'Chrome'), process: 'Google Chrome'},
  {id: 'edge', name: 'Microsoft Edge', data: path.join(SUPPORT, 'Microsoft Edge'), cache: path.join(CACHES, 'Microsoft Edge'), process: 'Microsoft Edge'},
  {id: 'brave', name: 'Brave', data: path.join(SUPPORT, 'BraveSoftware', 'Brave-Browser'), cache: path.join(CACHES, 'BraveSoftware', 'Brave-Browser'), process: 'Brave Browser'},
  {id: 'vivaldi', name: 'Vivaldi', data: path.join(SUPPORT, 'Vivaldi'), cache: path.join(CACHES, 'Vivaldi'), process: 'Vivaldi'},
  {id: 'arc', name: 'Arc', data: path.join(SUPPORT, 'Arc', 'User Data'), cache: path.join(CACHES, 'Arc', 'User Data'), process: 'Arc'},
  {id: 'yandex', name: 'Yandex Browser', data: path.join(SUPPORT, 'Yandex', 'YandexBrowser'), cache: path.join(CACHES, 'Yandex', 'YandexBrowser'), process: 'Yandex'},
  {id: 'opera', name: 'Opera', data: path.join(SUPPORT, 'com.operasoftware.Opera'), cache: path.join(CACHES, 'com.operasoftware.Opera'), process: 'Opera', single: true}
];
const isProfile = p => /^(Default|Profile \d+|Guest Profile)$/i.test(path.basename(p)) || fs.existsSync(path.join(p, 'Preferences'));
const profileName = p => path.basename(p) === 'Default' ? 'main profile' : path.basename(p).toLowerCase();

function chromiumRules(b) {
  const profiles = root => b.single ? [root] : subdirs(root).filter(isProfile);
  const sfx = p => b.single ? '' : ` (${profileName(p)})`;
  const rule = (key, props, resolve) => ({id: `${b.id}.${key}`, group: 'browsers', app: b.name, appId: b.id, processes: [b.process], installed: () => exists(b.data), resolve, ...props});
  return [
    rule('cache', {name: 'Cache', verdict: 'safe', defaultOn: true,
      contains: 'Temporary copies of images, scripts and pages from websites you visited, compiled JavaScript, graphics shaders and offline data saved by web apps. It does NOT contain your passwords, bookmarks, history, cookies or logins.',
      ifDeleted: 'Websites load slightly slower the first time you open them again. You stay signed in everywhere.',
      advice: 'Safe to clean anytime. Especially useful if a site looks broken or outdated.'
    }, () => {
      const seen = new Set(); const out = [];
      for (const root of [b.cache, b.data]) for (const p of profiles(root)) for (const [d, label] of CACHE_DIRS) {
        const dir = path.join(p, d); if (seen.has(dir)) continue; seen.add(dir); out.push({dir, recursive: true, label: label + sfx(p)});
      }
      if (!b.single) for (const d of ['ShaderCache', 'GrShaderCache', 'GraphiteDawnCache']) out.push({dir: path.join(b.data, d), recursive: true, label: 'Shared graphics shader cache'});
      return out;
    }),
    rule('history', {name: 'Browsing history', verdict: 'review', defaultOn: false, privacy: true,
      contains: 'The list of sites you visited, your download list and address-bar suggestions built from them.',
      ifDeleted: 'The address bar stops suggesting sites you visited. Bookmarks, passwords, cookies and logins are kept.',
      advice: 'Clean for privacy — it frees little space and does not speed anything up.'
    }, () => profiles(b.data).flatMap(p => ['History', 'History-journal', 'Visited Links', 'Top Sites', 'Top Sites-journal', 'Shortcuts', 'Shortcuts-journal'].map(f => ({file: path.join(p, f), label: 'History database' + sfx(p)})))),
    rule('cookies', {name: 'Cookies & site logins', verdict: 'keep', defaultOn: false, privacy: true, caution: true,
      contains: 'Small files websites use to keep you signed in and remember settings such as language and cookie-banner choices.',
      ifDeleted: 'You are signed out of every website and must log in again, often with two-factor codes.',
      advice: 'Usually keep. Clean only to sign out everywhere or fix a misbehaving site.'
    }, () => profiles(b.data).flatMap(p => [path.join(p, 'Cookies'), path.join(p, 'Cookies-journal'), path.join(p, 'Network', 'Cookies'), path.join(p, 'Network', 'Cookies-journal')].map(f => ({file: f, label: 'Cookie database' + sfx(p)}))))
  ];
}

function firefoxRules() {
  const data = path.join(SUPPORT, 'Firefox', 'Profiles'), cache = path.join(CACHES, 'Firefox', 'Profiles');
  const base = {group: 'browsers', app: 'Mozilla Firefox', appId: 'firefox', processes: ['firefox'], installed: () => exists(data)};
  return [
    {...base, id: 'firefox.cache', name: 'Cache', verdict: 'safe', defaultOn: true,
      contains: 'Temporary copies of web pages, images and scripts, plus page thumbnails. No passwords, bookmarks, history or logins.',
      ifDeleted: 'Sites load slightly slower the first time you revisit them. You stay signed in.', advice: 'Safe to clean anytime.',
      resolve: () => subdirs(cache).flatMap(p => [{dir: path.join(p, 'cache2'), recursive: true, label: 'Page cache'}, {dir: path.join(p, 'startupCache'), recursive: true, label: 'Startup cache'}, {dir: path.join(p, 'thumbnails'), recursive: true, label: 'Page thumbnails'}])},
    {...base, id: 'firefox.cookies', name: 'Cookies & site logins', verdict: 'keep', defaultOn: false, privacy: true, caution: true,
      contains: 'Small files websites use to keep you signed in.', ifDeleted: 'You are signed out of every website.', advice: 'Usually keep.',
      resolve: () => subdirs(data).flatMap(p => ['cookies.sqlite', 'cookies.sqlite-wal', 'cookies.sqlite-shm'].map(f => ({file: path.join(p, f), label: 'Cookie database'})))}
  ];
}

const SAFARI = [
  {id: 'safari.cache', group: 'browsers', app: 'Safari', appId: 'safari', name: 'Cache', processes: ['Safari'], fda: true, verdict: 'safe', defaultOn: true, installed: () => true,
    contains: 'Copies of web pages, images and scripts Safari saved to load sites faster. No passwords, bookmarks or history.',
    ifDeleted: 'Websites load slightly slower the first time. You stay signed in.', advice: 'Safe to clean. Requires Full Disk Access because macOS protects Safari’s folders.',
    resolve: () => [{dir: path.join(CACHES, 'com.apple.Safari'), recursive: true, label: 'Safari cache'}, {dir: path.join(LIB, 'Containers', 'com.apple.Safari', 'Data', 'Library', 'Caches'), recursive: true, label: 'Safari cache (sandbox)'}, {dir: path.join(CACHES, 'com.apple.WebKit.Networking'), recursive: true, label: 'Web content cache'}]},
  {id: 'safari.history', group: 'browsers', app: 'Safari', appId: 'safari', name: 'Browsing history', processes: ['Safari'], fda: true, verdict: 'review', defaultOn: false, privacy: true, installed: () => true,
    contains: 'The list of sites you visited in Safari. If you use iCloud for Safari, history is also synced to your other devices.',
    ifDeleted: 'Safari stops suggesting visited sites. With iCloud sync, the history may be removed on your other devices as well.',
    advice: 'Clean for privacy only. Safari → History → Clear History does the same with more options.',
    resolve: () => ['History.db', 'History.db-shm', 'History.db-wal'].map(f => ({file: path.join(LIB, 'Safari', f), label: 'Safari history database'}))}
];

const mac = (id, name, props, resolve) => ({id: `macos.${id}`, group: 'system', app: 'macOS', appId: 'macos', name, resolve, defaultOn: true, verdict: 'safe', ...props});

// Folders inside ~/Library/Caches that have their own rule, so "App caches" doesn't count them twice.
const OWN_CACHE_RULES = [path.join(CACHES, 'Google'), path.join(CACHES, 'Microsoft Edge'), path.join(CACHES, 'BraveSoftware'), path.join(CACHES, 'Vivaldi'), path.join(CACHES, 'Arc'), path.join(CACHES, 'Yandex'), path.join(CACHES, 'com.operasoftware.Opera'), path.join(CACHES, 'Firefox'), path.join(CACHES, 'com.apple.Safari'), path.join(CACHES, 'com.apple.WebKit.Networking'), path.join(CACHES, 'com.spotify.client'), path.join(CACHES, 'Homebrew'), path.join(CACHES, 'pip'), path.join(CACHES, 'Yarn'), path.join(CACHES, 'CocoaPods')];

const SYSTEM = [
  mac('appcaches', 'App caches', {
    contains: 'Cached data that all your other apps keep in ~/Library/Caches: downloaded images, previews, update files and similar. Only files not touched in the last 24 hours are removed.',
    ifDeleted: 'Apps may start a little slower once and download some content again. Your documents and settings are not here.',
    advice: 'Safe to clean. Quit apps you use heavily first for the best result.'
  // One location per app folder, so a single app's cache can be cleaned on its own.
  }, () => [
    ...subdirs(CACHES).filter(d => !OWN_CACHE_RULES.includes(d)).map(dir => ({dir, recursive: true, minAgeHours: 24, label: path.basename(dir)})),
    {dir: CACHES, recursive: false, minAgeHours: 24, label: 'Loose files in ~/Library/Caches'}
  ]),
  mac('logs', 'App logs', {
    contains: 'Text logs that apps write to record what they did (~/Library/Logs).',
    ifDeleted: 'Nothing you would notice. Only useful when troubleshooting a specific app.',
    advice: 'Safe to clean.'
  }, () => [{dir: path.join(LIB, 'Logs'), recursive: true, exclude: [path.join(LIB, 'Logs', 'DiagnosticReports')], label: 'Your app logs'}]),
  mac('crash', 'Crash reports', {
    contains: 'Reports macOS wrote when an app crashed or hung, used for sending to Apple or the developer.',
    ifDeleted: 'You lose details about past crashes. Apps and data are unaffected.',
    advice: 'Delete them — unless you are currently troubleshooting crashes with a developer.'
  }, () => [{dir: path.join(LIB, 'Logs', 'DiagnosticReports'), recursive: true, label: 'Crash and hang reports'}]),
  mac('temp', 'Temporary files', {
    contains: 'Scratch files apps leave in your private temporary folder. Only files older than 3 days are removed.',
    ifDeleted: 'Nothing; apps that are running are not affected because recent files are kept.',
    advice: 'Safe to clean.'
  }, () => [{dir: os.tmpdir(), recursive: true, minAgeHours: 72, label: 'Your temporary folder'}]),
  mac('quicklook', 'Quick Look thumbnails', {
    contains: 'Preview images Finder and Quick Look generated for your files.',
    ifDeleted: 'Previews are rebuilt the next time you view a folder — slightly slower once.',
    advice: 'Safe. Also fixes wrong or outdated thumbnails.'
  }, () => { const d = userCacheDir(); return d ? [{dir: path.join(d, 'com.apple.QuickLook.thumbnailcache'), recursive: true, label: 'Quick Look thumbnail cache'}] : []; }),
  mac('trash', 'Trash', {
    verdict: 'review', fda: true,
    contains: 'Files you moved to the Trash. macOS keeps them so you can still put them back.',
    ifDeleted: 'Those files are gone for good and cannot be restored.',
    advice: 'Open the Trash first if you might still need something. Requires Full Disk Access.'
  }, () => [{dir: path.join(HOME, '.Trash'), recursive: true, label: 'Your Trash'}, ...subdirs('/Volumes').map(v => ({dir: path.join(v, '.Trashes', String(uid())), recursive: true, label: `Trash on ${path.basename(v)}`}))]),
  mac('ipsw', 'iPhone & iPad software updates', {
    contains: 'Full iOS/iPadOS installer files Finder downloaded to update a device. Each is 5–8 GB.',
    ifDeleted: 'Finder downloads the file again if you ever restore or update a device from this Mac.',
    advice: 'Safe to clean — they are only needed during an update.'
  }, () => [{dir: path.join(LIB, 'iTunes', 'iPhone Software Updates'), recursive: true, label: 'iPhone updates'}, {dir: path.join(LIB, 'iTunes', 'iPad Software Updates'), recursive: true, label: 'iPad updates'}]),
  mac('installers', 'Old installers in Downloads', {
    verdict: 'review', defaultOn: false,
    contains: 'Disk images (.dmg) and installer packages (.pkg) in your Downloads folder that are older than 30 days.',
    ifDeleted: 'You would have to download those installers again if you need to reinstall something.',
    advice: 'Usually safe — the apps are already installed. Check the list before cleaning.'
  }, () => [{dir: path.join(HOME, 'Downloads'), match: /\.(dmg|pkg|mpkg)$/i, minAgeHours: 720, label: 'Installers in Downloads'}]),
  mac('mailDownloads', 'Mail attachments cache', {
    verdict: 'review', defaultOn: false, fda: true,
    contains: 'Copies of email attachments you opened in Mail. The attachments stay in your mailbox.',
    ifDeleted: 'Mail re-downloads an attachment the next time you open it.',
    advice: 'Safe if your mail account keeps messages on the server (iCloud, Gmail, Exchange). Requires Full Disk Access.'
  }, () => [{dir: path.join(LIB, 'Containers', 'com.apple.mail', 'Data', 'Library', 'Mail Downloads'), recursive: true, label: 'Mail Downloads'}]),
  mac('iosbackups', 'iPhone & iPad backups', {
    verdict: 'keep', defaultOn: false, fda: true,
    contains: 'Full local backups of your iPhone or iPad made by Finder. They can be tens of gigabytes.',
    ifDeleted: 'You can no longer restore a device from these backups. If a backup is your only copy of photos or messages, they would be lost.',
    advice: 'Keep unless you back up to iCloud. Manage individual backups in Finder → your device → Manage Backups.'
  }, () => [{dir: path.join(SUPPORT, 'MobileSync', 'Backup'), recursive: true, label: 'Device backups'}])
];

const app = (id, name, processes, resolve, props) => ({id: `apps.${id}`, group: 'apps', app: name, appId: id, name: props.name || 'Cache', processes, resolve, defaultOn: true, verdict: 'safe', ...props});
const electron = (root, what = 'App') => [['Cache', `${what} cache — images and files you viewed`], ['Code Cache', 'Compiled app code'], ['GPUCache', 'Graphics shader cache'], [path.join('Service Worker', 'CacheStorage'), 'Offline web data']].map(([d, label]) => ({dir: path.join(root, d), recursive: true, label}));
const XCODE = path.join(LIB, 'Developer');
const APPS = [
  app('discord', 'Discord', ['Discord'], () => electron(path.join(SUPPORT, 'discord'), 'Media'), {installed: () => exists(path.join(SUPPORT, 'discord')),
    contains: 'Images, videos, GIFs and emojis from chats and servers you scrolled through.', ifDeleted: 'Media loads again when you scroll back. Messages and login are unaffected.', advice: 'Safe to clean.'}),
  app('spotify', 'Spotify', ['Spotify'], () => [{dir: path.join(CACHES, 'com.spotify.client'), recursive: true, label: 'Streamed songs cache'}, {dir: path.join(SUPPORT, 'Spotify', 'PersistentCache'), recursive: true, label: 'Song cache and offline downloads'}], {installed: () => exists(path.join(SUPPORT, 'Spotify')), verdict: 'review',
    contains: 'Songs you streamed recently, plus songs downloaded for offline listening.', ifDeleted: 'Recently played songs stream again. Offline playlists must download again.', advice: 'Safe if you do not rely on offline playlists.'}),
  app('slack', 'Slack', ['Slack'], () => [...electron(path.join(SUPPORT, 'Slack')), ...electron(path.join(LIB, 'Containers', 'com.tinyspeck.slackmacgap', 'Data', 'Library', 'Application Support', 'Slack'))], {installed: () => exists(path.join(SUPPORT, 'Slack')) || exists(path.join(LIB, 'Containers', 'com.tinyspeck.slackmacgap')),
    contains: 'Cached images, file previews and the app’s code.', ifDeleted: 'Slack starts a little slower once. Messages and login are kept.', advice: 'Safe to clean.'}),
  app('teams', 'Microsoft Teams', ['MSTeams', 'Microsoft Teams'], () => [{dir: path.join(LIB, 'Containers', 'com.microsoft.teams2', 'Data', 'Library', 'Caches'), recursive: true, label: 'Teams cache'}, ...electron(path.join(SUPPORT, 'Microsoft', 'Teams'))], {installed: () => exists(path.join(LIB, 'Containers', 'com.microsoft.teams2')) || exists(path.join(SUPPORT, 'Microsoft', 'Teams')),
    contains: 'Cached images, profile pictures, previews and app code.', ifDeleted: 'Teams starts slower once. Chats and login are kept.', advice: 'Safe to clean.'}),
  app('vscode', 'Visual Studio Code', ['Code'], () => [...electron(path.join(SUPPORT, 'Code')), {dir: path.join(SUPPORT, 'Code', 'CachedData'), recursive: true, label: 'Cached editor code'}, {dir: path.join(SUPPORT, 'Code', 'CachedExtensionVSIXs'), recursive: true, label: 'Downloaded extension installers'}, {dir: path.join(SUPPORT, 'Code', 'logs'), recursive: true, label: 'Logs'}], {installed: () => exists(path.join(SUPPORT, 'Code')),
    contains: 'Editor caches, old extension installers and logs.', ifDeleted: 'VS Code starts slightly slower once. Settings, extensions and projects are kept.', advice: 'Safe to clean.'}),
  ...[['claude', 'Claude', 'Claude'], ['cursor', 'Cursor', 'Cursor'], ['notion', 'Notion', 'Notion'], ['obsidian', 'Obsidian', 'obsidian']].map(([id, name, folder]) => app(id, name, [name], () => [...electron(path.join(SUPPORT, folder)), ...(id === 'cursor' ? [{dir: path.join(SUPPORT, folder, 'CachedData'), recursive: true, label: 'Cached editor code'}] : [])], {installed: () => exists(path.join(SUPPORT, folder)),
    contains: 'Cached images, web content and the app’s compiled code.', ifDeleted: `${name} starts a little slower once. Your ${id === 'obsidian' ? 'vaults' : 'chats, documents'} and login are kept.`, advice: 'Safe to clean while the app is closed.'})),
  app('steam', 'Steam', ['steam_osx'], () => [{dir: path.join(SUPPORT, 'Steam', 'appcache', 'httpcache'), recursive: true, label: 'Store web cache'}], {installed: () => exists(path.join(SUPPORT, 'Steam')),
    contains: 'Cached Store and Community web pages. Not your games.', ifDeleted: 'Store pages load slower once.', advice: 'Safe to clean.'}),
  app('xcode', 'Xcode', ['Xcode'], () => [{dir: path.join(XCODE, 'Xcode', 'DerivedData'), recursive: true, label: 'DerivedData (build files)'}, {dir: path.join(XCODE, 'CoreSimulator', 'Caches'), recursive: true, label: 'Simulator caches'}], {installed: () => exists(path.join(XCODE, 'Xcode')), name: 'Build files (DerivedData)',
    contains: 'Intermediate build products and indexes Xcode creates for every project you open, plus simulator caches.', ifDeleted: 'The next build of each project takes longer while Xcode rebuilds them. Your source code is not here.', advice: 'Safe and often frees many gigabytes.'}),
  app('xcodeDevice', 'Xcode', ['Xcode'], () => [{dir: path.join(XCODE, 'Xcode', 'iOS DeviceSupport'), recursive: true, label: 'iOS device support'}, {dir: path.join(XCODE, 'Xcode', 'watchOS DeviceSupport'), recursive: true, label: 'watchOS device support'}], {installed: () => exists(path.join(XCODE, 'Xcode', 'iOS DeviceSupport')), name: 'Device support files', verdict: 'review', defaultOn: false,
    contains: 'Debug symbols copied from every iPhone/iPad/Watch version you connected for development. Old iOS versions pile up.', ifDeleted: 'Connecting a device for debugging copies its files again (a few minutes).', advice: 'Safe for versions you no longer test on.'}),
  app('homebrew', 'Homebrew', [], () => [{dir: path.join(CACHES, 'Homebrew'), recursive: true, label: 'Downloaded bottles and installers'}], {installed: () => exists(path.join(CACHES, 'Homebrew')),
    contains: 'Packages Homebrew downloaded during installs and upgrades.', ifDeleted: 'Reinstalling a package downloads it again.', advice: 'Safe to clean (same as “brew cleanup”).'}),
  ...[['npm', 'npm', path.join(HOME, '.npm', '_cacache')], ['pip', 'pip (Python)', path.join(CACHES, 'pip')], ['yarn', 'Yarn', path.join(CACHES, 'Yarn')], ['cocoapods', 'CocoaPods', path.join(CACHES, 'CocoaPods')], ['gradle', 'Gradle', path.join(HOME, '.gradle', 'caches')]].map(([id, name, dir]) => app(id, name, [], () => [{dir, recursive: true, label: `${name} package cache`}], {installed: () => exists(dir), defaultOn: false, verdict: 'review',
    contains: 'Packages a developer tool downloaded, kept so future installs don’t download them again.', ifDeleted: 'The next project install downloads these packages again. Your projects are not affected.', advice: 'For developers: clean when you need space.'})),
  app('adobe', 'Adobe Creative Cloud', [], () => [{dir: path.join(SUPPORT, 'Adobe', 'Common', 'Media Cache Files'), recursive: true, label: 'Media cache files'}, {dir: path.join(SUPPORT, 'Adobe', 'Common', 'Media Cache'), recursive: true, label: 'Media cache database'}], {installed: () => exists(path.join(SUPPORT, 'Adobe', 'Common')), name: 'Media cache', verdict: 'review',
    contains: 'Audio and video previews Premiere Pro, After Effects and Audition generated for your footage.', ifDeleted: 'Projects re-generate previews when opened, which takes time.', advice: 'Clean when no project is open, especially after finishing projects.'})
];

function allRules() { return [...SYSTEM, ...SAFARI, ...CHROMIUM.flatMap(chromiumRules), ...firefoxRules(), ...APPS]; }
const GROUPS = [{id: 'system', name: 'macOS'}, {id: 'browsers', name: 'Browsers'}, {id: 'apps', name: 'Applications'}];

module.exports = {allRules, GROUPS};
