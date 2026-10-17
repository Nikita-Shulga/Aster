'use strict';
const S = require('./security');
const { fs, path, crypto, constants, fail, abort, within, assertAllowed, identity, sameIdentity, lstat, maybeStat, chain, parentChain, regular, hashFile, validIdentity, validAncestors } = S;
const { progress } = require('./scanner');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX = /^[a-f0-9]{64}$/;
const MAX_JOURNAL = 8 * 1024 * 1024;
const activeRoots = new Set();
function privateMode(st, directory) {
  if (st.isSymbolicLink()) fail('SYMLINK', 'Quarantine storage cannot contain symbolic links or junctions');
  if (directory ? !st.isDirectory() : !st.isFile()) fail('UNSAFE_QUARANTINE', 'Quarantine storage must use real directories and regular files');
  if (!directory && st.nlink !== 1n) fail('HARDLINK', 'Quarantine metadata has multiple hard links');
  if (process.platform !== 'win32' && ((Number(st.mode) & 0o077) !== 0 || (typeof process.getuid === 'function' && Number(st.uid) !== process.getuid()))) fail('UNSAFE_PERMISSIONS', 'Quarantine storage must be owned by this user and private');
}
async function syncDirectory(folder) {
  if (process.platform === 'win32') return; // Directory fsync is not exposed reliably by Node on Windows.
  const fd = await fs.open(folder, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try { await fd.sync(); } finally { await fd.close(); }
}
async function syncRestoredFile(filename, expected, ancestors) {
  await parentChain(filename, ancestors);
  const before = await lstat(filename); regular(before, filename);
  if (!sameIdentity(identity(before), expected)) fail('FILE_CHANGED', 'Restored copy changed before syncing; quarantine retained');
  // Windows FlushFileBuffers requires a write-capable handle. Never create or
  // truncate here, and never change read-only attributes to obtain access.
  // POSIX retains read-only opens so read-only copies remain restorable there.
  const access = process.platform === 'win32' ? constants.O_WRONLY : constants.O_RDONLY;
  const fd = await fs.open(filename, access | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const opened = await fd.stat({ bigint: true }); regular(opened, filename);
    if (!sameIdentity(identity(opened), expected)) fail('FILE_CHANGED', 'Restored copy changed while opening for sync; quarantine retained');
    await parentChain(filename, ancestors);
    await fd.sync();
    const synced = await fd.stat({ bigint: true }); regular(synced, filename);
    if (!sameIdentity(identity(synced), expected)) fail('FILE_CHANGED', 'Restored copy changed while syncing; quarantine retained');
  } finally { await fd.close(); }
  await parentChain(filename, ancestors);
  const after = await lstat(filename); regular(after, filename);
  if (!sameIdentity(identity(after), expected)) fail('FILE_CHANGED', 'Restored path changed while syncing; quarantine retained');
  await syncDirectory(path.dirname(filename));
}
async function privateDir(folder, create = false) {
  folder = assertAllowed(folder);
  const parents = await parentChain(folder);
  if (create) { try { await fs.mkdir(folder, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; } }
  await parentChain(folder, parents);
  const st = await lstat(folder); privateMode(st, true);
  const ancestors = await chain(folder);
  return { path: folder, ancestors, dev: String(st.dev), ino: String(st.ino) };
}
async function readPrivateFile(filename, maxBytes) {
  await parentChain(filename);
  const before = await lstat(filename); privateMode(before, false);
  if (before.size > BigInt(maxBytes)) fail('MALFORMED_JOURNAL', 'Metadata is too large');
  const fd = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = await fd.stat({ bigint: true }); privateMode(opened, false);
    if (!sameIdentity(identity(before), identity(opened))) fail('FILE_CHANGED', 'Metadata changed while opening');
    const buffer = Buffer.alloc(Math.min(maxBytes, Number(before.size)) + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await fd.read(buffer, total, buffer.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > maxBytes || total !== Number(before.size) || !sameIdentity(identity(before), identity(await fd.stat({ bigint: true })))) fail('FILE_CHANGED', 'Metadata changed while reading');
    return buffer.subarray(0, total);
  } finally { await fd.close(); }
}
async function keyFor(root, create = false) {
  const filename = path.join(root.path, '.aster-journal-key');
  await chain(root.path, { expected: root.ancestors });
  if (create) {
    let handle;
    try { handle = await fs.open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600); }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
    if (handle) { try { await handle.writeFile(crypto.randomBytes(32).toString('hex')); await handle.sync(); } finally { await handle.close(); } await syncDirectory(root.path); }
  }
  const data = (await readPrivateFile(filename, 64)).toString();
  if (!HEX.test(data)) fail('MALFORMED_JOURNAL', 'Invalid quarantine authentication key');
  return Buffer.from(data, 'hex');
}
const sign = (payload, key) => crypto.createHmac('sha256', key).update(JSON.stringify(payload)).digest('hex');
async function saveJournal(context) {
  const { payload, key, journalPath, directory, root } = context;
  await chain(root.path, { expected: root.ancestors });
  await chain(directory.path, { expected: directory.ancestors });
  const data = JSON.stringify({ payload, signature: sign(payload, key) }, null, 2);
  if (Buffer.byteLength(data) > MAX_JOURNAL) fail('JOURNAL_LIMIT', 'Recovery journal size limit exceeded');
  const temporary = path.join(directory.path, `.journal-${crypto.randomUUID()}.tmp`);
  const fd = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
  try { await fd.writeFile(data); await fd.sync(); } finally { await fd.close(); }
  const old = await maybeStat(journalPath); if (old) privateMode(old, false);
  await chain(directory.path, { expected: directory.ancestors });
  await fs.rename(temporary, journalPath); await syncDirectory(directory.path);
}
function validatePayload(payload, journalPath) {
  if (!payload || payload.version !== 1 || !UUID.test(payload.id) || path.basename(path.dirname(journalPath)) !== `txn-${payload.id}` || path.basename(journalPath) !== 'journal.json') fail('MALFORMED_JOURNAL', 'Invalid recovery journal header');
  if (!['prepared', 'quarantining', 'completed', 'interrupted', 'restoring', 'restored'].includes(payload.status)) fail('MALFORMED_JOURNAL', 'Invalid recovery status');
  if (!Array.isArray(payload.roots) || !payload.roots.length || payload.roots.length > 16 || !Array.isArray(payload.entries) || !payload.entries.length || payload.entries.length > 1000 || !Array.isArray(payload.keepFiles) || payload.keepFiles.length > 1000) fail('MALFORMED_JOURNAL', 'Invalid recovery journal entries');
  for (const root of payload.roots) if (!root || assertAllowed(root.path) !== root.path || !validAncestors(root.ancestors)) fail('MALFORMED_JOURNAL', 'Invalid recovery scope');
  const sources = new Set(), destinations = new Set();
  for (const entry of payload.entries) {
    if (!entry || !UUID.test(entry.id) || entry.destination !== `${entry.id}.bin` || !HEX.test(entry.sha256) || !validIdentity(entry.identity) || !validAncestors(entry.ancestors) || !['pending', 'moved', 'restored'].includes(entry.status)) fail('MALFORMED_JOURNAL', 'Invalid recovery file');
    const source = assertAllowed(entry.source);
    if (source !== entry.source || !payload.roots.some(root => within(root.path, source)) || within(path.dirname(path.dirname(journalPath)), source, true) || sources.has(source) || destinations.has(entry.destination)) fail('MALFORMED_JOURNAL', 'Recovery paths are outside their scope or collide');
    sources.add(source); destinations.add(entry.destination);
    if ((entry.restoredIdentity && !validIdentity(entry.restoredIdentity)) || (entry.movedIdentity && !validIdentity(entry.movedIdentity))) fail('MALFORMED_JOURNAL', 'Invalid moved-file identity');
  }
  for (const keep of payload.keepFiles) if (!keep || assertAllowed(keep.path) !== keep.path || !validIdentity(keep.identity) || !HEX.test(keep.sha256) || !validAncestors(keep.ancestors) || sources.has(keep.path) || !payload.roots.some(root => within(root.path, keep.path))) fail('MALFORMED_JOURNAL', 'Invalid duplicate keeper');
}
async function loadJournal(journalPath) {
  journalPath = assertAllowed(journalPath);
  if (path.basename(journalPath) !== 'journal.json') fail('MALFORMED_JOURNAL', 'Select an Aster recovery journal');
  const root = await privateDir(path.dirname(path.dirname(journalPath))), directory = await privateDir(path.dirname(journalPath));
  const key = await keyFor(root);
  let wrapper;
  try { wrapper = JSON.parse((await readPrivateFile(journalPath, MAX_JOURNAL)).toString('utf8')); } catch (error) { if (error instanceof SyntaxError) fail('MALFORMED_JOURNAL', 'Recovery journal is not valid JSON'); throw error; }
  if (!wrapper || !HEX.test(wrapper.signature || '') || !wrapper.payload) fail('MALFORMED_JOURNAL', 'Recovery journal signature is missing');
  const expected = sign(wrapper.payload, key);
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(wrapper.signature, 'hex'))) fail('JOURNAL_TAMPERED', 'Recovery journal authentication failed');
  validatePayload(wrapper.payload, journalPath);
  return { payload: wrapper.payload, key, journalPath, directory, root };
}
function publicJournal(context) {
  const { payload, journalPath } = context;
  return { id: payload.id, journalPath, status: payload.status, createdAt: payload.createdAt, updatedAt: payload.updatedAt, totalBytes: payload.entries.reduce((sum, e) => sum + e.identity.size, 0), movedFiles: payload.entries.filter(e => e.status === 'moved').length, restoredFiles: payload.entries.filter(e => e.status === 'restored').length, entries: payload.entries.map(e => ({ id: e.id, source: e.source, size: e.identity.size, sha256: e.sha256, status: e.status })), error: payload.error || null, freesDiskSpace: false, recoveryCopiesRetained: true };
}
async function verifyFile(file, signal, moved = false) {
  const hashed = await hashFile(file.path, file.identity, { signal, ancestors: file.ancestors, moved });
  if (hashed.sha256 !== file.sha256) fail('CONTENT_CHANGED', `File content changed: ${file.path}`);
  return hashed;
}
async function verifyKeepers(keepers, signal) { for (const file of keepers) { abort(signal); await verifyFile(file, signal); } }
async function checkCapacity(folder, bytes = 1024 * 1024) {
  let st; try { st = await fs.statfs(folder, { bigint: true }); } catch { fail('CAPACITY_UNAVAILABLE', 'Free filesystem capacity could not be verified'); }
  if (st.bavail * st.bsize < BigInt(bytes)) fail('INSUFFICIENT_SPACE', 'Insufficient free capacity for durable recovery metadata');
}
async function quarantine(plan, options = {}) {
  const { signal, onProgress } = options;
  abort(signal);
  const qpath = assertAllowed(options.quarantineRoot);
  if (plan.files.some(f => within(qpath, f.path, true))) fail('UNSAFE_QUARANTINE', 'Selected files cannot already be inside quarantine');
  // Preflight every file and keeper before moving anything.
  for (const file of plan.files) await verifyFile(file, signal);
  await verifyKeepers(plan.keepFiles, signal);
  const root = await privateDir(qpath, true);
  const lockKey = `${root.dev}:${root.ino}`;
  if (activeRoots.has(lockKey)) fail('BUSY', 'Quarantine storage is already in use');
  activeRoots.add(lockKey);
  let context;
  try {
    if (plan.files.some(file => file.identity.dev !== root.dev)) fail('CROSS_DEVICE', 'Quarantine must be on the same filesystem as every selected file');
    await checkCapacity(root.path);
    abort(signal);
    const key = await keyFor(root, true), id = crypto.randomUUID();
    const transactionPath = path.join(root.path, `txn-${id}`);
    await chain(root.path, { expected: root.ancestors });
    await fs.mkdir(transactionPath, { mode: 0o700 });
    const directory = await privateDir(transactionPath);
    const payload = { version: 1, id, status: 'prepared', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), roots: plan.roots, keepFiles: plan.keepFiles, entries: plan.files.map(file => ({ id: file.id, source: file.path, destination: `${file.id}.bin`, identity: file.identity, ancestors: file.ancestors, sha256: file.sha256, status: 'pending' })) };
    context = { root, directory, key, payload, journalPath: path.join(transactionPath, 'journal.json') };
    await saveJournal(context); await syncDirectory(root.path);
    payload.status = 'quarantining'; await saveJournal(context);
    for (const entry of payload.entries) {
      abort(signal);
      const groupId = plan.files.find(file => file.id === entry.id).duplicateGroupId;
      await verifyKeepers(plan.keepFiles.filter(keeper => groupId && keeper.duplicateGroupId === groupId), signal);
      await verifyFile({ path: entry.source, identity: entry.identity, ancestors: entry.ancestors, sha256: entry.sha256 }, signal);
      const destination = path.join(transactionPath, entry.destination);
      await chain(directory.path, { expected: directory.ancestors });
      if (await maybeStat(destination)) fail('COLLISION', 'Quarantine destination already exists');
      await parentChain(entry.source, entry.ancestors);
      const current = await lstat(entry.source); regular(current, entry.source);
      if (!sameIdentity(identity(current), entry.identity)) fail('FILE_CHANGED', 'Source changed immediately before the move');
      abort(signal);
      await fs.rename(entry.source, destination);
      // Never roll back by overwriting a path. The durable pending entry covers a crash here.
      await syncDirectory(path.dirname(entry.source)); await syncDirectory(directory.path);
      const stored = await lstat(destination); regular(stored, destination);
      if (!sameIdentity(identity(stored), entry.identity, true)) fail('FILE_CHANGED', 'Moved file identity changed; recovery journal retained');
      entry.movedIdentity = identity(stored); entry.status = 'moved'; payload.updatedAt = new Date().toISOString();
      await saveJournal(context);
      progress(onProgress, { phase: 'quarantining', completed: payload.entries.filter(e => e.status === 'moved').length, total: payload.entries.length });
    }
    payload.status = 'completed'; payload.updatedAt = new Date().toISOString(); await saveJournal(context);
    return publicJournal(context);
  } catch (error) {
    if (!context) throw error;
    context.payload.status = 'interrupted'; context.payload.updatedAt = new Date().toISOString(); context.payload.error = { code: error.code || 'IO_ERROR', message: error.message };
    try { await saveJournal(context); } catch (journalError) { fail('JOURNAL_WRITE_FAILED', 'Operation stopped; existing journal must be retained for recovery', { journalPath: context.journalPath, cause: journalError.message }); }
    return publicJournal(context);
  } finally { activeRoots.delete(lockKey); }
}
async function reconcile(context, signal) {
  const states = [];
  for (const entry of context.payload.entries) {
    abort(signal);
    await parentChain(entry.source, entry.ancestors);
    await chain(context.directory.path, { expected: context.directory.ancestors });
    const destination = path.join(context.directory.path, entry.destination);
    const sourceStat = await maybeStat(entry.source), destinationStat = await maybeStat(destination);
    if (!sourceStat && !destinationStat) fail('MISSING_FILE', `Neither source nor quarantine file exists: ${entry.source}`);
    if (destinationStat) {
      regular(destinationStat, destination);
      await verifyFile({ path: destination, identity: entry.movedIdentity || entry.identity, ancestors: context.directory.ancestors, sha256: entry.sha256 }, signal, true);
      if (String(destinationStat.dev) !== entry.identity.dev) fail('CROSS_DEVICE', 'Quarantine filesystem changed');
    }
    if (sourceStat && destinationStat) {
      if (!entry.restoreStarted) fail('COLLISION', `Restore will not overwrite the existing source: ${entry.source}`);
      regular(sourceStat, entry.source);
      const current = identity(sourceStat);
      if (entry.restoredIdentity && !sameIdentity(current, entry.restoredIdentity)) fail('FILE_CHANGED', `Restored copy changed: ${entry.source}`);
      const hash = await hashFile(entry.source, current, { signal, ancestors: entry.ancestors });
      if (hash.sha256 !== entry.sha256) fail('COLLISION', `Existing source is not a verified complete restore: ${entry.source}`);
      entry.restoredIdentity = current;
      states.push({ entry, state: 'restored' });
    } else if (sourceStat) {
      regular(sourceStat, entry.source);
      await verifyFile({ path: entry.source, identity: entry.identity, ancestors: entry.ancestors, sha256: entry.sha256 }, signal, true);
      states.push({ entry, state: 'source' });
    } else states.push({ entry, state: 'destination', destination });
  }
  return states;
}
async function restore(options = {}) {
  const { signal, onProgress } = options;
  abort(signal);
  const journalPath = assertAllowed(options.journalPath);
  const root = await privateDir(path.dirname(path.dirname(journalPath)));
  const lockKey = `${root.dev}:${root.ino}`;
  if (activeRoots.has(lockKey)) fail('BUSY', 'Quarantine storage is already in use');
  activeRoots.add(lockKey);
  let context;
  try {
    context = await loadJournal(journalPath);
    if (context.root.dev !== root.dev || context.root.ino !== root.ino) fail('ANCESTOR_CHANGED', 'Quarantine storage changed while opening recovery');
    const states = await reconcile(context, signal);
    const copyBytes = states.filter(s => s.state === 'destination').reduce((sum, s) => sum + s.entry.identity.size, 0);
    await checkCapacity(context.root.path, copyBytes + 1024 * 1024);
    context.payload.status = 'restoring'; delete context.payload.error; await saveJournal(context);
    for (const { entry, state, destination } of states) {
      abort(signal);
      if (state === 'destination') {
        await verifyFile({ path: destination, identity: entry.movedIdentity || entry.identity, ancestors: context.directory.ancestors, sha256: entry.sha256 }, signal, true);
        await parentChain(entry.source, entry.ancestors);
        if (await maybeStat(entry.source)) fail('COLLISION', `Restore will not overwrite: ${entry.source}`);
        const parent = await lstat(path.dirname(entry.source));
        if (String(parent.dev) !== entry.identity.dev) fail('CROSS_DEVICE', 'Original filesystem changed');
        await chain(context.directory.path, { expected: context.directory.ancestors });
        // Persist intent before an exclusive copy. A crash may leave an incomplete source;
        // recovery refuses that collision and always retains the quarantined original.
        entry.restoreStarted = true; await saveJournal(context);
        abort(signal);
        await fs.copyFile(destination, entry.source, constants.COPYFILE_EXCL);
        const restored = await lstat(entry.source); regular(restored, entry.source);
        const verified = await hashFile(entry.source, identity(restored), { signal, ancestors: entry.ancestors });
        if (verified.sha256 !== entry.sha256) fail('CONTENT_CHANGED', 'Restored copy failed content verification; quarantine retained');
        entry.restoredIdentity = verified.identity;
      }
      // A verified copy found after interruption still needs a successful flush:
      // otherwise retrying a failed sync could incorrectly publish success.
      if (state === 'destination' || state === 'restored') await syncRestoredFile(entry.source, entry.restoredIdentity, entry.ancestors);
      entry.status = 'restored'; context.payload.updatedAt = new Date().toISOString(); await saveJournal(context);
      progress(onProgress, { phase: 'restoring', completed: context.payload.entries.filter(e => e.status === 'restored').length, total: context.payload.entries.length });
    }
    context.payload.status = 'restored'; context.payload.updatedAt = new Date().toISOString(); await saveJournal(context);
    return publicJournal(context);
  } catch (error) {
    if (!context) throw error;
    context.payload.status = 'interrupted'; context.payload.updatedAt = new Date().toISOString(); context.payload.error = { code: error.code || 'IO_ERROR', message: error.message };
    try { await saveJournal(context); } catch (journalError) { fail('JOURNAL_WRITE_FAILED', 'Restore stopped; existing journal must be retained', { journalPath: context.journalPath, cause: journalError.message }); }
    return publicJournal(context);
  } finally { activeRoots.delete(lockKey); }
}
async function inspectJournal(options = {}) { return publicJournal(await loadJournal(options.journalPath)); }
module.exports = { quarantine, restore, inspectJournal };
