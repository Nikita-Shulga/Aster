'use strict';
// Windows-only suite (macOS has its own in mac.test.cjs).
if (process.platform !== 'win32') { require('node:test').test('tweaks (Windows only)', {skip: true}, () => {}); return; }
// Flips two harmless per-user tweaks and restores the original values.
const test = require('node:test');
const assert = require('node:assert');
const {Tweaks, TWEAKS} = require('../src/main/tweaks.cjs');

const logs = [];
const tweaks = new Tweaks({store: {log: e => logs.push(e)}, buildNumber: async () => 26200});

test('every tweak is fully described', () => {
  for (const t of TWEAKS) {
    assert.ok(t.title && t.what && t.get && t.set && t.verdict, t.id);
    if (t.type === 'toggle') assert.ok(t.on && t.off && t.pro && t.con, `${t.id} needs on/off/pro/con`);
    else assert.ok(t.options?.length >= 2, `${t.id} needs options`);
  }
});

test('all tweak states can be read', async () => {
  const r = await tweaks.list({groups: ['performance', 'gaming', 'privacy', 'appearance', 'explorer', 'taskbar']});
  const unreadable = r.items.filter(i => i.value === null).map(i => i.id);
  assert.deepStrictEqual(unreadable, []);
});

for (const id of ['menuDelay', 'startupDelay']) {
  test(`${id} can be changed and restored`, async () => {
    const read = async () => (await tweaks.list({groups: ['performance']})).items.find(i => i.id === id).value;
    const original = await read();
    try {
      const r = await tweaks.set({id, value: !original});
      assert.strictEqual(r.value, !original);
      assert.strictEqual(await read(), !original);
    } finally {
      await tweaks.set({id, value: original});
    }
    assert.strictEqual(await read(), original);
    assert.ok(logs.some(l => /→/.test(l.title)), 'change is logged with before → after');
  });
}

test('invalid values are rejected', async () => {
  await assert.rejects(tweaks.set({id: 'menuDelay', value: 'yes'}), /Invalid/);
  await assert.rejects(tweaks.set({id: 'taskbarAlign', value: 'top'}), /Invalid/);
  await assert.rejects(tweaks.set({id: 'nope', value: true}), /Unknown/);
});
