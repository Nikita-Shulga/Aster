'use strict';
// Updates Aster itself from its GitHub releases. Nothing is contacted until the user asks.
// Every download is checked against the release's SHA256SUMS.txt before it is opened.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {Readable, Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');

const REPO = 'Nikita-Shulga/Aster';
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;
const HEADERS = {'User-Agent': 'Aster-Updater', Accept: 'application/vnd.github+json'};

// 1.2.3 vs 1.10.0, "v" prefix allowed; a pre-release (2.0.0-beta.1) sorts before its release.
function compareVersions(a, b) {
  const parse = v => {
    const [core, pre = ''] = String(v || '').trim().replace(/^v/i, '').split('-', 2);
    return {nums: core.split('.').map(n => parseInt(n, 10) || 0), pre};
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length, 3); i++) {
    const d = (x.nums[i] || 0) - (y.nums[i] || 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

// How this copy of Aster was installed decides what to download and how to apply it.
function installKind({platform = process.platform, packaged, env = process.env, execPath = process.execPath, exists = fs.existsSync} = {}) {
  if (!packaged) return 'dev';
  if (platform === 'darwin') return 'mac';
  if (platform !== 'win32') return 'unsupported';
  if (env.PORTABLE_EXECUTABLE_FILE) return 'portable';
  return exists(path.join(path.dirname(execPath), 'Uninstall Aster.exe')) ? 'installer' : 'manual';
}

// Release file names, as produced by .github/workflows/build.yml.
function assetNames(kind, version, arch = process.arch) {
  if (kind === 'portable') return [`Aster-${version}-portable.exe`, 'Aster-Windows-Portable.exe'];
  if (kind === 'mac') return arch === 'arm64' ? [`Aster-${version}-mac-arm64.dmg`, 'Aster-Mac-AppleSilicon.dmg'] : [`Aster-${version}-mac-x64.dmg`, 'Aster-Mac-Intel.dmg'];
  return [`Aster-Setup-${version}.exe`, 'Aster-Windows-Setup.exe'];
}

function pickAsset(assets, kind, version, arch) {
  for (const name of assetNames(kind, version, arch)) {
    const a = (assets || []).find(x => x && x.name === name);
    if (a) return a;
  }
  return null;
}

// "<sha256>  <name>" per line (sha256sum output; a leading * marks binary mode).
function parseSums(text) {
  const sums = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line);
    if (m) sums.set(m[2], m[1].toLowerCase());
  }
  return sums;
}

// Only files attached to a release of this repository may be downloaded.
const isReleaseUrl = (url, tag, name) => url === `${DOWNLOAD_PREFIX}${encodeURIComponent(tag)}/${encodeURIComponent(name)}` || url === `${DOWNLOAD_PREFIX}${tag}/${name}`;

class Updater {
  constructor({app, shell, store, fetch: fetchImpl = globalThis.fetch, spawn: spawnImpl = spawn, onProgress = () => {}}) {
    this.app = app; this.shell = shell; this.store = store; this.fetch = fetchImpl; this.spawn = spawnImpl; this.onProgress = onProgress;
    this.release = null; this.file = null; this.busy = false; this.abort = null;
  }

  kind() { return installKind({packaged: this.app.isPackaged}); }

  // Installers from earlier updates are no longer needed once the new version runs.
  cleanup() {
    if (this.busy || this.file) return;
    try { fs.rmSync(path.join(this.app.getPath('temp'), 'aster-update'), {recursive: true, force: true}); } catch {}
  }

  async check() {
    const current = this.app.getVersion();
    const kind = this.kind();
    let res;
    try { res = await this.fetch(LATEST, {headers: HEADERS, signal: AbortSignal.timeout(20000)}); }
    catch { throw new Error('Could not reach GitHub. Check your internet connection and try again.'); }
    if (res.status === 403 || res.status === 429) throw new Error('GitHub is limiting requests right now. Try again in a few minutes.');
    if (!res.ok) throw new Error(`GitHub answered ${res.status}. Try again later.`);
    const r = await res.json();
    const latest = String(r.tag_name || '').replace(/^v/i, '');
    if (!latest) throw new Error('GitHub returned a release without a version.');
    const asset = kind === 'dev' || kind === 'unsupported' ? null : pickAsset(r.assets, kind, latest);
    const sums = (r.assets || []).find(a => a.name === 'SHA256SUMS.txt');
    this.release = {tag: r.tag_name, version: latest, asset, sums};
    this.file = null;
    return {
      current, latest, kind,
      available: compareVersions(latest, current) > 0,
      name: r.name || `Aster ${latest}`,
      notes: String(r.body || '').slice(0, 20000),
      url: r.html_url || `https://github.com/${REPO}/releases/latest`,
      publishedAt: r.published_at || null,
      asset: asset ? {name: asset.name, size: asset.size} : null,
      checkedAt: new Date().toISOString()
    };
  }

  cancel() { this.abort?.abort(); return {ok: true}; }

  async download() {
    const rel = this.release;
    if (!rel) throw new Error('Check for updates first.');
    if (compareVersions(rel.version, this.app.getVersion()) <= 0) throw new Error('You already have the latest version.');
    if (!rel.asset) throw new Error('This release has no download for your system. Open the release page instead.');
    if (!rel.sums) throw new Error('This release has no checksums, so Aster can\'t verify the download. Open the release page instead.');
    if (!isReleaseUrl(rel.asset.browser_download_url, rel.tag, rel.asset.name) || !isReleaseUrl(rel.sums.browser_download_url, rel.tag, rel.sums.name)) throw new Error('Unexpected download address.');
    if (this.busy) throw new Error('A download is already running.');
    this.busy = true;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const dir = path.join(this.app.getPath('temp'), 'aster-update');
    const file = path.join(dir, rel.asset.name);
    try {
      const sumsRes = await this.fetch(rel.sums.browser_download_url, {headers: {'User-Agent': HEADERS['User-Agent']}, signal});
      if (!sumsRes.ok) throw new Error(`Could not download the checksums (${sumsRes.status}).`);
      const expected = parseSums(await sumsRes.text()).get(rel.asset.name);
      if (!expected) throw new Error(`The checksums don't list ${rel.asset.name}.`);

      try { fs.rmSync(dir, {recursive: true, force: true}); } catch {}
      fs.mkdirSync(dir, {recursive: true});
      const res = await this.fetch(rel.asset.browser_download_url, {headers: {'User-Agent': HEADERS['User-Agent']}, signal});
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`);
      const total = Number(res.headers.get('content-length')) || rel.asset.size || 0;
      const hash = crypto.createHash('sha256');
      let done = 0, last = 0;
      const meter = new Transform({transform: (chunk, _enc, cb) => {
        hash.update(chunk); done += chunk.length;
        const now = Date.now();
        if (now - last > 200) { last = now; this.onProgress({phase: 'download', done, total}); }
        cb(null, chunk);
      }});
      await pipeline(Readable.fromWeb(res.body), meter, fs.createWriteStream(file), {signal});
      this.onProgress({phase: 'download', done, total});
      if (rel.asset.size && done !== rel.asset.size) throw new Error('The download is incomplete. Try again.');
      if (hash.digest('hex') !== expected) throw new Error('The download doesn\'t match its published checksum, so it was discarded. Try again.');
      this.file = {path: file, version: rel.version, name: rel.asset.name};
      return {ok: true, version: rel.version, name: rel.asset.name, bytes: done};
    } catch (e) {
      fs.rmSync(file, {force: true});
      if (signal.aborted) throw new Error('Download cancelled.');
      throw e;
    } finally { this.busy = false; this.abort = null; }
  }

  // Starts the verified download. On Windows Aster closes and the new version opens by itself.
  async install() {
    const f = this.file;
    if (!f || !fs.existsSync(f.path)) throw new Error('Download the update first.');
    const kind = this.kind();
    const launch = (file, args, opts = {}) => {
      const child = this.spawn(file, args, {detached: true, stdio: 'ignore', ...opts});
      child.on?.('error', () => {});
      child.unref?.();
    };
    this.store?.log({kind: 'update', title: `Updating Aster to ${f.version}`});
    if (kind === 'installer') {
      // Silent per-user install into the current folder, then relaunch (electron-builder NSIS flags).
      // NSIS wants /D= last and unquoted, so the command line is passed verbatim with a quoted program path.
      const dir = path.dirname(process.execPath);
      launch(f.path, ['/S', '--updated', '--force-run', `/D=${dir}`], {windowsVerbatimArguments: true, argv0: `"${f.path}"`});
      setTimeout(() => this.app.quit(), 400);
      return {ok: true, restarting: true, message: `Installing Aster ${f.version}. Aster will reopen in a moment.`};
    }
    if (kind === 'portable') {
      const target = path.join(path.dirname(process.env.PORTABLE_EXECUTABLE_FILE), f.name);
      fs.copyFileSync(f.path, target);
      launch(target, []);
      setTimeout(() => this.app.quit(), 400);
      return {ok: true, restarting: true, message: `Opening Aster ${f.version}. The new version was saved as ${f.name} next to the old one, which you can delete.`};
    }
    if (kind === 'mac') {
      const target = path.join(this.app.getPath('downloads'), f.name);
      fs.copyFileSync(f.path, target);
      const err = await this.shell.openPath(target);
      if (err) throw new Error(err);
      return {ok: true, restarting: false, message: `Aster ${f.version} is open in Finder. Quit Aster, drag the new Aster into Applications and choose Replace.`};
    }
    if (kind === 'manual') {
      launch(f.path, []);
      return {ok: true, restarting: false, message: `The Aster ${f.version} installer is open. Follow its steps; it will close this copy of Aster.`};
    }
    throw new Error('Updates can only be installed in the packaged app.');
  }
}

module.exports = {Updater, compareVersions, installKind, assetNames, pickAsset, parseSums, isReleaseUrl, REPO};
