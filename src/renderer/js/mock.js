// Sample data used only when the UI runs outside Electron (browser preview / screenshots).
// Like the main process, the sample API answers in the interface language: descriptive text is written as
// L(english, russian) and turned into the current language's text when a method is called (or an event is sent).
// Names that are data — programs, publishers, paths, hardware, OS products — are written once, as the system gives them.
import {lang} from './i18n.js';

const MAC = new URLSearchParams(location.search).get('platform') === 'darwin';
const TR = Symbol('text');
const L = (en, ru) => ({[TR]: true, en, ru});
const tx = v => v?.[TR] ? v[lang()] ?? v.en : v;
const loc = v => v?.[TR] ? tx(v) : Array.isArray(v) ? v.map(loc) : v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, loc(x)])) : v;
const listeners = new Set();
const emit = e => { const v = loc(e); listeners.forEach(fn => fn(v)); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const GB = 1024 ** 3, MB = 1024 ** 2;

let settings = {language: 'en', theme: 'system', closeAppsBeforeCleaning: false, confirmBeforeCleaning: true, exclusions: [], cleanerSelection: null, registryCategories: null};
const activity = [
  {id: 'a1', at: new Date(Date.now() - 864e5 * 2).toISOString(), kind: 'clean', title: L('Cleaned 18,204 files', 'Удалено 18\u00a0204 ненужных файла'), bytes: 3.1 * GB},
  {id: 'a2', at: new Date(Date.now() - 864e5 * 2).toISOString(), kind: 'registry', title: L('Fixed 212 registry issues', 'Исправлено 212 проблем в реестре'), count: 212, backup: 'x.reg', backupExists: true},
  {id: 'a3', at: new Date(Date.now() - 864e5 * 5).toISOString(), kind: 'uninstall', title: L('Uninstalled Old Toolbar', 'Удалена программа Old Toolbar')},
  {id: 'a4', at: new Date(Date.now() - 864e5 * 5).toISOString(), kind: 'startup', title: L('Disabled Spotify at startup', 'Отключена автозагрузка: Spotify')}
];

const R = (id, group, app, appId, name, description, bytes, extra = {}) => ({id, group, app, appId, name, description, defaultOn: true, admin: false, privacy: false, caution: false, processes: [], installed: true, bytes, verdict: extra.caution ? 'keep' : extra.privacy || extra.defaultOn === false ? 'review' : 'safe', contains: L(description.en + ' It does not contain passwords, bookmarks or logins.', description.ru + ' Пароли, закладки и данные для входа здесь не хранятся.'), ifDeleted: L('Rebuilt automatically; things may load slightly slower the first time.', 'Создаётся заново автоматически; в первый раз всё может загружаться чуть медленнее.'), advice: L('Safe to clean anytime.', 'Можно очищать в любое время.'), ...extra});
const CACHE = L('Cache', 'Кэш'), WEB_CACHE = L('Cached web content.', 'Кэшированное содержимое веб-страниц.');
const rules = [
  R('windows.temp', 'windows', 'Windows', 'windows', L('Temporary files', 'Временные файлы'), L('Files apps left in your temp folder.', 'Файлы, которые программы оставили в папке временных файлов.'), 2.4 * GB),
  R('windows.systemp', 'windows', 'Windows', 'windows', L('System temporary files', 'Системные временные файлы'), L('Windows temp folder.', 'Папка временных файлов Windows.'), 820 * MB, {admin: true}),
  R('windows.recyclebin', 'windows', 'Windows', 'windows', L('Recycle Bin', 'Корзина'), L('Permanently removes everything in the Recycle Bin.', 'Безвозвратно удаляет всё содержимое Корзины.'), 1.3 * GB),
  R('windows.thumbcache', 'windows', 'Windows', 'windows', L('Thumbnail cache', 'Кэш эскизов'), L('Explorer thumbnail caches.', 'Кэш эскизов Проводника.'), 214 * MB),
  R('windows.wer', 'windows', 'Windows', 'windows', L('Error reports', 'Отчёты об ошибках'), L('Crash reports.', 'Отчёты о сбоях.'), 96 * MB),
  R('windows.dumps', 'windows', 'Windows', 'windows', L('Crash dumps', 'Аварийные дампы'), L('Memory dumps.', 'Дампы памяти.'), 640 * MB),
  R('windows.shadercache', 'windows', 'Windows', 'windows', L('Graphics shader cache', 'Кэш графических шейдеров'), L('Shader caches.', 'Кэши шейдеров.'), 1.1 * GB),
  R('windows.updatecache', 'windows', 'Windows', 'windows', L('Windows Update downloads', 'Загрузки Центра обновления Windows'), L('Installed update packages.', 'Пакеты уже установленных обновлений.'), 3.6 * GB, {admin: true}),
  R('windows.recent', 'windows', 'Windows', 'windows', L('Recent files list', 'Список последних файлов'), L('Quick Access recent items.', 'Последние файлы на панели быстрого доступа.'), 1 * MB, {defaultOn: false, privacy: true}),
  R('chrome.cache', 'browsers', 'Google Chrome', 'chrome', CACHE, L('Cached images and scripts.', 'Кэшированные изображения и скрипты.'), 1.8 * GB, {processes: ['chrome.exe']}),
  R('chrome.history', 'browsers', 'Google Chrome', 'chrome', L('Browsing history', 'История посещений'), L('Visited sites.', 'Посещённые сайты.'), 64 * MB, {defaultOn: false, privacy: true}),
  R('chrome.cookies', 'browsers', 'Google Chrome', 'chrome', L('Cookies', 'Файлы cookie'), L('Signs you out of websites.', 'Вы выйдете из аккаунтов на сайтах.'), 12 * MB, {defaultOn: false, privacy: true, caution: true}),
  R('edge.cache', 'browsers', 'Microsoft Edge', 'edge', CACHE, WEB_CACHE, 690 * MB),
  R('firefox.cache', 'browsers', 'Mozilla Firefox', 'firefox', CACHE, WEB_CACHE, 410 * MB),
  R('apps.discord', 'apps', 'Discord', 'discord', CACHE, L('Cached data the app rebuilds.', 'Кэшированные данные, которые приложение создаст заново.'), 520 * MB, {processes: ['discord.exe']}),
  R('apps.spotify', 'apps', 'Spotify', 'spotify', CACHE, L('Streamed music cache.', 'Кэш прослушанной музыки.'), 2.2 * GB),
  R('apps.vscode', 'apps', 'Visual Studio Code', 'vscode', CACHE, L('Editor caches and logs.', 'Кэши и журналы редактора.'), 380 * MB),
  R('apps.npm', 'apps', 'npm', 'npm', CACHE, L('Downloaded package cache.', 'Кэш скачанных пакетов.'), 1.6 * GB, {defaultOn: false})
];

const cats = ['uninstall', 'startup', 'apppaths', 'shareddlls', 'applications', 'extensions', 'com', 'muicache', 'compat', 'installer', 'fonts', 'help', 'empty'];
const catNames = {uninstall: L('Broken uninstall entries', 'Неисправные записи в списке программ'), startup: L('Invalid startup entries', 'Неверные записи автозагрузки'), apppaths: L('Invalid application paths', 'Неверные пути к приложениям'), shareddlls: L('Missing shared DLLs', 'Отсутствующие общие DLL'), applications: L('Obsolete "Open with" apps', 'Устаревшие приложения в меню «Открыть с помощью»'), extensions: L('Unused file extensions', 'Неиспользуемые расширения файлов'), com: L('Broken COM registrations', 'Повреждённые регистрации COM'), muicache: L('MUI cache', 'Кэш MUI'), compat: L('Compatibility records', 'Записи совместимости'), installer: L('Installer folders', 'Папки установщика'), fonts: L('Missing fonts', 'Отсутствующие шрифты'), help: L('Missing help files', 'Отсутствующие файлы справки'), empty: L('Empty software keys', 'Пустые разделы программ')};
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
const REG_USER = L('Registry · Current user', 'Реестр · Текущий пользователь');
const startup = [
  S('Discord', 'Discord Inc.', 'C:\\Users\\Alex\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe', 'registry', REG_USER, true),
  S('Spotify', 'Spotify AB', 'C:\\Users\\Alex\\AppData\\Roaming\\Spotify\\Spotify.exe /minimized', 'registry', REG_USER, false),
  S('Steam', 'Valve Corporation', '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent', 'registry', REG_USER, true),
  S('OneDrive', 'Microsoft Corporation', '"C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe" /background', 'registry', REG_USER, true),
  S('SecurityHealth', 'Microsoft Corporation', '%windir%\\system32\\SecurityHealthSystray.exe', 'registry', L('Registry · All users', 'Реестр · Все пользователи'), true, {scope: 'machine', admin: true}),
  S('Old Updater', null, 'C:\\Program Files\\OldApp\\updater.exe', 'registry', REG_USER, true, {exists: false}),
  S('Notion', 'Notion Labs', 'C:\\Users\\Alex\\AppData\\Local\\Programs\\Notion\\Notion.exe', 'folder', L('Startup folder · Current user', 'Папка автозагрузки · Текущий пользователь'), true),
  S('GoogleUpdateTaskMachineUA', 'Google LLC', '"C:\\Program Files (x86)\\Google\\Update\\GoogleUpdate.exe" /ua', 'task', L('Scheduled task · At sign-in', 'Задание планировщика · При входе в систему'), true),
  S('Adobe Update Service', 'Adobe Inc.', '"C:\\Program Files (x86)\\Common Files\\Adobe\\ARM\\armsvc.exe"', 'service', L('Service · Auto', 'Служба · Автоматически'), true, {state: 'Running', admin: true, scope: 'machine'})
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

// Preview: results "from the previous session" so the restored state can be seen; saves live only until reload.
const savedScans = new Map();
const earlier = () => new Date(Date.now() - 864e5 * 2 - 3.6e6 * 5).toISOString();

// Cleaner location names. "key" keeps the English name, so saved results can be renamed in another language (as main.cjs relabel()).
const SECONDARY = L('Secondary cache', 'Дополнительный кэш');
const folderLabel = r => L(`${r.name.en} folder`, `Папка «${r.name.ru}»`);
const locationLabel = key => key === SECONDARY.en ? SECONDARY : rules.map(folderLabel).find(l => l.en === key) || key;
const relabel = analysis => ({...analysis, results: (analysis?.results || []).map(r => ({...r, locations: (r.locations || []).map(l => ({...l, key: l.key ?? l.label, label: locationLabel(l.key ?? l.label)}))}))});

const FLUSH_DNS = L('Flush DNS cache', 'Очистить кэш DNS');
const api = {
  'disk.last': async () => ({...await api['disk.analyze'](), at: earlier(), restored: true}),
  'scans.load': async ({kind}) => { const saved = savedScans.get(kind); if (saved && kind === 'cleaner') return {...saved, data: relabel(saved.data)}; return saved || (kind === 'duplicates' ? {v: 1, savedAt: earlier(), data: {...await api['disk.duplicates'](), root: 'C:\\', roots: ['C:\\'], minSize: MB, at: earlier()}} : null); },
  'scans.save': ({kind, data}) => { if (data == null) savedScans.delete(kind); else savedScans.set(kind, {v: 1, savedAt: new Date().toISOString(), data: structuredClone(data)}); return {ok: true}; },
  'app.info': () => ({version: '1.0.0', electron: '44.8.0', dataPath: 'C:\\Users\\Alex\\AppData\\Roaming\\Aster'}),
  'system.info': () => MAC ? ({os: 'macOS Sequoia', osVersion: '15.6 (24G84)', build: 15, arch: 'arm64', hostname: 'Alex-MacBook-Pro', user: 'alex', model: 'MacBook Pro (Mac15,6)', cpu: 'Apple M3 Pro', cores: 12, gpu: ['Apple M3 Pro'], admin: false, mac: true, fda: false, memory: {total: 18 * GB, free: 3.1 * GB}, uptime: 302000, cpuLoad: 9,
    drives: [{name: 'Macintosh HD', root: '/', label: 'Macintosh HD', format: 'APFS', type: 'Fixed', total: 994 * GB, free: 212 * GB}, {name: 'Backup', root: '/Volumes/Backup', label: 'Backup', type: 'Removable', total: 2000 * GB, free: 1210 * GB}]}) : ({os: 'Windows 11 Pro', osVersion: L('25H2 (build 26200.6899)', '25H2 (сборка 26200.6899)'), arch: 'x64', hostname: 'ALEX-DESKTOP', user: 'alex', model: 'ASUS ROG Strix G16', cpu: 'AMD Ryzen 9 7945HX with Radeon Graphics', cores: 32, gpu: ['NVIDIA GeForce RTX 4070 Laptop GPU'], admin: false, memory: {total: 32 * GB, free: 13.4 * GB}, uptime: 192000, cpuLoad: 14,
    drives: [{name: 'C:', label: 'Windows', format: 'NTFS', type: 'Fixed', total: 1000 * GB, free: 214 * GB}, {name: 'D:', label: 'Data', format: 'NTFS', type: 'Fixed', total: 2000 * GB, free: 1480 * GB}]}),
  'system.live': () => ({memory: {total: 32 * GB, free: (12 + Math.random() * 2) * GB}, cpuLoad: Math.round(8 + Math.random() * 18), uptime: 192000}),
  'system.relaunchAdmin': () => ({ok: true}),
  'appUpdate.check': async () => { await wait(700); return {current: '1.0.0', latest: '1.1.0', kind: MAC ? 'mac' : 'installer', available: true, name: 'Aster 1.1.0', url: 'https://github.com/Nikita-Shulga/Aster/releases/latest', publishedAt: '2026-10-18T19:05:13Z', asset: {name: MAC ? 'Aster-1.1.0-mac-arm64.dmg' : 'Aster-Setup-1.1.0.exe', size: 111 * MB}, checkedAt: new Date().toISOString(),
    notes: '## What\'s new\n\n**Cleaner: clean exactly what you want**\n- Delete a single file from Show largest files.\n- Clean a single location with the broom button next to it.\n- Faster scans of big cache folders.'}; },
  'appUpdate.download': async () => { for (let i = 1; i <= 20; i++) { emit({channel: 'appUpdate', phase: 'download', done: i * 5.55 * MB, total: 111 * MB}); await wait(120); } return {ok: true, version: '1.1.0'}; },
  'appUpdate.cancel': () => ({ok: true}),
  'appUpdate.install': () => ({ok: true, restarting: !MAC, message: MAC ? L('Aster 1.1.0 is open in Finder. Quit Aster, drag the new Aster into Applications and choose Replace.', 'Aster 1.1.0 открыт в Finder. Завершите Aster, перетащите новую версию в папку «Программы» и выберите «Заменить».') : L('Installing Aster 1.1.0. Aster will reopen in a moment.', 'Устанавливается Aster 1.1.0. Через несколько секунд Aster откроется снова.')}),
  'settings.get': () => settings,
  'settings.update': p => (settings = {...settings, ...p}),
  'settings.pickExclusion': () => 'D:\\Projects',
  'cleaner.rules': () => ({groups: [{id: 'windows', name: 'Windows'}, {id: 'browsers', name: L('Browsers', 'Браузеры')}, {id: 'apps', name: L('Applications', 'Приложения')}], rules}),
  'cleaner.analyze': async ({ids}) => {
    for (let i = 0; i < ids.length; i++) { emit({channel: 'cleaner', index: i, total: ids.length, label: rules.find(r => r.id === ids[i])?.app + ' · ' + tx(rules.find(r => r.id === ids[i])?.name)}); await wait(90); }
    const results = ids.map(id => { const r = rules.find(x => x.id === id); return {id, bytes: Math.round(r.bytes), files: Math.round(r.bytes / 180000), running: r.processes.length && id === 'chrome.cache' ? ['chrome.exe'] : [], locations: [{label: folderLabel(r), key: `${r.name.en} folder`, path: `C:\\Users\\Alex\\AppData\\Local\\${r.app}\\Cache`, drive: 'C:', bytes: Math.round(r.bytes * .8), files: Math.round(r.bytes / 220000)}, {label: SECONDARY, key: SECONDARY.en, path: `D:\\Cache\\${r.app}`, drive: 'D:', bytes: Math.round(r.bytes * .2), files: Math.round(r.bytes / 900000)}], sample: [{path: `C:\\Users\\Alex\\AppData\\Local\\Temp\\${id}\\data_1.bin`, size: r.bytes / 6}, {path: `C:\\Users\\Alex\\AppData\\Local\\Temp\\${id}\\f_000231`, size: r.bytes / 9}]}; });
    return {results, totalBytes: results.reduce((n, r) => n + r.bytes, 0), totalFiles: results.reduce((n, r) => n + r.files, 0)};
  },
  'cleaner.clean': async ({ids}) => { for (let i = 0; i < ids.length; i++) { emit({channel: 'cleaner', index: i, total: ids.length, label: ids[i]}); await wait(120); } const freed = ids.reduce((n, id) => n + (rules.find(r => r.id === id)?.bytes || 0), 0); return {results: [], freed, deleted: Math.round(freed / 180000), skipped: 37}; },
  'cleaner.listFiles': async ({id}) => {
    await wait(400);
    const r = rules.find(x => x.id === id);
    const base = `C:\\Users\\Alex\\AppData\\Local\\${r.app}\\Cache`;
    const names = ['data_1', 'data_2', 'index', 'f_000a1c', 'f_000b37', 'f_00c2d9', 'thumbs.db', 'session.log', 'blob_store.bin', 'shader_cache.bin'];
    const files = Array.from({length: 240}, (_, i) => ({path: `${base}\\${i % 3 ? 'Cache_Data' : 'Code Cache\\js'}\\${names[i % names.length]}${i >= names.length ? '_' + i : ''}`, size: Math.round(r.bytes / (i + 2) / 4), mtime: Date.now() - i * 36e5 * 7, loc: base}))
      .sort((a, b) => b.size - a.size);
    return {files, total: files.length, bytes: files.reduce((n, f) => n + f.size, 0), truncated: false, recycleBin: id === 'windows.recyclebin'};
  },
  'cleaner.removeFiles': async ({paths}) => { await wait(300); return {done: paths, failed: [], freed: 0}; },
  'cleaner.relabel': ({analysis}) => relabel(analysis),
  'cleaner.cancel': () => ({ok: true}),
  'registry.categories': () => cats.map(id => ({id, name: catNames[id], description: L('References to files or programs that no longer exist.', 'Ссылки на файлы и программы, которых больше нет.'), verdict: ['extensions', 'com', 'installer'].includes(id) ? 'review' : 'safe', defaultOn: !['extensions', 'com', 'installer'].includes(id), contains: L('Entries left behind by programs that were removed.', 'Записи, оставшиеся после удалённых программ.'), ifDeleted: L('Nothing visible; Windows stops referring to missing files.', 'Внешне ничего не изменится: Windows перестанет обращаться к отсутствующим файлам.'), advice: L('Safe housekeeping.', 'Безопасная чистка.')})),
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
  'programs.leftovers': async () => { await wait(700); return {items: [{id: 'l1', kind: 'folder', path: 'C:\\Users\\Alex\\AppData\\Roaming\\Old Game Launcher', reason: L('Matches program name', 'Совпадает с названием программы'), size: 214 * MB}, {id: 'l2', kind: 'registry', path: 'HKCU\\Software\\Old Game Launcher', reason: L('Program settings', 'Настройки программы'), detail: L('12 values, 3 subkeys', '12 параметров, 3 подраздела')}]}; },
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
  'updates.update': async ({id}) => { for (const l of [L('Found package', 'Найден пакет'), L('Downloading…', 'Скачивание…'), L('Successfully verified installer hash', 'Хэш установщика успешно проверен'), L('Starting package install…', 'Запуск установки пакета…')]) { emit({channel: 'updates', id, line: l}); await wait(500); } updates.items = updates.items.filter(i => i.id !== id); return {ok: true}; },
  'disk.pickFolder': () => 'C:\\',
  'disk.analyze': async () => { for (let i = 1; i <= 8; i++) { emit({channel: 'disk', files: i * 51234, bytes: i * 48 * GB, current: 'C:\\Users\\Alex\\AppData\\Local\\Packages'}); await wait(150); } return {root: 'C:\\', size: 388 * GB, files: 768000, top: [{path: 'C:\\Users\\Alex\\Videos\\Trip 2026 (4K).mp4', size: 18.4 * GB, mtime: Date.now() - 864e5 * 40}, {path: 'C:\\hiberfil.sys', size: 12.8 * GB}, {path: 'C:\\Games\\Cyberpunk\\archive\\pc\\content\\basegame_4_gamedata.archive', size: 9.6 * GB}, {path: 'C:\\Users\\Alex\\Downloads\\ubuntu-26.04-desktop-amd64.iso', size: 6.1 * GB}], types: [{name: 'Video', bytes: 92 * GB, count: 410, exts: []}, {name: 'Programs', bytes: 71 * GB, count: 88000, exts: []}, {name: 'Disk images', bytes: 64 * GB, count: 2100, exts: []}, {name: 'Images', bytes: 22 * GB, count: 41000, exts: []}, {name: 'Archives', bytes: 18 * GB, count: 900, exts: []}, {name: 'Documents', bytes: 8 * GB, count: 12000, exts: []}, {name: 'Other', bytes: 113 * GB, count: 600000, exts: []}]}; },
  'disk.children': ({path}) => { const key = path.replace(/\\$/, '') || 'C:'; const kids = tree[path] || tree[key] || tree[key + '\\'] || [['Cache', 2 * GB, 4000], ['Data', 1 * GB, 1000]]; const items = kids.map(([name, size, files]) => ({name, path: (path.endsWith('\\') ? path : path + '\\') + name, size, files, dir: true})); items.push({name: 'pagefile.sys', path: path + '\\pagefile.sys', size: 8 * GB, dir: false, mtime: Date.now()}); const size = items.reduce((n, i) => n + i.size, 0); return {path, size, files: items.reduce((n, i) => n + (i.files || 1), 0), items}; },
  'disk.duplicates': async () => { await wait(1200); return {files: 48210, bytes: 210 * GB, wasted: 4.3 * GB, groups: [{size: 1.2 * GB, files: [{path: 'D:\\Backup\\Videos\\Wedding.mp4', mtime: Date.now() - 864e5 * 300}, {path: 'C:\\Users\\Alex\\Videos\\Wedding.mp4', mtime: Date.now() - 864e5 * 20}]}, {size: 640 * MB, files: [{path: 'C:\\Users\\Alex\\Downloads\\installer.iso', mtime: Date.now() - 864e5 * 90}, {path: 'C:\\Users\\Alex\\Downloads\\installer (1).iso', mtime: Date.now() - 864e5 * 10}, {path: 'D:\\ISO\\installer.iso', mtime: Date.now() - 864e5 * 200}]}]}; },
  'disk.cancel': () => ({ok: true}),
  'disk.trash': ({paths}) => ({done: paths, failed: [], bytes: 1.2 * GB}),
  'disk.identify': ({items}) => Object.fromEntries(items.map(i => [i.path, /pagefile/i.test(i.path) ? {verdict: 'keep', kind: L('Windows virtual memory', 'Виртуальная память Windows'), owner: 'Windows', what: L('Windows uses this file as extra memory when RAM is full.', 'Windows использует этот файл как дополнительную память, когда не хватает оперативной.'), advice: L('Do not delete it.', 'Не удаляйте его.')} : /\.iso$/i.test(i.path) ? {verdict: 'safe', kind: L('Disk image', 'Образ диска'), owner: L('Your downloads', 'Ваши загрузки'), what: L('An installer image.', 'Образ установщика.'), advice: L('Safe to delete once installed.', 'После установки его можно удалить.')} : /Games|Program/i.test(i.path) ? {verdict: 'keep', kind: L('Program folder', 'Папка программы'), owner: L('Installed programs', 'Установленные программы'), what: L('Program files.', 'Файлы программы.'), advice: L('Uninstall the program instead.', 'Вместо этого удалите саму программу.')} : {verdict: 'review', kind: i.dir ? L('Folder', 'Папка') : L('Video', 'Видео'), owner: i.dir ? null : L('You', 'Вы'), what: L('Your own files.', 'Ваши личные файлы.'), advice: L('Delete only if you are sure.', 'Удаляйте, только если уверены.')}])),
  'tweaks.list': ({groups}) => ({groups: {performance: L('Performance', 'Производительность'), gaming: L('Gaming', 'Игры'), privacy: L('Privacy & ads', 'Конфиденциальность и реклама'), appearance: L('Appearance', 'Оформление'), explorer: L('File Explorer', 'Проводник'), taskbar: L('Taskbar & input', 'Панель задач и ввод')}, items: MOCK_TWEAKS.filter(t => groups.includes(t.group))}),
  'tweaks.set': ({id, value}) => { const t = MOCK_TWEAKS.find(x => x.id === id); t.value = value; return {ok: true, value}; },
  'power.get': () => power, 'power.set': p => { if (p.guid) power.plans.forEach(x => { x.active = x.guid === p.guid; }); return power; }, 'power.addHigh': () => power,
  'processes.list': () => ({items: [{name: 'chrome', description: 'Google Chrome', company: 'Google LLC', count: 37, memory: 4.4 * GB}, {name: 'Discord', description: 'Discord', company: 'Discord Inc.', count: 6, memory: 820 * MB}, {name: 'Code', description: 'Visual Studio Code', company: 'Microsoft Corporation', count: 12, memory: 1.3 * GB}, {name: 'dwm', description: L('Desktop Window Manager', 'Диспетчер окон рабочего стола'), company: 'Microsoft Corporation', count: 1, memory: 310 * MB, protected: true}]}),
  'processes.end': () => ({ok: true}), 'explorer.restart': () => ({ok: true}),
  'display.list': () => ({items: [{device: '\\\\.\\DISPLAY1', name: 'Dell AW3423DW', primary: true, width: 3440, height: 1440, freq: 60, modes: [175, 144, 120, 100, 60].map(f => ({w: 3440, h: 1440, f})).concat([{w: 2560, h: 1080, f: 60}, {w: 1920, h: 1080, f: 60}])}]}),
  'display.set': () => ({ok: true}),
  'tools.catalog': () => ({actions: MAC ? [{id: 'snapshot', icon: 'restore', tone: 'blue', title: L('Create a Time Machine snapshot', 'Создать снимок Time Machine'), text: L('Saves a local snapshot you can restore from.', 'Сохраняет локальный снимок, из которого можно восстановить систему.')}, {id: 'thin', icon: 'drive', tone: 'green', title: L('Free space used by local snapshots', 'Освободить место, занятое локальными снимками'), text: L('Removes Time Machine local snapshots.', 'Удаляет локальные снимки Time Machine.')}, {id: 'dns', icon: 'network', tone: 'green', title: FLUSH_DNS, text: L('Fixes sites that fail to load.', 'Помогает, если сайты не открываются.'), admin: true}, {id: 'bin', icon: 'trash', tone: 'amber', title: L('Empty the Trash', 'Очистить Корзину'), text: L('Permanently deletes everything in the Trash.', 'Безвозвратно удаляет всё содержимое Корзины.')}] : [{id: 'restore', icon: 'restore', tone: 'blue', title: L('Create a restore point', 'Создать точку восстановления'), text: L('Snapshot system settings before big changes.', 'Снимок системных параметров перед серьёзными изменениями.'), admin: true}, {id: 'dns', icon: 'network', tone: 'green', title: FLUSH_DNS, text: L('Fixes sites that fail to load after network changes.', 'Помогает, если после смены сети сайты не открываются.')}, {id: 'bin', icon: 'trash', tone: 'amber', title: L('Empty Recycle Bin', 'Очистить Корзину'), text: L('Permanently delete everything in the Recycle Bin.', 'Всё содержимое Корзины будет удалено безвозвратно.')}, {id: 'admin', icon: 'shield', tone: '', title: L('Restart as administrator', 'Перезапустить от имени администратора'), text: L('Unlock system-wide cleaning.', 'Открывает доступ к очистке всей системы.')}],
    launchers: MAC ? [['activity', L('Activity Monitor', 'Мониторинг системы'), 'gauge'], ['diskutil', L('Disk Utility', 'Дисковая утилита'), 'drive'], ['console', L('Console', 'Консоль'), 'list'], ['terminal', L('Terminal', 'Терминал'), 'terminal']] : [['taskmgr', L('Task Manager', 'Диспетчер задач'), 'gauge'], ['services', L('Services', 'Службы'), 'sliders'], ['devmgmt', L('Device Manager', 'Диспетчер устройств'), 'monitor'], ['regedit', L('Registry Editor', 'Редактор реестра'), 'key']],
    settings: MAC ? [['storage', L('Storage', 'Хранилище'), 'pie'], ['update', L('Software Update', 'Обновление ПО'), 'refresh'], ['loginitems', L('Login Items', 'Объекты входа'), 'power']] : [['storage', L('Storage Sense', 'Контроль памяти'), 'pie'], ['update', L('Windows Update', 'Центр обновления Windows'), 'refresh']], binRule: MAC ? 'macos.trash' : 'windows.recyclebin'}),
  'tools.run': async () => { await wait(500); return {ok: true, message: L('Done', 'Готово')}; },
  'tools.launch': () => ({ok: true}), 'tools.flushDns': async () => { await wait(500); return {ok: true}; }, 'tools.restorePoint': () => ({ok: true}),
  'health.disks': async () => { await wait(500); return MAC
    ? {admin: true, details: false, disks: [{id: 'disk0', name: 'APPLE SSD AP0512Z', size: 500.3e9, letters: [], kind: 'nvme', health: 'Verified', verdict: 'good'}, {id: 'disk4', name: 'Samsung Portable SSD T7', size: 1e12, letters: [], kind: 'usb', health: 'Not Supported', verdict: 'unknown'}]}
    : {admin: false, details: false, disks: [{id: '0', name: 'Samsung SSD 990 PRO 2TB', size: 2e12, letters: ['C:'], kind: 'nvme', health: 'Healthy', verdict: 'good'}, {id: '1', name: 'WDC WD20EZRZ', size: 2e12, letters: ['D:'], kind: 'hdd', health: 'Warning', verdict: 'warning'}]}; },
  'repair.run': async ({id}) => {
    for (let p = 0; p <= 100; p += 20) { emit({channel: 'repair', id, pct: id === 'verify' || id === 'scan' ? null : p, line: id === 'verify' ? 'Checking the fsroot tree' : ''}); await wait(250); }
    return {id, state: id === 'scan' ? 'problems' : id === 'sfc' ? 'repaired' : id === 'fix' ? 'scheduled' : 'ok', repaired: 3};
  },
  'repair.status': () => ({running: null}),
  'schedule.get': () => mockSchedule,
  'schedule.set': async p => { await wait(400); Object.assign(mockSchedule, {enabled: !!p.enabled, frequency: p.frequency === 'daily' ? 'daily' : 'weekly', notify: p.notify !== false}); return mockSchedule; },
  'system.home': () => MAC ? '/Users/alex' : 'C:\\Users\\Alex',
  'disk.emptyFolders': async () => {
    await wait(900);
    const home = MAC ? '/Users/alex' : 'C:\\Users\\Alex';
    const j = (...p) => [home, ...p].join(MAC ? '/' : '\\');
    const day = 864e5;
    return {dirs: 7949, at: new Date().toISOString(), folders: [
      {path: j('Documents', 'Adobe', 'After Effects 2022', 'User Libraries'), mtime: Date.now() - 400 * day, nested: 0},
      {path: j('Documents', 'Old project', 'build'), mtime: Date.now() - 90 * day, nested: 3},
      {path: j('Downloads', 'setup_unpacked'), mtime: Date.now() - 45 * day, nested: 1},
      {path: j('Desktop', 'New folder'), mtime: Date.now() - 200 * day, nested: 0},
      {path: j('Documents', 'Codex', '2026-10-21'), mtime: Date.now() - 2 * day, nested: 2},
      {path: MAC ? '/Volumes/Backup/Photos/2019/Empty' : 'D:\\Photos\\2019\\Empty', mtime: Date.now() - 900 * day, nested: 0}
    ]};
  },
  'disk.trashEmpty': async ({paths}) => { await wait(300); return {done: paths, failed: []}; },
  'search.check': async () => {
    await wait(900);
    const app = (name, exe, company, likely = true, extra = {}) => ({id: exe, name, exe, folder: exe.replace(/\\[^\\]+$/, ''), drive: MAC ? null : exe.slice(0, 2), company, likely, icon: null, ...extra});
    const apps = MAC
      ? [app('Blender', '/Applications/Blender.app', null), app('Obsidian', '/Applications/Obsidian.app', null)]
      : [app('Epic Games Launcher', 'H:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe', 'Epic Games, Inc.'),
        app('Ubisoft Connect', 'H:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\UbisoftConnect.exe', 'Ubisoft'),
        app('TeamViewer', 'H:\\Program Files (x86)\\TeamViewer\\TeamViewer.exe', 'TeamViewer Germany GmbH'),
        app('VLC media player', 'H:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe', 'VideoLAN'),
        app('WinRAR', 'H:\\Program Files\\WinRAR\\WinRAR.exe', 'Alexander Roshal'),
        app('Audacity', 'D:\\Program Files\\Audacity\\audacity.exe', 'Audacity Team'),
        app('WinRAR', 'G:\\Program Files\\WinRAR\\WinRAR.exe', 'Alexander Roshal', false, {older: true}),
        app('RTSS', 'H:\\Program Files (x86)\\RivaTuner Statistics Server\\RTSS.exe', null, false)].filter(a => !mockSearch.added.some(x => x.id === a.id));
    return {platform: MAC ? 'darwin' : 'win32', admin: false, service: {status: 'Running', disabled: false, ok: true}, index: {ok: true, error: null}, startMenu: {ok: true, shortcuts: 127}, ui: true,
      apps, added: mockSearch.added.map(a => ({lnk: a.id, name: a.name})), checkedAt: new Date().toISOString()};
  },
  'search.addApps': async ({ids}) => { await wait(600); mockSearch.added.push(...ids.map(id => ({id, name: id.split('\\').pop().replace(/\.exe$/i, '')}))); return {added: ids.length}; },
  'search.removeAdded': async () => { const n = mockSearch.added.length; mockSearch.added = []; return {removed: n}; },
  'search.fix': async () => { await wait(700); return {ok: true}; },
  'activity.list': () => activity, 'activity.stats': () => ({cleaned: 14.2 * GB, fixed: 968, lastClean: activity[0].at}),
  'backups.restore': () => ({ok: true}), 'backups.openFolder': () => ({ok: true}),
  'shell.reveal': () => ({ok: true}), 'shell.openUrl': () => ({ok: true})
};

const TW = (id, group, title, value, recommended, verdict, extra = {}) => ({id, group, title, type: 'toggle', value, recommended, verdict, what: L('Explains what this setting changes in Windows.', 'Здесь объясняется, что этот параметр меняет в Windows.'), pro: L('What you gain from it.', 'Что вы получаете.'), con: L('What you give up.', 'Чем придётся пожертвовать.'), on: L('On', 'Вкл.'), off: L('Off', 'Выкл.'), admin: false, restart: null, ...extra});
const MOCK_TWEAKS = [
  TW('startupDelay', 'performance', L('Start apps right after sign-in', 'Запускать программы сразу после входа в систему'), false, true, 'recommended', {on: L('No delay', 'Без задержки'), off: L('Windows default delay', 'Обычная задержка Windows')}),
  TW('menuDelay', 'performance', L('Faster menus', 'Быстрое открытие меню'), false, true, 'recommended'),
  TW('animations', 'performance', L('Turn off animation effects', 'Отключить эффекты анимации'), false, null, 'situational'),
  TW('hibernation', 'performance', L('Turn off hibernation', 'Отключить гибернацию'), false, null, 'situational', {admin: true, extra: {bytes: 12.8 * GB}}),
  TW('gameMode', 'gaming', L('Game Mode', 'Игровой режим'), true, true, 'recommended'),
  TW('gameDvr', 'gaming', L('Turn off background game recording', 'Отключить фоновую запись игр'), false, true, 'recommended'),
  TW('hags', 'gaming', L('Hardware-accelerated GPU scheduling', 'Планирование графического процессора с аппаратным ускорением'), false, null, 'optional', {admin: true, restart: 'reboot'}),
  TW('adId', 'privacy', L('Turn off advertising ID', 'Отключить рекламный идентификатор'), false, true, 'recommended'),
  TW('tips', 'privacy', L('Turn off tips, suggestions and lock-screen ads', 'Отключить советы, рекомендации и рекламу на экране блокировки'), false, true, 'recommended'),
  {...TW('appTheme', 'appearance', L('App colour mode', 'Цветовой режим приложений'), 'light', null, 'preference'), type: 'choice', options: [{value: 'light', label: L('Light', 'Светлый')}, {value: 'dark', label: L('Dark', 'Тёмный')}]},
  TW('showExt', 'explorer', L('Show file extensions', 'Показывать расширения файлов'), false, true, 'recommended', {restart: 'explorer', on: L('Shown', 'Показаны'), off: L('Hidden', 'Скрыты')}),
  TW('classicMenu', 'explorer', L('Classic right-click menu', 'Классическое контекстное меню'), false, null, 'preference', {restart: 'explorer'}),
  {...TW('taskbarAlign', 'taskbar', L('Taskbar alignment', 'Выравнивание панели задач'), 'center', null, 'preference'), type: 'choice', options: [{value: 'center', label: L('Center', 'По центру')}, {value: 'left', label: L('Left', 'Слева')}], pro: null, con: null},
  TW('clipboardHistory', 'taskbar', L('Clipboard history (Win+V)', 'Журнал буфера обмена (Win+V)'), false, true, 'recommended')
];
const mockSearch = {added: []};
const mockSchedule = {enabled: false, frequency: 'weekly', notify: true, last: null, installed: false};
const power = {plans: [{guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: L('Balanced', 'Сбалансированная'), active: true}, {guid: 'a1841308-3541-4fab-bc81-f71556f20b4a', name: L('Power saver', 'Экономия энергии'), active: false}], screenAc: 600, screenDc: 300, sleepAc: 1800, sleepDc: 900, battery: false};

export const mockApi = {
  async invoke(method, args) {
    const fn = api[method];
    if (!fn) throw new Error(`Preview: ${method} is not available`); // developer-only message: stays in English
    await wait(60);
    return structuredClone(loc(await fn(args || {})));
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
};
