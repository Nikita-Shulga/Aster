'use strict';
// Runs in a worker thread: walks a folder tree (never following links) and reports sizes or duplicates.
const {parentPort, workerData} = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TYPES = {
  Video: 'mp4 mkv avi mov wmv flv webm m4v mpg mpeg ts m2ts vob 3gp',
  Images: 'jpg jpeg png gif bmp tif tiff webp heic heif raw cr2 nef arw dng psd svg ico',
  Audio: 'mp3 wav flac aac ogg m4a wma opus aiff mid',
  Documents: 'pdf doc docx xls xlsx ppt pptx odt ods odp txt rtf md csv epub djvu',
  Archives: 'zip rar 7z tar gz bz2 xz iso img cab zst tgz',
  Programs: 'exe msi dll sys msix appx apk jar bat cmd ps1',
  Code: 'js ts jsx tsx py java c cpp h cs go rs rb php html css json xml yml yaml sql sh',
  'Disk images': 'vhd vhdx vmdk vdi qcow2 pak bin dat db sqlite'
};
const EXT_TYPE = new Map();
for (const [type, list] of Object.entries(TYPES)) for (const e of list.split(' ')) EXT_TYPE.set(e, type);

const MAC = process.platform === 'darwin';
// macOS: skip firmlinked duplicates of the root volume, other volumes, and OS-owned trees.
const SKIP_ALWAYS_MAC = /^\/(System\/Volumes|Volumes|dev|net|home|cores)(\/|$)/;
const SKIP_DUPES_MAC = /^\/(System|Library|Applications|private|usr|bin|sbin|opt|Volumes|dev|cores)(\/|$)|^\/Users\/[^/]+\/Library(\/|$)/;
const SKIP_DUPES_WIN = /^[a-z]:\\(windows|\$recycle\.bin|system volume information|program files|program files \(x86\)|programdata|recovery|\$windows\.~bt|\$winreagent)(\\|$)/i;
const SKIP_ALWAYS_WIN = /^[a-z]:\\(\$recycle\.bin|system volume information)(\\|$)/i;
const SKIP_ALWAYS = MAC ? SKIP_ALWAYS_MAC : SKIP_ALWAYS_WIN;
const SKIP_DUPES = MAC ? SKIP_DUPES_MAC : SKIP_DUPES_WIN;
// Paths on external macOS volumes are matched relative to the volume, so analyzing /Volumes/X works.
const rel = p => MAC && p.startsWith('/Volumes/') ? (p.replace(/^\/Volumes\/[^/]+/, '') || '/') : p;

let lastPost = 0;
let files = 0, bytes = 0, current = '';
function progress(force, extra) {
  const now = Date.now();
  if (!force && now - lastPost < 150) return;
  lastPost = now;
  parentPort.postMessage({type: 'progress', files, bytes, current, ...extra});
}

function analyze(root) {
  const TOP = 500;
  const top = []; // largest files, kept sorted descending
  const types = new Map();
  let errors = 0;
  const walk = (dir, name) => {
    const node = {n: name, s: 0, f: 0, c: []};
    let entries;
    try { entries = fs.readdirSync(dir, {withFileTypes: true}); } catch { errors++; return node; }
    current = dir;
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (SKIP_ALWAYS.test(rel(full))) continue;
        const child = walk(full, e.name);
        node.s += child.s; node.f += child.f; node.c.push(child);
      } else if (e.isFile()) {
        let st;
        try { st = fs.lstatSync(full); } catch { errors++; continue; }
        const size = st.size;
        node.s += size; node.f++; files++; bytes += size;
        const ext = path.extname(e.name).slice(1).toLowerCase();
        const type = EXT_TYPE.get(ext) || 'Other';
        const t = types.get(type) || {bytes: 0, count: 0, exts: new Map()};
        t.bytes += size; t.count++; t.exts.set(ext, (t.exts.get(ext) || 0) + size); types.set(type, t);
        if (top.length < TOP || size > top[top.length - 1].size) {
          const item = {path: full, size, mtime: st.mtimeMs};
          let i = top.length; while (i > 0 && top[i - 1].size < size) i--;
          top.splice(i, 0, item); if (top.length > TOP) top.pop();
        }
      }
      progress(false);
    }
    node.c.sort((a, b) => b.s - a.s);
    if (!node.c.length) delete node.c;
    return node;
  };
  const tree = walk(root, root);
  progress(true);
  const typeList = [...types.entries()].map(([name, t]) => ({name, bytes: t.bytes, count: t.count, exts: [...t.exts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ext, b]) => ({ext: ext || '(none)', bytes: b}))})).sort((a, b) => b.bytes - a.bytes);
  return {tree, top, types: typeList, files, bytes, errors};
}

function hashFile(file, limit) {
  const h = crypto.createHash('sha1');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024);
    let pos = 0;
    while (true) {
      const want = limit ? Math.min(buf.length, limit - pos) : buf.length;
      if (want <= 0) break;
      const n = fs.readSync(fd, buf, 0, want, pos);
      if (!n) break;
      h.update(buf.subarray(0, n)); pos += n;
    }
  } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

function duplicates(roots, minSize) {
  const bySize = new Map();
  const walk = dir => {
    let entries;
    try { entries = fs.readdirSync(dir, {withFileTypes: true}); } catch { return; }
    current = dir;
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!SKIP_DUPES.test(rel(full))) walk(full); continue; }
      if (!e.isFile()) continue;
      let st; try { st = fs.lstatSync(full); } catch { continue; }
      files++; bytes += st.size;
      if (st.size < minSize) continue;
      const list = bySize.get(st.size);
      const item = {path: full, mtime: st.mtimeMs};
      if (list) list.push(item); else bySize.set(st.size, [item]);
      progress(false, {phase: 'scan'});
    }
  };
  for (const r of roots) walk(r);
  const candidates = [...bySize.entries()].filter(([, l]) => l.length > 1);
  const totalToHash = candidates.reduce((n, [s, l]) => n + s * l.length, 0);
  let hashed = 0;
  const groups = [];
  for (const [size, list] of candidates) {
    const partial = new Map();
    for (const f of list) {
      try { const k = hashFile(f.path, 64 * 1024); (partial.get(k) || partial.set(k, []).get(k)).push(f); } catch {}
    }
    for (const sub of partial.values()) {
      if (sub.length < 2) { hashed += size * sub.length; continue; }
      const full = new Map();
      for (const f of sub) {
        current = f.path;
        try { const k = size <= 64 * 1024 ? 'p' : hashFile(f.path); (full.get(k) || full.set(k, []).get(k)).push(f); } catch {}
        hashed += size;
        progress(false, {phase: 'hash', hashed, totalToHash});
      }
      for (const [hash, g] of full) if (g.length > 1) groups.push({size, hash, files: g.sort((a, b) => a.mtime - b.mtime)});
    }
  }
  groups.sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1));
  progress(true, {phase: 'done'});
  return {groups: groups.slice(0, 5000), files, bytes};
}

// Folders with nothing in them (or only .DS_Store / Thumbs.db), reported at their top-most empty level. System
// trees, AppData / Library, hidden folders (.git, .config…) and the standard folders of a user profile are never
// offered: apps and the OS expect those to exist even when empty.
const IGNORABLE = /^(\.ds_store|thumbs\.db|ehthumbs\.db)$/i;
const SKIP_EMPTY = MAC
  ? /^\/(System|Library|Applications|private|usr|bin|sbin|opt|Volumes|dev|cores)(\/|$)|^\/Users\/[^/]+\/Library(\/|$)|\.(app|bundle|framework|photoslibrary|musiclibrary)(\/|$)/i
  : /^[a-z]:\\(windows|\$recycle\.bin|system volume information|program files|program files \(x86\)|programdata|recovery|\$windows\.~bt|\$winreagent|msocache|intel|amd|nvidia)(\\|$)|^[a-z]:\\users\\[^\\]+\\appdata(\\|$)/i;
const PROFILE_CHILD = MAC ? /^\/Users\/[^/]+\/[^/]+$/ : /^[a-z]:\\users\\[^\\]+\\[^\\]+$/i;
const PROFILE = MAC ? /^\/Users\/[^/]+$/ : /^[a-z]:\\users\\[^\\]+$/i;
function emptyFolders(roots) {
  const found = [];
  let dirs = 0, guard = true;
  // Returns true when dir holds no files at any depth.
  const walk = dir => {
    let entries;
    try { entries = fs.readdirSync(dir, {withFileTypes: true}); } catch { return false; }
    dirs++; current = dir;
    progress(false, {phase: 'empty', dirs, found: found.length});
    let empty = true;
    const emptyKids = [];
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) { empty = false; continue; }
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || (guard && SKIP_EMPTY.test(rel(full))) || SKIP_ALWAYS.test(rel(full))) { empty = false; continue; }
        if (walk(full)) emptyKids.push(full); else empty = false;
      } else if (!(e.isFile() && IGNORABLE.test(e.name))) empty = false;
    }
    // A folder that is not empty as a whole reports its empty subfolders (offerable ones only).
    if (!empty) for (const k of emptyKids) offer(k);
    return empty;
  };
  const offer = dir => {
    const r = rel(dir);
    const depth = r.split(/[\\/]+/).filter(Boolean).length;
    if (depth < (MAC ? 2 : 3) || PROFILE.test(r)) return;
    // A standard profile folder (Videos, Saved Games, Public…) is kept, but empty folders inside it are offered.
    if (PROFILE_CHILD.test(r)) { for (const e of safeList(dir)) if (e.isDirectory() && !e.isSymbolicLink()) offer(path.join(dir, e.name)); return; }
    let mtime = 0, nested = 0;
    try { mtime = fs.statSync(dir).mtimeMs; } catch {}
    const count = d => { for (const e of safeList(d)) if (e.isDirectory() && !e.isSymbolicLink()) { nested++; count(path.join(d, e.name)); } };
    count(dir);
    found.push({path: dir, mtime, nested});
  };
  const safeList = d => { try { return fs.readdirSync(d, {withFileTypes: true}); } catch { return []; } };
  // A folder the user picked inside AppData or Library is searched as asked; the guard only protects whole drives.
  for (const r of roots) { guard = !SKIP_EMPTY.test(rel(r)); if (walk(r)) offer(r); }
  progress(true, {phase: 'done', dirs, found: found.length});
  found.sort((a, b) => a.path.localeCompare(b.path));
  return {folders: found.slice(0, 20000), dirs};
}

try {
  const result = workerData.mode === 'duplicates' ? duplicates(workerData.roots, workerData.minSize) : workerData.mode === 'empty' ? emptyFolders(workerData.roots) : analyze(workerData.root);
  parentPort.postMessage({type: 'done', result});
} catch (e) {
  parentPort.postMessage({type: 'error', message: e.message});
}
