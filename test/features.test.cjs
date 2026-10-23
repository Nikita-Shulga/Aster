'use strict';
// Choosing single Cleaner files, empty folders, drive health, repair progress and automatic cleaning.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const isWin = process.platform === 'win32';

test('empty folders: nested empty folders are one entry, files and hidden folders keep a folder, re-checked before removal', async () => {
  const {Disk} = require('../src/main/disk.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-empty-'));
  for (const d of ['a/b/c', 'a/d', 'keep/sub', 'junk', '.hidden/x']) fs.mkdirSync(path.join(root, d), {recursive: true});
  fs.writeFileSync(path.join(root, 'keep', 'file.txt'), 'x');
  fs.writeFileSync(path.join(root, 'junk', isWin ? 'Thumbs.db' : '.DS_Store'), 'x');
  const trashed = [];
  const disk = new Disk({store: {log() {}}, trash: async p => { trashed.push(p); fs.rmSync(p, {recursive: true}); }});
  try {
    const r = await disk.findEmptyFolders({roots: [root]});
    const found = r.folders.map(f => path.relative(root, f.path)).sort();
    assert.deepStrictEqual(found, ['a', 'junk', path.join('keep', 'sub')].sort());
    assert.strictEqual(r.folders.find(f => path.relative(root, f.path) === 'a').nested, 3);
    fs.writeFileSync(path.join(root, 'a', 'd', 'new.txt'), 'x'); // no longer empty
    const res = await disk.trashEmptyFolders({paths: [...r.folders.map(f => f.path), 'relative/path']});
    assert.deepStrictEqual(res.done.map(p => path.relative(root, p)).sort(), ['junk', path.join('keep', 'sub')].sort());
    assert.ok(fs.existsSync(path.join(root, 'a', 'd', 'new.txt')));
    assert.strictEqual(res.failed.length, 2);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('drive health verdicts: Windows status, wear and read errors; macOS SMART status', () => {
  const {verdict} = require('../src/main/health.cjs');
  assert.strictEqual(verdict({health: 'Healthy'}), 'good');
  assert.strictEqual(verdict({health: 'Healthy', wear: 95}), 'warning');
  assert.strictEqual(verdict({health: 'Healthy', readErrors: 3}), 'warning');
  assert.strictEqual(verdict({health: 'Warning'}), 'warning');
  assert.strictEqual(verdict({health: 'Unhealthy'}), 'failing');
  assert.strictEqual(verdict({health: ''}), 'unknown');
  const mac = require('../src/main/mac/health.cjs');
  assert.strictEqual(mac.verdict('Verified'), 'good');
  assert.strictEqual(mac.verdict('Failing'), 'failing');
  assert.strictEqual(mac.verdict('Not Supported'), 'unknown');
  assert.strictEqual(mac.plistValue('<key>SolidState</key><true/>', 'SolidState'), true);
  assert.strictEqual(mac.plistValue('<key>SMARTStatus</key>\n<string>Verified</string>', 'SMARTStatus'), 'Verified');
});

test('repair progress is read from sfc (UTF-16) and DISM (code page) output', () => {
  const {percent, readLog} = require('../src/main/repair.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-repair-'));
  try {
    const sfc = path.join(dir, 'sfc.log');
    fs.writeFileSync(sfc, Buffer.from('\uFEFFBeginning verification phase.\r\nVerification 12% complete.\rVerification 47% complete.', 'utf16le'));
    assert.strictEqual(percent(readLog(sfc)), 47);
    const dism = path.join(dir, 'dism.log');
    fs.writeFileSync(dism, '[=====                      10.0%                          ]\r[==========                 62,3%                          ]');
    assert.strictEqual(percent(readLog(dism)), 62.3);
    assert.strictEqual(percent(''), null);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('repair scripts are valid PowerShell', {skip: !isWin && 'Windows only'}, async () => {
  const {psJson} = require('../src/main/ps.cjs');
  const src = fs.readFileSync(require.resolve('../src/main/repair.cjs'), 'utf8');
  const body = /const SCRIPTS = \{([\s\S]*?)\n\};/.exec(src)[1];
  // Rebuild each script with sample values, as repair.cjs does, and let PowerShell's parser check it.
  const {sys32} = require('../src/main/ps.cjs');
  const q = s => s.replace(/'/g, "''");
  const SCRIPTS = eval(`({${body}})`); // eslint-disable-line no-eval
  for (const [id, make] of Object.entries(SCRIPTS)) {
    const script = make('C:\\Temp\\aster-repair.log', 'C');
    const errors = await psJson('$e = $null; [void][Management.Automation.Language.Parser]::ParseInput($in.s, [ref]$null, [ref]$e); Out-Json @($e | ForEach-Object { $_.Message })', {s: `${script}\nexit $code`});
    assert.deepStrictEqual(errors || [], [], id);
  }
  assert.ok(sys32 && q);
});

test('automatic cleaning takes only selected Safe items that need no admin rights or Full Disk Access', async () => {
  const {runAutoClean} = require('../src/main/schedule.cjs');
  const rules = [
    {id: 'a', verdict: 'safe', installed: true}, {id: 'b', verdict: 'review', installed: true}, {id: 'c', verdict: 'safe', installed: true, admin: true},
    {id: 'd', verdict: 'safe', installed: false}, {id: 'e', verdict: 'safe', installed: true, fda: true}, {id: 'f', verdict: 'safe', installed: true, defaultOn: true}
  ];
  const logged = [];
  let settings = {cleanerSelection: ['a', 'b', 'c', 'd', 'e']};
  const store = {getSettings: () => settings, log: e => logged.push(e)};
  let cleaned = null;
  const cleaner = {rules: () => ({rules}), clean: async ({ids, closeApps}) => { cleaned = ids; assert.strictEqual(closeApps, false); return {freed: 2048, deleted: 3}; }};
  await runAutoClean({store, cleaner, admin: false, fda: false});
  assert.deepStrictEqual(cleaned, ['a']);
  assert.strictEqual(logged[0].key, 'activity.autoClean');
  assert.strictEqual(logged[0].bytes, 2048);
  // Elevated with Full Disk Access: admin and FDA items join in. No saved selection: the defaults.
  await runAutoClean({store, cleaner, admin: true, fda: true});
  assert.deepStrictEqual(cleaned, ['a', 'c', 'e']);
  settings = {cleanerSelection: null};
  await runAutoClean({store, cleaner});
  assert.deepStrictEqual(cleaned, ['f']);
  // Nothing selected that qualifies: no run, nothing logged.
  settings = {cleanerSelection: ['b']};
  logged.length = 0;
  assert.strictEqual(await runAutoClean({store, cleaner}), null);
  assert.strictEqual(logged.length, 0);
});

test('the automatic-cleaning setting is stored in a fixed shape', () => {
  const {Store} = require('../src/main/store.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-store-'));
  try {
    const store = new Store(dir);
    assert.strictEqual(store.getSettings().autoClean, null);
    assert.deepStrictEqual(store.updateSettings({autoClean: {enabled: true, frequency: 'hourly', notify: 0, extra: 1}}).autoClean, {enabled: true, frequency: 'weekly', notify: true});
    assert.deepStrictEqual(store.updateSettings({autoClean: {enabled: 'yes', frequency: 'daily', notify: false}}).autoClean, {enabled: false, frequency: 'daily', notify: false});
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('Cleaner: every file of an item can be listed and removed one by one, never anything outside it', {skip: !isWin && 'Windows only', timeout: 120000}, async () => {
  const {Cleaner} = require('../src/main/cleaner.cjs');
  const trashed = [];
  const cleaner = new Cleaner({getSettings: () => ({exclusions: []}), getDrives: async () => [{name: 'C:'}], trash: async p => { trashed.push(p); fs.rmSync(p); }});
  // Two old files in the user's temp folder (the Windows temp item skips files changed in the last day).
  const old = new Date(Date.now() - 3 * 864e5);
  const files = ['aster-test-a.tmp', 'aster-test-b.tmp'].map(n => path.join(os.tmpdir(), n));
  for (const f of files) { fs.writeFileSync(f, 'x'.repeat(4096)); fs.utimesSync(f, old, old); }
  try {
    const list = await cleaner.listFiles({id: 'windows.temp'});
    assert.ok(list.total >= 2 && list.files.length <= 5000);
    for (const f of files) assert.ok(list.files.some(x => x.path.toLowerCase() === f.toLowerCase()), f);
    const toBin = await cleaner.removeFiles({id: 'windows.temp', paths: [files[0]]});
    assert.deepStrictEqual(toBin.done.length, 1);
    assert.strictEqual(trashed.length, 1);
    const deleted = await cleaner.removeFiles({id: 'windows.temp', paths: [files[1]], permanent: true});
    assert.strictEqual(deleted.done.length, 1);
    assert.strictEqual(trashed.length, 1, 'deleted, not sent to the Recycle Bin');
    assert.ok(!fs.existsSync(files[1]));
    const forged = await cleaner.removeFiles({id: 'windows.temp', paths: [path.join(process.env.SystemRoot || 'C:\\Windows', 'win.ini')], permanent: true});
    assert.strictEqual(forged.done.length, 0);
  } finally { for (const f of files) fs.rmSync(f, {force: true}); }
});
