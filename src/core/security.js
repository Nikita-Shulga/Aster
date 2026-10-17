'use strict';
const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const crypto = require('node:crypto');

class CareError extends Error {
  constructor(code, message, details) { super(message); this.name = 'CareError'; this.code = code; if (details) Object.assign(this, details); }
}
const fail = (code, message, details) => { throw new CareError(code, message, details); };
const abort = signal => { if (signal?.aborted) fail('CANCELLED', 'Operation cancelled'); };
const fold = p => ['win32', 'darwin'].includes(process.platform) ? p.toLowerCase() : p;
const within = (base, p, equal = false) => {
  const relative = path.relative(fold(base), fold(p));
  return (equal && relative === '') || (relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};
function absolute(p) {
  if (typeof p !== 'string' || !p || p.includes('\0') || !path.isAbsolute(p)) fail('INVALID_PATH', 'An explicit absolute path is required');
  if (p.split(/[\\/]/).some(part => part === '..' || part === '.')) fail('INVALID_PATH', 'Dot and parent path components are not allowed');
  if (process.platform === 'win32' && (/^\\\\/.test(p) || /[<>"|?*]/.test(p) || p.slice(2).includes(':'))) fail('INVALID_PATH', 'Network, device, stream, and wildcard paths are not supported');
  if (process.platform === 'win32' && p.slice(path.parse(p).root.length).split(/[\\/]/).some(part => /[. ]$/.test(part) || /[\x00-\x1f]/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail('INVALID_PATH', 'Windows device names and ambiguous trailing characters are not supported');
  return path.resolve(p);
}
const unixProtected = ['/proc', '/sys', '/dev', '/etc', '/bin', '/sbin', '/usr', '/lib', '/lib64', '/boot', '/run', '/System', '/Library', '/private/etc', '/private/var'];
function assertAllowed(p) {
  p = absolute(p);
  if (p === path.parse(p).root) fail('PROTECTED_PATH', 'Select a specific personal folder, not a filesystem root');
  const protectedPaths = process.platform === 'win32'
    ? [process.env.SystemRoot || 'C:\\Windows', process.env.ProgramFiles || 'C:\\Program Files', process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', process.env.ProgramData || 'C:\\ProgramData', `${path.parse(p).root}$Recycle.Bin`, `${path.parse(p).root}System Volume Information`]
    : unixProtected;
  if (protectedPaths.some(base => within(base, p, true))) fail('PROTECTED_PATH', 'System-managed paths are protected');
  return p;
}
function identity(st) {
  return { dev: String(st.dev), ino: String(st.ino), size: Number(st.size), mtimeNs: String(st.mtimeNs), ctimeNs: String(st.ctimeNs), mode: Number(st.mode), nlink: Number(st.nlink) };
}
function sameIdentity(a, b, moved = false) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && (moved || a.ctimeNs === b.ctimeNs) && a.mode === b.mode && a.nlink === b.nlink;
}
const sameDirectory = (a, b) => a.dev === b.dev && a.ino === b.ino;
async function lstat(p) { return fs.lstat(p, { bigint: true }); }
async function maybeStat(p) { try { return await lstat(p); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function chain(p, { leafMissing = false, expected } = {}) {
  p = absolute(p);
  const root = path.parse(p).root;
  let current = root;
  const parts = p.slice(root.length).split(path.sep).filter(Boolean);
  const result = [];
  for (let i = -1; i < parts.length; i++) {
    if (i >= 0) current = path.join(current, parts[i]);
    let st;
    try { st = await lstat(current); } catch (error) {
      if (leafMissing && i === parts.length - 1 && error.code === 'ENOENT') break;
      throw error;
    }
    if (st.isSymbolicLink()) fail('SYMLINK', `Symbolic links and junctions are excluded: ${current}`);
    if (i < parts.length - 1 && !st.isDirectory()) fail('NOT_DIRECTORY', `Parent is not a directory: ${current}`);
    const item = { path: current, dev: String(st.dev), ino: String(st.ino) };
    const prior = expected?.find(x => fold(x.path) === fold(current));
    if (expected && (!prior || !sameDirectory(item, prior))) fail('ANCESTOR_CHANGED', `A path component changed: ${current}`);
    result.push(item);
  }
  return result;
}
async function parentChain(p, expected) { return chain(path.dirname(p), { expected }); }
function regular(st, p) {
  if (st.isSymbolicLink()) fail('SYMLINK', `Symbolic link excluded: ${p}`);
  if (!st.isFile()) fail('NOT_FILE', `Only regular files are eligible: ${p}`);
  if (st.nlink !== 1n) fail('HARDLINK', `Files with multiple hard links are excluded: ${p}`);
  if (st.size > BigInt(Number.MAX_SAFE_INTEGER)) fail('TOO_LARGE', 'File size exceeds safe numerical precision');
}
async function hashFile(p, expected, { signal, ancestors, maxBytes = Number.MAX_SAFE_INTEGER, onBytes, moved = false, check } = {}) {
  abort(signal);
  await parentChain(p, ancestors);
  const before = await lstat(p); regular(before, p);
  const id = identity(before);
  if (expected && !sameIdentity(id, expected, moved)) fail('FILE_CHANGED', `File changed since preview: ${p}`);
  if (id.size > maxBytes) fail('HASH_LIMIT', `File exceeds the remaining content-hashing budget: ${p}`);
  const handle = await fs.open(p, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  let digest;
  try {
    const opened = await handle.stat({ bigint: true }); regular(opened, p);
    if (!sameIdentity(id, identity(opened))) fail('FILE_CHANGED', `File changed while opening: ${p}`);
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(256 * 1024);
    let total = 0;
    while (true) {
      abort(signal); check?.();
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, id.size - total + 1), total);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > id.size || total > maxBytes) fail('FILE_CHANGED', `File grew while hashing: ${p}`);
      hash.update(buffer.subarray(0, bytesRead)); onBytes?.(bytesRead);
    }
    if (total !== id.size || !sameIdentity(id, identity(await handle.stat({ bigint: true })))) fail('FILE_CHANGED', `File changed while hashing: ${p}`);
    digest = hash.digest('hex');
  } finally { await handle.close(); }
  await parentChain(p, ancestors);
  const after = await lstat(p); regular(after, p);
  if (!sameIdentity(id, identity(after))) fail('FILE_CHANGED', `File path changed while hashing: ${p}`);
  return { sha256: digest, identity: id };
}
function validIdentity(id) {
  return id && ['dev', 'ino', 'mtimeNs', 'ctimeNs'].every(k => typeof id[k] === 'string' && /^-?\d+$/.test(id[k])) && ['size', 'mode', 'nlink'].every(k => Number.isSafeInteger(id[k]) && id[k] >= 0) && id.nlink === 1;
}
function validAncestors(items) {
  return Array.isArray(items) && items.length > 0 && items.length < 256 && items.every(x => x && typeof x.path === 'string' && ['dev', 'ino'].every(k => typeof x[k] === 'string' && /^-?\d+$/.test(x[k])));
}
module.exports = { fs, path, crypto, constants, CareError, fail, abort, within, absolute, assertAllowed, identity, sameIdentity, sameDirectory, lstat, maybeStat, chain, parentChain, regular, hashFile, validIdentity, validAncestors };
