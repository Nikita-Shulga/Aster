'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {parseTable} = require('../src/main/updates.cjs');
const {splitCommand, normalize} = require('../src/main/programs.cjs');
const {Disk} = require('../src/main/disk.cjs');

test('winget table parsing handles localized headers and spaced versions', () => {
  const out = [
    '   - \\ |',
    'Имя                                     ИД                                Версия          Доступно',
    '------------------------------------------------------------------------------------------------',
    'Zoom Workplace                          Zoom.Zoom.EXE                     7.1.9 (48550)   7.2.1 (48556)',
    'Ubisoft Connect                         Ubisoft.Connect                   < 174.2.0.13389 174.2.0.13389',
    'WinRAR 7.20 (64-разрядная)              RARLab.WinRAR                     7.20.0          7.23.0',
    'Доступны обновления: 3.'
  ].join('\r\n');
  const rows = parseTable(out);
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows[0], {name: 'Zoom Workplace', id: 'Zoom.Zoom.EXE', installed: '7.1.9 (48550)', available: '7.2.1 (48556)', truncated: false});
  assert.strictEqual(rows[2].id, 'RARLab.WinRAR');
  assert.deepStrictEqual(parseTable('No installed package found matching input criteria.'), []);
});

test('uninstall command splitting', () => {
  assert.deepStrictEqual(splitCommand('"C:\\Program Files\\App\\unins000.exe" /SILENT'), {file: 'C:\\Program Files\\App\\unins000.exe', args: '/SILENT'});
  assert.deepStrictEqual(splitCommand('C:\\Program Files\\App\\uninstall.exe --x'), {file: 'C:\\Program Files\\App\\uninstall.exe', args: '--x'});
  assert.deepStrictEqual(splitCommand('MsiExec.exe /I{1234}'), {file: 'MsiExec.exe', args: '/I{1234}'});
  assert.strictEqual(splitCommand(''), null);
});

test('program names normalize for leftover matching', () => {
  assert.strictEqual(normalize('WinRAR 7.20 (64-bit)'), 'winrar');
  assert.strictEqual(normalize('Mozilla Firefox (x64 en-US)'), 'mozilla firefox');
  assert.strictEqual(normalize('Notepad++ 8.6.4'), 'notepad++');
});

test('disk analyzer sizes folders and finds content duplicates', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-disk-'));
  const w = (p, data) => { fs.mkdirSync(path.dirname(path.join(root, p)), {recursive: true}); fs.writeFileSync(path.join(root, p), data); };
  const big = Buffer.alloc(200 * 1024, 7);
  w('a/one.bin', big); w('b/two.bin', big); w('b/c/three.bin', big);
  w('a/different.bin', Buffer.alloc(100 * 1024, 9));
  w('small.txt', 'hello');
  const trashed = [];
  const disk = new Disk({store: {log() {}}, trash: async p => { trashed.push(p); fs.rmSync(p, {recursive: true}); }});

  const a = await disk.analyze({root});
  assert.strictEqual(a.files, 5);
  assert.strictEqual(a.size, 3 * 200 * 1024 + 100 * 1024 + 5);
  const kids = await disk.children({path: root});
  assert.deepStrictEqual(kids.items.filter(i => i.dir).map(i => i.name), ['b', 'a']);

  const d = await disk.findDuplicates({roots: [root], minSize: 1024});
  assert.strictEqual(d.groups.length, 1);
  assert.strictEqual(d.groups[0].files.length, 3);
  assert.strictEqual(d.wasted, 2 * 200 * 1024);

  const t = await disk.trashPaths({paths: [path.join(root, 'b', 'c')]});
  assert.strictEqual(t.done.length, 1);
  const after = await disk.children({path: path.join(root, 'b')});
  assert.strictEqual(after.size, 200 * 1024, 'tree sizes update after deletion');
  fs.rmSync(root, {recursive: true, force: true});
});
