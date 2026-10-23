'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const isMac = process.platform === 'darwin';
const {allRules, GROUPS} = isMac ? require('./mac/cleaner-rules.cjs') : require('./cleaner-rules.cjs');
const {powershell, run, sys32} = require('./ps.cjs');
const {t, td, tdLabel} = require('./i18n.cjs');

const SAMPLE = 40;

function isSafeTarget(p) {
  const parts = path.resolve(p).split(/[\\/]+/).filter(Boolean);
  return parts.length >= 3; // never a drive root or a top-level folder such as C:\Users
}

const under = (p, roots) => roots.some(r => { const a = p.toLowerCase(), b = r.toLowerCase().replace(/[\\/]+$/, ''); return a === b || a.startsWith(b + path.sep); });

// Volume label used to group and filter locations: "C:" on Windows, "Macintosh HD" / external name on macOS.
const volumeOf = p => isMac ? require('./mac/sh.cjs').volumeOf(p) : path.parse(p).root.replace(/\\$/, '').toUpperCase();

async function runningProcesses() {
  if (isMac) {
    try { return new Set((await run('/bin/ps', ['-axco', 'comm='], {timeout: 10000})).split('\n').map(s => s.trim().toLowerCase()).filter(Boolean)); }
    catch { return new Set(); }
  }
  try {
    const out = await run(sys32('tasklist.exe'), ['/FO', 'CSV', '/NH'], {timeout: 10000});
    return new Set(out.split(/\r?\n/).map(l => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean).map(s => s.toLowerCase()));
  } catch { return new Set(); }
}

// Visit files of one target. Links and junctions are never followed.
async function walk(target, visit, ctx) {
  if (target.file) {
    try { const st = await fs.lstat(target.file); if (st.isFile()) await visit(target.file, st); } catch {}
    return;
  }
  if (!isSafeTarget(target.dir)) return;
  const minAge = target.minAgeHours ? Date.now() - target.minAgeHours * 3600e3 : null;
  const stack = [target.dir];
  while (stack.length) {
    if (ctx.signal?.aborted) return;
    const dir = stack.pop();
    let handle;
    try { handle = await fs.opendir(dir); } catch { continue; }
    for await (const entry of handle) {
      const full = path.join(dir, entry.name);
      if (ctx.exclusions.length && under(full, ctx.exclusions)) continue;
      if (target.exclude && under(full, target.exclude)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { if (target.recursive) stack.push(full); continue; }
      if (!entry.isFile() || (target.match && !target.match.test(entry.name))) continue;
      let st;
      try { st = await fs.lstat(full); } catch { continue; }
      if (minAge && st.mtimeMs > minAge) continue;
      await visit(full, st);
    }
  }
}

async function removeEmptyDirs(root, signal) {
  if (!isSafeTarget(root)) return;
  const visit = async dir => {
    let entries;
    try { entries = await fs.readdir(dir, {withFileTypes: true}); } catch { return false; }
    let empty = true;
    for (const e of entries) {
      if (signal?.aborted) return false;
      if (e.isDirectory() && !e.isSymbolicLink()) { if (!(await visit(path.join(dir, e.name)))) empty = false; } else empty = false;
    }
    if (empty && dir !== root) { try { await fs.rmdir(dir); return true; } catch { return false; } }
    return empty;
  };
  await visit(root);
}

let sidCache = null;
async function userSid() {
  if (sidCache) return sidCache;
  const out = await run(sys32('whoami.exe'), ['/user', '/fo', 'csv', '/nh']);
  sidCache = (out.match(/"(S-1-[\d-]+)"/) || [])[1] || null;
  return sidCache;
}

async function recycleBinTargets(drives) {
  const sid = await userSid().catch(() => null);
  if (!sid) return [];
  return drives.map(d => ({dir: `${d.name}\\$Recycle.Bin\\${sid}`, recursive: true, label: `Recycle Bin on drive ${d.name}`}));
}

class Cleaner {
  constructor({getSettings, getDrives, trash}) { this.getSettings = getSettings; this.getDrives = getDrives; this.trash = trash; this.abort = null; }

  // Rule text is written in English in the rule tables and shown in the interface language.
  rules() {
    return {groups: GROUPS.map(g => ({...g, name: td(g.name)})), rules: allRules().map(r => ({
      id: r.id, group: r.group, app: td(r.app), appId: r.appId, name: td(r.name), description: td(r.description),
      defaultOn: !!r.defaultOn, admin: !!r.admin, privacy: !!r.privacy, caution: !!r.caution, fda: !!r.fda,
      verdict: r.verdict || 'safe', contains: td(r.contains || ''), ifDeleted: td(r.ifDeleted || ''), advice: td(r.advice || ''),
      processes: r.processes || [], installed: r.installed ? !!r.installed() : true
    }))};
  }

  async targetsFor(rule) {
    if (rule.special === 'recyclebin') return recycleBinTargets(await this.getDrives());
    return rule.resolve ? rule.resolve() : [];
  }

  ctx(signal) { return {signal, exclusions: (this.getSettings().exclusions || []).filter(Boolean)}; }

  cancel() { this.abort?.abort(); }

  async analyze({ids, onProgress = () => {}}) {
    const wanted = new Set(ids);
    const rules = allRules().filter(r => wanted.has(r.id));
    const procs = await runningProcesses();
    this.abort = new AbortController();
    const ctx = this.ctx(this.abort.signal);
    const results = [];
    let i = 0;
    for (const rule of rules) {
      if (ctx.signal.aborted) break;
      onProgress({phase: 'analyze', ruleId: rule.id, label: `${td(rule.app)} · ${td(rule.name)}`, index: i++, total: rules.length});
      const running = (rule.processes || []).filter(p => procs.has(p.toLowerCase()));
      let bytes = 0, files = 0; const sample = [];
      const locations = [];
      for (const target of await this.targetsFor(rule)) {
        const where = target.dir || target.file;
        // key: the English name, so saved results can be renamed when the interface language changes.
        const key = target.label || rule.name;
        const loc = {label: tdLabel(key), key, path: where, drive: volumeOf(where), bytes: 0, files: 0};
        await walk(target, async (file, st) => {
          bytes += st.size; files++; loc.bytes += st.size; loc.files++;
          if (sample.length < SAMPLE) sample.push({path: file, size: st.size});
          else if (st.size > sample[sample.length - 1].size) { sample[sample.length - 1] = {path: file, size: st.size}; }
          else return;
          sample.sort((a, b) => b.size - a.size);
        }, ctx);
        if (loc.files) locations.push(loc);
      }
      locations.sort((a, b) => b.bytes - a.bytes);
      results.push({id: rule.id, bytes, files, sample, running, locations});
    }
    this.abort = null;
    return {results, cancelled: ctx.signal.aborted, totalBytes: results.reduce((n, r) => n + r.bytes, 0), totalFiles: results.reduce((n, r) => n + r.files, 0)};
  }

  // drives: optional list like ['D:'] — only locations on those drives are cleaned.
  // paths: optional list of locations (as reported by analyze) — only those are cleaned.
  async clean({ids, closeApps = false, drives = null, paths = null, onProgress = () => {}}) {
    const wanted = new Set(ids);
    const onDrive = t => (!drives || drives.includes(volumeOf(t.dir || t.file))) && (!paths || paths.includes(t.dir || t.file));
    const rules = allRules().filter(r => wanted.has(r.id));
    let procs = await runningProcesses();
    if (closeApps) {
      const toClose = [...new Set(rules.flatMap(r => r.processes || []).filter(p => procs.has(p.toLowerCase())))];
      for (const image of toClose) {
        if (isMac) { if (/^[\w .+-]{1,80}$/.test(image)) await run('/usr/bin/osascript', ['-e', `quit app "${image}"`], {timeout: 15000}).catch(() => {}); }
        else await run(sys32('taskkill.exe'), ['/IM', image, '/T'], {timeout: 10000}).catch(() => {});
      }
      if (toClose.length) { await new Promise(r => setTimeout(r, 2500)); procs = await runningProcesses(); }
    }
    this.abort = new AbortController();
    const ctx = this.ctx(this.abort.signal);
    const results = [];
    let i = 0;
    for (const rule of rules) {
      if (ctx.signal.aborted) break;
      onProgress({phase: 'clean', ruleId: rule.id, label: `${td(rule.app)} · ${td(rule.name)}`, index: i++, total: rules.length});
      const running = (rule.processes || []).filter(p => procs.has(p.toLowerCase()));
      if (running.length) { results.push({id: rule.id, freed: 0, deleted: 0, skipped: 0, blocked: t('cleaner.appRunning', {app: td(rule.app)})}); continue; }
      let freed = 0, deleted = 0, skipped = 0;
      if (rule.special === 'recyclebin') {
        const before = await this.analyze({ids: [rule.id]});
        const letters = drives ? drives.map(d => d[0]).filter(l => /^[A-Z]$/.test(l)) : null;
        try { await powershell(letters ? 'foreach ($l in @($in.letters)) { Clear-RecycleBin -DriveLetter $l -Force -ErrorAction SilentlyContinue }' : 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue', {timeout: 120000, input: {letters}}); } catch {}
        const after = await this.analyze({ids: [rule.id]});
        this.abort = new AbortController();
        freed = Math.max(0, before.totalBytes - after.totalBytes); deleted = Math.max(0, before.totalFiles - after.totalFiles); skipped = after.totalFiles;
      } else {
        const targets = (await this.targetsFor(rule)).filter(onDrive);
        for (const target of targets) {
          await walk(target, async (file, st) => {
            try { await fs.unlink(file); freed += st.size; deleted++; }
            catch (e) {
              if (e.code === 'EPERM' || e.code === 'EACCES') {
                try { await fs.chmod(file, 0o666); await fs.unlink(file); freed += st.size; deleted++; return; } catch {}
              }
              skipped++;
            }
          }, ctx);
          if (target.dir && target.recursive) await removeEmptyDirs(target.dir, ctx.signal);
        }
      }
      results.push({id: rule.id, freed, deleted, skipped});
    }
    this.abort = null;
    return {results, cancelled: ctx.signal.aborted, freed: results.reduce((n, r) => n + r.freed, 0), deleted: results.reduce((n, r) => n + r.deleted, 0), skipped: results.reduce((n, r) => n + r.skipped, 0)};
  }
}

// Every file of one item (or of one of its locations), largest first, so single files can be picked and removed.
// Capped at FILE_LIST files; the item's own clean button still removes everything.
const FILE_LIST = 5000;
Cleaner.prototype.listFiles = async function ({id, path: only = null}) {
  const rule = allRules().find(r => r.id === id);
  if (!rule) throw new Error(t('cleaner.analyzeAgain'));
  const targets = (await this.targetsFor(rule)).filter(tg => !only || (tg.dir || tg.file) === only);
  const ctx = this.ctx(null);
  let files = [], total = 0, bytes = 0;
  for (const target of targets) {
    const where = target.dir || target.file;
    await walk(target, async (file, st) => {
      total++; bytes += st.size;
      files.push({path: file, size: st.size, mtime: st.mtimeMs, loc: where});
      // Keep memory flat on huge caches: trim back to the largest files now and then.
      if (files.length > FILE_LIST * 2) { files.sort((a, b) => b.size - a.size); files.length = FILE_LIST; }
    }, ctx);
  }
  files.sort((a, b) => b.size - a.size);
  if (files.length > FILE_LIST) files.length = FILE_LIST;
  return {files, total, bytes, truncated: total > files.length, recycleBin: rule.special === 'recyclebin'};
};

// Removes individual files the user picked: to the Trash / Recycle Bin, or deleted right away (permanent), like
// cleaning the whole item does. Each file must lie inside one of the rule's own locations, so a forged path can
// never reach anything else. Files already in the Recycle Bin can only be deleted.
Cleaner.prototype.removeFiles = async function ({id, paths, permanent = false}) {
  const rule = allRules().find(r => r.id === id);
  if (!rule) throw new Error(t('cleaner.analyzeAgain'));
  const targets = await this.targetsFor(rule);
  const exclusions = (this.getSettings().exclusions || []).filter(Boolean);
  const inside = p => targets.some(t => t.file ? under(p, [path.resolve(t.file)]) : under(p, [path.resolve(t.dir)]) && p !== path.resolve(t.dir) && (t.recursive || path.dirname(p) === path.resolve(t.dir)) && (!t.match || t.match.test(path.basename(p))) && !(t.exclude && under(p, t.exclude)));
  const done = [], failed = [];
  let freed = 0;
  const remove = permanent || rule.special === 'recyclebin'
    ? async p => { try { await fs.unlink(p); } catch (e) { if (e.code !== 'EPERM' && e.code !== 'EACCES') throw e; await fs.chmod(p, 0o666); await fs.unlink(p); } }
    : p => this.trash(p);
  for (const raw of (Array.isArray(paths) ? paths : []).slice(0, FILE_LIST)) {
    const p = typeof raw === 'string' && path.isAbsolute(raw) ? path.resolve(raw) : null;
    if (!p || !inside(p) || (exclusions.length && under(p, exclusions))) { failed.push({path: raw, error: t('cleaner.notPartOfItem')}); continue; }
    try {
      const st = await fs.lstat(p);
      if (!st.isFile()) throw new Error(t('cleaner.notAFile'));
      await remove(p);
      done.push(p); freed += st.size;
    } catch (e) { failed.push({path: p, error: e.message}); }
  }
  return {done, failed, freed};
};

module.exports = {Cleaner, runningProcesses, walk, isSafeTarget};
