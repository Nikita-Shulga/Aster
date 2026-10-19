'use strict';
const {app, BrowserWindow, ipcMain, dialog, shell, nativeImage, nativeTheme, session, Menu} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {powershell} = require('./ps.cjs');
const {Store} = require('./store.cjs');
const {Cleaner} = require('./cleaner.cjs');
const {Disk} = require('./disk.cjs');
const {Updater} = require('./updater.cjs');

// Platform layer: the same API on Windows and macOS, implemented natively for each.
const isMac = process.platform === 'darwin';
const P = isMac ? {
  system: require('./mac/system.cjs'),
  Registry: require('./mac/leftovers.cjs').MacLeftovers,
  Programs: require('./mac/programs.cjs').MacPrograms,
  Startup: require('./mac/startup.cjs').MacStartup,
  Updates: require('./mac/updates.cjs').MacUpdates,
  Tools: require('./mac/tools.cjs').MacTools,
  identify: require('./mac/identify.cjs').identify,
  Tweaks: require('./mac/tweaks.cjs').MacTweaks,
  Display: require('./mac/display.cjs').MacDisplay
} : {
  system: require('./system.cjs'),
  Registry: require('./registry.cjs').Registry,
  Programs: require('./programs.cjs').Programs,
  Startup: require('./startup.cjs').Startup,
  Updates: require('./updates.cjs').Updates,
  Tools: require('./tools.cjs').Tools,
  identify: require('./identify.cjs').identify,
  Tweaks: require('./tweaks.cjs').Tweaks,
  Display: require('./display.cjs').Display
};
const {system, identify} = P;
const FDA_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';

const RENDERER = path.join(__dirname, '..', 'renderer', 'index.html');
const relaunched = process.argv.includes('--aster-relaunch');
let win = null;

app.setAppUserModelId('com.nikitashulga.aster');

function acquireLock(attempt = 0) {
  if (app.requestSingleInstanceLock()) return Promise.resolve(true);
  // After "Restart as administrator" the previous instance may still be closing.
  if (relaunched && attempt < 20) return new Promise(r => setTimeout(r, 250)).then(() => acquireLock(attempt + 1));
  return Promise.resolve(false);
}

const iconCache = new Map();
let genericIcon;
// Windows returns a blank "document" icon for files without their own icon; treat that as no icon.
async function blankIcon() {
  if (genericIcon !== undefined) return genericIcon;
  try {
    const probe = path.join(app.getPath('temp'), 'aster-icon-probe.asterunknown');
    fs.writeFileSync(probe, '');
    genericIcon = (await app.getFileIcon(probe, {size: 'large'})).toDataURL();
    fs.rmSync(probe, {force: true});
  } catch { genericIcon = null; }
  return genericIcon;
}
// macOS: read the bundle's own .icns and convert it with sips (avoids app.getFileIcon on bundles).
async function macIcon(file) {
  const sh = require('./mac/sh.cjs');
  const bundle = (/^(.*?\.app)(\/|$)/.exec(file) || [])[1];
  if (!bundle) return null;
  const info = await sh.plist(path.join(bundle, 'Contents', 'Info.plist')).catch(() => ({}));
  let name = info.CFBundleIconFile || 'AppIcon';
  if (!/\.icns$/i.test(name)) name += '.icns';
  const icns = path.join(bundle, 'Contents', 'Resources', name);
  if (!fs.existsSync(icns)) return null;
  const out = path.join(app.getPath('temp'), `aster-icon-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  try {
    await sh.sh('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '64', icns, '--out', out], {timeout: 10000});
    const img = nativeImage.createFromPath(out);
    return img.isEmpty() ? null : img.toDataURL();
  } finally { fs.rmSync(out, {force: true}); }
}

async function getIcon(file) {
  const key = file.toLowerCase();
  if (iconCache.has(key)) return iconCache.get(key);
  let url = null;
  if (isMac) {
    try { url = await macIcon(file); } catch {}
    iconCache.set(key, url);
    return url;
  }
  try {
    if (/\.(png|jpg|jpeg|ico)$/i.test(file)) {
      const img = nativeImage.createFromPath(file);
      url = img.isEmpty() ? null : img.resize({width: 64, height: 64, quality: 'best'}).toDataURL();
    } else {
      const img = await app.getFileIcon(file, {size: 'large'});
      url = img.isEmpty() ? null : img.toDataURL();
      if (url && url === await blankIcon()) url = null;
    }
  } catch {}
  iconCache.set(key, url);
  return url;
}

const trash = p => shell.trashItem(path.resolve(p));

function send(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send('aster:event', {channel, ...payload}); }

function overlayColors(theme) {
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
  return dark ? {color: '#121215', symbolColor: '#e8e8ed', height: 44} : {color: '#f7f7f9', symbolColor: '#1d1d22', height: 44};
}

async function main() {
  if (!(await acquireLock())) { app.quit(); return; }
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  await app.whenReady();
  // macOS needs an application menu for Quit, Copy/Paste and window shortcuts.
  Menu.setApplicationMenu(isMac ? Menu.buildFromTemplate([{role: 'appMenu'}, {role: 'editMenu'}, {role: 'viewMenu', submenu: [{role: 'resetZoom'}, {role: 'zoomIn'}, {role: 'zoomOut'}, {type: 'separator'}, {role: 'togglefullscreen'}]}, {role: 'windowMenu'}]) : null);

  const store = new Store(app.getPath('userData'));
  let sysInfo = null;
  const getDrives = async () => (sysInfo || (sysInfo = await system.info())).drives;
  const cleaner = new Cleaner({getSettings: () => store.getSettings(), getDrives, trash});
  const registry = new P.Registry({store, trash});
  const programs = new P.Programs({store, getIcon, trash});
  const startup = new P.Startup({store, getIcon, trash});
  const updates = new P.Updates({store});
  const disk = new Disk({store, trash});
  const tools = new P.Tools({store, shell});
  const tweaks = new P.Tweaks({store, buildNumber: async () => (sysInfo || (sysInfo = await system.info())).build || 0});
  const display = new P.Display({store});
  const updater = new Updater({app, shell, store, onProgress: p => send('appUpdate', p)});
  setTimeout(() => updater.cleanup(), 60000); // after an update, give the installer time to exit first

  const pick = async (options) => { const r = await dialog.showOpenDialog(win, options); return r.canceled ? null : r.filePaths; };

  const api = {
    'app.info': () => ({version: app.getVersion(), name: app.getName(), electron: process.versions.electron, dataPath: app.getPath('userData')}),
    'system.info': async a => (sysInfo = await system.info({refresh: !!a?.refresh})),
    'system.live': () => system.live(),
    'system.openFullDiskAccess': async () => { if (isMac) await shell.openExternal(FDA_URL); return {ok: true}; },
    'system.relaunchAdmin': async () => {
      if (isMac) { await shell.openExternal(FDA_URL); return {ok: true}; }
      const args = app.isPackaged ? ['--aster-relaunch'] : [app.getAppPath(), '--aster-relaunch'];
      await powershell('Start-Process -FilePath $in.file -ArgumentList $in.args -Verb RunAs', {input: {file: process.execPath, args: args.map(a => `"${a}"`).join(' ')}, timeout: 60000})
        .catch(e => { throw new Error(/cancel/i.test(e.message) ? 'Elevation was cancelled.' : e.message); });
      setTimeout(() => app.quit(), 200);
      return {ok: true};
    },

    'appUpdate.check': () => updater.check(),
    'appUpdate.download': () => updater.download(),
    'appUpdate.cancel': () => updater.cancel(),
    'appUpdate.install': () => updater.install(),

    'settings.get': () => store.getSettings(),
    'settings.update': patch => {
      const s = store.updateSettings(patch);
      if (patch && 'theme' in patch) { nativeTheme.themeSource = s.theme; win?.setTitleBarOverlay?.(overlayColors(s.theme)); }
      return s;
    },
    'settings.pickExclusion': async () => (await pick({title: 'Choose a folder Aster should never clean', properties: ['openDirectory']}))?.[0] || null,

    'cleaner.rules': () => cleaner.rules(),
    'cleaner.analyze': a => cleaner.analyze({ids: a.ids, onProgress: p => send('cleaner', p)}),
    'cleaner.clean': async a => {
      const drives = Array.isArray(a.drives) ? a.drives.filter(d => typeof d === 'string' && d.length < 200 && (isMac || /^[A-Z]:$/.test(d))) : null;
      const paths = Array.isArray(a.paths) ? a.paths.filter(p => typeof p === 'string' && path.isAbsolute(p)).slice(0, 50) : null;
      const r = await cleaner.clean({ids: a.ids, closeApps: !!a.closeApps, drives: drives?.length ? drives : null, paths: paths?.length ? paths : null, onProgress: p => send('cleaner', p)});
      if (r.deleted > 0 || r.freed > 0) store.log({kind: 'clean', title: `Cleaned ${r.deleted.toLocaleString()} files`, bytes: r.freed, count: r.deleted});
      return r;
    },
    'cleaner.removeFiles': async a => {
      const r = await cleaner.removeFiles({id: String(a?.id || ''), paths: a?.paths});
      if (r.done.length) store.log({kind: 'trash', title: `Moved ${r.done.length} file${r.done.length === 1 ? '' : 's'} to the ${isMac ? 'Trash' : 'Recycle Bin'}`, bytes: r.freed, count: r.done.length});
      return r;
    },
    'cleaner.cancel': () => { cleaner.cancel(); return {ok: true}; },

    'registry.categories': () => registry.categories(),
    'registry.scan': a => registry.scan({categories: a?.categories}),
    'registry.fix': a => registry.fix({ids: a.ids}),
    'registry.list': a => registry.list({path: a?.path}),
    'registry.edit': a => registry.edit(a),
    'registry.search': a => registry.search(a),
    'registry.export': async a => {
      const r = await dialog.showSaveDialog(win, {title: 'Export registry key', defaultPath: `${String(a.path).split('\\').pop() || 'registry'}.reg`, filters: [{name: 'Registration file', extensions: ['reg']}]});
      if (r.canceled || !r.filePath) return {cancelled: true};
      return registry.exportKey({path: a.path, file: r.filePath});
    },
    'registry.import': async () => {
      const files = await pick({title: 'Import a registry file', properties: ['openFile'], filters: [{name: 'Registration file', extensions: ['reg']}]});
      if (!files) return {cancelled: true};
      return registry.importFile({file: files[0]});
    },

    'programs.list': () => programs.list(),
    'programs.icons': a => programs.icons(a),
    'programs.size': a => programs.folderSize(a),
    'programs.uninstall': a => programs.uninstall(a),
    'programs.removeEntry': a => programs.removeEntry(a),
    'programs.leftovers': a => programs.scanLeftovers(a),
    'programs.removeLeftovers': a => programs.removeLeftovers(a),

    'startup.list': () => startup.list(),
    'startup.icons': a => startup.icons(a),
    'startup.toggle': a => startup.toggle(a),
    'startup.remove': a => startup.remove(a),
    'startup.add': async () => {
      const files = isMac
        ? await pick({title: 'Choose an app to open at login', defaultPath: '/Applications', properties: ['openFile', 'treatPackageAsDirectory'].slice(0, 1), filters: [{name: 'Applications', extensions: ['app']}]})
        : await pick({title: 'Choose a program to run at sign-in', properties: ['openFile'], filters: [{name: 'Programs', extensions: ['exe', 'bat', 'cmd', 'lnk']}]});
      if (!files) return {cancelled: true};
      const file = files[0];
      return startup.add({name: path.basename(file, path.extname(file)), command: `"${file}"`});
    },

    'updates.available': () => updates.available(),
    'updates.check': () => updates.check(),
    'updates.last': () => updates.last(),
    'updates.update': a => updates.update({id: a.id, onLine: line => send('updates', {id: a.id, line})}),

    'disk.pickFolder': async () => (await pick({title: 'Choose a folder to analyze', properties: ['openDirectory']}))?.[0] || null,
    'disk.analyze': a => disk.analyze({root: a.root, onProgress: p => send('disk', p)}),
    'disk.children': a => disk.children(a),
    'disk.duplicates': a => disk.findDuplicates({roots: a.roots, minSize: a.minSize, onProgress: p => send('duplicates', p)}),
    'disk.identify': async a => {
      if (!programs.items.size) await programs.list().catch(() => {});
      return identify({items: (a.items || []).filter(i => i && typeof i.path === 'string').slice(0, 400), programs: [...programs.items.values()]});
    },
    'disk.cancel': () => disk.cancel(),
    'disk.trash': a => disk.trashPaths({paths: (a.paths || []).filter(p => typeof p === 'string' && path.isAbsolute(p) && path.parse(p).root !== path.resolve(p))}),

    'tweaks.list': a => tweaks.list({groups: Array.isArray(a?.groups) ? a.groups : []}),
    'tweaks.set': a => tweaks.set(a),
    'power.get': () => tweaks.power(),
    'power.set': a => tweaks.setPower(a),
    'power.addHigh': () => tweaks.addHighPerformance(),
    'processes.list': () => tweaks.processes(),
    'processes.end': a => tweaks.endProcess(a),
    'explorer.restart': () => tweaks.restartExplorer(),
    'display.list': () => display.list(),
    'display.set': a => display.set(a),
    'tools.catalog': () => tools.catalog(),
    'tools.run': a => tools.run(a),
    'tools.launch': a => tools.launch(a),
    'tools.flushDns': () => tools.flushDns(),
    'tools.restorePoint': a => tools.restorePoint(a),

    'activity.list': () => store.getActivity(),
    'activity.stats': () => store.stats(),
    'backups.restore': a => store.restoreBackup(a.name),
    'backups.openFolder': () => shell.openPath(store.backupDir),

    'shell.reveal': a => { if (typeof a?.path === 'string' && path.isAbsolute(a.path)) shell.showItemInFolder(a.path); return {ok: true}; },
    'shell.openUrl': a => { if (/^https?:\/\//i.test(a?.url || '')) shell.openExternal(a.url); return {ok: true}; }
  };

  ipcMain.handle('aster:invoke', async (event, method, args) => {
    if (!win || event.sender !== win.webContents || !event.senderFrame?.url?.startsWith('file:')) throw new Error('Unauthorized');
    const fn = api[method];
    if (!fn) throw new Error(`Unknown method ${method}`);
    if (process.env.ASTER_SELFTEST) console.log('[api]', method);
    try { return await fn(args || {}); }
    catch (e) { throw new Error(e?.message || 'The operation failed.'); }
  });

  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({cancel: !/^(file|devtools|data):/i.test(d.url)}));

  nativeTheme.themeSource = store.getSettings().theme;
  const theme = store.getSettings().theme;
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 980, minHeight: 640, show: false,
    title: 'Aster',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121215' : '#f7f7f9',
    ...(isMac ? {titleBarStyle: 'hiddenInset', trafficLightPosition: {x: 18, y: 18}} : {titleBarStyle: 'hidden', titleBarOverlay: overlayColors(theme)}),
    webPreferences: {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, devTools: !app.isPackaged}
  });
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.once('ready-to-show', () => win.show());
  nativeTheme.on('updated', () => win?.setTitleBarOverlay?.(overlayColors(store.getSettings().theme)));
  win.on('closed', () => { win = null; disk.cancel(); cleaner.cancel(); });
  await win.loadFile(RENDERER);
  if (!app.isPackaged && process.env.ASTER_SELFTEST) require('../../scripts/selftest.cjs')(win, process.env.ASTER_SELFTEST).finally(() => app.quit());
}

main().catch(e => { dialog.showErrorBox('Aster could not start', String(e?.stack || e)); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (win) win.show(); });
