'use strict';

const os = require('node:os');
const fs = require('node:fs/promises');
const path = require('node:path');
const commands = require('./commands');
const parsers = require('./parsers');
const diagnostics = require('./diagnostics');
const {samplePerformance}=require('../core/performance');

const BASE_APPLICATION_WARNING = 'Inventory is read-only and may omit portable apps, other users\' apps, or inaccessible entries.';
const BASE_STARTUP_WARNING = 'This is a partial inventory. Enabled state, scheduled tasks, services, and managed startup entries are not determined. Use system settings to make changes.';

function nonnegative(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER ? n : null;
}

function unavailable(label, error) {
  const reason = error && error.code === 'TIMEOUT' ? 'The scan timed out.' : error && error.code === 'OUTPUT_LIMIT' ? 'The scan exceeded its output limit.' : 'The system source is unavailable or returned an unsupported format.';
  return { items: [], status: 'partial', warnings: [label + ' could not be read. ' + reason] };
}

function createCollectors(dependencies = {}) {
  // Dependency injection is for tests and trusted main-process code only.
  // Do not expose createCollectors or its options over an IPC bridge.
  const system = dependencies.os || os;
  const files = dependencies.fs || fs;
  const run = dependencies.runCommand || commands.runCommand;
  const platform = dependencies.platform || process.platform;
  const env = dependencies.env || process.env;
  const nativePlatform = platform === 'win32' || platform === 'darwin';

  async function getSystemInfo() {
    const cpu = system.cpus();
    let storage = { total: null, free: null, used: null };
    const warnings = [];
    try {
      const stat = await files.statfs(system.homedir());
      if ([stat.blocks, stat.bsize, stat.bavail].some(value => value === null || value === undefined || typeof value === 'boolean')) throw new Error('Missing capacity');
      const total = nonnegative(Number(stat.blocks) * Number(stat.bsize));
      const available = nonnegative(Number(stat.bavail) * Number(stat.bsize));
      if (total === null || total <= 0 || available === null) throw new Error('Invalid capacity');
      const free = Math.min(available, total);
      storage = { total, free, used: total - free };
    } catch {
      warnings.push('Storage capacity is unavailable for the home volume.');
    }
    if (platform === 'win32' && storage.total === null && /^[a-z]:[\\/]/i.test(system.homedir())) {
      try {
        const output = await run(commands.windowsPowerShell(env), commands.powershellArgs(commands.WINDOWS_DIAGNOSTICS), {timeout:15000,maxBuffer:128*1024});
        const drive = system.homedir().slice(0,2).toUpperCase();
        const volume = diagnostics.parseWindowsDiagnostics(output).volumes.items.find(v=>v.id===drive&&v.total!==null);
        if(volume){storage={total:volume.total,free:volume.free,used:volume.used};warnings.length=0;}
      } catch { /* Keep the explicit unavailable state. */ }
    }
    const recommendations = [];
    if (storage.total && storage.free / storage.total < 0.1) {
      recommendations.push({ id: 'low-storage', title: 'Storage is running low', detail: 'Less than 10% of the home volume is available. Review files before removing anything. This is an app guidance threshold, not a hardware diagnosis.', severity: 'warning', action: 'storage' });
    }
    if (!nativePlatform) {
      recommendations.push({ id: 'development-host', title: 'Development environment', detail: 'These readings describe this host. Windows and macOS inventory features require the app to run on those systems.', severity: 'info' });
    }
    if (!recommendations.length) {
      recommendations.push({ id: 'review-first', title: 'Review before you clean', detail: 'Caches often improve performance and rebuild after removal. Only remove items you recognize; no registry or memory optimization is needed.', severity: 'info', action: 'cleanup' });
    }
    return {
      platform, measuredAt: new Date().toISOString(),
      osName: platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : system.type(),
      version: parsers.text(typeof system.version === 'function' ? system.version() : system.release(), 300),
      arch: system.arch(), hostname: parsers.text(system.hostname(), 300),
      memory: { total: nonnegative(system.totalmem()), free: nonnegative(system.freemem()) },
      cpu: { model: parsers.text(cpu[0] && cpu[0].model || 'Unavailable', 300), cores: cpu.length },
      uptime: nonnegative(system.uptime()), storage, recommendations,
      capabilities: {
        nativePlatform, systemInfo: true, storage: storage.total !== null,
        startupInventory: nativePlatform, applicationInventory: nativePlatform,
        startupManagement: false, applicationUninstall: false, diskHealth: false,
        memoryPressure: false
      },
      warnings,
      measurementNotes: [
        'Storage describes the volume containing the home directory, not every disk. Available capacity can differ from system storage settings.',
        'Free RAM is an operating-system snapshot, not memory pressure or a performance score.',
        'CPU cores reports logical processors. Disk hardware health has not been assessed.'
      ]
    };
  }

  async function getDiagnostics() {
    const result = {
      status: nativePlatform ? 'partial' : 'unsupported', collectedAt: new Date().toISOString(),
      volumes: { status: 'unknown', items: [], warnings: [] },
      battery: diagnostics.unknownBattery(nativePlatform ? 'unknown' : 'unsupported'),
      security: { status: 'unknown', assessed: false, detail: 'Antivirus, firewall, encryption, and secure boot have not been assessed. Review the operating system security settings.' },
      updates: { status: 'unknown', assessed: false, detail: 'Available updates and restart requirements have not been checked. Review the operating system update settings.' },
      warnings: ['Read-only evidence; missing data is not evidence that a system is healthy or unhealthy.']
    };
    if (platform === 'win32') {
      try {
        const output = await run(commands.windowsPowerShell(env), commands.powershellArgs(commands.WINDOWS_DIAGNOSTICS), { timeout: 15000, maxBuffer: 128 * 1024 });
        Object.assign(result, diagnostics.parseWindowsDiagnostics(output));
      } catch { result.warnings.push('Windows diagnostic sources are unavailable or returned an unsupported format.'); }
    } else {
      const info = await getSystemInfo();
      result.volumes = { status: info.storage.total === null ? 'unknown' : 'partial', items: info.storage.total === null ? [] : [{ id: 'home-volume', label: 'Home volume', ...info.storage, fileSystem: null, scope: 'home-volume' }], warnings: ['Only the volume containing the home directory is measured. Shared APFS capacity, snapshots, and reserved space can differ from system storage settings.'] };
      if (platform === 'darwin') {
        try {
          result.battery = diagnostics.parseMacBattery(await run('/usr/bin/pmset', ['-g', 'batt'], { timeout: 5000, maxBuffer: 65536 }));
        } catch { result.battery.warnings.push('The macOS battery source is unavailable or returned an unsupported format.'); }
      }
    }
    return result;
  }

  async function windowsInventory(kind) {
    try {
      const script = kind === 'applications' ? commands.WINDOWS_APPLICATIONS : commands.WINDOWS_STARTUP;
      const output = await run(commands.windowsPowerShell(env), commands.powershellArgs(script), { timeout: 15000, maxBuffer: commands.MAX_OUTPUT });
      const result = parsers.parseWindows(output, kind);
      result.warnings.unshift(kind === 'applications' ? BASE_APPLICATION_WARNING : BASE_STARTUP_WARNING);
      return result;
    } catch (error) { return unavailable(kind === 'applications' ? 'Applications' : 'Startup entries', error); }
  }

  async function listApplications() {
    if (platform === 'win32') return windowsInventory('applications');
    if (platform === 'darwin') {
      try {
        const output = await run('/usr/sbin/system_profiler', ['SPApplicationsDataType', '-json', '-detailLevel', 'mini'], { timeout: 15000, maxBuffer: commands.MAX_OUTPUT });
        return parsers.parseMacApplications(output);
      } catch (error) { return unavailable('Applications', error); }
    }
    return { items: [], status: 'unsupported', warnings: ['Application inventory is available only when running on Windows or macOS.'] };
  }

  async function macStartup() {
    const roots = [path.posix.join(system.homedir(), 'Library', 'LaunchAgents'), '/Library/LaunchAgents', '/Library/LaunchDaemons'];
    const warnings = new Set(['Launch definitions are a partial inventory. Modern login items and actual enabled state are not represented. Review Login Items & Extensions in System Settings.']);
    const candidates = [];
    const deadline = Date.now() + 8000;
    for (const root of roots) {
      try {
        const rootInfo = await files.lstat(root);
        if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) { warnings.add('A redirected launch-definition folder was skipped.'); continue; }
        const entries = await files.readdir(root, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.plist')) continue;
          if (candidates.length >= 60) { warnings.add('The bounded launch-definition inventory reached its item limit.'); break; }
          candidates.push(path.posix.join(root, entry.name));
        }
      } catch (error) { if (error.code !== 'ENOENT') warnings.add('Some launch-definition folders could not be read.'); }
    }
    const items = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < candidates.length) {
        if (Date.now() > deadline) { warnings.add('The bounded launch-definition inventory reached its time limit.'); break; }
        const location = candidates[cursor++];
        try {
          const stat = await files.lstat(location);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) { warnings.add('A redirected or unusually large launch definition was skipped.'); continue; }
          const output = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', location], { timeout: 2000, maxBuffer: 128 * 1024 });
          items.push(parsers.parseLaunchAgent(output, location));
        } catch { warnings.add('Some launch definitions could not be read.'); }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    items.sort((a, b) => a.name.localeCompare(b.name));
    return { items, status: 'partial', warnings: [...warnings] };
  }

  async function listStartup() {
    if (platform === 'win32') return windowsInventory('startup');
    if (platform === 'darwin') {
      try { return await macStartup(); } catch (error) { return unavailable('Startup entries', error); }
    }
    return { items: [], status: 'unsupported', warnings: ['Startup inventory is available only when running on Windows or macOS.'] };
  }

  let previousPerformance=null;
  async function getPerformance() {
    const result={collectedAt:new Date().toISOString(),status:platform==='win32'?'partial':'unsupported',items:[],warnings:['Working set is a current memory snapshot. CPU seconds are cumulative process time, not current CPU usage. Shared memory can be counted in several processes. No process is stopped or changed.']};
    result.memory={total:nonnegative(system.totalmem()),free:nonnegative(system.freemem())};
    if(platform!=='win32')return result;
    try{
      const raw=parsers.parseJson(await run(commands.windowsPowerShell(env),commands.powershellArgs(commands.WINDOWS_PERFORMANCE),{timeout:10000,maxBuffer:512*1024}));
      if(!Array.isArray(raw?.items)||!Array.isArray(raw?.warnings))throw new Error('Invalid performance response');
      const seen=new Set();
      for(const row of raw.items.slice(0,1000)){
        if(!row||!Number.isSafeInteger(row.id)||row.id<0||!Number.isSafeInteger(row.memoryBytes)||row.memoryBytes<0||seen.has(row.id))continue;
        const name=parsers.text(row.name,300);if(!name)continue;seen.add(row.id);
        result.items.push({id:row.id,name,memoryBytes:row.memoryBytes,cpuSeconds:typeof row.cpuSeconds==='number'&&Number.isFinite(row.cpuSeconds)&&row.cpuSeconds>=0?row.cpuSeconds:null,startedAt:typeof row.startedAt==='string'&&Number.isFinite(Date.parse(row.startedAt))?new Date(row.startedAt).toISOString():null,executablePath:parsers.text(row.executablePath,32768)||null});
      }
      result.items.sort((a,b)=>b.memoryBytes-a.memoryBytes||a.name.localeCompare(b.name));
      result.warnings.push(...raw.warnings.slice(0,10).map(w=>parsers.text(w,300)).filter(Boolean));
    }catch{result.warnings.push('The Windows process source is unavailable.');}
    const sampled=samplePerformance(previousPerformance,result,{cores:system.cpus().length});previousPerformance=result;return sampled;
  }
  async function getDrivers(){
    if(platform!=='win32')return {status:'unsupported',items:[],updatesAssessed:false,canExecute:false};
    try{return require('../core/care').parseDrivers(parsers.parseJson(await run(commands.windowsPowerShell(env),commands.powershellArgs(commands.WINDOWS_DRIVERS),{timeout:15000,maxBuffer:1024*1024})));}
    catch{return {status:'unavailable',items:[],updatesAssessed:false,canExecute:false,warnings:['Driver inventory could not be read.']};}
  }
  return { getDrivers, getSystemInfo, getDiagnostics, getPerformance, listStartup, listApplications };
}

module.exports = { ...createCollectors(), createCollectors };
