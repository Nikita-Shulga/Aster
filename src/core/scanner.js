'use strict';
const {browserProfilePath}=require('./care');
const S = require('./security');
const { fs, path, crypto, fail, abort, within, absolute, assertAllowed, identity, chain, parentChain, lstat, regular, hashFile } = S;
const DEFAULT_LIMITS = Object.freeze({ maxEntries: 50000, maxFiles: 20000, maxDepth: 32, maxDurationMs: 120000, maxHashBytes: 1024 ** 3, maxHashFileBytes: 512 * 1024 ** 2, largeFileThreshold: 50 * 1024 ** 2, maxLargeFiles: 100 });
const HARD_LIMITS = { maxEntries: 200000, maxFiles: 100000, maxDepth: 64, maxDurationMs: 600000, maxHashBytes: 16 * 1024 ** 3, maxHashFileBytes: 8 * 1024 ** 3, largeFileThreshold: Number.MAX_SAFE_INTEGER, maxLargeFiles: 1000 };
const DEFAULT_EXCLUDED_NAMES = Object.freeze(['.git', '.ssh', '.aws', '.gnupg', '.Trash', '.Trashes', '$RECYCLE.BIN', 'System Volume Information', '.aster-quarantine']);
function getLimits(requested = {}) {
  if (!requested || typeof requested !== 'object' || Array.isArray(requested)) fail('INVALID_LIMITS', 'Limits must be an object');
  const limits = { ...DEFAULT_LIMITS };
  for (const [key, value] of Object.entries(requested)) {
    if (!(key in limits) || !Number.isSafeInteger(value) || value < 0 || value > HARD_LIMITS[key]) fail('INVALID_LIMITS', `Invalid scan limit: ${key}`);
    limits[key] = value;
  }
  return limits;
}
function category(filename) {
  const ext = path.extname(filename).toLowerCase();
  const groups = { image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.svg'], video: ['.mp4', '.mov', '.mkv', '.avi'], audio: ['.mp3', '.wav', '.flac', '.m4a'], document: ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.md'], archive: ['.zip', '.tar', '.gz', '.7z', '.rar'], code: ['.js', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.json'] };
  return Object.keys(groups).find(key => groups[key].includes(ext)) || 'other';
}
function progress(callback, value) { try { callback?.(value); } catch { /* Observers cannot change safety decisions. */ } }
async function scan(options = {}) {
  const { signal, onProgress } = options;
  if (!Array.isArray(options.roots) || options.roots.length < 1 || options.roots.length > 16) fail('INVALID_SCOPE', 'Select between one and sixteen explicit folders');
  const roots = options.roots.map(assertAllowed);
  if (roots.some(root => root.split(path.sep).some(part => DEFAULT_EXCLUDED_NAMES.some(name => name.toLowerCase() === part.toLowerCase())))) fail('PROTECTED_PATH', 'The selected scope is inside a permanently excluded directory');
  if (roots.some((r, i) => roots.some((other, j) => j !== i && within(other, r, true)))) fail('OVERLAPPING_ROOTS', 'Scan roots must be distinct and must not overlap');
  if (options.exclusions !== undefined && !Array.isArray(options.exclusions)) fail('INVALID_EXCLUSION', 'Exclusions must be absolute paths in an array');
  const includeHidden = options.includeHidden === true;
  const exclusions = (options.exclusions || []).map(absolute);
  if (exclusions.length > 1000 || exclusions.some(x => !roots.some(r => within(r, x, true)))) fail('INVALID_EXCLUSION', 'Each exclusion must be within a selected root');
  const limits = getLimits(options.limits);
  const startedAt = new Date().toISOString(), start = Date.now();
  const result = { id: crypto.randomUUID(), roots, exclusions, includeHidden, excludedNames: [...DEFAULT_EXCLUDED_NAMES], limits, files: [], directories: [], duplicates: [], largeFiles: [], totals: { files: 0, bytes: 0, hashedBytes: 0, visitedEntries: 0 }, warnings: [], warningsOmitted: 0, truncated: false, cancelled: false, startedAt, completedAt: null };
  const internals = { roots: [], files: new Map() }, dirs = new Map(), seenDirectories = new Set(), seenFiles = new Set();
  const warn = (p, code, message) => { if (result.warnings.length < 200) result.warnings.push({ path: p, code, message }); else result.warningsOmitted++; };
  const check = () => {
    abort(signal);
    if (Date.now() - start >= limits.maxDurationMs) fail('SCAN_LIMIT', 'Scan duration limit reached');
  };
  const emit = phase => progress(onProgress, { phase, files: result.totals.files, bytes: result.totals.bytes, hashedBytes: result.totals.hashedBytes, visitedEntries: result.totals.visitedEntries });
  const excluded = p => DEFAULT_EXCLUDED_NAMES.some(x => x.toLowerCase() === path.basename(p).toLowerCase()) || exclusions.some(x => within(x, p, true));
  async function walk(folder, root, rootDevice, depth, ancestors) {
    check();
    if (depth > limits.maxDepth) { result.truncated = true; warn(folder, 'DEPTH_LIMIT', 'Directory depth limit reached'); return; }
    await chain(folder, { expected: ancestors });
    const st = await lstat(folder);
    if (!st.isDirectory() || st.isSymbolicLink()) fail('DIRECTORY_CHANGED', `Directory changed: ${folder}`);
    if (String(st.dev) !== rootDevice) { warn(folder, 'MOUNT_BOUNDARY', 'A different filesystem was excluded'); return; }
    const directoryKey = `${st.dev}:${st.ino}`;
    if (seenDirectories.has(directoryKey)) { warn(folder, 'PATH_ALIAS', 'A second path to an already visited directory was excluded'); return; }
    seenDirectories.add(directoryKey);
    const directory = { path: folder, root, name: path.basename(folder), bytes: 0, fileCount: 0 };
    dirs.set(folder, directory); result.directories.push(directory);
    const handle = await fs.opendir(folder);
    try {
      for await (const entry of handle) {
        check();
        result.totals.visitedEntries++;
        if (result.totals.visitedEntries > limits.maxEntries) fail('SCAN_LIMIT', 'Filesystem entry limit reached');
        const candidate = path.join(folder, entry.name);
        if (!within(root, candidate) || excluded(candidate) || (!includeHidden && entry.name.startsWith('.'))) continue;
        try {
          assertAllowed(candidate);
          await chain(folder, { expected: ancestors });
          const stat = await lstat(candidate);
          if (stat.isSymbolicLink()) { warn(candidate, 'SYMLINK', 'Symbolic link or junction skipped'); continue; }
          if (String(stat.dev) !== rootDevice) { warn(candidate, 'MOUNT_BOUNDARY', 'A different filesystem was excluded'); continue; }
          if (stat.isDirectory()) {
            const next = [...ancestors, { path: candidate, dev: String(stat.dev), ino: String(stat.ino) }];
            await walk(candidate, root, rootDevice, depth + 1, next);
          } else if (stat.isFile()) {
            regular(stat, candidate);
            const fileKey = `${stat.dev}:${stat.ino}`;
            if (seenFiles.has(fileKey)) { warn(candidate, 'PATH_ALIAS', 'A second path to the same physical file was excluded'); continue; }
            seenFiles.add(fileKey);
            if (result.totals.bytes + Number(stat.size) > Number.MAX_SAFE_INTEGER) fail('SCAN_LIMIT', 'Total file sizes exceed safe numerical precision');
            if (result.files.length >= limits.maxFiles) fail('SCAN_LIMIT', 'File count limit reached');
            const file = { id: crypto.randomUUID(), path: candidate, root, name: entry.name, size: Number(stat.size), mtimeMs: Number(stat.mtimeNs) / 1e6, modifiedAt: new Date(Number(stat.mtimeNs) / 1e6).toISOString(), category: category(entry.name), sha256: null, duplicateGroupId: null };
            result.files.push(file); internals.files.set(file.id, { ...file, identity: identity(stat), ancestors: [...ancestors] });
            result.totals.files++; result.totals.bytes += file.size;
            let parent = folder;
            while (within(root, parent, true)) { const d = dirs.get(parent); if (d) { d.bytes += file.size; d.fileCount++; } if (parent === root) break; parent = path.dirname(parent); }
            if (result.totals.files % 100 === 0) emit('walking');
          } else warn(candidate, 'SPECIAL_FILE', 'Non-regular file skipped');
        } catch (error) {
          if (['CANCELLED', 'SCAN_LIMIT'].includes(error.code)) throw error;
          warn(candidate, error.code || 'READ_ERROR', error.message);
        }
      }
    } finally { try { await handle.close(); } catch (e) { if (e.code !== 'ERR_DIR_CLOSED') throw e; } }
    await chain(folder, { expected: ancestors });
  }
  // Validate every root before walking any of them; no implicit fallback scope.
  for (const root of roots) {
    abort(signal);
    const ancestors = await chain(root), stat = await lstat(root);
    if (!stat.isDirectory()) fail('INVALID_SCOPE', `Scan root must be a directory: ${root}`);
    if (internals.roots.some(previous => previous.dev === String(stat.dev) && previous.ino === String(stat.ino))) fail('OVERLAPPING_ROOTS', 'Selected roots alias the same physical directory');
    internals.roots.push({ path: root, dev: String(stat.dev), ino: String(stat.ino), ancestors });
  }
  emit('walking');
  try {
    for (const root of internals.roots) if (!excluded(root.path)) await walk(root.path, root.path, root.dev, 0, root.ancestors);
  } catch (error) {
    if (error.code === 'CANCELLED') result.cancelled = true;
    else if (error.code === 'SCAN_LIMIT') { result.truncated = true; warn(null, error.code, error.message); }
    else throw error;
  }
  const sizes = new Map();
  for (const file of result.files) { if (!sizes.has(file.size)) sizes.set(file.size, []); sizes.get(file.size).push(file); }
  emit('hashing');
  let budgetExhausted = false;
  try {
    check();
    for (const group of sizes.values()) {
      check();
      if (group.length < 2 || result.cancelled) continue;
      for (const file of group) {
        check();
        if(browserProfilePath(file.path)){file.contentReadSkipped='browser-profile';continue;}
        if (file.size > limits.maxHashFileBytes || file.size > limits.maxHashBytes - result.totals.hashedBytes) { budgetExhausted = true; continue; }
        const trusted = internals.files.get(file.id);
        try {
          const hashed = await hashFile(file.path, trusted.identity, { signal, check, ancestors: trusted.ancestors, maxBytes: Math.min(limits.maxHashFileBytes, limits.maxHashBytes - result.totals.hashedBytes), onBytes: bytes => { result.totals.hashedBytes += bytes; } });
          file.sha256 = trusted.sha256 = hashed.sha256;
        } catch (error) { if (['CANCELLED', 'SCAN_LIMIT'].includes(error.code)) throw error; warn(file.path, error.code || 'HASH_ERROR', error.message); }
        emit('hashing');
      }
    }
  } catch (error) {
    if (error.code === 'CANCELLED') result.cancelled = true;
    else if (error.code === 'SCAN_LIMIT') { result.truncated = true; warn(null, error.code, error.message); }
    else throw error;
  }
  if (signal?.aborted) result.cancelled = true;
  if (budgetExhausted) { result.truncated = true; warn(null, 'HASH_LIMIT', 'Some duplicate candidates were not hashed because of the configured content-reading limits'); }
  const hashes = new Map();
  for (const file of result.files) if (file.sha256) { const key = `${file.size}:${file.sha256}`; if (!hashes.has(key)) hashes.set(key, []); hashes.get(key).push(file); }
  for (const group of hashes.values()) if (group.length > 1) {
    const id = crypto.randomUUID();
    for (const file of group) { file.duplicateGroupId = id; internals.files.get(file.id).duplicateGroupId = id; }
    result.duplicates.push({ id, sha256: group[0].sha256, size: group[0].size, fileIds: group.map(f => f.id), recoverableBytes: group[0].size * (group.length - 1) });
  }
  result.largeFiles = result.files.filter(f => f.size >= limits.largeFileThreshold).sort((a, b) => b.size - a.size).slice(0, limits.maxLargeFiles);
  result.completedAt = new Date().toISOString(); emit(result.cancelled ? 'cancelled' : 'complete');
  return { result, internals };
}
module.exports = { scan, progress, DEFAULT_LIMITS, DEFAULT_EXCLUDED_NAMES };
