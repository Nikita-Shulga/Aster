'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createService } = require('../../src/core');

// Exercise only quarantine's platform-dependent flush policy. Security/path
// helpers retain the actual host platform; this is not native Windows evidence.
async function windowsRestore() {
  const filename = require.resolve('../../src/core/quarantine');
  const module = { exports: {} };
  const factory = vm.runInNewContext(`(function(require, module, exports, process) { ${await fs.readFile(filename, 'utf8')}\n})`, { Buffer }, { filename });
  factory(createRequire(filename), module, module.exports, { platform: 'win32' });
  return module.exports.restore;
}
async function fixture(t, readonly = false) {
  const base = path.join(__dirname, '.fixtures'); await fs.mkdir(base, { recursive: true });
  const dir = await fs.mkdtemp(path.join(base, 'sync-'));
  const root = path.join(dir, 'source'); await fs.mkdir(root);
  const target = path.join(root, 'original.txt'); await fs.writeFile(target, 'original bytes');
  if (readonly) await fs.chmod(target, 0o444);
  const service = createService({ mutationEnabled: true });
  const scan = await service.scan({ roots: [root] });
  const plan = await service.createCleanupPlan({ scanId: scan.id, selectedIds: scan.files.map(f => f.id) });
  const moved = await service.quarantine({ planId: plan.id, quarantineRoot: path.join(dir, 'quarantine') });
  assert.equal(moved.status, 'completed');
  t.after(async () => {
    // Windows rm cannot remove a read-only file without first clearing its bit.
    for (const filename of [target, path.join(path.dirname(moved.journalPath), `${moved.entries[0].id}.bin`)]) await fs.chmod(filename, 0o600).catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  });
  return { target, journalPath: moved.journalPath, stored: path.join(path.dirname(moved.journalPath), `${moved.entries[0].id}.bin`) };
}
async function withOpen(mock, run) {
  const open = fs.open;
  fs.open = (...args) => mock(open, ...args);
  try { return await run(); } finally { fs.open = open; }
}
const writable = flags => (flags & (constants.O_WRONLY | constants.O_RDWR)) !== 0;

test('Windows restore flush uses a nontruncating write handle and retains both complete files', async t => {
  const f = await fixture(t), restore = await windowsRestore(); let syncs = 0;
  const result = await withOpen(async (open, filename, flags, ...args) => {
    const fd = await open(filename, flags, ...args);
    if (filename === f.target) {
      const sync = fd.sync.bind(fd);
      fd.sync = async () => {
        assert.ok(writable(flags), 'Windows cannot flush a read-only handle');
        assert.equal(flags & (constants.O_CREAT | constants.O_TRUNC | constants.O_APPEND), 0);
        syncs++; return sync();
      };
    }
    return fd;
  }, () => restore({ journalPath: f.journalPath }));
  assert.equal(result.status, 'restored'); assert.equal(syncs, 1);
  assert.equal(await fs.readFile(f.target, 'utf8'), 'original bytes');
  assert.equal(await fs.readFile(f.stored, 'utf8'), 'original bytes');
});

test('Windows read-only access denial fails closed, preserves attributes and retained recovery bytes', async t => {
  const f = await fixture(t, true), restore = await windowsRestore(); let attempts = 0;
  await withOpen(async (open, filename, flags, ...args) => {
    if (filename === f.target && writable(flags)) { attempts++; throw Object.assign(new Error('Read-only attribute'), { code: 'EACCES' }); }
    return open(filename, flags, ...args);
  }, async () => {
    for (let i = 0; i < 2; i++) {
      const result = await restore({ journalPath: f.journalPath });
      assert.equal(result.status, 'interrupted'); assert.equal(result.error.code, 'EACCES');
      assert.equal(result.restoredFiles, 0);
    }
  });
  assert.equal(attempts, 2, 'resume must not bypass the failed flush');
  assert.equal((await fs.stat(f.target)).mode & 0o200, 0);
  assert.equal(await fs.readFile(f.target, 'utf8'), 'original bytes');
  assert.equal(await fs.readFile(f.stored, 'utf8'), 'original bytes');
});

test('real flush errors interrupt every retry until a successful verified flush', async t => {
  const f = await fixture(t), restore = await windowsRestore(); let attempts = 0;
  await withOpen(async (open, filename, flags, ...args) => {
    const fd = await open(filename, flags, ...args);
    if (filename === f.target && writable(flags)) fd.sync = async () => { attempts++; throw Object.assign(new Error('Disk flush failed'), { code: 'EIO' }); };
    return fd;
  }, async () => {
    for (let i = 0; i < 2; i++) {
      const result = await restore({ journalPath: f.journalPath });
      assert.equal(result.status, 'interrupted'); assert.equal(result.error.code, 'EIO');
    }
  });
  assert.equal(attempts, 2);
  assert.equal((await restore({ journalPath: f.journalPath })).status, 'restored');
  assert.equal(await fs.readFile(f.stored, 'utf8'), 'original bytes');
});

test('replacement between hash verification and flush open is rejected before syncing', async t => {
  const f = await fixture(t), restore = await windowsRestore(); let synced = false;
  const result = await withOpen(async (open, filename, flags, ...args) => {
    if (filename === f.target && writable(flags)) {
      await fs.rename(filename, `${filename}.verified`);
      await fs.writeFile(filename, 'replacement');
      const fd = await open(filename, flags, ...args);
      fd.sync = async () => { synced = true; };
      return fd;
    }
    return open(filename, flags, ...args);
  }, () => restore({ journalPath: f.journalPath }));
  assert.equal(result.status, 'interrupted'); assert.equal(result.error.code, 'FILE_CHANGED'); assert.equal(synced, false);
  assert.equal(await fs.readFile(f.target, 'utf8'), 'replacement');
  assert.equal(await fs.readFile(f.stored, 'utf8'), 'original bytes');
});

test('POSIX read-only files retain their mode and restore through read-only flush handles', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t, true);
  const restore = require('../../src/core/quarantine').restore; let syncs = 0;
  const result = await withOpen(async (open, filename, flags, ...args) => {
    const fd = await open(filename, flags, ...args);
    if (filename === f.target) {
      const sync = fd.sync.bind(fd);
      fd.sync = async () => { assert.equal(writable(flags), false); syncs++; return sync(); };
    }
    return fd;
  }, () => restore({ journalPath: f.journalPath }));
  assert.equal(result.status, 'restored'); assert.equal(syncs, 1);
  assert.equal((await fs.stat(f.target)).mode & 0o777, 0o444);
});
