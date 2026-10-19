'use strict';
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const {sh, rootVolumeName, hasFullDiskAccess} = require('./sh.cjs');
const {td} = require('../i18n.cjs');

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

// os.freemem() on macOS counts only completely unused pages (often under 1% of RAM), because macOS
// keeps file caches in memory. Use Activity Monitor's definition instead: app memory + wired + compressed.
async function memory() {
  const total = os.totalmem();
  try {
    const out = await sh('/usr/bin/vm_stat', [], {timeout: 3000});
    const page = Number((/page size of (\d+)/.exec(out) || [])[1]) || 16384;
    const n = k => Number((new RegExp(`${k}:\\s+(\\d+)`).exec(out) || [])[1]) || 0;
    const used = (n('Anonymous pages') - n('Pages purgeable') + n('Pages wired down') + n('Pages occupied by compressor')) * page;
    if (used > 0 && used <= total) return {total, free: total - used};
  } catch {}
  return {total, free: os.freemem()};
}

// Battery health for laptops: cycle count, condition and maximum capacity (System Settings → Battery → Battery Health).
async function battery() {
  try {
    const out = await sh('/usr/sbin/ioreg', ['-rn', 'AppleSmartBattery'], {timeout: 5000});
    if (!out.trim()) return null;
    const n = k => { const m = new RegExp(`"${k}" = (\\d+)`).exec(out); return m ? Number(m[1]) : null; };
    const design = n('DesignCapacity'), max = n('NominalChargeCapacity') ?? n('AppleRawMaxCapacity');
    return {cycles: n('CycleCount'), health: design && max ? Math.min(100, Math.round(100 * max / design)) : null, charging: /"IsCharging" = Yes/.test(out)};
  } catch { return null; }
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
    const [version, build, hw, gpu, batt] = await Promise.all([
      sh('/usr/bin/sw_vers', ['-productVersion']).then(s => s.trim()).catch(() => os.release()),
      sh('/usr/bin/sw_vers', ['-buildVersion']).then(s => s.trim()).catch(() => ''),
      sh('/usr/sbin/system_profiler', ['SPHardwareDataType', '-json'], {timeout: 20000}).then(s => JSON.parse(s).SPHardwareDataType?.[0] || {}).catch(() => ({})),
      sh('/usr/sbin/system_profiler', ['SPDisplaysDataType', '-json'], {timeout: 20000}).then(s => (JSON.parse(s).SPDisplaysDataType || []).map(g => g.sppci_model || g._name).filter(Boolean)).catch(() => []),
      battery()
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
      battery: batt,
      admin: false,
      mac: true,
      drives: volumes()
    };
  }
  return {...cached, cpu: td(cached.cpu), drives: volumes(), fda: hasFullDiskAccess(), memory: await memory(), uptime: os.uptime(), cpuLoad: cpuLoad()};
}

async function live() { return {memory: await memory(), cpuLoad: cpuLoad(), uptime: os.uptime()}; }

module.exports = {info, live, volumes, memory, battery};
