'use strict';
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const {sh, rootVolumeName, hasFullDiskAccess} = require('./sh.cjs');

const NAMES = {26: 'Tahoe', 15: 'Sequoia', 14: 'Sonoma', 13: 'Ventura', 12: 'Monterey', 11: 'Big Sur'};
let cached = null;
let lastCpu = os.cpus();

function cpuLoad() {
  const now = os.cpus();
  let idle = 0, total = 0;
  now.forEach((c, i) => {
    const p = lastCpu[i] || c;
    const t = k => c.times[k] - p.times[k];
    idle += t('idle'); total += t('user') + t('nice') + t('sys') + t('idle') + t('irq');
  });
  lastCpu = now;
  return total > 0 ? Math.max(0, Math.min(100, Math.round(100 * (1 - idle / total)))) : 0;
}

function capacity(p) {
  try { const s = fs.statfsSync(p); return {total: s.blocks * s.bsize, free: s.bavail * s.bsize}; } catch { return null; }
}

function volumes() {
  const out = [];
  // On APFS the writable Data volume holds user data; its numbers match Finder's.
  const root = capacity('/System/Volumes/Data') || capacity('/');
  if (root) out.push({name: rootVolumeName(), root: '/', label: rootVolumeName(), format: 'APFS', type: 'Fixed', ...root});
  let entries = [];
  try { entries = fs.readdirSync('/Volumes'); } catch {}
  for (const name of entries) {
    const p = path.join('/Volumes', name);
    try { if (fs.realpathSync(p) === '/') continue; } catch { continue; }
    const c = capacity(p);
    if (c && c.total >= 2 * 1024 ** 3) out.push({name, root: p, label: name, format: null, type: 'Removable', ...c});
  }
  return out;
}

async function info({refresh = false} = {}) {
  if (!cached || refresh) {
    const [version, build, hw, gpu] = await Promise.all([
      sh('/usr/bin/sw_vers', ['-productVersion']).then(s => s.trim()).catch(() => os.release()),
      sh('/usr/bin/sw_vers', ['-buildVersion']).then(s => s.trim()).catch(() => ''),
      sh('/usr/sbin/system_profiler', ['SPHardwareDataType', '-json'], {timeout: 20000}).then(s => JSON.parse(s).SPHardwareDataType?.[0] || {}).catch(() => ({})),
      sh('/usr/sbin/system_profiler', ['SPDisplaysDataType', '-json'], {timeout: 20000}).then(s => (JSON.parse(s).SPDisplaysDataType || []).map(g => g.sppci_model || g._name).filter(Boolean)).catch(() => [])
    ]);
    const major = parseInt(version, 10);
    cached = {
      os: `macOS ${NAMES[major] || ''}`.trim(),
      osVersion: `${version}${build ? ` (${build})` : ''}`,
      build: major,
      arch: os.arch(),
      hostname: os.hostname().replace(/\.local$/, ''),
      user: os.userInfo().username,
      model: [hw.machine_name, hw.machine_model ? `(${hw.machine_model})` : ''].filter(Boolean).join(' ') || null,
      cpu: hw.chip_type || os.cpus()[0]?.model?.trim() || 'Unknown CPU',
      cores: os.cpus().length,
      gpu,
      admin: false,
      mac: true,
      drives: volumes()
    };
  }
  return {...cached, drives: volumes(), fda: hasFullDiskAccess(), memory: {total: os.totalmem(), free: os.freemem()}, uptime: os.uptime(), cpuLoad: cpuLoad()};
}

function live() { return {memory: {total: os.totalmem(), free: os.freemem()}, cpuLoad: cpuLoad(), uptime: os.uptime()}; }

module.exports = {info, live, volumes};
