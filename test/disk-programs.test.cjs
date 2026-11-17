'use strict';
// Disk analyzer: the Windows Search index; Programs: finding and measuring install folders (Windows suite).
if (process.platform !== 'win32') { require('node:test').test('disk and programs (Windows only)', {skip: true}, () => {}); return; }
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {identify} = require('../src/main/identify.cjs');
const {Disk} = require('../src/main/disk.cjs');
const {Programs, measureDir, resolveSizeRoot, tooBroad} = require('../src/main/programs.cjs');
const i18n = require('../src/main/i18n.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-dp-'));
const put = (p, size = 100) => { fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, Buffer.alloc(size)); return p; };
const PD = process.env.ProgramData || 'C:\\ProgramData';
const GB = 1024 ** 3;

test.afterEach(() => i18n.setLanguage('en'));

test('a 17 GB Windows.db is the Windows Search index — safe to reset by rebuilding, and not Microsoft Office', async () => {
  const db = path.join(PD, 'Microsoft', 'Search', 'Data', 'Applications', 'Windows', 'Windows.db');
  const programs = [{name: 'Microsoft Office LTSC Professional Plus 2024 - en-us', publisher: 'Microsoft Corporation', location: 'C:\\Program Files\\Microsoft Office'}];
  const r = (await identify({items: [{path: db, dir: false, size: 17.3 * GB}], programs}))[db];
  assert.strictEqual(r.verdict, 'safe');
  assert.strictEqual(r.action, 'rebuildSearch');
  assert.strictEqual(r.kind, 'Windows Search index');
  assert.strictEqual(r.owner, 'Windows');
  assert.match(r.what, /not part of Microsoft Office/);
  assert.match(r.what, /17\.3 GB/, 'a huge index says how far it is from normal');
  assert.match(r.advice, /Rebuild the search index/);
  // A normal-sized index does not claim to be unusual; helper files and the folder get the same explanation.
  const small = (await identify({items: [{path: db, dir: false, size: 600 * 1024 ** 2}, {path: path.dirname(db), dir: true}, {path: path.join(path.dirname(db), 'Windows-gather.db'), dir: false, size: GB / 2}], programs}));
  assert.doesNotMatch(small[db].what, /normal index/);
  assert.strictEqual(small[path.dirname(db)].action, 'rebuildSearch');
  assert.strictEqual(small[path.join(path.dirname(db), 'Windows-gather.db')].kind, 'Windows Search index');
});

test('the Windows Search explanation exists in Russian', async () => {
  i18n.setLanguage('ru');
  const db = path.join(PD, 'Microsoft', 'Search', 'Data', 'Applications', 'Windows', 'Windows.db');
  const r = (await identify({items: [{path: db, dir: false, size: 17.3 * GB}], programs: []}))[db];
  for (const k of ['kind', 'what', 'advice']) assert.match(r[k], /[\u0400-\u04FF]/, k);
  assert.match(r.what, /17,3 ГБ/);
  assert.ok(!/\{\w+\}/.test(r.what));
});

test('a vendor folder such as Microsoft does not make Microsoft Office the owner of other data', async () => {
  const file = path.join(PD, 'Microsoft', 'Diagnosis', 'ETLLogs', 'trace.dat');
  const programs = [{name: 'Microsoft Office LTSC Professional Plus 2024 - en-us', publisher: 'Microsoft Corporation', location: 'C:\\Program Files\\Microsoft Office'}];
  const r = (await identify({items: [{path: file, dir: false}], programs}))[file];
  assert.notStrictEqual(r.owner, programs[0].name);
  assert.doesNotMatch(r.what, /Microsoft Office/);
});

test('Disk analyzer refuses to move the search index, with a pointer to rebuilding it', async () => {
  const moved = [];
  const disk = new Disk({store: {log() {}}, trash: async p => { moved.push(p); }});
  const db = path.join(PD, 'Microsoft', 'Search', 'Data', 'Applications', 'Windows', 'Windows.db');
  const res = await disk.trashPaths({paths: [db]});
  assert.deepStrictEqual(moved, []);
  assert.strictEqual(res.failed.length, 1);
  assert.match(res.failed[0].error, /Rebuild/i);
});

// ---------------------------------------------------------------------------------------------------------

test('measureDir adds up a whole folder, and says when it had to stop early', async () => {
  put(path.join(root, 'app', 'a.bin'), 1000);
  put(path.join(root, 'app', 'sub', 'b.bin'), 2000);
  put(path.join(root, 'app', 'sub', 'deeper', 'c.bin'), 3000);
  const full = await measureDir(path.join(root, 'app'), 10000);
  assert.deepStrictEqual(full, {size: 6000, partial: false});
  const cut = await measureDir(path.join(root, 'app'), -1);
  assert.strictEqual(cut.partial, true);
});

test('measureDir does not follow links', async () => {
  put(path.join(root, 'outside', 'big.bin'), 5000);
  put(path.join(root, 'linked', 'own.bin'), 10);
  try { fs.symlinkSync(path.join(root, 'outside'), path.join(root, 'linked', 'jump'), 'junction'); } catch { return; }
  assert.strictEqual((await measureDir(path.join(root, 'linked'), 10000)).size, 10);
});

test('the install folder is found from the uninstaller or the icon when InstallLocation is empty', () => {
  const tool = path.join(root, 'Tools', 'OBS');
  put(path.join(tool, 'uninstall.exe')); put(path.join(tool, 'bin', 'obs64.exe'));
  assert.strictEqual(resolveSizeRoot({location: '', uninstall: `"${path.join(tool, 'uninstall.exe')}"`, icon: path.join(tool, 'bin', 'obs64.exe')}), tool);
  assert.strictEqual(resolveSizeRoot({location: '', uninstall: '', icon: `"${path.join(tool, 'bin', 'obs64.exe')}",0`}), path.join(tool, 'bin'));
  assert.strictEqual(resolveSizeRoot({location: tool, uninstall: '"msiexec.exe" /x {GUID}'}), tool);
  assert.strictEqual(resolveSizeRoot({location: '', uninstall: 'MsiExec.exe /X{0000}', icon: ''}), null);
  assert.strictEqual(resolveSizeRoot({location: path.join(root, 'does-not-exist'), uninstall: '', icon: ''}), null);
});

test('shared and system folders are never measured as a program', () => {
  for (const dir of ['C:\\', 'C:\\Windows', 'C:\\Windows\\System32', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData', os.homedir(), path.join(os.homedir(), 'AppData', 'Local'), path.join(os.homedir(), 'AppData', 'Roaming'), path.join(os.homedir(), 'Documents'), 'C:\\ProgramData\\Package Cache\\{050d4fc8-5d48-4b8f-8972-47c82c46020f}']) {
    assert.ok(tooBroad(dir), `${dir} must not be measured as a program`);
  }
  assert.ok(!tooBroad('C:\\Program Files\\WinRAR'));
  assert.ok(!tooBroad('E:\\SteamLibrary\\steamapps\\common\\Megabonk'));
  assert.ok(!tooBroad('G:\\Battle.net'));
});

test('measured sizes are remembered between sessions and match the install location', async () => {
  const app = path.join(root, 'Programs', 'Chatty');
  put(path.join(app, 'chatty.exe'), 4000); put(path.join(app, 'data', 'x.pak'), 6000);
  const store = {root: path.join(root, 'userdata'), log() {}};
  fs.mkdirSync(store.root, {recursive: true});
  const make = () => new Programs({store, getIcon: async () => null, trash: async () => {}});
  const p = make();
  const item = {id: 'abc', type: 'desktop', name: 'Chatty', location: app, size: null};
  p.applySize(item);
  assert.strictEqual(item.measurable, true);
  assert.strictEqual(item.size, null);
  p.items.set('abc', item);
  assert.deepStrictEqual(await p.folderSize({id: 'abc'}), {size: 10000, partial: false});
  await new Promise(r => setTimeout(r, 1800)); // the cache file is written a moment later
  const next = make();
  const again = {id: 'abc', type: 'desktop', name: 'Chatty', location: app, size: null};
  next.applySize(again);
  assert.strictEqual(again.size, 10000);
  assert.strictEqual(again.sizeStale, false);
  // A program that moved to another folder is not given the old size; the program's own figure always wins.
  const moved = {id: 'abc', type: 'desktop', name: 'Chatty', location: path.join(root, 'Programs'), size: null};
  next.applySize(moved);
  assert.strictEqual(moved.size, null);
  const own = {id: 'abc', type: 'desktop', name: 'Chatty', location: app, size: 123 * 1024};
  next.applySize(own);
  assert.strictEqual(own.size, 123 * 1024);
  // A reported size of 0 means "unknown", not an empty program.
  const zero = {id: 'zzz', type: 'desktop', name: 'Zero', location: app, size: 0};
  next.applySize(zero);
  assert.strictEqual(zero.size, null);
});

test.after(() => fs.rmSync(root, {recursive: true, force: true}));
