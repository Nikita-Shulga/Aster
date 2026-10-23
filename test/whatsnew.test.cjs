'use strict';
// What's new page: in step with CHANGELOG.md and package.json, translated, newest first.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'js', 'whats-new.js')));

test('every version in CHANGELOG.md is on the What’s new page with the same date, and the newest is this version', async () => {
  const {RELEASES} = await load();
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  const listed = [...changelog.matchAll(/^## (\d+\.\d+\.\d+) — (\d{4}-\d\d-\d\d)/gm)].map(m => ({version: m[1], date: m[2]}));
  assert.deepStrictEqual(RELEASES.map(r => ({version: r.version, date: r.date})), listed);
  assert.strictEqual(RELEASES[0].version, require('../package.json').version);
});

test('each version has a title and short lines in English and Russian, newest first', async () => {
  const {RELEASES, compareVersions} = await load();
  for (let i = 1; i < RELEASES.length; i++) assert.ok(compareVersions(RELEASES[i - 1].version, RELEASES[i].version) > 0, RELEASES[i].version);
  for (const r of RELEASES) {
    for (const lang of ['en', 'ru']) assert.ok(r.title[lang]?.trim(), `${r.version} title ${lang}`);
    assert.ok(r.items.length > 0 && r.items.length <= 8, `${r.version}: 1–8 lines`);
    for (const item of r.items) {
      for (const lang of ['en', 'ru']) assert.ok(item[lang]?.trim() && item[lang].length <= 200, `${r.version} ${lang}: ${item.en}`);
      assert.ok(!item.os || ['win', 'mac'].includes(item.os));
    }
  }
});

test('versions compare by number, not as text', async () => {
  const {compareVersions} = await load();
  assert.ok(compareVersions('2.10.0', '2.9.1') > 0);
  assert.ok(compareVersions('2.6.0', '2.7.0') < 0);
  assert.strictEqual(compareVersions('2.6.0', '2.6.0'), 0);
  assert.ok(compareVersions('2.6.0', '0') > 0);
});

test('the last seen version is stored only as a version number', () => {
  const {Store} = require('../src/main/store.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-seen-'));
  try {
    const store = new Store(dir);
    assert.strictEqual(store.getSettings().seenVersion, null);
    assert.strictEqual(store.updateSettings({seenVersion: '2.7.0'}).seenVersion, '2.7.0');
    assert.strictEqual(store.updateSettings({seenVersion: '<b>x</b>'}).seenVersion, null);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
