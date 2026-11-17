'use strict';
// Smart cleaning: files that can go vs files that must stay (Windows suite; macOS has no smart items yet).
if (process.platform !== 'win32') { require('node:test').test('smart cleaning (Windows only)', {skip: true}, () => {}); return; }
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point the rules at disposable folders before they load: a fake Windows folder and a fake LocalAppData.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-smart-'));
const fakeWin = path.join(root, 'Windows');
const fakeLocal = path.join(root, 'Local');
const realEnv = {SystemRoot: process.env.SystemRoot, LOCALAPPDATA: process.env.LOCALAPPDATA, TEMP: process.env.TEMP};
process.env.SystemRoot = fakeWin;
process.env.LOCALAPPDATA = fakeLocal;
process.env.TEMP = path.join(fakeLocal, 'Temp');
const smart = require('../src/main/smart.cjs');
const {Cleaner} = require('../src/main/cleaner.cjs');
const identifyMod = require('../src/main/identify.cjs');
const {Disk} = require('../src/main/disk.cjs');
const i18n = require('../src/main/i18n.cjs');
// The rules have read their folders; programs started from here (PowerShell, tasklist) need the real values back.
Object.assign(process.env, realEnv);
smart.hooks.procs = new Set(); // no installer or updater is "running" unless a test says so

const DAY = 24 * 3600e3;
const installer = path.join(fakeWin, 'Installer');
const put = (p, size = 1000) => { fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, Buffer.alloc(size)); return p; };
const cleaner = () => new Cleaner({getSettings: () => ({exclusions: []}), getDrives: async () => [], trash: async p => fs.rmSync(p)});
// "Now" is two days from now, so files made by the test are older than the 24-hour protection.
const later = () => Date.now() + 2 * DAY;
function fakeRegistry(refs, extra = {}) { smart.hooks.readRefs = async () => ({ok: true, problems: 0, refs, ...extra}); smart.hooks.now = later; }
test.afterEach(() => { smart.hooks.readRefs = smart.readInstallerRefs; smart.hooks.now = () => Date.now(); smart.hooks.procs = new Set(); fs.rmSync(installer, {recursive: true, force: true}); fs.rmSync(fakeLocal, {recursive: true, force: true}); identifyMod.resetSmartCache(); i18n.setLanguage('en'); });

function installerFixture() {
  const used = put(path.join(installer, '1a2b3c.msi'), 4000);
  const patch = put(path.join(installer, '4d5e6f.msp'), 3000);
  const orphan = put(path.join(installer, '7a8b9c.msi'), 5000);
  const orphanPatch = put(path.join(installer, '9f8e7d.msp'), 2000);
  const icon = put(path.join(installer, '{AC76BA86-1033-1033-7760-BC15014EA700}', 'icon.ico'), 300);
  const other = put(path.join(installer, 'notes.txt'), 100);
  put(path.join(installer, 'lookalike-msi'), 100); // ends in "msi" but is not an .msi file: not part of the item at all
  return {used, patch, orphan, orphanPatch, icon, other, refs: [{p: used, n: 'Contoso Suite', k: 'product'}, {p: patch.toUpperCase().replace('.MSP', '.msp'), n: 'Update for Contoso Suite (KB1)', k: 'patch'}]};
}

test('Installer files nobody refers to are removable; registered ones and everything else stay', async () => {
  const f = installerFixture();
  fakeRegistry(f.refs);
  const c = await smart.installerCache({dir: installer});
  assert.strictEqual(c.state, null);
  const st = p => fs.lstatSync(p);
  assert.ok(c.removable(f.orphan, st(f.orphan)));
  assert.ok(c.removable(f.orphanPatch, st(f.orphanPatch)));
  assert.ok(!c.removable(f.used, st(f.used)), 'registered package stays');
  assert.ok(!c.removable(f.patch, st(f.patch)), 'registered update stays, whatever the letter case of the registry path');
  assert.ok(!c.removable(f.icon, st(f.icon)), 'product icon folders are never offered');
  assert.ok(!c.removable(f.other, st(f.other)), 'only .msi and .msp files are ever offered');
  assert.match(c.keptNote(f.used, st(f.used)), /Contoso Suite/);
  assert.match(c.keptNote(f.patch, st(f.patch)), /Update for Contoso Suite/);
});

test('files added in the last 24 hours are kept; so is everything while Windows is installing', async () => {
  const f = installerFixture();
  smart.hooks.readRefs = async () => ({ok: true, problems: 0, refs: f.refs});
  smart.hooks.now = () => Date.now(); // the fixture was created just now
  const fresh = await smart.installerCache({dir: installer});
  assert.ok(!fresh.removable(f.orphan, fs.lstatSync(f.orphan)));
  assert.match(fresh.keptNote(f.orphan, fs.lstatSync(f.orphan)), /24 hours/);

  fakeRegistry(f.refs);
  for (const busy of ['msiexec.exe', 'tiworker.exe']) {
    smart.hooks.procs = new Set([busy, 'explorer.exe']);
    const c = await smart.installerCache({dir: installer});
    assert.strictEqual(c.state, 'busy');
    assert.ok(!c.removable(f.orphan, fs.lstatSync(f.orphan)));
  }
});

test('when the list of installed programs cannot be read completely, nothing is removable', async () => {
  const f = installerFixture();
  const st = fs.lstatSync(f.orphan);
  for (const reply of [
    async () => { throw new Error('PowerShell failed'); },
    async () => null,
    async () => ({ok: false, refs: [], problems: 0}),
    async () => ({ok: true, refs: [], problems: 0}),                    // an empty list is not believable
    async () => ({ok: true, refs: f.refs, problems: 2})                 // some registry keys could not be opened
  ]) {
    smart.hooks.readRefs = reply; smart.hooks.now = later;
    const c = await smart.installerCache({dir: installer});
    assert.strictEqual(c.state, 'unreadable');
    assert.ok(!c.removable(f.orphan, st));
  }
});

test('cleaning the item deletes only the unused files, and reports what stayed', async () => {
  const f = installerFixture();
  fakeRegistry(f.refs);
  const a = await cleaner().analyze({ids: ['windows.installer']});
  const r = a.results[0];
  assert.strictEqual(r.files, 2);
  assert.strictEqual(r.bytes, 7000);
  assert.strictEqual(r.kept.files, 2);
  assert.strictEqual(r.kept.bytes, 7000);
  assert.strictEqual(r.kept.state, null);

  const res = await cleaner().clean({ids: ['windows.installer']});
  assert.strictEqual(res.deleted, 2);
  assert.strictEqual(res.freed, 7000);
  assert.ok(!fs.existsSync(f.orphan) && !fs.existsSync(f.orphanPatch));
  for (const p of [f.used, f.patch, f.icon, f.other]) assert.ok(fs.existsSync(p), `${path.basename(p)} must stay`);
});

test('if the check fails, cleaning removes nothing and says why', async () => {
  const f = installerFixture();
  smart.hooks.readRefs = async () => { throw new Error('no registry'); }; smart.hooks.now = later;
  const a = await cleaner().analyze({ids: ['windows.installer']});
  assert.strictEqual(a.results[0].bytes, 0);
  assert.strictEqual(a.results[0].kept.state, 'unreadable');
  const res = await cleaner().clean({ids: ['windows.installer']});
  assert.strictEqual(res.deleted, 0);
  for (const p of [f.used, f.orphan, f.orphanPatch, f.patch]) assert.ok(fs.existsSync(p));
});

test('the file list shows both sides with reasons, and a forged request cannot remove a file that stays', async () => {
  const f = installerFixture();
  fakeRegistry(f.refs);
  const list = await cleaner().listFiles({id: 'windows.installer'});
  assert.deepStrictEqual(list.files.map(x => path.basename(x.path)).sort(), ['7a8b9c.msi', '9f8e7d.msp']);
  assert.ok(list.files.every(x => /No installed program/.test(x.note)));
  assert.strictEqual(list.keptTotal, 2);
  assert.ok(list.kept.some(x => /Contoso Suite/.test(x.note)));
  assert.strictEqual(list.smart, true);

  const res = await cleaner().removeFiles({id: 'windows.installer', paths: [f.used, f.orphan, f.icon, path.join(fakeWin, 'System32', 'kernel32.dll')], permanent: true});
  assert.deepStrictEqual(res.done, [path.resolve(f.orphan)]);
  assert.strictEqual(res.failed.length, 3);
  assert.ok(fs.existsSync(f.used) && fs.existsSync(f.icon));
});

test('the real Windows Installer list can be read, and every registered file on disk stays', {timeout: 120000}, async () => {
  const data = await smart.readInstallerRefs();
  assert.ok(data && Array.isArray(data.refs));
  if (!data.ok || data.problems > 0 || !data.refs.length) return; // the classifier refuses in that case, which is tested above
  const dir = path.join(realEnv.SystemRoot || 'C:\\Windows', 'Installer');
  if (!fs.existsSync(dir)) return;
  const c = await smart.installerCache({dir, readRefs: async () => data, now: Date.now() + 2 * DAY});
  assert.strictEqual(c.state, null);
  let registered = 0;
  for (const r of data.refs) {
    if (!r.p || !fs.existsSync(r.p)) continue;
    registered++;
    assert.ok(!c.removable(r.p, fs.lstatSync(r.p)), `${r.p} is registered and must stay`);
  }
  assert.ok(registered > 0);
});

// ---------------------------------------------------------------------------------------------------------

function squirrelFixture() {
  const base = fakeLocal;
  const app = name => path.join(base, name);
  put(path.join(app('Chatty'), 'Update.exe'));
  put(path.join(app('Chatty'), 'packages', 'Chatty-1.0.10-full.nupkg'), 5000);
  put(path.join(app('Chatty'), 'app-1.0.9', 'Chatty.exe'), 2000);
  put(path.join(app('Chatty'), 'app-1.0.9', 'resources', 'app.asar'), 6000);
  put(path.join(app('Chatty'), 'app-1.0.2', 'Chatty.exe'), 1500);
  put(path.join(app('Chatty'), 'app-1.0.10', 'Chatty.exe'), 2000);
  put(path.join(app('Chatty'), 'app-1.0.10', 'resources', 'app.asar'), 6000);
  // An app whose newest folder is still empty (an update that is being unpacked): nothing is removable.
  put(path.join(app('Halfway'), 'Update.exe'));
  put(path.join(app('Halfway'), 'app-3.0.0', 'Halfway.exe'), 900);
  fs.mkdirSync(path.join(app('Halfway'), 'app-3.1.0'), {recursive: true});
  // Not a Squirrel app (no Update.exe) — never touched.
  put(path.join(app('Plain'), 'app-1.0.0', 'x.exe'));
  put(path.join(app('Plain'), 'app-2.0.0', 'x.exe'));
  return {chatty: app('Chatty'), halfway: app('Halfway'), plain: app('Plain')};
}

test('version numbers are compared as numbers; a release beats its own pre-release', () => {
  const v = s => { const m = /^(\d+(?:\.\d+)*)(?:-(.+))?$/.exec(s); return {numbers: m[1].split('.').map(Number), suffix: m[2] || ''}; };
  assert.ok(smart.compareVersions(v('1.0.10'), v('1.0.9')) > 0);
  assert.ok(smart.compareVersions(v('4.36.140'), v('4.4.0')) > 0);
  assert.ok(smart.compareVersions(v('2.0.0'), v('2.0.0-rc1')) > 0);
  assert.strictEqual(smart.compareVersions(v('1.2'), v('1.2.0')), 0);
});

test('old app versions go; the newest version, the updater and the packages stay', async () => {
  const f = squirrelFixture();
  const c = await smart.squirrelOldVersions({base: fakeLocal});
  const rm = p => c.removable(p, fs.lstatSync(p));
  assert.ok(rm(path.join(f.chatty, 'app-1.0.9', 'Chatty.exe')));
  assert.ok(rm(path.join(f.chatty, 'app-1.0.9', 'resources', 'app.asar')));
  assert.ok(rm(path.join(f.chatty, 'app-1.0.2', 'Chatty.exe')));
  assert.ok(!rm(path.join(f.chatty, 'app-1.0.10', 'Chatty.exe')), '1.0.10 is newer than 1.0.9');
  assert.ok(!rm(path.join(f.chatty, 'Update.exe')));
  assert.ok(!rm(path.join(f.chatty, 'packages', 'Chatty-1.0.10-full.nupkg')));
  assert.ok(!rm(path.join(f.halfway, 'app-3.0.0', 'Halfway.exe')), 'newest folder is unfinished, so the old one is still needed');
  assert.ok(!rm(path.join(f.plain, 'app-1.0.0', 'x.exe')), 'no Update.exe, not a Squirrel app');
  assert.match(c.note(path.join(f.chatty, 'app-1.0.9', 'Chatty.exe')), /1\.0\.9.*1\.0\.10/);
  assert.match(c.keptNote(path.join(f.chatty, 'app-1.0.10', 'Chatty.exe')), /in use/);
  assert.ok(c.processes.includes('chatty.exe'));
});

test('an update in progress (Update.exe running) blocks removal', async () => {
  const f = squirrelFixture();
  smart.hooks.procs = new Set(['update.exe']);
  const c = await smart.squirrelOldVersions({base: fakeLocal});
  assert.strictEqual(c.state, 'busy');
  assert.ok(!c.removable(path.join(f.chatty, 'app-1.0.9', 'Chatty.exe'), fs.lstatSync(path.join(f.chatty, 'app-1.0.9', 'Chatty.exe'))));
});

test('cleaning removes old app versions with their folders and nothing else', async () => {
  const f = squirrelFixture();
  put(path.join(f.chatty, 'empty-but-not-ours', '.keep')); fs.rmSync(path.join(f.chatty, 'empty-but-not-ours', '.keep'));
  const a = await cleaner().analyze({ids: ['apps.squirrel']});
  const r = a.results[0];
  assert.strictEqual(r.files, 3);
  assert.strictEqual(r.bytes, 2000 + 6000 + 1500);
  assert.ok(r.kept.files >= 4);
  const res = await cleaner().clean({ids: ['apps.squirrel']});
  assert.strictEqual(res.deleted, 3);
  assert.ok(!fs.existsSync(path.join(f.chatty, 'app-1.0.9')) && !fs.existsSync(path.join(f.chatty, 'app-1.0.2')), 'emptied old version folders are removed');
  assert.ok(fs.existsSync(path.join(f.chatty, 'app-1.0.10', 'Chatty.exe')));
  assert.ok(fs.existsSync(path.join(f.chatty, 'Update.exe')));
  assert.ok(fs.existsSync(path.join(f.chatty, 'packages', 'Chatty-1.0.10-full.nupkg')));
  assert.ok(fs.existsSync(path.join(f.chatty, 'empty-but-not-ours')), 'folders that merely happen to be empty are left alone');
  assert.ok(fs.existsSync(path.join(f.halfway, 'app-3.0.0', 'Halfway.exe')));
  assert.ok(fs.existsSync(path.join(f.plain, 'app-1.0.0', 'x.exe')));
});

test('smart items explain how they decide', () => {
  const {rules} = cleaner().rules();
  const smartRules = rules.filter(r => r.smart);
  assert.deepStrictEqual(smartRules.map(r => r.id).sort(), ['apps.squirrel', 'windows.installer']);
  for (const r of smartRules) { assert.ok(r.how, `${r.id} needs a "how"`); assert.notStrictEqual(r.verdict, 'safe', `${r.id} asks before cleaning`); }
  assert.ok(rules.find(r => r.id === 'windows.installer').admin);
});

// ---------------------------------------------------------------------------------------------------------
// Disk analyzer: the same distinction, shown file by file

const identify = async (...paths) => {
  const items = paths.map(p => ({path: p, dir: fs.existsSync(p) && fs.statSync(p).isDirectory()}));
  return identifyMod.identify({items, programs: []});
};

test('Disk analyzer: unused Installer packages are Safe, the ones programs need are Keep and name the program', async () => {
  const f = installerFixture();
  fakeRegistry(f.refs);
  const r = await identify(f.used, f.patch, f.orphan, f.orphanPatch, f.icon, path.dirname(f.icon));
  assert.strictEqual(r[f.orphan].verdict, 'safe');
  assert.strictEqual(r[f.orphanPatch].verdict, 'safe');
  assert.ok(r[f.orphan].smart);
  assert.strictEqual(r[f.used].verdict, 'keep');
  assert.match(r[f.used].what, /Contoso Suite/);
  assert.strictEqual(r[f.used].owner, 'Contoso Suite');
  assert.strictEqual(r[f.patch].verdict, 'keep');
  assert.match(r[f.patch].what, /Update for Contoso Suite/);
  assert.strictEqual(r[path.dirname(f.icon)].verdict, 'keep');
  assert.ok(['keep', 'review'].includes(r[f.icon].verdict), 'files inside icon folders fall back to the general rules');
});

test('Disk analyzer: the Installer folder says how much of it is unused, and a new file is not called safe', async () => {
  const f = installerFixture();
  fakeRegistry(f.refs);
  const r = (await identify(installer))[installer];
  assert.strictEqual(r.verdict, 'review');
  assert.match(r.what, /2 files/);   // needed
  assert.match(r.what, /2 files \(\d+(\.\d)? (B|KB)\)/);   // sizes come with units
  smart.hooks.now = () => Date.now(); // the fixture was created just now
  identifyMod.resetSmartCache();
  const fresh = await identify(f.orphan);
  assert.strictEqual(fresh[f.orphan].verdict, 'review');
  assert.match(fresh[f.orphan].what, /24 hours/);
});

test('Disk analyzer: when the check fails every Installer file is Keep', async () => {
  const f = installerFixture();
  smart.hooks.readRefs = async () => { throw new Error('no registry'); }; smart.hooks.now = later;
  const r = await identify(f.orphan, f.used, installer);
  for (const p of [f.orphan, f.used, installer]) assert.strictEqual(r[p].verdict, 'keep', path.basename(p));
});

test('Disk analyzer: old app versions are Safe, the newest, the updater and the packages are Keep', async () => {
  const f = squirrelFixture();
  const r = await identify(path.join(f.chatty, 'app-1.0.9'), path.join(f.chatty, 'app-1.0.9', 'Chatty.exe'), path.join(f.chatty, 'app-1.0.10'), path.join(f.chatty, 'Update.exe'), path.join(f.chatty, 'packages'), f.chatty);
  assert.strictEqual(r[path.join(f.chatty, 'app-1.0.9')].verdict, 'safe');
  assert.strictEqual(r[path.join(f.chatty, 'app-1.0.9', 'Chatty.exe')].verdict, 'safe');
  assert.match(r[path.join(f.chatty, 'app-1.0.9')].what, /1\.0\.9.*1\.0\.10/);
  assert.strictEqual(r[path.join(f.chatty, 'app-1.0.10')].verdict, 'keep');
  assert.strictEqual(r[path.join(f.chatty, 'Update.exe')].verdict, 'keep');
  assert.strictEqual(r[path.join(f.chatty, 'packages')].verdict, 'keep');
  assert.strictEqual(r[f.chatty].verdict, 'review');
  assert.match(r[f.chatty].what, /Older versions are still here \(2\)/);
});

test('Disk analyzer: the explanations exist in Russian', async () => {
  const f = installerFixture();
  const g = squirrelFixture();
  fakeRegistry(f.refs);
  i18n.setLanguage('ru');
  const cyr = /[Ѐ-ӿ]/;
  const r = await identify(installer, f.used, f.patch, f.orphan, path.dirname(f.icon), path.join(g.chatty, 'app-1.0.9'), path.join(g.chatty, 'app-1.0.10'), path.join(g.chatty, 'Update.exe'), g.chatty);
  for (const [p, info] of Object.entries(r)) for (const k of ['kind', 'what', 'advice']) {
    assert.match(info[k], cyr, `${path.basename(p)} ${k} is not translated: ${info[k]}`);
    assert.ok(!/\{\w+\}/.test(info[k]), `${path.basename(p)} ${k} has an unfilled placeholder`);
  }
});

test('Disk analyzer: Installer files that something needs cannot be moved to the Recycle Bin, even if asked directly', async () => {
  const f = installerFixture();
  fakeRegistry(f.refs);
  const moved = [];
  const disk = new Disk({store: {log() {}}, trash: async p => { moved.push(p); }});
  const res = await disk.trashPaths({paths: [f.used, f.patch, f.orphan, f.icon, installer, f.other]});
  assert.deepStrictEqual(moved, [f.orphan], 'only the unused package may go');
  assert.deepStrictEqual(res.done, [f.orphan]);
  assert.strictEqual(res.failed.length, 5);
  assert.match(res.failed[0].error, /needs them|no installed program/i);
  // If the check fails, nothing from that folder moves.
  moved.length = 0;
  smart.hooks.readRefs = async () => { throw new Error('no registry'); };
  const again = await disk.trashPaths({paths: [f.orphan, f.orphanPatch]});
  assert.deepStrictEqual(moved, []);
  assert.strictEqual(again.failed.length, 2);
});

test('Disk analyzer: files outside the Installer folder are not affected by the guard', async () => {
  const f = installerFixture();
  fakeRegistry(f.refs);
  const elsewhere = put(path.join(root, 'Downloads', 'setup.msi'), 500);
  const moved = [];
  const disk = new Disk({store: {log() {}}, trash: async p => { moved.push(p); }});
  await disk.trashPaths({paths: [elsewhere]});
  assert.deepStrictEqual(moved, [elsewhere]);
});

test.after(() => fs.rmSync(root, {recursive: true, force: true}));
