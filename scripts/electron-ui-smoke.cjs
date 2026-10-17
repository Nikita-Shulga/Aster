'use strict';
// DEVELOPMENT ONLY: actual Aster renderer/preload + synthetic main-process IPC.
// This file is not included by the production package's src-only file list.
// Runs hidden, without screenshots or desktop input. Never controls other apps.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const assert = require('node:assert/strict');
if (!process.versions.electron) {
  process.stdout.write(JSON.stringify({ status: 'fail', code: 'ELECTRON_RUNTIME_REQUIRED', instruction: 'Run the already installed Electron binary with scripts/electron-ui-smoke.cjs' }) + '\n');
  process.exitCode = 1;
} else {
  const { app, BrowserWindow, ipcMain, session, Menu } = require('electron');
  const { assertSender } = require('../src/desktop/validation.cjs');
  const root = path.resolve(__dirname, '..'), entry = path.join(root, 'src/renderer/index.html');
  const output = fs.mkdtempSync(path.join(fs.realpathSync(path.join(root, 'qa')), 'electron-fixture-'));
  const profile = path.join(output, 'isolated-profile'); fs.mkdirSync(profile);
  app.setPath('userData', profile); app.setPath('sessionData', profile);
  app.setName('Aster fixture renderer QA');
  const report = { schemaVersion: 1, mode: 'actual-electron-renderer-production-preload-fixture-main-ipc', platform: process.platform, arch: process.arch, electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node, outputDirectoryName: path.basename(output), backgroundOnly: true, desktopInput: false, screenCapture: false, nativeMainIntegration: false, nativeReleaseApproved: false, personalFilesAccessed: false, checks: [], screenshots: [], runtimeErrors: [], ipcCalls: {}, limitations: ['Synthetic inventory and scan only', 'No production DesktopService or OS dialogs exercised', 'Widths below 820 are supplemental responsive stress, not production window configuration', 'DOM and computed layout assertions only; no visual review', 'No desktop screenshots, OS input automation, signing or packaging validation'] };
  let win, finished = false;
  const safeMessage = value => String(value || '').replace(/file:\/\/[^\s)]+|[A-Za-z]:[\\/][^\s)]+|\/(?:[^\s/:]+\/)+[^\s:)]*/g, '<path>').slice(0, 240);
  function recordError(kind, error) { report.runtimeErrors.push({ kind, message: safeMessage(error?.message || error) }); }
  function finish(code = 0) {
    if (finished) return; finished = true; clearTimeout(watchdog);
    report.status = code || report.runtimeErrors.length || report.checks.some(c => c.status === 'fail') ? 'fail' : 'pass';
    report.summary = { pass: report.checks.filter(c => c.status === 'pass').length, fail: report.checks.filter(c => c.status === 'fail').length, runtimeErrors: report.runtimeErrors.length };
    try { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); process.stdout.write(JSON.stringify(report, null, 2) + '\n'); }
    catch { process.stderr.write('QA_REPORT_WRITE_FAILED\n'); code = 1; }
    // Own Electron app teardown destroys this window and its renderer children.
    if (win && !win.isDestroyed()) win.destroy();
    app.exit(report.status === 'fail' || code ? 1 : 0);
  }
  const watchdog = setTimeout(() => { recordError('timeout', 'Fixture renderer run exceeded 90 seconds'); finish(1); }, 90000);
  process.on('uncaughtException', e => { recordError('uncaught-exception', e); finish(1); });
  process.on('unhandledRejection', e => { recordError('unhandled-rejection', e); finish(1); });
  process.on('SIGINT', () => { recordError('interrupted', 'Run interrupted'); finish(1); });
  process.on('SIGTERM', () => { recordError('interrupted', 'Run interrupted'); finish(1); });
  app.on('child-process-gone', (_event, details) => { if (!finished) { recordError('child-process-gone', details.reason); finish(1); } });
  app.on('window-all-closed', () => { if (!finished) { recordError('window-closed', 'Fixture window closed before completion'); finish(1); } });
  const fixtureRoot = '/AsterFixture';
  let settings = { theme: 'light', includeHidden: false, largeFileMinBytes: 100 * 1024 ** 2 };
  const fixtureScan = { id: 'fixture-scan', root: fixtureRoot, roots: [fixtureRoot], cancelled: false, truncated: false, warnings: [], files: [
    { id: 'fixture-1', path: fixtureRoot + '/sample-video.mp4', name: 'sample-video.mp4', size: 180 * 1024 ** 2, category: 'video', modifiedAt: '2026-01-01T00:00:00Z' },
    { id: 'fixture-2', path: fixtureRoot + '/sample.txt', name: 'sample.txt', size: 4096, category: 'document', duplicateGroupId: 'fixture-duplicate', modifiedAt: '2026-01-01T00:00:00Z' },
    { id: 'fixture-3', path: fixtureRoot + '/sample-copy.txt', name: 'sample-copy.txt', size: 4096, category: 'document', duplicateGroupId: 'fixture-duplicate', modifiedAt: '2026-01-01T00:00:00Z' }
  ] };
  const system = { hostname: 'FIXTURE DATA · not your computer', osName: 'Synthetic QA system', memory: { total: 8 * 1024 ** 3, free: null }, storage: { total: 100 * 1024 ** 3, free: 25 * 1024 ** 3, used: 75 * 1024 ** 3 }, cpu: { model: 'Synthetic fixture processor', cores: 2 }, uptime: 0, capabilities: { nativePlatform: false, quarantine: false, restore: false, mutationReason: 'Fixture renderer only; shipping mutation gate remains disabled' } };
  const blocked = () => { throw new Error('FIXTURE_SIDE_EFFECT_BLOCKED'); };
  const handlers = {
    getSystemInfo: () => system, getSettings: () => settings,
    updateSettings: patch => { assert.ok(patch && Object.keys(patch).every(k => ['theme', 'includeHidden', 'largeFileMinBytes'].includes(k))); if (patch.theme !== undefined) assert.ok(['light', 'dark', 'system'].includes(patch.theme)); settings = { ...settings, ...patch }; return settings; },
    getRecommendations: () => [{ id: 'fixture-evidence', title: 'Synthetic fixture observation', detail: 'Illustrative evidence for renderer QA only.', severity: 'info', action: 'storage', evidence: { files: 3 } }],
    getDiagnostics: () => ({ status: 'partial', volumes: { items: [], warnings: ['Fixture only; no OS diagnostics collected'] }, battery: { chargePercent: null, powerSource: 'unknown', state: 'unknown', warnings: ['No real battery reading'] }, security: { assessed: false }, updates: { assessed: false } }),
    getPerformance:()=>({status:'partial',items:[{id:1,name:'Fixture process',memoryBytes:4096,cpuSeconds:1}],warnings:['Synthetic process data']}),
    getStorageInsights:()=>({status:'complete',fileCount:3,totalBytes:180*1024**2+8192,groups:[],extensions:[],ages:[],history:[]}),
    getOrganizationPreview:()=>({mode:'category',proposals:[],skipped:[],warnings:[],totalProposals:0}),getRegistryData:()=>({file:null,comparison:null}),
    openRegistryFile:()=>({cancelled:true}),compareRegistryFile:()=>({cancelled:true}),exportOrganizationPlan:blocked,
    getStartupControls:()=>({items:[]}),getManagedUpdates:()=>({status:'not-checked',items:[]}),getTrackedUninstalls:()=>({items:[]}),getManagementHistory:()=>({items:[]}),getApplicationFootprints:()=>({status:'no-scan',items:[]}),getPerformanceAdvice:()=>({items:[]}),exportInstallBaseline:blocked,importInstallBaseline:blocked,getBrowserReview:()=>({scanId:null,groups:[]}),getInstallTracking:()=>({status:'no-baseline'}),getDrivers:()=>({status:'complete',items:[]}),getUpdateReview:()=>({items:[]}),getMaintenance:()=>({items:[],automaticExecution:false}),getStartupReview:()=>({items:[{name:'Fixture startup entry',enabled:null}],warnings:['Synthetic inventory']}),getRegistryEditor:()=>({text:'',hasFile:false}),captureInstallBaseline:blocked,exportInstallTracking:blocked,previewRegistryDraft:blocked,exportRegistryDraft:blocked,saveMaintenance:blocked,importUpdateCatalog:blocked,
    getEntityIcons:()=>({icons:[]}),exportInventory:blocked,
    getScanHistory: () => [], selectFolder: () => fixtureRoot,
    scan: arg => { assert.equal(arg.root, fixtureRoot); return fixtureScan; }, cancelScan: () => ({ cancelled: true }),
    listStartup: () => ({ items: [{ name: 'Fixture startup entry', enabled: null }], warnings: ['Synthetic entry; enabled state unknown'] }),
    listApplications: () => ({ items: [{ name: 'Fixture app', version: '0.0' }], warnings: ['Synthetic inventory'] }),
    getActivity: () => [], previewQuarantine: () => ({ previewId: 'fixture-preview', canExecute: false, blockedReason: 'Fixture renderer: file mutations disabled' }),
    quarantine: blocked, restore: blocked, revealPath: blocked, openSystemSettings: blocked, exportReport: blocked
  };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function execute(code) {
    assert.ok(win && !win.isDestroyed());
    assert.equal(win.webContents.getURL().split('#')[0], pathToFileURL(entry).href);
    return win.webContents.executeJavaScript(code, false);
  }
  async function waitFor(code) {
    const start = Date.now();
    while (Date.now() - start < 8000) { if (await execute(code)) return; await delay(50); }
    throw new Error('FIXTURE_RENDER_WAIT_TIMEOUT');
  }
  async function click(selector) { await execute(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled) throw new Error('FIXTURE_CONTROL_UNAVAILABLE'); el.click(); })()`); }
  async function check(name, operation) {
    try { const detail = await operation(); report.checks.push({ name, status: 'pass', ...(detail ? { detail } : {}) }); }
    catch (e) { report.checks.push({ name, status: 'fail', message: safeMessage(e.message) }); throw e; }
  }
  app.whenReady().then(async () => {
    assert.equal(require('../src/desktop/release-policy.json').nativeMutationsValidated, false);
    Menu.setApplicationMenu(null);
    const isolatedSession = session.fromPartition('aster-fixture-ui-smoke');
    isolatedSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    isolatedSession.setPermissionCheckHandler(() => false);
    isolatedSession.on('will-download', event => { event.preventDefault(); recordError('download-blocked', 'Unexpected download attempted'); });
    isolatedSession.webRequest.onBeforeRequest((details, callback) => {
      let allowed = false;
      try { const url = new URL(details.url); const file = url.protocol === 'file:' ? fileURLToPath(url) : ''; const relative = path.relative(path.join(root, 'src/renderer'), file); allowed = !!file && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); } catch {}
      callback({ cancel: !allowed });
    });
    for (const [method, handler] of Object.entries(handlers)) ipcMain.handle(`aster:${method}`, (event, arg) => { assertSender(event, win, entry); report.ipcCalls[method] = (report.ipcCalls[method] || 0) + 1; return handler(arg); });
    win = new BrowserWindow({ width: 1280, height: 860, title: 'ASTER FIXTURE RENDERER QA — SYNTHETIC DATA', show: false, backgroundColor: '#f6f7f4', webPreferences: { preload: path.join(root, 'src/desktop/preload.cjs'), session: isolatedSession, backgroundThrottling: false, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, devTools: false } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    win.webContents.on('console-message', (_event, details) => { if (details && ['error', 3].includes(details.level)) recordError('renderer-console-error', details.message); });
    win.webContents.on('preload-error', (_event, _preload, error) => { recordError('preload-error', error); finish(1); });
    win.webContents.on('render-process-gone', (_event, details) => { if (!finished) { recordError('renderer-process-gone', details.reason); finish(1); } });
    await win.loadFile(entry);
    await waitFor(`document.querySelector('#main h1') && document.body.textContent.includes('CLEANUP OFF')`);
    await execute(`(() => { const label = document.createElement('div'); label.id = 'fixture-qa-label'; label.textContent = 'FIXTURE RENDERER QA · SYNTHETIC DATA · NOT NATIVE MAIN INTEGRATION'; Object.assign(label.style, { position: 'fixed', bottom: '0', left: '0', right: '0', zIndex: '2147483647', background: '#6b2100', color: 'white', padding: '5px', font: '11px sans-serif', textAlign: 'center', pointerEvents: 'none' }); document.body.append(label); window.addEventListener('error', () => { document.body.dataset.fixtureRuntimeError = 'true'; }); window.addEventListener('unhandledrejection', () => { document.body.dataset.fixtureRuntimeError = 'true'; }); })()`);
    await check('sandboxed-production-preload', async () => { const prefs = win.webContents.getLastWebPreferences(); assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false); assert.equal(await execute(`typeof window.aster.scan === 'function' && typeof window.require === 'undefined'`), true); });
    await click('[data-action="choose-folder"]');
    await waitFor(`document.querySelector('.hub-footer')?.textContent.includes('3 files')`);
    const themeBackgrounds = new Map();
    const pages = ['overview', 'startupControls', 'managedUpdates', 'registryLive', 'uninstall', 'recovery', 'footprints', 'optimizer', 'drives', 'history', 'storage', 'recommendations', 'cleanup', 'large', 'duplicates', 'insights', 'organize', 'performance', 'registry', 'tools', 'startup', 'applications', 'report', 'activity', 'settings', 'browser', 'tracking', 'drivers', 'updates', 'maintenance'];
    for (const width of [1280, 820, 390]) for (const theme of ['light', 'dark']) {
      win.setContentSize(width, 860);
      await click('[data-page="settings"]'); await click(`[data-theme="${theme}"]`);
      await waitFor(`document.documentElement.dataset.theme === ${JSON.stringify(theme)}`);
      for (const page of pages) {
        await click('[data-action="command-palette"]'); await click(`[data-command-page="${page}"]`);
        await waitFor(`location.hash === '#${page}' && document.querySelector('#main h1') && !document.querySelector('.loading-state')`);
        await delay(100);
        await check(`${page}-${theme}-${width}`, async () => {
          const layout = await execute(`(() => { const heading = document.querySelector('#main h1'); const r = heading.getBoundingClientRect(); return { viewportWidth: innerWidth, viewportHeight: innerHeight, scrollWidth: document.documentElement.scrollWidth, headingWidth: Math.round(r.width), headingHeight: Math.round(r.height), theme: document.documentElement.dataset.theme, activePage: document.querySelector('[data-page-title]')?.dataset.pageTitle || 'overview', runtimeError: document.body.dataset.fixtureRuntimeError === 'true', background: getComputedStyle(document.body).backgroundColor }; })()`);
          assert.equal(layout.activePage, page); assert.equal(layout.theme, theme); assert.equal(layout.viewportWidth, width); assert.ok(layout.headingWidth > 0 && layout.headingHeight > 0); assert.ok(layout.scrollWidth <= layout.viewportWidth + 2); assert.equal(layout.runtimeError, false);
          if (page === 'overview') {
            if (theme === 'light') themeBackgrounds.set(width, layout.background);
            else assert.notEqual(layout.background, themeBackgrounds.get(width), 'Light and dark computed backgrounds must differ');
          }
          return layout;
        });
      }
    }
    await check('no-side-effect-methods-invoked', async () => { for (const method of ['quarantine', 'restore', 'revealPath', 'openSystemSettings', 'exportReport']) assert.equal(report.ipcCalls[method] || 0, 0); assert.equal(require('../src/desktop/release-policy.json').nativeMutationsValidated, false); });
    finish();
  }).catch(error => { recordError('fixture-run-failed', error); finish(1); });
}
