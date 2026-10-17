'use strict';
const { scan: performScan, DEFAULT_LIMITS, DEFAULT_EXCLUDED_NAMES, progress } = require('./scanner');
const mutation = require('./quarantine');
const { CareError, crypto, fail, abort, hashFile } = require('./security');
const clone = value => structuredClone(value);
function createService({ mutationEnabled = false, maxPlanBytes = 4 * 1024 ** 3 } = {}) {
  if (!Number.isSafeInteger(maxPlanBytes) || maxPlanBytes < 0 || maxPlanBytes > 16 * 1024 ** 3) fail('INVALID_LIMITS', 'Invalid cleanup preview hashing budget');
  const scans = new Map(), plans = new Map();
  let mutationBusy = false;
  const trim = (map, size) => { while (map.size > size) map.delete(map.keys().next().value); };
  async function scan(options) {
    const { result, internals } = await performScan(options);
    scans.set(result.id, { result: clone(result), internals }); trim(scans, 3);
    return result;
  }
  async function createCleanupPlan({ scanId, selectedIds, signal, onProgress } = {}) {
    abort(signal);
    const scan = scans.get(scanId);
    if (!scan) fail('UNKNOWN_SCAN', 'Scan again before creating a cleanup preview');
    if (scan.result.cancelled) fail('CANCELLED_SCAN', 'Finish a new scan before preparing a cleanup preview');
    if (!Array.isArray(selectedIds) || selectedIds.length < 1 || selectedIds.length > 1000 || new Set(selectedIds).size !== selectedIds.length || selectedIds.some(id => typeof id !== 'string' || !scan.internals.files.has(id))) fail('INVALID_SELECTION', 'Choose between one and one thousand distinct files from this scan');
    const selected = new Set(selectedIds), files = selectedIds.map(id => clone(scan.internals.files.get(id))), keepFiles = [];
    for (const group of scan.result.duplicates) {
      if (!group.fileIds.some(id => selected.has(id))) continue;
      const keeper = group.fileIds.find(id => !selected.has(id));
      if (!keeper) fail('LAST_COPY', 'At least one verified member of each duplicate group must remain unselected');
      keepFiles.push(clone(scan.internals.files.get(keeper)));
    }
    const requiredBytes = [...files, ...keepFiles].reduce((sum, f) => sum + f.size, 0);
    if (requiredBytes > maxPlanBytes) fail('PLAN_LIMIT', 'Selected files and duplicate keepers exceed the cleanup preview content-reading budget');
    let hashedBytes = 0;
    for (const file of [...files, ...keepFiles]) {
      abort(signal);
      const verified = await hashFile(file.path, file.identity, { signal, ancestors: file.ancestors, maxBytes: maxPlanBytes - hashedBytes, onBytes: bytes => { hashedBytes += bytes; } });
      if (file.sha256 && file.sha256 !== verified.sha256) fail('CONTENT_CHANGED', `File content changed since the scan: ${file.path}`);
      file.sha256 = verified.sha256;
      progress(onProgress, { phase: 'previewing', hashedBytes, totalBytes: requiredBytes });
    }
    abort(signal);
    const plan = { id: crypto.randomUUID(), scanId, createdAt: new Date().toISOString(), files, keepFiles, roots: clone(scan.internals.roots), totalBytes: files.reduce((sum, f) => sum + f.size, 0), freesDiskSpace: false };
    plans.set(plan.id, plan); trim(plans, 20);
    return { id: plan.id, scanId, createdAt: plan.createdAt, files: files.map(f => ({ id: f.id, path: f.path, size: f.size, sha256: f.sha256 })), keepFiles: keepFiles.map(f => ({ id: f.id, path: f.path, size: f.size, sha256: f.sha256 })), totalBytes: plan.totalBytes, freesDiskSpace: false, warnings: ['Selection is a user decision; large and duplicate files are not automatically junk.', 'Quarantine moves files without freeing disk space. Restore retains a recovery copy and needs additional free space.'] };
  }
  function requireMutations() {
    if (!mutationEnabled) fail('MUTATIONS_DISABLED', 'Filesystem changes are disabled until native safety validation and explicit operation approval');
    if (mutationBusy) fail('BUSY', 'Another filesystem change is in progress');
    mutationBusy = true;
  }
  async function quarantine(options = {}) {
    requireMutations();
    try {
      const plan = plans.get(options.planId);
      if (!plan) fail('UNKNOWN_PLAN', 'Create a fresh cleanup preview before quarantine');
      return await mutation.quarantine(plan, options);
    } finally { mutationBusy = false; }
  }
  async function restore(options) {
    requireMutations();
    try { return await mutation.restore(options); } finally { mutationBusy = false; }
  }
  return Object.freeze({ scan, createCleanupPlan, quarantine, restore, inspectJournal: mutation.inspectJournal });
}
const service = createService();
module.exports = { createService, CareError, DEFAULT_LIMITS, DEFAULT_EXCLUDED_NAMES, ...require('./analysis'), ...service };
