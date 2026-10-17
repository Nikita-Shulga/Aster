'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeScan, buildRecommendations, compareScans } = require('../../src/core');
const NOW = Date.parse('2026-10-17T00:00:00Z');
const hash = 'a'.repeat(64);
const file = (path, size = 100, extra = {}) => ({ id: path, path, size, category: 'document', mtimeMs: NOW - 400 * 86400000, ...extra });
const scan = (files = [], extra = {}) => ({ roots: ['/data'], files, completedAt: new Date(NOW).toISOString(), warnings: [], ...extra });

test('analysis totals do not double count nested directories or overlapping review categories', () => {
  const result = analyzeScan(scan([file('/data/a', 100, { sha256: hash }), file('/data/sub/b', 100, { sha256: hash }), file('/data/sub/c', 20)]), { largeFileBytes: 50 });
  assert.deepEqual(result.totals, { files: 3, bytes: 220 });
  assert.equal(result.directories.reduce((n, row) => n + row.bytes, 0), 220);
  assert.equal(result.categories[0].bytes, 220);
  assert.equal(result.largeFileCount, 2); assert.equal(result.oldFileCount, 3);
  assert.equal(result.duplicatePotentialBytes, 100); assert.equal(result.duplicateGroups, 1);
  assert.equal(result.completeness, 'complete'); assert.match(result.notes.join(' '), /must not be added/);
});

test('duplicate estimates ignore unsupported claims and require equal valid hashes and sizes', () => {
  const result = analyzeScan(scan([file('/data/a', 100, { sha256: hash }), file('/data/b', 200, { sha256: hash }), file('/data/c', 100, { sha256: 'fake' })], { duplicates: [{ recoverableBytes: 999999999 }] }));
  assert.equal(result.duplicatePotentialBytes, 0);
});

test('unknown, null, invalid and future modification dates are not old', () => {
  const files = [null, undefined, NaN, Infinity, -1, NOW + 1000].map((mtimeMs, i) => file(`/data/${i}`, 1, { mtimeMs }));
  const result = analyzeScan(scan(files));
  assert.equal(result.oldFileCount, 0); assert.equal(result.unknownDates, 6);
  assert.equal(analyzeScan(scan([file('/data/a')], { completedAt: null })).unknownDates, 1);
  assert.equal(analyzeScan(scan([file('/data/a', 1, { mtimeMs: undefined, modifiedAt: '2020-01-01T00:00:00Z' })])).oldFileCount, 1);
});

test('partial scans remain partial even when useful files are available', () => {
  for (const flag of [{ cancelled: true }, { truncated: true }, { warnings: [{}] }, { warningsOmitted: 1 }, { completedAt: 'bad' }]) {
    const result = analyzeScan(scan([file('/data/a')], flag));
    assert.equal(result.completeness, 'partial'); assert.ok(result.warnings.length);
    assert.ok(buildRecommendations({ scan: scan([], flag) }).some(row => row.id === 'partial-scan'));
  }
});

test('repeated paths are counted once and conflicting path records are excluded', () => {
  assert.equal(analyzeScan(scan([file('/data/a'), file('/data/a')])).totals.bytes, 100);
  const a = file('/data/a'), b = file('/data/a', 50);
  assert.deepEqual(analyzeScan(scan([a, b])), analyzeScan(scan([b, a])));
  assert.equal(analyzeScan(scan([a, b, a])).totals.files, 0);
  const windows = analyzeScan(scan([file('C:\\Data\\A', 5), file('c:\\data\\a', 5), file('C:\\Data\\B', 7)]));
  assert.equal(windows.totals.files, 2); assert.equal(windows.directories.length, 1);
});

test('results are deterministically ordered and inputs are not mutated', () => {
  const files = [file('/data/z', 20), file('/data/a', 20, { category: 'image' }), file('/data/m', 30)];
  const input = scan(files), original = structuredClone(input);
  assert.deepEqual(analyzeScan(input, { largeFileBytes: 1 }), analyzeScan(scan([...files].reverse()), { largeFileBytes: 1 }));
  assert.deepEqual(input, original);
  assert.deepEqual(analyzeScan(input, { largeFileBytes: 1 }).largeFiles.map(row => row.path), ['/data/m', '/data/a', '/data/z']);
});

test('analysis caps records and rows and rejects unsafe option values', () => {
  const result = analyzeScan(scan([file('/data/a/a'), file('/data/b/b'), file('/data/c/c')]), { maxFiles: 2, maxRows: 1, largeFileBytes: 1 });
  assert.equal(result.completeness, 'partial'); assert.equal(result.totals.files, 2);
  assert.equal(result.directories.length, 1); assert.equal(result.directoriesOmitted, 1);
  assert.equal(result.largeFiles.length, 1); assert.equal(result.largeFileCount, 2);
  for (const options of [{ maxFiles: 100001 }, { maxRows: 0 }, { maxRows: Infinity }, { oldFileDays: -1 }, { nowMs: NaN }]) assert.throws(() => analyzeScan(scan(), options), RangeError);
});

test('missing metrics and malformed input never become a healthy result or invented capacity', () => {
  assert.equal(analyzeScan(null).completeness, 'partial');
  assert.equal(analyzeScan(scan([null, file('relative'), file('/data/a', -1)])).totals.files, 0);
  const rows = buildRecommendations({ systemInfo: { storage: { total: null, free: null }, memory: { free: 0 } } });
  assert.deepEqual(rows.map(row => row.id), ['storage-unavailable']);
  assert.ok(!JSON.stringify(rows).includes('score'));
  assert.equal(buildRecommendations({})[0].id, 'review-first');
});

test('storage recommendations use valid capacity and documented strict threshold', () => {
  const recommendation = free => buildRecommendations({ systemInfo: { storage: { total: 1000, free } } });
  assert.equal(recommendation(99)[0].id, 'low-storage');
  assert.equal(recommendation(100)[0].id, 'review-first');
  for (const free of [null, -1, 1001, '1']) assert.equal(recommendation(free)[0].id, 'storage-unavailable');
  assert.equal(buildRecommendations({ startup: { status: 'partial' } })[0].id, 'startup-coverage');
});

test('comparison matches paths rather than scan IDs and accounts for byte changes', () => {
  const previous = scan([file('/data/a', 10), file('/data/b', 20), file('/data/c', 30)]);
  const current = scan([file('/data/a', 10, { id: 'new-id' }), file('/data/b', 25), file('/data/d', 40)]);
  const result = compareScans(previous, current);
  assert.equal(result.comparable, true);
  assert.deepEqual(result.totals, { beforeBytes: 60, afterBytes: 75, deltaBytes: 15, addedBytes: 40, removedBytes: 30, changedBytes: 5, addedFiles: 1, removedFiles: 1, changedFiles: 1, unchangedFiles: 1 });
  assert.equal(result.totals.deltaBytes, result.totals.addedBytes - result.totals.removedBytes + result.totals.changedBytes);
  assert.match(result.warnings.join(' '), /do not prove creation or deletion/);
});

test('comparison detects same-size hash or timestamp changes without inventing unknown changes', () => {
  const previous = scan([file('/data/a', 10, { sha256: hash }), file('/data/b', 10)]);
  const current = scan([file('/data/a', 10, { sha256: 'b'.repeat(64) }), file('/data/b', 10, { mtimeMs: NOW })]);
  assert.equal(compareScans(previous, current).totals.changedFiles, 2);
  assert.equal(compareScans(scan([file('/data/a', 1, { mtimeMs: null })]), scan([file('/data/a', 1, { mtimeMs: null })])).totals.unchangedFiles, 1);
});

test('comparison flags changed scopes, hidden settings, exclusions, missing and partial snapshots', () => {
  for (const extra of [{ roots: ['/other'] }, { roots: [] }, { includeHidden: true }, { exclusions: ['/data/private'] }, { excludedNames: ['private'] }]) assert.equal(compareScans(scan(), scan([], extra)).comparable, false);
  for (const extra of [{ truncated: true }, { cancelled: true }, { warnings: [{}] }]) assert.equal(compareScans(scan(), scan([], extra)).comparable, false);
  assert.equal(compareScans(null, null).comparable, false);
  const result = compareScans(scan(), scan([file('/data/a'), file('/data/b')]), { maxRows: 1 });
  assert.equal(result.added.length, 1); assert.equal(result.rowsOmitted.added, 1); assert.equal(result.totals.addedFiles, 2);
});

test('overflow and unsafe bytes are excluded with a visible warning', () => {
  const result = analyzeScan(scan([file('/data/a', Number.MAX_SAFE_INTEGER), file('/data/b', 1)]));
  assert.equal(result.completeness, 'partial'); assert.equal(result.totals.bytes, Number.MAX_SAFE_INTEGER);
  assert.equal(analyzeScan(scan([file('/data/a', NaN)])).totals.bytes, 0);
});
