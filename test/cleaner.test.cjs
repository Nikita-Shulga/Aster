'use strict';
// Windows-only suite (macOS has its own in mac.test.cjs).
if (process.platform !== 'win32') { require('node:test').test('cleaner (Windows only)', {skip: true}, () => {}); return; }
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point the "Temporary files" rule at a disposable fixture before the rules module loads.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-cleaner-'));
const temp = path.join(root, 'Local', 'Temp');
process.env.TEMP = temp;
const {Cleaner, isSafeTarget} = require('../src/main/cleaner.cjs');

function file(p, ageHours, size = 1000) {
  fs.mkdirSync(path.dirname(p), {recursive: true});
  fs.writeFileSync(p, Buffer.alloc(size));
  const t = Date.now() / 1000 - ageHours * 3600;
  fs.utimesSync(p, t, t);
}

test('temp rule removes only files older than 24h and keeps the folder', async () => {
  file(path.join(temp, 'old.tmp'), 48, 4000);
  file(path.join(temp, 'nested', 'deep', 'old.log'), 72, 2000);
  file(path.join(temp, 'fresh.tmp'), 1, 500);
  file(path.join(temp, 'excluded', 'keep.tmp'), 100, 700);
  const cleaner = new Cleaner({getSettings: () => ({exclusions: [path.join(temp, 'excluded')]}), getDrives: async () => []});

  const analysis = await cleaner.analyze({ids: ['windows.temp']});
  assert.strictEqual(analysis.results[0].files, 2);
  assert.strictEqual(analysis.results[0].bytes, 6000);

  const result = await cleaner.clean({ids: ['windows.temp']});
  assert.strictEqual(result.deleted, 2);
  assert.strictEqual(result.freed, 6000);
  assert.ok(fs.existsSync(temp), 'target folder itself is kept');
  assert.ok(fs.existsSync(path.join(temp, 'fresh.tmp')), 'recent file kept');
  assert.ok(fs.existsSync(path.join(temp, 'excluded', 'keep.tmp')), 'excluded folder kept');
  assert.ok(!fs.existsSync(path.join(temp, 'nested')), 'emptied subfolders removed');
});

test('cleaning limited to another drive leaves files alone', async () => {
  file(path.join(temp, 'other-drive.tmp'), 48, 300);
  const cleaner = new Cleaner({getSettings: () => ({exclusions: []}), getDrives: async () => []});
  const here = path.parse(temp).root.replace(/\\$/, '').toUpperCase();
  const elsewhere = here === 'Q:' ? 'R:' : 'Q:';
  const none = await cleaner.clean({ids: ['windows.temp'], drives: [elsewhere]});
  assert.strictEqual(none.deleted, 0);
  assert.ok(fs.existsSync(path.join(temp, 'other-drive.tmp')));
  const some = await cleaner.clean({ids: ['windows.temp'], drives: [here]});
  assert.ok(some.deleted >= 1);
  assert.ok(!fs.existsSync(path.join(temp, 'other-drive.tmp')));
});

test('links are never followed', async () => {
  const outside = path.join(root, 'outside');
  file(path.join(outside, 'precious.doc'), 500);
  try { fs.symlinkSync(outside, path.join(temp, 'link'), 'junction'); } catch { return; }
  const cleaner = new Cleaner({getSettings: () => ({exclusions: []}), getDrives: async () => []});
  await cleaner.clean({ids: ['windows.temp']});
  assert.ok(fs.existsSync(path.join(outside, 'precious.doc')));
});

test('shallow paths are refused', () => {
  assert.strictEqual(isSafeTarget('C:\\'), false);
  assert.strictEqual(isSafeTarget('C:\\Users'), false);
  assert.strictEqual(isSafeTarget('C:\\Users\\me\\AppData'), true);
});

test('rules catalogue is well formed', () => {
  const {rules, groups} = new Cleaner({getSettings: () => ({}), getDrives: async () => []}).rules();
  const ids = new Set();
  for (const r of rules) {
    assert.ok(!ids.has(r.id), `duplicate ${r.id}`); ids.add(r.id);
    assert.ok(groups.some(g => g.id === r.group));
    assert.ok(r.name && r.contains && r.ifDeleted && r.advice, `${r.id} must explain itself`);
    assert.ok(['safe', 'review', 'keep'].includes(r.verdict), `${r.id} verdict`);
  }
});

test.after(() => fs.rmSync(root, {recursive: true, force: true}));
