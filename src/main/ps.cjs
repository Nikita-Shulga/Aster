'use strict';
// Small helpers for running fixed, app-authored PowerShell scripts and native tools.
// Scripts never interpolate renderer input: dynamic data is passed as JSON on stdin.
const {spawn, execFile} = require('node:child_process');
const path = require('node:path');

const SYSTEM_ROOT = /^[a-z]:\\windows\\?$/i.test(process.env.SystemRoot || '') ? process.env.SystemRoot : 'C:\\Windows';
const sys32 = (...p) => path.join(SYSTEM_ROOT, 'System32', ...p);
const POWERSHELL = sys32('WindowsPowerShell', 'v1.0', 'powershell.exe');

const PREAMBLE = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$in = if ($raw.Trim()) { ConvertFrom-Json $raw } else { $null }
function Out-Json($value) { [Console]::Out.Write((ConvertTo-Json -InputObject $value -Depth 8 -Compress)) }
`;

const BOOTSTRAP = "[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false); $all = [Console]::In.ReadToEnd(); $nl = $all.IndexOf([char]10); $raw = $all.Substring(0, $nl); & ([ScriptBlock]::Create($all.Substring($nl + 1)))";

function powershell(script, {input = null, timeout = 60000} = {}) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('This feature requires Windows.'));
    // The script travels on stdin after one line of JSON input; long scripts exceed the command-line limit.
    const encoded = Buffer.from(BOOTSTRAP, 'utf16le').toString('base64');
    const child = spawn(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {windowsHide: true});
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('The operation timed out.')); }, timeout);
    child.stdout.setEncoding('utf8').on('data', d => { out += d; });
    child.stderr.setEncoding('utf8').on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(out.replace(/^\uFEFF/, ''));
      else reject(new Error(cleanError(err) || `PowerShell exited with code ${code}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end((input == null ? '' : JSON.stringify(input)) + '\n' + PREAMBLE + script);
  });
}

async function psJson(script, input, options) {
  const text = (await powershell(script, {...options, input})).trim();
  if (!text) return null;
  return JSON.parse(text);
}

// PowerShell's error stream is verbose; keep the first meaningful line.
function cleanError(text) {
  // With redirected streams PowerShell serializes errors as CLIXML.
  if (String(text).startsWith('#< CLIXML')) {
    text = [...String(text).matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)].map(m => m[1]).join('')
      .replace(/_x000D_/g, '').replace(/_x000A_/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  }
  const line = String(text || '').split(/\r?\n/).map(s => s.trim()).find(s => s && !s.startsWith('At line') && !s.startsWith('+'));
  return line ? line.replace(/^.*?:\s(?=[A-Z])/, '').slice(0, 300) : '';
}

function run(file, args, {timeout = 30000, encoding = 'utf8'} = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {windowsHide: true, timeout, encoding, maxBuffer: 16 * 1024 * 1024}, (error, stdout, stderr) => {
      if (error) { error.stdout = stdout; error.stderr = stderr; reject(error); } else resolve(stdout);
    });
  });
}

// PowerShell 5.1 collapses single-item arrays to objects.
const arr = v => v == null ? [] : Array.isArray(v) ? v : [v];

module.exports = {powershell, psJson, run, arr, sys32, SYSTEM_ROOT, POWERSHELL};
