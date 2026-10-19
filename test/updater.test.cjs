'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {Updater, compareVersions, installKind, pickAsset, parseSums, isReleaseUrl} = require('../src/main/updater.cjs');

test('versions compare numerically, with pre-releases before releases', () => {
  assert.strictEqual(compareVersions('2.1.0', '2.0.9'), 1);
  assert.strictEqual(compareVersions('v2.10.0', '2.9.0'), 1);
  assert.strictEqual(compareVersions('2.1', '2.1.0'), 0);
  assert.strictEqual(compareVersions('2.1.0', '2.1.0'), 0);
  assert.strictEqual(compareVersions('2.0.0', '2.1.0'), -1);
  assert.strictEqual(compareVersions('3.0.0-beta.1', '3.0.0'), -1);
  assert.strictEqual(compareVersions('3.0.0', '3.0.0-beta.2'), 1);
});

test('install kind follows how Aster was installed', () => {
  const exe = 'C:\\Apps\\Aster\\Aster.exe';
  assert.strictEqual(installKind({packaged: false, platform: 'win32'}), 'dev');
  assert.strictEqual(installKind({packaged: true, platform: 'darwin'}), 'mac');
  assert.strictEqual(installKind({packaged: true, platform: 'win32', env: {PORTABLE_EXECUTABLE_FILE: 'D:\\Aster.exe'}, execPath: exe}), 'portable');
  assert.strictEqual(installKind({packaged: true, platform: 'win32', env: {}, execPath: exe, exists: p => p === path.join(path.dirname(exe), 'Uninstall Aster.exe')}), 'installer');
  assert.strictEqual(installKind({packaged: true, platform: 'win32', env: {}, execPath: exe, exists: () => false}), 'manual');
});

test('the right release file is picked for each kind of install', () => {
  const assets = ['Aster-Setup-2.2.0.exe', 'Aster-2.2.0-portable.exe', 'Aster-2.2.0-mac-arm64.dmg', 'Aster-2.2.0-mac-x64.dmg', 'Aster-Windows-Setup.exe', 'SHA256SUMS.txt'].map(name => ({name}));
  assert.strictEqual(pickAsset(assets, 'installer', '2.2.0').name, 'Aster-Setup-2.2.0.exe');
  assert.strictEqual(pickAsset(assets, 'manual', '2.2.0').name, 'Aster-Setup-2.2.0.exe');
  assert.strictEqual(pickAsset(assets, 'portable', '2.2.0').name, 'Aster-2.2.0-portable.exe');
  assert.strictEqual(pickAsset(assets, 'mac', '2.2.0', 'arm64').name, 'Aster-2.2.0-mac-arm64.dmg');
  assert.strictEqual(pickAsset(assets, 'mac', '2.2.0', 'x64').name, 'Aster-2.2.0-mac-x64.dmg');
  assert.strictEqual(pickAsset([{name: 'Aster-Windows-Setup.exe'}], 'installer', '9.9.9').name, 'Aster-Windows-Setup.exe');
  assert.strictEqual(pickAsset([{name: 'notes.md'}], 'installer', '2.2.0'), null);
});

test('checksum files and download addresses are parsed strictly', () => {
  const sums = parseSums(`${'a'.repeat(64)}  Aster-Setup-2.2.0.exe\r\n${'B'.repeat(64)} *Aster 2.2.0.dmg\nnot a line\n`);
  assert.strictEqual(sums.get('Aster-Setup-2.2.0.exe'), 'a'.repeat(64));
  assert.strictEqual(sums.get('Aster 2.2.0.dmg'), 'b'.repeat(64));
  assert.strictEqual(sums.size, 2);
  assert.ok(isReleaseUrl('https://github.com/Nikita-Shulga/Aster/releases/download/v2.2.0/Aster-Setup-2.2.0.exe', 'v2.2.0', 'Aster-Setup-2.2.0.exe'));
  assert.ok(!isReleaseUrl('https://evil.example/Aster-Setup-2.2.0.exe', 'v2.2.0', 'Aster-Setup-2.2.0.exe'));
  assert.ok(!isReleaseUrl('https://github.com/someone/Aster/releases/download/v2.2.0/Aster-Setup-2.2.0.exe', 'v2.2.0', 'Aster-Setup-2.2.0.exe'));
});

// A fake GitHub: the latest release, its checksums and one installer.
function fakeGitHub({version = '9.0.0', payload = Buffer.from('new Aster installer'), sum} = {}) {
  const tag = `v${version}`;
  const name = process.platform === 'darwin' ? `Aster-${version}-mac-${process.arch}.dmg` : `Aster-Setup-${version}.exe`;
  const base = `https://github.com/Nikita-Shulga/Aster/releases/download/${tag}/`;
  const digest = sum || crypto.createHash('sha256').update(payload).digest('hex');
  const release = {tag_name: tag, name: `Aster ${version}`, body: '## New\n- Things', html_url: 'https://github.com/Nikita-Shulga/Aster/releases/tag/' + tag, published_at: '2026-10-20T00:00:00Z',
    assets: [{name, size: payload.length, browser_download_url: base + name}, {name: 'SHA256SUMS.txt', size: 100, browser_download_url: base + 'SHA256SUMS.txt'}]};
  const fetch = async url => {
    if (url.endsWith('/releases/latest')) return new Response(JSON.stringify(release), {status: 200});
    if (url === base + 'SHA256SUMS.txt') return new Response(`${digest}  ${name}\n`, {status: 200});
    if (url === base + name) return new Response(payload, {status: 200, headers: {'content-length': String(payload.length)}});
    return new Response('not found', {status: 404});
  };
  return {fetch, name};
}

function fakeApp(version, tmp) {
  return {isPackaged: true, getVersion: () => version, getPath: () => tmp, quit() {}};
}

test('check reports a newer release; download verifies it against the checksum', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-upd-'));
  try {
    const gh = fakeGitHub();
    const progress = [];
    const u = new Updater({app: fakeApp('2.1.0', tmp), shell: {}, fetch: gh.fetch, onProgress: p => progress.push(p)});
    const info = await u.check();
    assert.strictEqual(info.available, true);
    assert.strictEqual(info.latest, '9.0.0');
    assert.strictEqual(info.current, '2.1.0');
    const r = await u.download();
    assert.strictEqual(r.ok, true);
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'aster-update', gh.name), 'utf8'), 'new Aster installer');
    assert.ok(progress.length >= 1 && progress.at(-1).done === progress.at(-1).total);
  } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
});

test('a download that does not match its checksum is discarded', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-upd-'));
  try {
    const gh = fakeGitHub({sum: '0'.repeat(64)});
    const u = new Updater({app: fakeApp('2.1.0', tmp), shell: {}, fetch: gh.fetch});
    await u.check();
    await assert.rejects(u.download(), /checksum/);
    assert.ok(!fs.existsSync(path.join(tmp, 'aster-update', gh.name)));
    await assert.rejects(u.install(), /Download the update first/);
  } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
});

test('no update is offered when the installed version is current', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-upd-'));
  try {
    const u = new Updater({app: fakeApp('9.0.0', tmp), shell: {}, fetch: fakeGitHub().fetch});
    assert.strictEqual((await u.check()).available, false);
    await assert.rejects(u.download(), /latest version/);
  } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
});
