'use strict';
const {Worker} = require('node:worker_threads');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {t} = require('./i18n.cjs');

class Disk {
  constructor({store, trash, cache = null}) { this.store = store; this.trash = trash; this.cache = cache; this.worker = null; this.analysis = null; this.summary = null; this.dupes = null; this.saveTimer = null; }

  run(data, onProgress) {
    this.cancel();
    return new Promise((resolve, reject) => {
      const w = new Worker(path.join(__dirname, 'disk-worker.cjs'), {workerData: data});
      this.worker = w;
      w.on('message', m => {
        if (m.type === 'progress') onProgress?.(m);
        else if (m.type === 'done') { this.worker = null; resolve(m.result); w.terminate(); }
        else if (m.type === 'error') { this.worker = null; reject(new Error(m.message)); w.terminate(); }
      });
      w.on('error', e => { this.worker = null; reject(e); });
      w.on('exit', code => { if (this.worker === w) { this.worker = null; reject(Object.assign(new Error('Cancelled'), {cancelled: true})); } });
    });
  }

  cancel() { if (this.worker) { const w = this.worker; this.worker = null; w.terminate(); } return {ok: true}; }

  async analyze({root, onProgress}) {
    const r = await this.run({mode: 'analyze', root: checkRoot(root)}, onProgress);
    this.analysis = {root: path.resolve(root), ...r};
    this.summary = {root: this.analysis.root, size: r.tree.s, files: r.files, errors: r.errors, top: r.top, types: r.types, at: new Date().toISOString()};
    this.persist(0);
    return this.summary;
  }

  // The last analysis, saved so it survives a restart. Drilling into folders works from the saved tree.
  persist(delay = 1500) {
    if (!this.cache || !this.analysis || !this.summary) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.cache.save('disk', {summary: this.summary, tree: this.analysis.tree}), delay);
  }

  async last() {
    if (this.summary) return {...this.summary, restored: false};
    const saved = await this.cache?.load('disk');
    const d = saved?.data;
    if (!d?.summary || !d.tree || !fs.existsSync(d.summary.root)) return null;
    this.analysis = {root: d.summary.root, tree: d.tree};
    this.summary = d.summary;
    return {...this.summary, restored: true};
  }

  node(p) {
    if (!this.analysis) return null;
    const root = this.analysis.root.replace(/[\\/]+$/, '');
    const target = path.resolve(p).replace(/[\\/]+$/, '');
    if (target.toLowerCase() === root.toLowerCase()) return this.analysis.tree;
    if (!target.toLowerCase().startsWith(root.toLowerCase() + path.sep)) return null;
    let node = this.analysis.tree;
    for (const part of target.slice(root.length + 1).split(path.sep)) {
      node = node?.c?.find(c => c.n.toLowerCase() === part.toLowerCase());
      if (!node) return null;
    }
    return node;
  }

  async children({path: p}) {
    const node = this.node(p);
    if (!node) throw new Error(t('disk.analyzeAgain'));
    const dir = path.resolve(p);
    const dirs = (node.c || []).map(c => ({name: c.n, path: path.join(dir, c.n), size: c.s, files: c.f, dir: true, hasChildren: !!c.c}));
    let files = [];
    try {
      const entries = await fsp.readdir(dir, {withFileTypes: true});
      for (const e of entries) {
        if (!e.isFile()) continue;
        try { const st = await fsp.lstat(path.join(dir, e.name)); files.push({name: e.name, path: path.join(dir, e.name), size: st.size, mtime: st.mtimeMs, dir: false}); } catch {}
      }
    } catch {}
    files.sort((a, b) => b.size - a.size);
    return {path: dir, size: node.s, files: node.f, items: [...dirs, ...files]};
  }

  async findDuplicates({roots, minSize, onProgress}) {
    const r = await this.run({mode: 'duplicates', roots: roots.map(checkRoot), minSize: Math.max(1, minSize | 0)}, onProgress);
    this.dupes = r;
    return {...r, wasted: r.groups.reduce((n, g) => n + g.size * (g.files.length - 1), 0), at: new Date().toISOString()};
  }

  // Deletions from the analyzer and duplicate finder always go to the Recycle Bin.
  async trashPaths({paths}) {
    const done = [], failed = [];
    let bytes = 0;
    for (const p of paths) {
      try {
        const st = await fsp.lstat(p);
        const size = st.isDirectory() ? (this.node(p)?.s || 0) : st.size;
        await this.trash(p);
        done.push(p); bytes += size;
        this.subtract(p, size);
      } catch (e) { failed.push({path: p, error: e.message}); }
    }
    if (done.length) this.store.log({kind: 'trash', key: 'activity.trashedItems', vars: {count: done.length}, bytes, count: done.length});
    if (done.length && this.summary) {
      const gone = done.map(p => path.resolve(p).toLowerCase());
      const inside = f => gone.some(g => { const p = path.resolve(f).toLowerCase(); return p === g || p.startsWith(g + path.sep); });
      this.summary = {...this.summary, size: this.analysis.tree.s, top: this.summary.top.filter(f => !inside(f.path))};
      this.persist();
    }
    return {done, failed, bytes};
  }

  subtract(p, size) {
    if (!this.analysis) return;
    const parts = [];
    let cur = path.resolve(p);
    const root = this.analysis.root.replace(/[\\/]+$/, '');
    while (cur.length > root.length && path.dirname(cur) !== cur) { parts.unshift(cur); cur = path.dirname(cur); }
    let node = this.analysis.tree;
    node.s -= size;
    for (const full of parts) {
      const name = path.basename(full);
      const child = node.c?.find(c => c.n.toLowerCase() === name.toLowerCase());
      if (!child) break;
      if (full.toLowerCase() === path.resolve(p).toLowerCase()) { node.c = node.c.filter(c => c !== child); break; }
      child.s -= size; node = child;
    }
  }
}

function checkRoot(root) {
  if (typeof root !== 'string') throw new Error(t('disk.chooseFolderOrDrive'));
  if (/^[a-z]:$/i.test(root)) root += '\\';
  if (!path.isAbsolute(root)) throw new Error(t('disk.chooseFolderOrDrive'));
  if (!fs.existsSync(root)) throw new Error(t('disk.locationMissing'));
  return path.resolve(root);
}

module.exports = {Disk};
