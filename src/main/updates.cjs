'use strict';
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function wingetPath() {
  const alias = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'winget.exe');
  // App execution aliases are reparse points that stat() cannot follow; lstat() sees them.
  try { fs.lstatSync(alias); return alias; } catch { return null; }
}

function runWinget(args, {timeout = 180000, onLine} = {}) {
  return new Promise((resolve, reject) => {
    const exe = wingetPath();
    if (!exe) return reject(new Error('WinGet (App Installer) is not installed. Get "App Installer" from the Microsoft Store to enable updates.'));
    const child = spawn(exe, args, {windowsHide: true});
    let out = '';
    let pending = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('WinGet timed out.')); }, timeout);
    child.stdout.on('data', d => {
      const s = d.toString('utf8');
      out += s;
      if (onLine) {
        pending += s;
        const parts = pending.split(/\r?\n|\r/);
        pending = parts.pop();
        for (const p of parts) { const line = cleanLine(p); if (line) onLine(line); }
      }
    });
    child.stderr.on('data', d => { out += d.toString('utf8'); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => { clearTimeout(timer); resolve({code, out}); });
  });
}

// Remove spinner frames and progress-bar redraws that WinGet writes with carriage returns.
function cleanLine(s) {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/^[\s\-\\|/]+(?=\S)/, '').trim();
}

function parseTable(text) {
  const lines = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split(/\r?\n/).map(l => l.split('\r').pop());
  const divider = lines.findIndex(l => /^-{20,}\s*$/.test(l.trim()));
  if (divider < 1) return [];
  const header = lines[divider - 1].replace(/^[\s\-\\|/]+(?=\S{2})/, m => ' '.repeat(m.length));
  const starts = [...header.matchAll(/\S+(?: \S+)*/g)].map(m => m.index);
  if (starts.length < 4) return [];
  const rows = [];
  for (const line of lines.slice(divider + 1)) {
    if (!line.trim() || line.length < starts[3]) break;
    const cols = starts.map((s, i) => line.slice(s, starts[i + 1]).trim());
    const [name, id, installed, available] = cols;
    if (!id || !available || /\s/.test(id)) continue;
    rows.push({name, id, installed, available, truncated: id.includes('…') || name.includes('…')});
  }
  return rows;
}

class Updates {
  constructor({store}) { this.store = store; this.cache = null; this.busy = false; }

  available() { return {available: !!wingetPath()}; }

  async check() {
    const {out} = await runWinget(['upgrade', '--source', 'winget', '--disable-interactivity', '--accept-source-agreements'], {timeout: 180000});
    const items = parseTable(out);
    if (!items.length && /-{20,}/.test(out) === false && !/\d/.test(out)) throw new Error('WinGet returned an unexpected response.');
    this.cache = {items, checkedAt: new Date().toISOString()};
    return this.cache;
  }

  last() { return this.cache; }

  async update({id, onLine}) {
    if (this.busy) throw new Error('Another update is running.');
    const row = this.cache?.items.find(r => r.id === id);
    if (!row) throw new Error('Check for updates again.');
    if (row.truncated) throw new Error('This package ID was shortened by WinGet; update it from the command line.');
    this.busy = true;
    try {
      const {code, out} = await runWinget(['upgrade', '--id', row.id, '--exact', '--source', 'winget', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'], {timeout: 1800000, onLine});
      const ok = code === 0;
      if (ok) {
        this.cache.items = this.cache.items.filter(r => r.id !== id);
        this.store.log({kind: 'update', title: `Updated ${row.name} to ${row.available}`});
      }
      return {ok, code, message: ok ? null : lastMeaningful(out)};
    } finally { this.busy = false; }
  }
}

function lastMeaningful(out) {
  const lines = out.split(/\r?\n|\r/).map(cleanLine).filter(l => l && !/^[█▒\s\d.%KMGB/]+$/.test(l));
  return lines.slice(-2).join(' ').slice(0, 300) || 'The installer reported an error.';
}

module.exports = {Updates, parseTable};
