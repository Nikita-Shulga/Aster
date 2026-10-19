'use strict';
// Keeps the last result of each slow scan (disk analyzer, duplicates, cleaner) so it is still there after a restart.
// Results are gzip-compressed JSON in <userData>/scans. Writes for one kind are queued so they never overlap.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const {promisify} = require('node:util');
const {t} = require('./i18n.cjs');

const gzip = promisify(zlib.gzip), gunzip = promisify(zlib.gunzip);
const KINDS = new Set(['disk', 'duplicates', 'cleaner']);
const FORMAT = 1;
const MAX_CHARS = 150e6;

class ScanCache {
  constructor(root) { this.dir = path.join(root, 'scans'); this.queue = new Map(); }

  file(kind) {
    if (!KINDS.has(kind)) throw new Error(t('main.unknownScan'));
    return path.join(this.dir, `${kind}.json.gz`);
  }

  // data === null forgets the saved result.
  save(kind, data) {
    const file = this.file(kind);
    const prev = this.queue.get(kind) || Promise.resolve();
    const next = prev.then(async () => {
      if (data == null) { await fsp.rm(file, {force: true}); return true; }
      const json = JSON.stringify({v: FORMAT, savedAt: new Date().toISOString(), data});
      if (json.length > MAX_CHARS) return false;
      await fsp.mkdir(this.dir, {recursive: true});
      const tmp = `${file}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, await gzip(json));
      await fsp.rename(tmp, file);
      return true;
    }).catch(() => false);
    this.queue.set(kind, next);
    return next;
  }

  async load(kind) {
    const file = this.file(kind);
    await this.queue.get(kind);
    try {
      const o = JSON.parse(await gunzip(await fsp.readFile(file)));
      return o && o.v === FORMAT && o.data ? o : null;
    } catch { return null; }
  }
}

// Files deleted since the scan drop out; groups with fewer than two copies left are no longer duplicates.
function pruneDuplicates(data, exists = fs.existsSync) {
  const groups = (data.groups || []).map(g => ({...g, files: g.files.filter(f => exists(f.path))})).filter(g => g.files.length > 1);
  return {...data, groups, wasted: groups.reduce((n, g) => n + g.size * (g.files.length - 1), 0)};
}

module.exports = {ScanCache, pruneDuplicates, KINDS};
