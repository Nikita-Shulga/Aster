'use strict';
// Windows-only suite (macOS has its own in mac.test.cjs).
if (process.platform !== 'win32') { require('node:test').test('registry (Windows only)', {skip: true}, () => {}); return; }
// Uses a throwaway key (HKCU\Software\AsterSelfTest) that is created and removed by the test.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {Store} = require('../src/main/store.cjs');
const {Registry} = require('../src/main/registry.cjs');

const KEY = 'HKCU\\Software\\AsterSelfTest';
const reg = (...a) => execFileSync('reg.exe', a, {encoding: 'utf8', windowsHide: true});
const query = (k = KEY) => { try { return reg('query', k, '/s'); } catch { return null; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-reg-'));
const store = new Store(dir);
const registry = new Registry({store});

test.before(() => {
  try { reg('delete', KEY, '/f'); } catch {}
  reg('add', KEY, '/v', 'Text', '/t', 'REG_SZ', '/d', 'C:\\Path "quoted" \\value', '/f');
  reg('add', KEY, '/v', 'Number', '/t', 'REG_DWORD', '/d', '4294967295', '/f');
  reg('add', KEY, '/v', 'Expand', '/t', 'REG_EXPAND_SZ', '/d', '%SystemRoot%\\x', '/f');
  reg('add', KEY, '/v', 'Multi', '/t', 'REG_MULTI_SZ', '/d', 'a\\0b', '/f');
  reg('add', KEY, '/v', 'Bin', '/t', 'REG_BINARY', '/d', '00ff10', '/f');
  reg('add', KEY, '/v', 'Big', '/t', 'REG_QWORD', '/d', '0x1122334455667788', '/f');
  reg('add', `${KEY}\\Child`, '/v', 'Inner', '/t', 'REG_SZ', '/d', 'x', '/f');
});
test.after(() => { try { reg('delete', KEY, '/f'); } catch {} fs.rmSync(dir, {recursive: true, force: true}); });

test('list reads every value type', async () => {
  const r = await registry.list({path: KEY});
  const v = Object.fromEntries(r.values.map(x => [x.name, x]));
  assert.strictEqual(v.Text.data, 'C:\\Path "quoted" \\value');
  assert.strictEqual(v.Number.data, 4294967295);
  assert.strictEqual(v.Expand.data, '%SystemRoot%\\x');
  assert.deepStrictEqual(v.Multi.data, ['a', 'b']);
  assert.strictEqual(v.Bin.data, '00,ff,10');
  assert.strictEqual(v.Big.data, String(0x1122334455667788n));
  assert.deepStrictEqual(r.keys.map(k => k.name), ['Child']);
});

test('fix backs up values and keys, and the backup restores them exactly', async () => {
  const before = query();
  // Inject issues the way a scan would produce them.
  registry.issues.set('a', {id: 'a', path: KEY, value: 'Text', action: 'deleteValue'});
  registry.issues.set('b', {id: 'b', path: KEY, value: 'Multi', action: 'deleteValue'});
  registry.issues.set('c', {id: 'c', path: KEY, value: 'Big', action: 'deleteValue'});
  registry.issues.set('d', {id: 'd', path: `${KEY}\\Child`, value: null, action: 'deleteKey'});
  const r = await registry.fix({ids: ['a', 'b', 'c', 'd']});
  assert.deepStrictEqual(r.fixed.sort(), ['a', 'b', 'c', 'd']);
  const after = query();
  assert.ok(!/\bText\b/.test(after) && !/Child/.test(after) && !/\bBig\b/.test(after));
  await store.restoreBackup(r.backup);
  assert.strictEqual(query(), before, 'restored state matches original');
});

test('editor operations each create a working undo backup', async () => {
  const original = query();
  const ops = [
    {op: 'setValue', name: 'Number', kind: 'DWord', data: 7},
    {op: 'setValue', name: 'NewOne', kind: 'String', data: 'hello'},
    {op: 'setValue', name: 'Bin', kind: 'Binary', data: 'de ad be ef'},
    {op: 'setValue', name: 'Multi', kind: 'MultiString', data: ['x', 'y', 'z']},
    {op: 'renameValue', name: 'Expand', newName: 'Renamed'},
    {op: 'deleteValue', name: 'Text'},
    {op: 'createKey', name: 'Made'}
  ];
  for (const o of ops) {
    const snapshot = query();
    const res = await registry.edit({path: KEY, ...o});
    assert.notStrictEqual(query(), snapshot, `${o.op} changed something`);
    await store.restoreBackup(res.backup);
    assert.strictEqual(query(), snapshot, `${o.op} backup restores the previous state`);
  }
  const list = await registry.list({path: KEY});
  assert.strictEqual(list.values.find(v => v.name === 'Number').data, 4294967295);
  assert.strictEqual(query(), original);
});

test('delete key refuses protected roots', async () => {
  await assert.rejects(registry.edit({op: 'deleteKey', path: 'HKCU\\Software'}), /protected/);
  await assert.rejects(registry.edit({op: 'deleteKey', path: 'HKLM\\SYSTEM\\CurrentControlSet'}), /protected/);
  await assert.rejects(registry.edit({op: 'deleteKey', path: 'HKCU\\Software\\Microsoft'}), /protected/);
});

test('scan returns well-formed issues', async () => {
  const r = await registry.scan({categories: ['muicache', 'compat', 'empty']});
  for (const i of r.items) {
    assert.ok(i.id && i.path && i.action && i.title);
    assert.ok(['deleteKey', 'deleteValue'].includes(i.action));
    if (i.action === 'deleteValue') assert.ok(typeof i.value === 'string');
  }
});
