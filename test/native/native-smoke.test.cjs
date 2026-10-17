'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { contained, createFixture, run } = require('../../scripts/native-smoke.cjs');

test('fixture path helper rejects absolute paths, traversal and root selection', () => {
  const root = path.resolve('example-fixture');
  for (const input of ['', '.', '..', '../outside', 'child/../outside', 'child\\..\\outside', path.resolve('outside')]) {
    assert.throws(() => contained(root, input), { code: 'FIXTURE_ESCAPE' });
  }
  assert.equal(contained(root, 'child/file.txt'), path.join(root, 'child/file.txt'));
});

test('cleanup refuses a changed ownership marker and preserves the directory', async () => {
  const f = await createFixture(), marker = f.child('fixture-owner.json');
  const original = await fs.readFile(marker);
  try {
    await fs.writeFile(marker, JSON.stringify({ token: 'not-owner' }));
    await assert.rejects(f.clean(), { code: 'FIXTURE_OWNERSHIP' });
    assert.equal((await fs.lstat(f.root)).isDirectory(), true);
  } finally { await fs.writeFile(marker, original); await f.clean(); }
});

test('successful fixture cleanup does not follow a child directory link', async t => {
  const f = await createFixture(), other = await createFixture();
  try {
    await fs.writeFile(other.child('sentinel.txt'), 'keep');
    try { await fs.symlink(other.root, f.child('link'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS'].includes(error.code)) { t.skip(`Link creation unavailable: ${error.code}`); return; } throw error; }
    await f.clean();
    assert.equal(await fs.readFile(other.child('sentinel.txt'), 'utf8'), 'keep');
  } finally {
    if (await fs.lstat(f.root).catch(() => null)) await f.clean();
    await other.clean();
  }
});

test('CLI refuses all arguments instead of accepting arbitrary scan or cleanup paths', () => {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/native-smoke.cjs'), '--root', path.parse(process.cwd()).root], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { status: 'fail', code: 'ARGUMENTS_NOT_SUPPORTED' });
});

test('fixture runner produces honest sanitized platform evidence and cleans its own successful data', async () => {
  const report = await run();
  assert.equal(report.summary.fail, 0, JSON.stringify(report));
  assert.equal(report.fixture.retained, false);
  assert.equal(report.platform, process.platform); assert.equal(report.arch, process.arch);
  assert.equal(report.nativeReleaseApproved, false);
  assert.equal(report.summary.skip, report.checks.filter(c => c.status === 'skip').length);
  assert.equal(report.status, report.summary.skip ? 'pass-with-skips' : 'pass');
  assert.match(report.fixture.directoryName, /^native-smoke-[A-Za-z0-9]+$/);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(process.cwd()), false);
  assert.equal(serialized.includes(path.resolve(__dirname)), false);
  assert.equal(report.checks.every(c => !('message' in c) && !('path' in c)), true);
  await assert.rejects(fs.lstat(path.resolve(__dirname, '../../qa', report.fixture.directoryName)), { code: 'ENOENT' });
});
