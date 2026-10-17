'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { DesktopService, writeNewReport } = require('../../src/desktop/service.cjs');
const { assertSender } = require('../../src/desktop/validation.cjs');
const { createCollectors } = require('../../src/platform');
const policy = require('../../src/desktop/release-policy.json');

async function fixture(t, platform) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'aster-integration-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const chosen = path.join(base, 'selected');
  await fs.mkdir(chosen);
  const calls = [];
  const dialog = {
    showOpenDialog: async () => ({ canceled: false, filePaths: [chosen] }),
    showSaveDialog: async () => ({ canceled: true }),
    showMessageBox: async () => { calls.push('confirm'); return { response: 1 }; }
  };
  const core = {
    scan: async ({ roots }) => ({ id: 'scan-trusted', roots, files: [], totals: { files: 0, bytes: 0 }, warnings: [], duplicates: [] }),
    createCleanupPlan: async () => { throw new Error('No files selected'); },
    quarantine: async () => calls.push('quarantine'),
    restore: async () => calls.push('restore')
  };
  const service = await new DesktopService({ core, platform: platform || createCollectors({ platform: 'linux' }), dialog,
    shell: { openExternal: async target => calls.push(target), showItemInFolder: target => calls.push(target) },
    userData: path.join(base, 'data'), window: () => null }).initialize();
  return { base, chosen, service, dialog, calls, core };
}

test('trusted renderer remains authorized after fragment-based page navigation', () => {
  const entry = path.resolve('src/renderer/index.html');
  const trusted = pathToFileURL(entry).href;
  const frame = { url: trusted + '#startup' };
  const webContents = { mainFrame: frame };
  const window = { isDestroyed: () => false, webContents };
  assert.doesNotThrow(() => assertSender({ sender: webContents, senderFrame: frame }, window, entry));
  for (const url of [trusted + '.evil#startup', trusted + '?remote=true#startup', 'https://attacker.invalid/#startup', 'file:///unrelated/index.html#startup']) {
    frame.url = url;
    assert.throws(() => assertSender({ sender: webContents, senderFrame: frame }, window, entry));
  }
  frame.url = trusted;
  assert.throws(() => assertSender({ sender: webContents, senderFrame: { url: trusted } }, window, entry));
});

test('desktop preserves platform unsupported/partial states and overrides mutation claims', async t => {
  const platform = {
    getSystemInfo: async () => ({ platform: 'linux', storage: { total: null, free: null, used: null }, capabilities: { diskHealth: false, quarantine: true, restore: true } }),
    listStartup: async () => ({ items: [], status: 'unsupported', warnings: ['Windows/macOS only'] }),
    listApplications: async () => ({ items: [{ id: 'app', name: 'Example' }], status: 'partial', warnings: ['Incomplete inventory'] })
  };
  const { service } = await fixture(t, platform);
  assert.equal((await service.getSystemInfo()).capabilities.quarantine, policy.nativeMutationsValidated);
  assert.equal((await service.listStartup()).status, 'unsupported');
  assert.equal((await service.listApplications()).status, 'partial');
  assert.equal((await service.getSystemInfo()).storage.free, null);
});

test('false native release gate prevents mutations before dialogs or core calls', async t => {
  assert.equal(policy.nativeMutationsValidated, false, 'This suite describes the unvalidated alpha release');
  const { service, calls } = await fixture(t);
  await assert.rejects(service.quarantine({ previewId: 'even-a-valid-looking-id' }));
  await assert.rejects(service.restore({ operationId: 'even-a-valid-looking-id' }));
  assert.deepEqual(calls, []);
});

test('report export allowlists schema rather than leaking future system fields', async t => {
  const platform = {
    getSystemInfo: async () => ({ platform: 'linux', osName: 'Linux', hostname: 'PRIVATE-HOST', privatePath: '/Users/PRIVATE-PERSON/secret.txt', command: 'program --token=PRIVATE-TOKEN', memory: { total: 100, free: 50, privateMetadata: 'PRIVATE-NESTED' }, capabilities: {} }),
    listStartup: async () => ({ items: [], status: 'unsupported', warnings: [] }),
    listApplications: async () => ({ items: [], status: 'unsupported', warnings: [] })
  };
  const { service, base, dialog } = await fixture(t, platform);
  const report = path.join(base, 'summary.json');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: report });
  await service.exportReport();
  const text = await fs.readFile(report, 'utf8');
  assert.doesNotMatch(text, /PRIVATE-/);
  assert.equal(JSON.parse(text).system.memory.total, 100);
});

test('report export refuses a symlink destination without modifying its target', async t => {
  const { service, base, dialog } = await fixture(t);
  const original = path.join(base, 'keep.txt');
  const destination = path.join(base, 'report.json');
  await fs.writeFile(original, 'Do not modify');
  try { await fs.symlink(original, destination); } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('Host cannot create symlink fixture; native symlink QA remains required'); return; }
    throw error;
  }
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
  await assert.rejects(service.exportReport());
  assert.equal(await fs.readFile(original, 'utf8'), 'Do not modify');
});

test('picker grant rejects renderer guesses and canceled picker creates no grant', async t => {
  const { service, chosen, dialog } = await fixture(t);
  dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  assert.equal(await service.selectFolder(), null);
  await assert.rejects(service.scan({ root: chosen }));
  await assert.rejects(service.scan({ root: path.join(chosen, '..') }));
});

test('report publication never overwrites existing files and does not leave temporary files', async t => {
  const { base } = await fixture(t);
  const destination = path.join(base, 'report.json');
  await fs.writeFile(destination, 'original');
  await assert.rejects(writeNewReport(destination, 'replacement'));
  assert.equal(await fs.readFile(destination, 'utf8'), 'original');
  const fresh = path.join(base, 'new-report.json');
  await writeNewReport(fresh, '{"safe":true}');
  assert.equal(await fs.readFile(fresh, 'utf8'), '{"safe":true}');
  const leftovers = (await fs.readdir(base)).filter(name => name.endsWith('.tmp'));
  assert.deepEqual(leftovers, []);
});

test('settings patch cannot introduce prototype keys or executable options', async t => {
  const { service } = await fixture(t);
  for (const patch of [JSON.parse('{"__proto__":{"admin":true}}'), { constructor: true }, { command: 'bad' }, { startupEnabled: true }]) {
    await assert.rejects(service.updateSettings(patch));
  }
  assert.equal({}.admin, undefined);
});

async function rendererHarness() {
  let source = await fs.readFile(path.resolve('src/renderer/app.js'), 'utf8');
  source = source.replace(/^import .*;\s*$/gm, '').replace(/\ninit\(\);\s*$/, '');
  source = (await Promise.all(['workbench.js','studio.js','atelier.js','hub.js','dashboard.js','management.js'].map(name=>fs.readFile(path.resolve('src/renderer',name),'utf8')))).map(code=>code.replace(/^export /gm,'')).join('\n')+'\n'+source;
  source += '\nglobalThis.harness = { state, startupPage, appsPage, reportPage };';
  const context = {
    window: { aster: { getSystemInfo() {} }, addEventListener() {} },
    document: { addEventListener() {}, querySelector: () => ({ addEventListener() {} }) }, location: { hash: '' },
    localStorage: { getItem: () => null }, icon: () => '<svg></svg>', mark: () => '<svg></svg>',
    demoSystem: {}, demoScan: {}, demoApps: {}, demoStartup: {},
    setTimeout, clearTimeout, setInterval, clearInterval, console
  };
  vm.runInNewContext(source, context, { timeout: 1000 });
  return context.harness;
}

test('inventory renderer escapes names, paths and warnings; unknown startup state is not enabled', async () => {
  const h = await rendererHarness();
  h.state.startup = { items: [{ id: '1', name: '<img src=x onerror=bad()>', path: '/evil/<script>x</script>' }], status: 'partial', warnings: ['<script>warning</script>'] };
  const startup = h.startupPage();
  assert.doesNotMatch(startup, /<img src=x|<script>/);
  assert.match(startup, /&lt;img/);
  assert.match(startup, />Reported<|>Unknown</);
  h.state.apps = { items: [{ id: '2', name: '<script>app</script>', publisher: '<bad>', version: '<version>' }], status: 'partial', warnings: [] };
  const applications = h.appsPage();
  assert.doesNotMatch(applications, /<script>|<bad>|<version>/);
  assert.match(applications, /&lt;script&gt;/);
});
