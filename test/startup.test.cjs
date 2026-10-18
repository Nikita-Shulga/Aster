'use strict';
// Windows-only suite (macOS has its own in mac.test.cjs).
if (process.platform !== 'win32') { require('node:test').test('startup (Windows only)', {skip: true}, () => {}); return; }
// Adds a temporary HKCU Run entry named AsterSelfTest, exercises it, and removes it again.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {Store} = require('../src/main/store.cjs');
const {Startup} = require('../src/main/startup.cjs');

const RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const APPROVED = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
const NAME = 'AsterSelfTest';
const reg = (...a) => { try { return execFileSync('reg.exe', a, {encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']}); } catch { return null; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-startup-'));
const store = new Store(dir);
const startup = new Startup({store, getIcon: async () => null, trash: async () => {}});
const cleanup = () => { reg('delete', RUN, '/v', NAME, '/f'); reg('delete', APPROVED, '/v', NAME, '/f'); };

test.before(cleanup);
test.after(() => { cleanup(); fs.rmSync(dir, {recursive: true, force: true}); });

test('add, disable, enable, remove and restore a startup entry', async () => {
  await startup.add({name: NAME, command: `"${process.env.SystemRoot}\\notepad.exe"`});
  let item = (await startup.list()).items.find(i => i.name === NAME && i.type === 'registry');
  assert.ok(item, 'entry listed');
  assert.strictEqual(item.enabled, true);
  assert.strictEqual(item.exists, true);
  assert.match(item.publisher || '', /Microsoft/);

  await startup.toggle({id: item.id, enabled: false});
  assert.match(reg('query', APPROVED, '/v', NAME), /REG_BINARY\s+03/);
  item = (await startup.list()).items.find(i => i.name === NAME);
  assert.strictEqual(item.enabled, false, 'Windows reports it disabled');

  await startup.toggle({id: item.id, enabled: true});
  assert.match(reg('query', APPROVED, '/v', NAME), /REG_BINARY\s+02/);

  const removed = await startup.remove({id: item.id});
  assert.strictEqual(reg('query', RUN, '/v', NAME), null, 'value deleted');
  await store.restoreBackup(removed.backup);
  assert.match(reg('query', RUN, '/v', NAME), /notepad\.exe/, 'backup restores the entry');
});
