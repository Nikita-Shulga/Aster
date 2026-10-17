'use strict';

// Read-only interpretation of snapshots. No filesystem, clock, network or mutation access.
const path = require('node:path');
const MiB = 1024 ** 2;
const CATEGORIES = new Set(['image', 'video', 'audio', 'document', 'archive', 'code', 'other']);
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const bytes = value => Number.isSafeInteger(value) && value >= 0;
const stamp = value => { const time = typeof value === 'string' && value.length <= 100 ? Date.parse(value) : NaN; return time >= 0 ? time : NaN; };
const list = value => Array.isArray(value) ? value : [];
function config(options = {}) {
  const defaults = { maxFiles: 100000, maxRows: 100, largeFileBytes: 50 * MiB, oldFileDays: 365 };
  const caps = { maxFiles: 100000, maxRows: 1000, largeFileBytes: Number.MAX_SAFE_INTEGER, oldFileDays: 36500 };
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (options[key] !== undefined) {
      if (!Number.isSafeInteger(options[key]) || options[key] < 1 || options[key] > caps[key]) throw new RangeError(`Invalid analysis option: ${key}`);
      result[key] = options[key];
    }
  }
  if (options.nowMs !== undefined && (!Number.isFinite(options.nowMs) || options.nowMs < 0 || options.nowMs > 8640000000000000)) throw new RangeError('Invalid analysis option: nowMs');
  result.nowMs = options.nowMs;
  return result;
}
function canonical(value) {
  if (typeof value !== 'string' || !value || value.length > 32768 || value.includes('\0')) return null;
  const windows = /^[a-z]:[\\/]/i.test(value) || value.startsWith('\\\\');
  const parser = windows ? path.win32 : path.posix;
  if (!parser.isAbsolute(value)) return null;
  const normalized = parser.normalize(value);
  return { key: windows ? normalized.toLowerCase() : normalized, path: normalized, parser };
}
function snapshot(scan, cfg) {
  const issues = new Set();
  if (!scan || !Array.isArray(scan.files)) issues.add('File records are unavailable.');
  if (scan?.cancelled) issues.add('The scan was cancelled.');
  if (scan?.truncated) issues.add('The scan reached a configured limit.');
  if (list(scan?.warnings).length || scan?.warningsOmitted > 0) issues.add('The scan reported skipped entries or other warnings.');
  if (!Number.isFinite(stamp(scan?.completedAt))) issues.add('Scan completion is not recorded.');
  const source = list(scan?.files), entries = new Map(), conflicts = new Set();
  if (source.length > cfg.maxFiles) issues.add('The analysis file limit was reached.');
  let total = 0;
  for (let i = 0; i < Math.min(source.length, cfg.maxFiles); i++) {
    const value = source[i], p = canonical(value?.path);
    if (!p || !bytes(value?.size)) { issues.add('Invalid file records were excluded.'); continue; }
    const file = { id: typeof value.id === 'string' ? value.id.slice(0, 200) : null, path: p.path, size: value.size,
      category: CATEGORIES.has(value.category) ? value.category : 'other',
      mtimeMs: typeof value.mtimeMs === 'number' && Number.isFinite(value.mtimeMs) && value.mtimeMs >= 0 ? value.mtimeMs : stamp(value.modifiedAt),
      sha256: typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(value.sha256) ? value.sha256.toLowerCase() : null,
      directory: p.parser.dirname(p.path), key: p.key };
    if (conflicts.has(p.key)) continue;
    if (entries.has(p.key)) {
      const before = entries.get(p.key);
      issues.add('Repeated file paths were counted only once; conflicting records were excluded.');
      if (before.size !== file.size || before.sha256 !== file.sha256 || !Object.is(before.mtimeMs, file.mtimeMs) || before.category !== file.category) {
        total -= before.size; entries.delete(p.key); conflicts.add(p.key);
      } else if (compareText(`${file.path}:${file.id || ''}`, `${before.path}:${before.id || ''}`) < 0) entries.set(p.key, file);
      continue;
    }
    if (!Number.isSafeInteger(total + file.size)) { issues.add('File sizes exceeded safe numerical precision; remaining records were excluded.'); break; }
    total += file.size; entries.set(p.key, file);
  }
  return { files: [...entries.values()].sort((a, b) => compareText(a.key, b.key)), total, issues };
}
function publicFile(file) { return { id: file.id, path: file.path, size: file.size, category: file.category, mtimeMs: Number.isFinite(file.mtimeMs) ? file.mtimeMs : null }; }
function analyzeScan(scan, options = {}) {
  const cfg = config(options), data = snapshot(scan, cfg);
  const categories = new Map(), directories = new Map(), hashes = new Map();
  let duplicatePotentialBytes = 0, duplicateGroups = 0, unknownDates = 0;
  const reference = cfg.nowMs ?? stamp(scan?.completedAt);
  const large = [], old = [];
  for (const file of data.files) {
    for (const [map, key] of [[categories, file.category], [directories, canonical(file.directory).key]]) {
      const row = map.get(key) || { name: key, bytes: 0, files: 0 };
      row.bytes += file.size; row.files++; map.set(key, row);
    }
    if (file.size >= cfg.largeFileBytes) large.push(file);
    if (!Number.isFinite(file.mtimeMs) || !Number.isFinite(reference) || file.mtimeMs > reference) unknownDates++;
    else if (reference - file.mtimeMs >= cfg.oldFileDays * 86400000) old.push(file);
    if (file.sha256) {
      const key = `${file.size}:${file.sha256}`;
      const prior = hashes.get(key) || 0;
      if (prior) { duplicatePotentialBytes += file.size; if (prior === 1) duplicateGroups++; }
      hashes.set(key, prior + 1);
    }
  }
  const rank = (a, b) => b.size - a.size || compareText(a.key, b.key);
  const rows = map => [...map.values()].sort((a, b) => b.bytes - a.bytes || compareText(a.name, b.name));
  const directoryRows = rows(directories);
  const warnings = [...data.issues].sort(compareText);
  return {
    totals: { files: data.files.length, bytes: data.total },
    completeness: warnings.length ? 'partial' : 'complete', warnings,
    categories: rows(categories), directories: directoryRows.slice(0, cfg.maxRows), directoriesOmitted: Math.max(0, directoryRows.length - cfg.maxRows),
    largeFiles: large.sort(rank).slice(0, cfg.maxRows).map(publicFile), largeFileCount: large.length,
    oldFiles: old.sort(rank).slice(0, cfg.maxRows).map(publicFile), oldFileCount: old.length, unknownDates,
    duplicatePotentialBytes, duplicateGroups,
    notes: ['Sizes are logical file bytes, not allocated blocks or whole-disk usage.', 'Directory rows count direct children only; nested directory totals do not overlap.', 'Duplicate estimates use matching SHA-256 and size from the supplied scan; they do not re-verify current contents.', 'Age is time since modification, not proof of disuse. Large, old and duplicate files can overlap and must not be added together as savings.', 'Quarantine does not free disk space.']
  };
}
function buildRecommendations(input = {}, options = {}) {
  const result = [], system = input.systemInfo, storage = system?.storage;
  const add = (id, title, detail, severity, action, evidence) => result.push({ id, title, detail, severity, action, evidence });
  if (storage && bytes(storage.total) && storage.total > 0 && bytes(storage.free) && storage.free <= storage.total) {
    if (storage.free / storage.total < 0.1) add('low-storage', 'Review available storage', 'Less than 10% of the home volume is available. This guidance threshold is not a disk-health diagnosis. Review recognized files and your backup before making changes.', 'warning', 'storage', { freeBytes: storage.free, totalBytes: storage.total });
  } else if (system) add('storage-unavailable', 'Storage capacity is unavailable', 'Missing capacity readings cannot establish whether storage is running low.', 'info', 'overview', {});
  if (input.scan) {
    const analysis = analyzeScan(input.scan, options);
    if (analysis.completeness === 'partial') add('partial-scan', 'Review scan coverage', 'These findings cover only observed files. Skips, cancellation or limits can leave files and duplicates unexamined; review scan warnings before drawing conclusions.', 'warning', 'storage', { warnings: analysis.warnings });
    if (analysis.duplicateGroups) add('review-duplicates', 'Review matching file copies', 'Matching content may still serve different purposes. Keep a verified copy and review each location manually. This is potential duplicate logical size, not space reclaimed by quarantine.', 'info', 'duplicates', { groups: analysis.duplicateGroups, potentialBytes: analysis.duplicatePotentialBytes });
    if (analysis.largeFileCount) add('review-large-files', 'Review large files', 'Large files are candidates for manual review, not automatically junk. This category can overlap duplicate and older files.', 'info', 'large', { files: analysis.largeFileCount });
    if (analysis.oldFileCount) add('review-old-files', 'Review older modified files', 'An old modification date does not show when a file was last used. Archives and valuable documents often remain unchanged for years.', 'info', 'storage', { files: analysis.oldFileCount, days: config(options).oldFileDays });
  }
  for (const [key, label] of [['applications', 'Application'], ['startup', 'Startup']]) {
    const inventory = input[key];
    if (inventory && inventory.status !== 'complete') add(`${key}-coverage`, `${label} inventory has limited coverage`, 'Unlisted entries are not necessarily absent. Review the source warnings and use system settings to make any changes.', 'info', key, { status: ['partial', 'unsupported'].includes(inventory.status) ? inventory.status : 'unknown' });
  }
  if (!result.length) add('review-first', 'Keep changes deliberate', 'No recommendation threshold was met by the supplied evidence. This is not a health or performance assessment. Review files you recognize; automatic cleanup is not recommended.', 'info', 'storage', {});
  return result;
}
function scope(scan) {
  if (!Array.isArray(scan?.roots) || !scan.roots.length || scan.roots.length > 16 || list(scan.exclusions).length > 1000 || list(scan.excludedNames).length > 1000) return null;
  const roots = scan.roots.map(value => canonical(value)?.key);
  const exclusions = list(scan.exclusions).map(value => canonical(value)?.key);
  if (roots.some(value => !value) || exclusions.some(value => !value)) return null;
  const names = list(scan.excludedNames);
  if (names.some(value => typeof value !== 'string' || value.length > 32768)) return null;
  return JSON.stringify([roots.sort(compareText), exclusions.sort(compareText), scan.includeHidden === true, [...names].sort(compareText)]);
}
function compareScans(previous, current, options = {}) {
  const cfg = config(options), before = snapshot(previous, cfg), after = snapshot(current, cfg);
  const previousScope = scope(previous), sameScope = previousScope !== null && previousScope === scope(current);
  const warnings = [...new Set([...before.issues, ...after.issues])];
  if (!sameScope) warnings.push('Scan scopes differ or are unknown; differences may reflect coverage changes.');
  warnings.push('Added and removed mean observed in only one snapshot; they do not prove creation or deletion. Renames appear as an added and removed path.');
  const left = new Map(before.files.map(f => [f.key, f])), right = new Map(after.files.map(f => [f.key, f]));
  const added = [], removed = [], changed = [];
  let addedBytes = 0, removedBytes = 0, changedBytes = 0, unchangedFiles = 0;
  for (const file of after.files) {
    const prior = left.get(file.key);
    if (!prior) { added.push(publicFile(file)); addedBytes += file.size; }
    else if (file.size !== prior.size || (file.sha256 && prior.sha256 && file.sha256 !== prior.sha256) || (Number.isFinite(file.mtimeMs) && Number.isFinite(prior.mtimeMs) && file.mtimeMs !== prior.mtimeMs)) {
      changed.push({ path: file.path, beforeBytes: prior.size, afterBytes: file.size, deltaBytes: file.size - prior.size }); changedBytes += file.size - prior.size;
    } else unchangedFiles++;
  }
  for (const file of before.files) if (!right.has(file.key)) { removed.push(publicFile(file)); removedBytes += file.size; }
  return { sameScope, comparable: sameScope && !before.issues.size && !after.issues.size,
    totals: { beforeBytes: before.total, afterBytes: after.total, deltaBytes: after.total - before.total, addedBytes, removedBytes, changedBytes, addedFiles: added.length, removedFiles: removed.length, changedFiles: changed.length, unchangedFiles },
    added: added.slice(0, cfg.maxRows), removed: removed.slice(0, cfg.maxRows), changed: changed.slice(0, cfg.maxRows),
    rowsOmitted: { added: Math.max(0, added.length - cfg.maxRows), removed: Math.max(0, removed.length - cfg.maxRows), changed: Math.max(0, changed.length - cfg.maxRows) },
    warnings, notes: ['Unchanged means no change detected from available size, modification-time and hash evidence; unhashed contents may still differ.'] };
}
module.exports = { analyzeScan, buildRecommendations, compareScans };
