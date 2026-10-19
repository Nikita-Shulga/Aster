'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {ScanCache, pruneDuplicates} = require('../src/main/scans.cjs');
const {Disk} = require('../src/main/disk.cjs');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aster-scans-'));

test('saved scans come back after a restart, and can be forgotten', async () => {
  const root = tmpDir();
  try {
    const a = new ScanCache(root);
    assert.strictEqual(await a.save('cleaner', {results: [{id: 'windows.temp', bytes: 42}], at: '2026-10-19T10:00:00Z'}), true);
    const b = new ScanCache(root); // a new session reads what the old one wrote
    const saved = await b.load('cleaner');
    assert.deepStrictEqual(saved.data, {results: [{id: 'windows.temp', bytes: 42}], at: '2026-10-19T10:00:00Z'});
    assert.ok(Date.parse(saved.savedAt));
    await b.save('cleaner', null);
    assert.strictEqual(await b.load('cleaner'), null);
    assert.throws(() => b.file('../settings'), /Unknown scan/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('overlapping saves keep the last one; a damaged file reads as no result', async () => {
  const root = tmpDir();
  try {
    const c = new ScanCache(root);
    await Promise.all([1, 2, 3].map(n => c.save('duplicates', {n})));
    assert.strictEqual((await c.load('duplicates')).data.n, 3);
    fs.writeFileSync(c.file('duplicates'), 'not gzip');
    assert.strictEqual(await c.load('duplicates'), null);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('restored duplicate groups drop files that are gone', () => {
  const alive = new Set(['/a/1', '/a/2', '/b/1']);
  const d = pruneDuplicates({files: 10, groups: [
    {size: 100, files: [{path: '/a/1'}, {path: '/a/2'}, {path: '/a/3'}]},
    {size: 50, files: [{path: '/b/1'}, {path: '/b/2'}]}
  ]}, p => alive.has(p));
  assert.strictEqual(d.groups.length, 1);
  assert.deepStrictEqual(d.groups[0].files.map(f => f.path), ['/a/1', '/a/2']);
  assert.strictEqual(d.wasted, 100);
  assert.strictEqual(d.files, 10);
});

test('the disk analyzer result survives a restart, including folder drill-down and later deletions', async () => {
  const data = tmpDir(), root = tmpDir();
  try {
    fs.mkdirSync(path.join(root, 'big', 'inner'), {recursive: true});
    fs.mkdirSync(path.join(root, 'small'));
    fs.writeFileSync(path.join(root, 'big', 'inner', 'video.bin'), Buffer.alloc(300000));
    fs.writeFileSync(path.join(root, 'small', 'note.txt'), 'hello');
    const cache = new ScanCache(data);
    const trash = async p => fs.rmSync(p, {recursive: true});
    const first = new Disk({store: {log() {}}, trash, cache});
    const result = await first.analyze({root});
    first.persist(0);
    await new Promise(r => setTimeout(r, 50));
    await cache.queue.get('disk');

    const second = new Disk({store: {log() {}}, trash, cache}); // Aster reopened
    const back = await second.last();
    assert.strictEqual(back.restored, true);
    assert.strictEqual(back.root, result.root);
    assert.strictEqual(back.size, result.size);
    assert.strictEqual(back.at, result.at);
    const big = await second.children({path: path.join(root, 'big')});
    assert.deepStrictEqual(big.items.map(i => i.name), ['inner']);

    await second.trashPaths({paths: [path.join(root, 'big')]});
    second.persist(0);
    await new Promise(r => setTimeout(r, 50));
    await cache.queue.get('disk');
    const third = new Disk({store: {log() {}}, trash, cache});
    const after = await third.last();
    assert.strictEqual(after.size, 5);
    assert.ok(!after.top.some(f => f.path.includes(`${path.sep}big${path.sep}`)));

    fs.rmSync(root, {recursive: true, force: true});
    assert.strictEqual(await new Disk({store: {log() {}}, trash, cache}).last(), null, 'a location that no longer exists is not restored');
  } finally { fs.rmSync(data, {recursive: true, force: true}); fs.rmSync(root, {recursive: true, force: true}); }
});
