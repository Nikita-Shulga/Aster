'use strict';
// Windows repair tools: System File Checker (sfc /scannow), DISM image repair (/RestoreHealth) and a drive error scan
// (Repair-Volume). They need administrator rights and run for minutes, so the tool writes its output to a log file
// that Aster reads every second for progress; when Aster isn't elevated, Windows asks for permission first.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {psJson, sys32} = require('./ps.cjs');
const {t} = require('./i18n.cjs');

const isAdmin = async () => !!(await psJson(`Out-Json ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`).catch(() => false));
const q = s => s.replace(/'/g, "''");

// Scripts take only paths and a drive letter Aster made itself; nothing comes from the renderer unchecked.
// Each one leaves the tool's exit code in $code.
const SCRIPTS = {
  sfc: log => `$log = '${q(log)}'; & '${q(sys32('cmd.exe'))}' /d /c "sfc.exe /scannow > ""$log"" 2>&1"; $code = $LASTEXITCODE`,
  dism: log => `$log = '${q(log)}'; & '${q(sys32('cmd.exe'))}' /d /c "dism.exe /Online /Cleanup-Image /RestoreHealth > ""$log"" 2>&1"; $code = $LASTEXITCODE`,
  scan: (log, letter) => `$r = Repair-Volume -DriveLetter '${letter}' -Scan; Set-Content -LiteralPath '${q(log)}' -Value ([string]$r) -Encoding UTF8; $code = 0`,
  fix: (log, letter) => `$r = Repair-Volume -DriveLetter '${letter}' -OfflineScanAndFix; Set-Content -LiteralPath '${q(log)}' -Value ([string]$r) -Encoding UTF8; $code = 0`
};

// sfc writes UTF-16; DISM writes the console code page. Only digits and English log markers are parsed.
function readLog(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return ''; }
  if (buf.length > 1 && (buf[1] === 0 || (buf[0] === 0xff && buf[1] === 0xfe))) return buf.toString('utf16le').replace(/^\uFEFF/, '');
  return buf.toString('latin1');
}
const percent = text => { const all = [...text.matchAll(/(\d{1,3}(?:[.,]\d)?)\s*%/g)]; return all.length ? Math.min(100, parseFloat(all[all.length - 1][1].replace(',', '.'))) : null; };

// What System File Checker did this run, from the CBS log (always English): repaired files and files it could not fix.
function sfcOutcome(since) {
  const log = path.join(process.env.SystemRoot || 'C:\\Windows', 'Logs', 'CBS', 'CBS.log');
  let text = '';
  try { text = fs.readFileSync(log, 'latin1'); } catch { return null; }
  let repaired = 0, failed = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('[SR]')) continue;
    const at = Date.parse(line.slice(0, 19).replace(' ', 'T'));
    if (Number.isFinite(at) && at < since - 60000) continue;
    if (/Repairing corrupted file|Repaired file/i.test(line)) repaired++;
    if (/Cannot repair member file|could not be repaired/i.test(line)) failed++;
  }
  return {repaired, failed};
}

class Repair {
  constructor({store, send}) { this.store = store; this.send = send; this.running = null; }

  status() { return {running: this.running}; }

  async run({id, drive}) {
    if (this.running) throw new Error(t('repair.busy'));
    if (!SCRIPTS[id]) throw new Error('Unknown action');
    const letter = (/^([A-Z]):?\\?$/i.exec(drive || process.env.SystemDrive || 'C:') || [])[1]?.toUpperCase();
    if ((id === 'scan' || id === 'fix') && !letter) throw new Error('Unknown action');
    const log = path.join(os.tmpdir(), `aster-repair-${id}-${Date.now()}.log`);
    const script = SCRIPTS[id](log, letter);
    const started = Date.now();
    this.running = {id, drive: letter ? `${letter}:` : null, started, pct: null};
    const tick = setInterval(() => {
      const p = percent(readLog(log));
      if (p != null && this.running) { this.running.pct = p; this.send({id, pct: p}); }
    }, 1000);
    let code;
    try {
      if (await isAdmin()) code = Number(await psJson(`${script}\nOut-Json ([int]$code)`, null, {timeout: 3 * 3600e3})) || 0;
      else {
        const encoded = Buffer.from(`${script}\nexit $code`, 'utf16le').toString('base64');
        const r = await psJson(String.raw`
try { $p = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', $in.cmd) -Verb RunAs -WindowStyle Hidden -Wait -PassThru }
catch { Out-Json ([pscustomobject]@{ cancelled = $true }); return }
Out-Json ([pscustomobject]@{ code = $p.ExitCode })`, {cmd: encoded}, {timeout: 3 * 3600e3});
        if (r?.cancelled) throw new Error(t('repair.cancelled'));
        code = r?.code ?? 1;
      }
      const text = readLog(log);
      const result = this.outcome(id, code, text, started);
      this.store.log({kind: 'tool', key: `activity.repair.${id}`, vars: {drive: letter ? `${letter}:` : ''}});
      return result;
    } finally {
      clearInterval(tick);
      this.running = null;
      fs.rm(log, {force: true}, () => {});
    }
  }

  // A plain verdict for the renderer: ok / repaired / problems, plus details where the tool gives them.
  outcome(id, code, text, started) {
    if (id === 'sfc') {
      const o = sfcOutcome(started);
      if (o?.failed) return {id, state: 'problems', failed: o.failed, repaired: o.repaired};
      if (o?.repaired) return {id, state: 'repaired', repaired: o.repaired};
      return {id, state: code === 0 ? 'ok' : 'unknown', code};
    }
    if (id === 'dism') return {id, state: code === 0 ? 'ok' : 'problems', code};
    const r = (text.match(/NoErrorsFound|ScanNeeded|SpotFixNeeded|FullRepairNeeded/) || [])[0] || '';
    if (id === 'fix') return {id, state: r === 'NoErrorsFound' || !r ? 'repaired' : 'scheduled', result: r};
    return {id, state: r === 'NoErrorsFound' ? 'ok' : r ? 'problems' : 'unknown', result: r};
  }
}

module.exports = {Repair, percent, readLog};
