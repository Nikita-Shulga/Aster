'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createService } = require('../../src/core');
const FIXTURE_ROOT = path.join(__dirname, '.fixtures');
async function fixture(t) {
  await fs.mkdir(FIXTURE_ROOT, { recursive: true });
  const dir = await fs.mkdtemp(path.join(FIXTURE_ROOT, 'case-'));
  const source = path.join(dir, 'source'), quarantineRoot = path.join(dir, 'quarantine');
  await fs.mkdir(source);
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  const write = async (name, contents = name) => { const target = path.join(source, name); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, contents); return target; };
  return { dir, source, quarantineRoot, write };
}
const enabled = () => createService({ mutationEnabled: true });
async function preview(service, f, names) {
  const scan = await service.scan({ roots: [f.source], limits: { largeFileThreshold: 1 } });
  const plan = await service.createCleanupPlan({ scanId: scan.id, selectedIds: scan.files.filter(file => names.includes(file.name)).map(file => file.id) });
  return { scan, plan };
}
const code = expected => error => error.code === expected;

test('bounded disk scan reports directories, large files, hashes and true duplicates', async t => {
  const f = await fixture(t); await f.write('one.txt', 'same'); await f.write('nested/two.txt', 'same'); await f.write('nested/unique.txt', 'other');
  const phases = [];
  const scan = await enabled().scan({ roots: [f.source], limits: { largeFileThreshold: 1 }, onProgress: p => phases.push(p.phase) });
  assert.equal(scan.totals.files, 3); assert.equal(scan.totals.bytes, 13); assert.equal(scan.totals.hashedBytes, 8);
  assert.equal(scan.directories.find(d => d.path === f.source).bytes, 13);
  assert.equal(scan.duplicates.length, 1); assert.equal(scan.duplicates[0].recoverableBytes, 4); assert.equal(scan.largeFiles.length, 3);
  assert.match(scan.files[0].modifiedAt, /^\d{4}-/); assert.equal(scan.files[0].category, 'document');
  assert.equal(scan.duplicates[0].sha256, crypto.createHash('sha256').update('same').digest('hex'));
  assert.ok(phases.includes('hashing')); assert.equal(phases.at(-1), 'complete');
});

test('explicit scope rejects relative, traversal, protected and overlapping roots', async t => {
  const f = await fixture(t), service = enabled(); await fs.mkdir(path.join(f.source, 'child'));
  await assert.rejects(service.scan({ roots: ['.'] }), code('INVALID_PATH'));
  await assert.rejects(service.scan({ roots: [f.source + '/child/..'] }), code('INVALID_PATH'));
  await assert.rejects(service.scan({ roots: [path.parse(f.source).root] }), code('PROTECTED_PATH'));
  await assert.rejects(service.scan({ roots: [f.source, path.join(f.source, 'child')] }), code('OVERLAPPING_ROOTS'));
  await assert.rejects(service.scan({ roots: [f.source], exclusions: [f.dir] }), code('INVALID_EXCLUSION'));
});

test('hidden entries are opt-in while sensitive exclusions stay excluded', async t => {
  const f = await fixture(t); await f.write('.hidden.txt', 'hidden'); await f.write('.ssh/key', 'secret'); await f.write('visible.txt', 'visible');
  const service = enabled();
  assert.equal((await service.scan({ roots: [f.source] })).files.length, 1);
  const visible = await service.scan({ roots: [f.source], includeHidden: true });
  assert.equal(visible.files.length, 2); assert.ok(!visible.files.some(x => x.path.includes('.ssh')));
  const excluded = await service.scan({ roots: [f.source], exclusions: [path.join(f.source, 'visible.txt')] }); assert.equal(excluded.files.length, 0);
});

test('symlink roots, symlink parents, child symlinks and hardlinked files are excluded', async t => {
  const f = await fixture(t); const a = await f.write('a', 'content');
  await fs.symlink(f.source, path.join(f.dir, 'link'), 'dir');
  const service = enabled();
  await assert.rejects(service.scan({ roots: [path.join(f.dir, 'link')] }), code('SYMLINK'));
  await fs.mkdir(path.join(f.source, 'child'));
  await assert.rejects(service.scan({ roots: [path.join(f.dir, 'link', 'child')] }), code('SYMLINK'));
  await fs.symlink(a, path.join(f.source, 'sym'));
  await fs.link(a, path.join(f.source, 'hard'));
  const scan = await service.scan({ roots: [f.source] }); assert.equal(scan.files.length, 0);
  assert.ok(scan.warnings.some(w => w.code === 'SYMLINK')); assert.ok(scan.warnings.some(w => w.code === 'HARDLINK'));
});

test('limits bound traversal and hashing; cancellation is visible', async t => {
  const f = await fixture(t); for (let n = 0; n < 8; n++) await f.write(`file-${n}`, 'same');
  const service = enabled();
  const limited = await service.scan({ roots: [f.source], limits: { maxFiles: 2, maxHashBytes: 0 } });
  assert.equal(limited.files.length, 2); assert.equal(limited.truncated, true); assert.equal(limited.duplicates.length, 0);
  const controller = new AbortController();
  const cancelled = await service.scan({ roots: [f.source], signal: controller.signal, onProgress: p => { if (p.phase === 'hashing') controller.abort(); } });
  assert.equal(cancelled.cancelled, true);
  await assert.rejects(service.createCleanupPlan({ scanId: cancelled.id, selectedIds: [cancelled.files[0].id] }), code('CANCELLED_SCAN'));
  await assert.rejects(service.scan({ roots: [f.source], signal: controller.signal }), code('CANCELLED'));
});

test('preview protects last duplicate, uses trusted scan state, and detects changes', async t => {
  const f = await fixture(t); await f.write('a', 'same'); await f.write('b', 'same');
  const service = enabled(), scan = await service.scan({ roots: [f.source] });
  await assert.rejects(service.createCleanupPlan({ scanId: scan.id, selectedIds: scan.files.map(x => x.id) }), code('LAST_COPY'));
  await assert.rejects(service.createCleanupPlan({ scanId: scan.id, selectedIds: ['forged'] }), code('INVALID_SELECTION'));
  const selected = scan.files[0]; selected.path = path.join(f.dir, 'unrelated'); selected.size = 999;
  const plan = await service.createCleanupPlan({ scanId: scan.id, selectedIds: [selected.id] });
  assert.equal(plan.files[0].size, 4); assert.equal(plan.keepFiles.length, 1); assert.notEqual(plan.files[0].path, selected.path);
  await fs.writeFile(plan.files[0].path, 'new-content');
  await assert.rejects(service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot }), code('FILE_CHANGED'));
  assert.equal(await fs.readFile(plan.files[0].path, 'utf8'), 'new-content');
});

test('default service is read-only and plans never authorize themselves', async t => {
  const f = await fixture(t); await f.write('file', 'content'); const service = createService(); const { plan } = await preview(service, f, ['file']);
  await assert.rejects(service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot }), code('MUTATIONS_DISABLED'));
  await assert.rejects(service.restore({ journalPath: '/fake/journal.json' }), code('MUTATIONS_DISABLED'));
  await assert.rejects(enabled().quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot }), code('UNKNOWN_PLAN'));
});

test('quarantine is reversible, authenticated, same-device and does not claim free space', async t => {
  const f = await fixture(t), target = await f.write('file.txt', 'valuable original'); const service = enabled(); const { plan } = await preview(service, f, ['file.txt']);
  const moved = await service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot });
  assert.equal(moved.status, 'completed'); assert.equal(moved.movedFiles, 1); assert.equal(moved.freesDiskSpace, false);
  await assert.rejects(fs.stat(target), { code: 'ENOENT' });
  assert.equal((await service.inspectJournal({ journalPath: moved.journalPath })).status, 'completed');
  const restored = await service.restore({ journalPath: moved.journalPath }); assert.equal(restored.status, 'restored'); assert.equal(restored.restoredFiles, 1);
  assert.equal(await fs.readFile(target, 'utf8'), 'valuable original');
  assert.equal(await fs.readFile(path.join(path.dirname(moved.journalPath), `${plan.files[0].id}.bin`), 'utf8'), 'valuable original');
  assert.equal((await service.restore({ journalPath: moved.journalPath })).status, 'restored');
});

test('changed keeper and replaced ancestor prevent quarantine', async t => {
  const f = await fixture(t); await f.write('sub/a', 'same'); await f.write('sub/b', 'same'); const service = enabled(); const { plan } = await preview(service, f, ['a']);
  await fs.writeFile(plan.keepFiles[0].path, 'lost keeper');
  await assert.rejects(service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot }), code('FILE_CHANGED'));
  const next = await preview(service, f, ['a']);
  await fs.rename(path.join(f.source, 'sub'), path.join(f.source, 'old'));
  await fs.symlink(path.join(f.source, 'old'), path.join(f.source, 'sub'), 'dir');
  await assert.rejects(service.quarantine({ planId: next.plan.id, quarantineRoot: f.quarantineRoot }), code('SYMLINK'));
  assert.equal(await fs.readFile(path.join(f.source, 'old/a'), 'utf8'), 'same');
});

test('quarantine rejects symlink storage and non-private existing directories', async t => {
  const f = await fixture(t); await f.write('file'); const service = enabled(); const { plan } = await preview(service, f, ['file']);
  await fs.symlink(f.source, f.quarantineRoot, 'dir');
  await assert.rejects(service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot }), code('SYMLINK'));
  await fs.unlink(f.quarantineRoot); await fs.mkdir(f.quarantineRoot, { mode: 0o755 });
  if (process.platform !== 'win32') await assert.rejects(service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot }), code('UNSAFE_PERMISSIONS'));
});

test('cancellation after one move leaves a complete recovery journal', async t => {
  const f = await fixture(t); await f.write('a', 'first'); await f.write('b', 'second'); const service = enabled(); const { plan } = await preview(service, f, ['a', 'b']);
  const controller = new AbortController();
  const moved = await service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot, signal: controller.signal, onProgress: () => controller.abort() });
  assert.equal(moved.status, 'interrupted'); assert.equal(moved.error.code, 'CANCELLED'); assert.equal(moved.movedFiles, 1);
  const restored = await service.restore({ journalPath: moved.journalPath }); assert.equal(restored.status, 'restored');
  assert.equal(await fs.readFile(path.join(f.source, 'a'), 'utf8'), 'first'); assert.equal(await fs.readFile(path.join(f.source, 'b'), 'utf8'), 'second');
});

test('an interrupted move before journal update is discovered and recovered', async t => {
  const f = await fixture(t), target = await f.write('file', 'recover me'); const service = enabled(); const { plan } = await preview(service, f, ['file']);
  const rename = fs.rename;
  fs.rename = async (from, to) => { await rename(from, to); if (from === target) { const e = new Error('Simulated process interruption after move'); e.code = 'EIO'; throw e; } };
  let moved; try { moved = await service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot }); } finally { fs.rename = rename; }
  assert.equal(moved.status, 'interrupted'); assert.equal(moved.entries[0].status, 'pending');
  assert.equal((await enabled().restore({ journalPath: moved.journalPath })).status, 'restored');
  assert.equal(await fs.readFile(target, 'utf8'), 'recover me');
});

test('restore refuses destination collisions without overwriting either file', async t => {
  const f = await fixture(t), target = await f.write('file', 'original'); const service = enabled(); const { plan } = await preview(service, f, ['file']);
  const moved = await service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot }); await fs.writeFile(target, 'new occupant');
  const result = await service.restore({ journalPath: moved.journalPath }); assert.equal(result.status, 'interrupted'); assert.equal(result.error.code, 'COLLISION');
  assert.equal(await fs.readFile(target, 'utf8'), 'new occupant');
  assert.equal(await fs.readFile(path.join(path.dirname(moved.journalPath), `${plan.files[0].id}.bin`), 'utf8'), 'original');
});

test('exclusive restore also refuses a destination created after collision preflight', async t => {
  const f = await fixture(t), target = await f.write('file', 'original'); const service = enabled(); const { plan } = await preview(service, f, ['file']);
  const moved = await service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot });
  const copy = fs.copyFile; fs.copyFile = async (from, to, flags) => { if (to === target) await fs.writeFile(to, 'racing writer', { flag: 'wx' }); return copy(from, to, flags); };
  let result; try { result = await service.restore({ journalPath: moved.journalPath }); } finally { fs.copyFile = copy; }
  assert.equal(result.status, 'interrupted'); assert.equal(result.error.code, 'EEXIST'); assert.equal(await fs.readFile(target, 'utf8'), 'racing writer');
});

test('a full interrupted restore copy can be verified and resumed', async t => {
  const f = await fixture(t), target = await f.write('file', 'original'); const service = enabled(); const { plan } = await preview(service, f, ['file']);
  const moved = await service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot });
  const copy = fs.copyFile; fs.copyFile = async (...args) => { await copy(...args); const e = new Error('Interruption after full copy'); e.code = 'EIO'; throw e; };
  try { assert.equal((await service.restore({ journalPath: moved.journalPath })).status, 'interrupted'); } finally { fs.copyFile = copy; }
  assert.equal((await enabled().restore({ journalPath: moved.journalPath })).status, 'restored'); assert.equal(await fs.readFile(target, 'utf8'), 'original');
});

test('tampered, malformed and symlink journals cannot authorize a restore', async t => {
  const f = await fixture(t); await f.write('file', 'original'); const service = enabled(); const { plan } = await preview(service, f, ['file']);
  const moved = await service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot });
  const original = await fs.readFile(moved.journalPath, 'utf8'), wrapper = JSON.parse(original); wrapper.payload.entries[0].source = path.join(f.dir, 'outside');
  await fs.writeFile(moved.journalPath, JSON.stringify(wrapper));
  await assert.rejects(service.restore({ journalPath: moved.journalPath }), code('JOURNAL_TAMPERED'));
  await fs.writeFile(moved.journalPath, '{broken'); await assert.rejects(service.restore({ journalPath: moved.journalPath }), code('MALFORMED_JOURNAL'));
  await fs.writeFile(moved.journalPath, original); const renamed = moved.journalPath + '.real'; await fs.rename(moved.journalPath, renamed); await fs.symlink(renamed, moved.journalPath);
  await assert.rejects(service.restore({ journalPath: moved.journalPath }), code('SYMLINK'));
});

test('cross-device and low capacity preflight refuse before moving files', async t => {
  const f = await fixture(t), target = await f.write('file', 'original'); const service = enabled(); const { plan } = await preview(service, f, ['file']);
  const statfs = fs.statfs; fs.statfs = async () => ({ bavail: 0n, bsize: 4096n });
  try { await assert.rejects(service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot }), code('INSUFFICIENT_SPACE')); } finally { fs.statfs = statfs; }
  assert.equal(await fs.readFile(target, 'utf8'), 'original');
  const stat = fs.lstat;
  fs.lstat = async (p, options) => { const out = await stat(p, options); if (p === f.quarantineRoot) out.dev = 999999999n; return out; };
  try { await assert.rejects(service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot }), code('CROSS_DEVICE')); } finally { fs.lstat = stat; }
  assert.equal(await fs.readFile(target, 'utf8'), 'original');
});

test('permanent exclusions also reject a root nested inside a sensitive directory', async t => {
  const f = await fixture(t); await f.write('.ssh/nested/key', 'secret');
  await assert.rejects(enabled().scan({ roots: [path.join(f.source, '.ssh', 'nested')], includeHidden: true }), code('PROTECTED_PATH'));
});

test('cancellation with no duplicate candidates and at final preview callback is honored', async t => {
  const f = await fixture(t); await f.write('a', 'unique'); const service = enabled();
  const scanSignal = new AbortController();
  const stopped = await service.scan({ roots: [f.source], signal: scanSignal.signal, onProgress: p => { if (p.phase === 'hashing') scanSignal.abort(); } });
  assert.equal(stopped.cancelled, true);
  const scan = await service.scan({ roots: [f.source] }), planSignal = new AbortController();
  await assert.rejects(service.createCleanupPlan({ scanId: scan.id, selectedIds: [scan.files[0].id], signal: planSignal.signal, onProgress: () => planSignal.abort() }), code('CANCELLED'));
});

test('inode aliases cannot form false duplicate keepers', async t => {
  const f = await fixture(t); const first = await f.write('a', 'same'), second = await f.write('b', 'same');
  const stat = fs.lstat, firstStat = await stat(first, { bigint: true });
  fs.lstat = async (p, options) => { const out = await stat(p, options); if (p === second) out.ino = firstStat.ino; return out; };
  let scan; try { scan = await enabled().scan({ roots: [f.source] }); } finally { fs.lstat = stat; }
  assert.equal(scan.files.length, 1); assert.equal(scan.duplicates.length, 0); assert.ok(scan.warnings.some(w => w.code === 'PATH_ALIAS'));
});

test('macOS protected paths and overlapping roots are case-folded conservatively', () => {
  const security = require('../../src/core/security'), descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  try { assert.throws(() => security.assertAllowed('/system/example'), code('PROTECTED_PATH')); assert.equal(security.within('/Users/Name', '/users/name/a'), true); }
  finally { Object.defineProperty(process, 'platform', descriptor); }
});

test('partial restore interruption retains both files and refuses to replace the partial copy', async t => {
  const f = await fixture(t), target = await f.write('file', 'complete original'); const service = enabled(); const { plan } = await preview(service, f, ['file']);
  const moved = await service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot });
  const copy = fs.copyFile; fs.copyFile = async (from, to) => { await fs.writeFile(to, 'partial', { flag: 'wx' }); const error = new Error('Interrupted partial copy'); error.code = 'EIO'; throw error; };
  try { assert.equal((await service.restore({ journalPath: moved.journalPath })).status, 'interrupted'); } finally { fs.copyFile = copy; }
  const second = await service.restore({ journalPath: moved.journalPath }); assert.equal(second.status, 'interrupted'); assert.equal(second.error.code, 'COLLISION');
  assert.equal(await fs.readFile(target, 'utf8'), 'partial');
  assert.equal(await fs.readFile(path.join(path.dirname(moved.journalPath), `${plan.files[0].id}.bin`), 'utf8'), 'complete original');
});

test('restore rejects a symlinked original parent and a changed quarantined original', async t => {
  const f = await fixture(t); await f.write('sub/file', 'original'); const service = enabled(); const { plan } = await preview(service, f, ['file']);
  const moved = await service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot });
  await fs.rename(path.join(f.source, 'sub'), path.join(f.source, 'old')); await fs.symlink(path.join(f.source, 'old'), path.join(f.source, 'sub'), 'dir');
  const unsafe = await service.restore({ journalPath: moved.journalPath }); assert.equal(unsafe.error.code, 'SYMLINK');
  await fs.unlink(path.join(f.source, 'sub')); await fs.rename(path.join(f.source, 'old'), path.join(f.source, 'sub'));
  await fs.writeFile(path.join(path.dirname(moved.journalPath), `${plan.files[0].id}.bin`), 'modified');
  const changed = await service.restore({ journalPath: moved.journalPath }); assert.equal(changed.error.code, 'FILE_CHANGED');
  await assert.rejects(fs.stat(path.join(f.source, 'sub/file')), { code: 'ENOENT' });
});

test('multiple service instances serialize recovery before loading mutable journal state', async t => {
  const f = await fixture(t); await f.write('file', 'original'); const service = enabled(); const { plan } = await preview(service, f, ['file']);
  const moved = await service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot });
  const copy = fs.copyFile; let release, entered;
  const held = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
  fs.copyFile = async (...args) => { entered(); await held; return copy(...args); };
  try {
    const first = service.restore({ journalPath: moved.journalPath }); await started;
    await assert.rejects(enabled().restore({ journalPath: moved.journalPath }), code('BUSY'));
    release(); assert.equal((await first).status, 'restored');
  } finally { release(); fs.copyFile = copy; }
  assert.equal((await enabled().inspectJournal({ journalPath: moved.journalPath })).status, 'restored');
});

test('root inode aliases are rejected before the filesystem is walked', async t => {
  const f = await fixture(t), other = path.join(f.dir, 'other'); await fs.mkdir(other); await f.write('file', 'original');
  const stat = fs.lstat, rootStat = await stat(f.source, { bigint: true });
  fs.lstat = async (p, options) => { const out = await stat(p, options); if (p === other) { out.dev = rootStat.dev; out.ino = rootStat.ino; } return out; };
  try { await assert.rejects(enabled().scan({ roots: [f.source, other] }), code('OVERLAPPING_ROOTS')); } finally { fs.lstat = stat; }
});

test('scan duration is checked between content read chunks', async t => {
  const f = await fixture(t); const contents = Buffer.alloc(300 * 1024, 7); await f.write('a', contents); await f.write('b', contents);
  const originalNow = Date.now, originalOpen = fs.open, start = originalNow(); let now = start;
  Date.now = () => now;
  fs.open = async (p, ...args) => {
    const handle = await originalOpen(p, ...args);
    if (String(p).startsWith(f.source + path.sep)) {
      const read = handle.read.bind(handle);
      handle.read = async (...readArgs) => { const result = await read(...readArgs); now = start + 20000; return result; };
    }
    return handle;
  };
  let scan; try { scan = await enabled().scan({ roots: [f.source], limits: { maxDurationMs: 10000 } }); } finally { Date.now = originalNow; fs.open = originalOpen; }
  assert.equal(scan.truncated, true); assert.equal(scan.totals.hashedBytes, 256 * 1024); assert.ok(scan.warnings.some(w => w.code === 'SCAN_LIMIT'));
});

test('journal reads remain bounded if the metadata grows during reading', async t => {
  const f = await fixture(t); await f.write('file', 'original'); const service = enabled(); const { plan } = await preview(service, f, ['file']);
  const moved = await service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot }), initialSize = (await fs.stat(moved.journalPath)).size;
  const originalOpen = fs.open; let maxRead = 0, grew = false;
  fs.open = async (p, ...args) => {
    const handle = await originalOpen(p, ...args);
    if (p === moved.journalPath) {
      const read = handle.read.bind(handle);
      handle.read = async (buffer, offset, length, position) => { maxRead = Math.max(maxRead, length); if (!grew) { grew = true; await fs.appendFile(p, 'x'.repeat(20000)); } return read(buffer, offset, length, position); };
    }
    return handle;
  };
  try { await assert.rejects(service.inspectJournal({ journalPath: moved.journalPath }), code('FILE_CHANGED')); } finally { fs.open = originalOpen; }
  assert.ok(maxRead <= initialSize + 1);
});

test('restore cancellation keeps completed copies and resumes remaining files safely', async t => {
  const f = await fixture(t); await f.write('a', 'first'); await f.write('b', 'second'); const service = enabled(); const { plan } = await preview(service, f, ['a', 'b']);
  const moved = await service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot }); const controller = new AbortController();
  const stopped = await service.restore({ journalPath: moved.journalPath, signal: controller.signal, onProgress: () => controller.abort() });
  assert.equal(stopped.status, 'interrupted'); assert.equal(stopped.error.code, 'CANCELLED'); assert.equal(stopped.restoredFiles, 1);
  const resumed = await enabled().restore({ journalPath: moved.journalPath }); assert.equal(resumed.status, 'restored'); assert.equal(resumed.restoredFiles, 2);
  assert.equal(await fs.readFile(path.join(f.source, 'a'), 'utf8'), 'first'); assert.equal(await fs.readFile(path.join(f.source, 'b'), 'utf8'), 'second');
});

test('even authenticated malformed journal paths cannot escape recovery scope', async t => {
  const f = await fixture(t); await f.write('file', 'original'); const service = enabled(); const { plan } = await preview(service, f, ['file']);
  const moved = await service.quarantine({ planId: plan.id, quarantineRoot: f.quarantineRoot });
  const original = JSON.parse(await fs.readFile(moved.journalPath, 'utf8')), key = Buffer.from(await fs.readFile(path.join(f.quarantineRoot, '.aster-journal-key'), 'utf8'), 'hex');
  const rewrite = async change => { const wrapper = structuredClone(original); change(wrapper.payload); wrapper.signature = crypto.createHmac('sha256', key).update(JSON.stringify(wrapper.payload)).digest('hex'); await fs.writeFile(moved.journalPath, JSON.stringify(wrapper)); };
  await rewrite(payload => { payload.entries[0].destination = '../escape'; });
  await assert.rejects(service.restore({ journalPath: moved.journalPath }), code('MALFORMED_JOURNAL'));
  await rewrite(payload => { payload.entries[0].source = path.join(f.dir, 'outside'); });
  await assert.rejects(service.restore({ journalPath: moved.journalPath }), code('MALFORMED_JOURNAL'));
  await rewrite(payload => { payload.entries[0].status = 'delete'; });
  await assert.rejects(service.restore({ journalPath: moved.journalPath }), code('MALFORMED_JOURNAL'));
  await assert.rejects(fs.stat(path.join(f.dir, 'outside')), { code: 'ENOENT' });
});
