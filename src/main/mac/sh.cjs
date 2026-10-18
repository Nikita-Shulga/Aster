'use strict';
// Process helpers for macOS. Commands are fixed; dynamic values are passed as separate argv
// entries (never through a shell), and AppleScript strings are escaped.
const {execFile, execFileSync, spawn} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function sh(file, args = [], {timeout = 30000, env} = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {timeout, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8', env: env ? {...process.env, ...env} : process.env}, (error, stdout, stderr) => {
      if (error) { error.stdout = stdout; error.stderr = stderr; error.message = String(stderr || error.message).trim().split('\n').pop() || error.message; reject(error); }
      else resolve(stdout);
    });
  });
}

// Streams lines (for long-running tools such as brew upgrade).
function shStream(file, args, {timeout = 1800000, onLine, env} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {env: {...process.env, ...env}});
    let out = '', pending = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Timed out.')); }, timeout);
    const take = d => {
      const s = d.toString('utf8'); out += s; pending += s;
      const parts = pending.split(/\r?\n|\r/); pending = parts.pop();
      for (const p of parts) if (p.trim() && onLine) onLine(p.trim());
    };
    child.stdout.on('data', take); child.stderr.on('data', take);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => { clearTimeout(timer); resolve({code, out}); });
  });
}

const asString = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

function osa(script, {timeout = 60000} = {}) { return sh('/usr/bin/osascript', ['-e', script], {timeout}); }

// Runs a fixed shell command with administrator rights. macOS shows its own password dialog.
async function sudo(command, {timeout = 300000} = {}) {
  try { return await osa(`do shell script ${asString(command)} with administrator privileges`, {timeout}); }
  catch (e) {
    if (/-128|User canceled/i.test(e.message)) throw new Error('The administrator password prompt was cancelled.');
    throw e;
  }
}
// Quote a single value for /bin/sh inside sudo() commands.
const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

async function plist(file) {
  try { return JSON.parse(await sh('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', file], {timeout: 10000})); }
  catch {
    // plutil cannot convert plists that contain dates or data to JSON; fall back to the keys we need.
    const out = {};
    for (const key of ['CFBundleIdentifier', 'CFBundleName', 'CFBundleDisplayName', 'CFBundleShortVersionString', 'CFBundleVersion', 'NSHumanReadableCopyright', 'Label', 'Program', 'Disabled', 'RunAtLoad', 'KeepAlive']) {
      try { out[key] = (await sh('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', '--', file], {timeout: 5000})).trim(); } catch {}
    }
    try { out.ProgramArguments = JSON.parse(await sh('/usr/bin/plutil', ['-extract', 'ProgramArguments', 'json', '-o', '-', '--', file], {timeout: 5000})); } catch {}
    return out;
  }
}

// Limits concurrency for many small subprocesses.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch { out[k] = null; } }
  }));
  return out;
}

const HOME = os.homedir();
const LIB = path.join(HOME, 'Library');
const uid = () => process.getuid?.() ?? 501;

let rootName = null;
function rootVolumeName() {
  if (rootName) return rootName;
  try { rootName = (execFileSync('/usr/sbin/diskutil', ['info', '/'], {encoding: 'utf8', timeout: 5000}).match(/Volume Name:\s+(.+)/) || [])[1]?.trim(); } catch {}
  return rootName || (rootName = 'Macintosh HD');
}
// "/Volumes/Backup/x" -> "Backup", "/Users/me/x" -> "Macintosh HD"
function volumeOf(p) {
  if (typeof p !== 'string' || !p.startsWith('/')) return null;
  const m = /^\/Volumes\/([^/]+)/.exec(p);
  if (m) { try { if (fs.realpathSync(`/Volumes/${m[1]}`) === '/') return rootVolumeName(); } catch {} return m[1]; }
  return rootVolumeName();
}

function canRead(p) { try { fs.readdirSync(p); return true; } catch (e) { return e.code === 'ENOENT' ? null : false; } }
// Full Disk Access is required for Safari, Mail, Trash and other protected folders.
function hasFullDiskAccess() {
  const probes = [path.join(LIB, 'Safari'), path.join(LIB, 'Mail'), path.join(LIB, 'Containers', 'com.apple.stocks'), path.join(HOME, '.Trash')];
  let any = null;
  for (const p of probes) { const r = canRead(p); if (r === false) return false; if (r === true) any = true; }
  return any ?? true;
}

module.exports = {sh, shStream, osa, sudo, q, asString, plist, mapLimit, HOME, LIB, uid, volumeOf, rootVolumeName, hasFullDiskAccess};
