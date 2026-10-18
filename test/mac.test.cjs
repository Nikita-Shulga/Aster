'use strict';
// macOS suite — runs on the GitHub Actions macOS runner (and on any Mac with `npm test`).
if (process.platform !== 'darwin') { require('node:test').test('macOS (macOS only)', {skip: true}, () => {}); return; }
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point the temporary-files rule at a fixture before rules resolve (they read os.tmpdir() lazily).
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-mac-'));
const store = {log() {}, newBackupFile: () => ({name: 'x', file: path.join(fixture, 'x.reg')})};

test('system info describes the Mac and its volumes', async () => {
  const s = await require('../src/main/mac/system.cjs').info();
  assert.match(s.os, /^macOS/);
  assert.ok(s.cpu && s.cores > 0 && s.memory.total > 0);
  assert.ok(s.drives.some(d => d.root === '/' && d.total > 0 && d.free >= 0), JSON.stringify(s.drives));
  assert.ok([true, false].includes(s.fda));
});

test('cleaner rules are complete and analyze without errors', async () => {
  const {Cleaner} = require('../src/main/cleaner.cjs');
  const c = new Cleaner({getSettings: () => ({exclusions: []}), getDrives: async () => []});
  const {rules, groups} = c.rules();
  assert.ok(rules.length > 25);
  for (const r of rules) {
    assert.ok(groups.some(g => g.id === r.group), r.id);
    assert.ok(r.contains && r.ifDeleted && r.advice && ['safe', 'review', 'keep'].includes(r.verdict), `${r.id} must explain itself`);
  }
  const ids = rules.filter(r => r.installed && !r.fda).map(r => r.id);
  const a = await c.analyze({ids});
  assert.strictEqual(a.results.length, ids.length);
  for (const r of a.results) for (const l of r.locations) assert.ok(l.drive && l.path.startsWith('/'), JSON.stringify(l));
});

test('temporary files: only old files are removed, links are not followed', async () => {
  const tmp = path.join(fixture, 'T');
  fs.mkdirSync(path.join(tmp, 'deep'), {recursive: true});
  const old = (p, hours) => { fs.writeFileSync(p, 'x'.repeat(1000)); const t = Date.now() / 1000 - hours * 3600; fs.utimesSync(p, t, t); };
  old(path.join(tmp, 'old.tmp'), 100); old(path.join(tmp, 'deep', 'old2.tmp'), 100); old(path.join(tmp, 'fresh.tmp'), 1);
  const outside = path.join(fixture, 'outside'); fs.mkdirSync(outside); old(path.join(outside, 'keep.doc'), 500);
  fs.symlinkSync(outside, path.join(tmp, 'link'));
  const prev = process.env.TMPDIR; process.env.TMPDIR = tmp;
  try {
    const {Cleaner} = require('../src/main/cleaner.cjs');
    const c = new Cleaner({getSettings: () => ({exclusions: []}), getDrives: async () => []});
    const a = await c.analyze({ids: ['macos.temp']});
    assert.strictEqual(a.results[0].files, 2);
    const r = await c.clean({ids: ['macos.temp']});
    assert.strictEqual(r.deleted, 2);
    assert.ok(fs.existsSync(path.join(tmp, 'fresh.tmp')));
    assert.ok(fs.existsSync(path.join(outside, 'keep.doc')));
  } finally { process.env.TMPDIR = prev; }
});

test('programs: lists app bundles with identifiers and finds leftovers', async () => {
  const {MacPrograms} = require('../src/main/mac/programs.cjs');
  const p = new MacPrograms({store, getIcon: async () => null, trash: async () => {}});
  const {items} = await p.list();
  assert.ok(items.length > 0, 'at least one app in /Applications');
  for (const it of items) { assert.ok(it.name && it.location.endsWith('.app') && it.drive, JSON.stringify(it)); assert.ok(['app', 'store', 'apple'].includes(it.type)); }
  const one = items.find(i => i.canUninstall) || items[0];
  const lo = await p.scanLeftovers({id: one.id});
  assert.ok(Array.isArray(lo.items));
  for (const x of lo.items) assert.ok(x.path.startsWith('/') && x.reason);
});

test('startup: lists launch agents and daemons', async () => {
  const {MacStartup} = require('../src/main/mac/startup.cjs');
  const s = new MacStartup({store, getIcon: async () => null, trash: async () => {}});
  const {items} = await s.list();
  for (const it of items) { assert.ok(['login', 'agent', 'daemon'].includes(it.type)); assert.ok(typeof it.enabled === 'boolean'); assert.ok(!/^com\.apple\./.test(it.label || '')); }
});

test('leftovers: scan returns well-formed items and never flags Apple data', async () => {
  const {MacLeftovers} = require('../src/main/mac/leftovers.cjs');
  const l = new MacLeftovers({store, trash: async () => {}});
  const r = await l.scan({});
  for (const i of r.items) {
    assert.ok(i.id && i.path.startsWith(os.homedir()) && i.title && i.type);
    assert.ok(!/com\.apple\./i.test(path.basename(i.path)), i.path);
  }
});

test('tweaks: every value can be read; a Finder setting round-trips', async () => {
  const {MacTweaks, TWEAKS} = require('../src/main/mac/tweaks.cjs');
  for (const t of TWEAKS) assert.ok(t.title && t.what && t.get && t.set && t.verdict, t.id);
  const tw = new MacTweaks({store});
  const r = await tw.list({groups: ['performance', 'privacy', 'appearance', 'explorer', 'taskbar', 'input', 'screenshots']});
  const unreadable = r.items.filter(i => i.value === null && i.id !== 'analytics').map(i => i.id);
  assert.deepStrictEqual(unreadable, []);
  const read = async () => (await tw.list({groups: ['explorer']})).items.find(i => i.id === 'statusBar').value;
  const before = await read();
  try { await tw.set({id: 'statusBar', value: !before}); assert.strictEqual(await read(), !before); }
  finally { await tw.set({id: 'statusBar', value: before}); }
  assert.strictEqual(await read(), before);
  const power = await tw.power();
  assert.ok(Array.isArray(power.plans));
  const procs = await tw.processes();
  assert.ok(procs.items.length > 0 && procs.items.every(p => p.name && p.memory >= 0));
});

test('updates: parsers handle softwareupdate and mas output', () => {
  const {parseSoftwareUpdate, parseMas} = require('../src/main/mac/updates.cjs');
  const su = parseSoftwareUpdate('Software Update found the following new or updated software:\n* Label: macOS Sequoia 15.7-24G222\n\tTitle: macOS Sequoia 15.7, Version: 15.7, Size: 1630000KiB, Recommended: YES, Action: restart,\n');
  assert.deepStrictEqual(su, [{id: 'macos:macOS Sequoia 15.7-24G222', name: 'macOS Sequoia 15.7', installed: 'Current', available: '15.7', kind: 'macos'}]);
  assert.deepStrictEqual(parseMas('497799835 Xcode (16.0 -> 16.1)\n'), [{id: 'mas:497799835', name: 'Xcode', installed: '16.0', available: '16.1', kind: 'appstore'}]);
});

test('file identification knows macOS locations', () => {
  const {classify} = require('../src/main/mac/identify.cjs');
  const h = os.homedir();
  assert.strictEqual(classify('/System/Library/Kernels/kernel', false, []).verdict, 'keep');
  assert.strictEqual(classify(`${h}/Library/Caches/com.example.app`, true, []).verdict, 'safe');
  assert.strictEqual(classify(`${h}/Library/Developer/Xcode/DerivedData`, true, []).verdict, 'safe');
  assert.strictEqual(classify(`${h}/Downloads/Setup.dmg`, false, []).verdict, 'safe');
  assert.strictEqual(classify(`${h}/Pictures/Photos Library.photoslibrary`, true, []).verdict, 'keep');
});

test('display list never throws', async () => {
  const {MacDisplay} = require('../src/main/mac/display.cjs');
  const r = await new MacDisplay({store}).list();
  assert.ok(Array.isArray(r.items));
});

test.after(() => fs.rmSync(fixture, {recursive: true, force: true}));
