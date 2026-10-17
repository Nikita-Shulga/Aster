'use strict';
// Fixture-only exercise. This does not authorize or enable app mutations.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createService } = require('../src/core');

function contained(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).some(p => p === '..' || p === '.')) throw Object.assign(new Error('Invalid fixture child'), { code: 'FIXTURE_ESCAPE' });
  const result = path.resolve(root, relative), rel = path.relative(root, result);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw Object.assign(new Error('Invalid fixture child'), { code: 'FIXTURE_ESCAPE' });
  return result;
}
async function createFixture() {
  // macOS os.tmpdir() is under protected /private/var. Never relax core policy.
  const base = await fs.realpath(path.join(__dirname, '../qa'));
  const root = await fs.mkdtemp(path.join(base, 'native-smoke-'));
  const identity = await fs.lstat(root, { bigint: true });
  const token = crypto.randomUUID();
  const marker = contained(root, 'fixture-owner.json');
  await fs.writeFile(marker, JSON.stringify({ token }), { flag: 'wx', mode: 0o600 });
  return {
    root,
    child: relative => contained(root, relative),
    async clean() {
      const now = await fs.lstat(root, { bigint: true });
      const mark = await fs.lstat(marker);
      if (!now.isDirectory() || now.isSymbolicLink() || now.dev !== identity.dev || now.ino !== identity.ino || !mark.isFile() || mark.isSymbolicLink() || mark.nlink !== 1 || JSON.parse(await fs.readFile(marker, 'utf8')).token !== token) throw Object.assign(new Error('Fixture ownership changed'), { code: 'FIXTURE_OWNERSHIP' });
      await fs.rm(root, { recursive: true, force: false });
    }
  };
}
const skipCodes = new Set(['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS']);
const safeCode = error => /^[A-Z][A-Z0-9_]{0,63}$/.test(error?.code || '') ? error.code : 'CHECK_FAILED';
async function run() {
  const report = { schemaVersion: 1, platform: process.platform, arch: process.arch, nodeVersion: process.versions.node, evidenceScope: ['win32', 'darwin'].includes(process.platform) ? 'native-fixture-only' : 'non-target-platform-fixture-only', nativeReleaseApproved: false, checks: [], fixture: { retained: false, directoryName: null } };
  let f;
  async function check(name, fn) {
    try { const result = await fn(); report.checks.push({ name, status: result?.skip ? 'skip' : 'pass', ...(result?.skip ? { reason: result.skip } : {}) }); }
    catch (error) { report.checks.push({ name, status: 'fail', code: safeCode(error) }); }
  }
  async function caseFiles(name, entries) {
    const root = f.child(name); await fs.mkdir(root);
    for (const [file, data] of Object.entries(entries)) await fs.writeFile(contained(root, file), data, { flag: 'wx' });
    return root;
  }
  async function plan(service, root, name) {
    const scan = await service.scan({ roots: [root] });
    assert.equal(scan.cancelled, false); assert.equal(scan.truncated, false);
    const file = scan.files.find(x => x.name === name); assert.ok(file);
    return service.createCleanupPlan({ scanId: scan.id, selectedIds: [file.id] });
  }
  try {
    f = await createFixture(); report.fixture.directoryName = path.basename(f.root);
    await check('shipping-mutations-disabled', async () => {
      assert.equal(require('../src/desktop/release-policy.json').nativeMutationsValidated, false);
      await assert.rejects(createService().quarantine({}), { code: 'MUTATIONS_DISABLED' });
      await assert.rejects(createService().restore({}), { code: 'MUTATIONS_DISABLED' });
    });
    await check('scan-and-duplicate-keeper', async () => {
      const root = await caseFiles('duplicates', { 'one.txt': 'same', 'two.txt': 'same', 'unique.txt': 'unique!' });
      const service = createService(), scan = await service.scan({ roots: [root] });
      assert.equal(scan.files.length, 3); assert.equal(scan.totals.bytes, 15); assert.equal(scan.duplicates.length, 1);
      assert.equal(scan.duplicates[0].recoverableBytes, 4);
      await assert.rejects(service.createCleanupPlan({ scanId: scan.id, selectedIds: scan.duplicates[0].fileIds }), { code: 'LAST_COPY' });
    });
    for (const kind of ['symlink', 'directory-symlink', 'junction', 'hardlink']) await check(`${kind}-excluded`, async () => {
      if (kind === 'junction' && process.platform !== 'win32') return { skip: 'Windows junction check requires Windows' };
      const root = await caseFiles(kind, { 'original.txt': 'fixture' });
      const source = contained(root, 'original.txt'), alias = contained(root, 'alias');
      try {
        if (kind === 'hardlink') await fs.link(source, alias);
        else await fs.symlink(['junction', 'directory-symlink'].includes(kind) ? root : source, alias, kind === 'junction' ? 'junction' : kind === 'directory-symlink' ? 'dir' : 'file');
      } catch (error) { if (skipCodes.has(error.code)) return { skip: `Link creation unavailable: ${safeCode(error)}` }; throw error; }
      const service = createService(), scan = await service.scan({ roots: [root] });
      assert.equal(scan.files.length, kind === 'hardlink' ? 0 : 1);
      assert.ok(scan.warnings.some(w => w.code === (kind === 'hardlink' ? 'HARDLINK' : 'SYMLINK')));
      if (['junction', 'directory-symlink'].includes(kind)) await assert.rejects(service.scan({ roots: [alias] }), { code: 'SYMLINK' });
      assert.equal(await fs.readFile(source, 'utf8'), 'fixture');
    });
    await check('stale-plan-blocked', async () => {
      const root = await caseFiles('stale', { 'source.txt': 'before' }), service = createService({ mutationEnabled: true });
      const p = await plan(service, root, 'source.txt');
      await fs.writeFile(contained(root, 'source.txt'), 'changed after preview');
      await assert.rejects(service.quarantine({ planId: p.id, quarantineRoot: f.child('stale-quarantine') }), error => ['FILE_CHANGED', 'CONTENT_CHANGED'].includes(error.code));
      assert.equal(await fs.readFile(contained(root, 'source.txt'), 'utf8'), 'changed after preview');
    });
    await check('quarantine-restore-and-retained-recovery', async () => {
      const root = await caseFiles('roundtrip', { 'source.txt': 'round trip fixture' }), service = createService({ mutationEnabled: true });
      const p = await plan(service, root, 'source.txt');
      // Public plans are copies; caller tampering must not redirect internal paths.
      p.files[0].path = f.child('uncreated-target.txt');
      const q = await service.quarantine({ planId: p.id, quarantineRoot: f.child('roundtrip-quarantine') });
      assert.equal(q.status, 'completed'); assert.equal(q.movedFiles, 1); assert.equal(q.freesDiskSpace, false);
      await assert.rejects(fs.lstat(contained(root, 'source.txt')), { code: 'ENOENT' });
      const restored = await service.restore({ journalPath: q.journalPath });
      assert.equal(restored.status, 'restored'); assert.equal(restored.recoveryCopiesRetained, true);
      assert.equal(await fs.readFile(contained(root, 'source.txt'), 'utf8'), 'round trip fixture');
      const bins = (await fs.readdir(path.dirname(q.journalPath))).filter(x => x.endsWith('.bin'));
      assert.equal(bins.length, 1); assert.equal(await fs.readFile(path.join(path.dirname(q.journalPath), bins[0]), 'utf8'), 'round trip fixture');
      await assert.rejects(fs.lstat(f.child('uncreated-target.txt')), { code: 'ENOENT' });
    });
    await check('restore-collision-preserves-both-files', async () => {
      const root = await caseFiles('collision', { 'source.txt': 'original content' }), service = createService({ mutationEnabled: true });
      const p = await plan(service, root, 'source.txt');
      const q = await service.quarantine({ planId: p.id, quarantineRoot: f.child('collision-quarantine') }); assert.equal(q.status, 'completed');
      await fs.writeFile(contained(root, 'source.txt'), 'new unrelated file', { flag: 'wx' });
      const result = await service.restore({ journalPath: q.journalPath });
      assert.equal(result.status, 'interrupted'); assert.equal(result.error.code, 'COLLISION');
      assert.equal(await fs.readFile(contained(root, 'source.txt'), 'utf8'), 'new unrelated file');
      const bins = (await fs.readdir(path.dirname(q.journalPath))).filter(x => x.endsWith('.bin'));
      assert.equal(bins.length, 1); assert.equal(await fs.readFile(path.join(path.dirname(q.journalPath), bins[0]), 'utf8'), 'original content');
    });
    await check('journal-tamper-blocked', async () => {
      const root = await caseFiles('tamper', { 'source.txt': 'tamper fixture' }), service = createService({ mutationEnabled: true });
      const p = await plan(service, root, 'source.txt');
      const q = await service.quarantine({ planId: p.id, quarantineRoot: f.child('tamper-quarantine') }); assert.equal(q.status, 'completed');
      const journal = JSON.parse(await fs.readFile(q.journalPath, 'utf8')); journal.payload.status = 'restored';
      await fs.writeFile(q.journalPath, JSON.stringify(journal));
      await assert.rejects(service.inspectJournal({ journalPath: q.journalPath }), { code: 'JOURNAL_TAMPERED' });
      await assert.rejects(service.restore({ journalPath: q.journalPath }), { code: 'JOURNAL_TAMPERED' });
      await assert.rejects(fs.lstat(contained(root, 'source.txt')), { code: 'ENOENT' });
    });
  } catch (error) { report.checks.push({ name: 'fixture-setup', status: 'fail', code: safeCode(error) }); }
  if (f) {
    report.fixture.retained = true;
    if (!report.checks.some(c => c.status === 'fail')) await check('fixture-cleanup', async () => { await f.clean(); report.fixture.retained = false; });
  }
  report.summary = Object.fromEntries(['pass', 'fail', 'skip'].map(status => [status, report.checks.filter(c => c.status === status).length]));
  report.status = report.summary.fail ? 'fail' : report.summary.skip ? 'pass-with-skips' : 'pass';
  return report;
}
if (require.main === module) {
  if (process.argv.length !== 2) { process.stdout.write(JSON.stringify({ status: 'fail', code: 'ARGUMENTS_NOT_SUPPORTED' }) + '\n'); process.exitCode = 1; }
  else run().then(report => { process.stdout.write(JSON.stringify(report, null, 2) + '\n'); process.exitCode = report.summary.fail ? 1 : 0; }).catch(error => { process.stdout.write(JSON.stringify({ status: 'fail', code: safeCode(error) }) + '\n'); process.exitCode = 1; });
}
module.exports = { contained, createFixture, run };
