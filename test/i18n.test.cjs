'use strict';
// Interface language: dictionaries stay in sync, every explanation has a Russian translation, English is the default.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const SRC = path.join(__dirname, '..', 'src');
const i18n = require('../src/main/i18n.cjs');
const ruData = require('../src/main/locales/ru-data/index.cjs');

const placeholders = s => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort().join(',');
const tags = s => [...String(s).matchAll(/<\/?([a-z]+)[^>]*>/g)].map(m => m[0].startsWith('</') ? '/' + m[1] : m[1]).join(' ');
const forms = v => typeof v === 'string' ? [v] : Object.values(v);

// Same keys, no empty text, the same placeholders and markup in every language and plural form.
function checkPair(name, en, ru) {
  assert.deepStrictEqual(Object.keys(ru).sort(), Object.keys(en).sort(), `${name}: English and Russian keys differ`);
  for (const key of Object.keys(en)) {
    for (const [lang, v] of [['en', en[key]], ['ru', ru[key]]]) {
      assert.ok(typeof v === 'string' || (v && typeof v === 'object'), `${name} ${lang} ${key}: not text`);
      for (const f of forms(v)) assert.ok(typeof f === 'string' && f.trim(), `${name} ${lang} ${key}: empty text`);
      if (typeof v === 'object') {
        const need = lang === 'ru' ? ['one', 'few', 'many', 'other'] : ['one', 'other'];
        for (const form of need) assert.ok(v[form], `${name} ${lang} ${key}: plural form "${form}" missing`);
      }
    }
    const want = placeholders(forms(en[key])[forms(en[key]).length - 1]);
    for (const f of [...forms(en[key]), ...forms(ru[key])]) {
      // A singular form may spell the number out ("1 file") but must not invent placeholders.
      const got = placeholders(f);
      assert.ok(got === want || (typeof en[key] === 'object' && got.split(',').every(p => !p || want.split(',').includes(p))), `${name} ${key}: placeholders {${got}} ≠ {${want}}`);
      assert.strictEqual(tags(f), tags(forms(en[key])[0]), `${name} ${key}: markup differs`);
    }
  }
}

test('renderer dictionaries: same keys, placeholders and markup in English and Russian', async () => {
  const en = (await import(pathToFileURL(path.join(SRC, 'renderer/js/locales/en.js')))).default;
  const ru = (await import(pathToFileURL(path.join(SRC, 'renderer/js/locales/ru.js')))).default;
  assert.ok(Object.keys(en).length > 100);
  checkPair('renderer', en, ru);
});

test('main-process dictionaries: same keys, placeholders and markup in English and Russian', () => {
  checkPair('main', require('../src/main/locales/en.cjs'), require('../src/main/locales/ru.cjs'));
});

test('every renderer key used in the code exists in the dictionary', async () => {
  const en = (await import(pathToFileURL(path.join(SRC, 'renderer/js/locales/en.js')))).default;
  const files = [];
  const walk = d => fs.readdirSync(d, {withFileTypes: true}).forEach(e => e.isDirectory() ? (e.name !== 'locales' && walk(path.join(d, e.name))) : e.name.endsWith('.js') && files.push(path.join(d, e.name)));
  walk(path.join(SRC, 'renderer/js'));
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const code = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    for (const m of code.matchAll(/\bth?\(\s*'([a-z]\w*\.[\w.-]+)'/g)) if (!(m[1] in en)) missing.push(`${path.basename(f)}: ${m[1]}`);
  }
  assert.deepStrictEqual(missing, []);
});

test('every main-process key used in the code exists in the dictionary', () => {
  const en = require('../src/main/locales/en.cjs');
  const files = [];
  const walk = d => fs.readdirSync(d, {withFileTypes: true}).forEach(e => e.isDirectory() ? (e.name !== 'locales' && walk(path.join(d, e.name))) : e.name.endsWith('.cjs') && files.push(path.join(d, e.name)));
  walk(path.join(SRC, 'main'));
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    // Keys are "area.name"; comment lines are skipped.
    const code = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    for (const m of code.matchAll(/\bt(?:In)?\(\s*(?:'(?:en|ru)',\s*)?'([a-z]\w*\.[\w.-]+)'/g)) if (!(m[1] in en)) missing.push(`${path.basename(f)}: ${m[1]}`);
    for (const m of src.matchAll(/\bkey: '(activity\.[\w.]+)'/g)) if (!(m[1] in en)) missing.push(`${path.basename(f)}: ${m[1]}`);
  }
  assert.deepStrictEqual(missing, []);
});

test('phrasebook: Russian for every entry, matching placeholders, no conflicting duplicates', () => {
  const seen = new Map();
  for (const name of ruData.FILES) {
    const file = require(`../src/main/locales/ru-data/${name}.cjs`);
    for (const [en, ru] of Object.entries(file)) {
      for (const f of forms(ru)) {
        assert.ok(typeof f === 'string' && f.trim(), `ru-data/${name}: empty translation for "${en}"`);
        assert.strictEqual(placeholders(f), placeholders(en), `ru-data/${name}: placeholders differ for "${en}"`);
      }
      if (seen.has(en)) assert.deepStrictEqual(ru, seen.get(en).ru, `"${en}" is translated differently in ru-data/${seen.get(en).name} and ru-data/${name}`);
      else seen.set(en, {ru, name});
    }
  }
});

// The explanations Aster shows for each item must exist in both languages.
function missingData(texts) {
  return [...new Set(texts.filter(s => typeof s === 'string' && s.trim()))].filter(s => !i18n.hasData(s));
}

test('cleaner rules (Windows and macOS) are translated: names, explanations and locations', () => {
  const texts = [];
  for (const file of ['../src/main/cleaner-rules.cjs', '../src/main/mac/cleaner-rules.cjs']) {
    const {allRules, GROUPS} = require(file);
    for (const r of allRules()) texts.push(r.name, r.description, r.contains, r.ifDeleted, r.advice);
    for (const g of GROUPS) if (!/^(Windows|macOS)$/.test(g.name)) texts.push(g.name);
    // Location labels are written as string literals next to each path.
    const src = fs.readFileSync(require.resolve(file), 'utf8');
    for (const m of src.matchAll(/\blabel: '([^'$]+)'/g)) texts.push(m[1]);
  }
  assert.deepStrictEqual(missingData(texts), []);
});

test('registry categories and tweaks are translated', () => {
  const texts = [];
  for (const c of require('../src/main/registry.cjs').CATEGORIES) texts.push(c.name, c.description, c.contains, c.ifDeleted, c.advice);
  for (const file of ['../src/main/tweaks.cjs', '../src/main/mac/tweaks.cjs']) {
    for (const tw of require(file).TWEAKS) {
      texts.push(tw.title, tw.what, tw.pro, tw.con, tw.on, tw.off, ...(tw.options || []).map(o => o.label));
    }
  }
  assert.deepStrictEqual(missingData(texts), []);
});

test('text from the main process follows the language; English stays as written', () => {
  try {
    assert.strictEqual(i18n.getLanguage(), 'en');
    assert.strictEqual(i18n.td('Temporary files'), 'Temporary files');
    assert.strictEqual(i18n.t('activity.registryFixed', {count: 1}), 'Fixed 1 registry issue');
    assert.strictEqual(i18n.t('activity.registryFixed', {count: 212}), 'Fixed 212 registry issues');
    i18n.setLanguage('ru');
    assert.notStrictEqual(i18n.td('Temporary files'), 'Temporary files');
    assert.strictEqual(i18n.t('activity.registryFixed', {count: 1}), 'Исправлена 1 проблема в реестре');
    assert.strictEqual(i18n.t('activity.registryFixed', {count: 3}), 'Исправлено 3 проблемы в реестре');
    assert.strictEqual(i18n.t('activity.registryFixed', {count: 25}), 'Исправлено 25 проблем в реестре');
    assert.strictEqual(i18n.t('activity.registryFixed', {count: 21}), 'Исправлена 21 проблема в реестре');
    assert.strictEqual(i18n.tError('Unknown backup'), i18n.t('store.unknownBackup'));
    assert.strictEqual(i18n.td('Not in the phrasebook'), 'Not in the phrasebook');
    assert.match(i18n.tdLabel('History database (profile 2)'), /профиль 2\)$/);
    i18n.setLanguage('xx');
    assert.strictEqual(i18n.getLanguage(), 'en');
  } finally { i18n.setLanguage('en'); }
});

test('the language setting defaults to English and is stored with the other settings', () => {
  const {Store} = require('../src/main/store.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-i18n-'));
  try {
    // New users: English, whatever the OS language is.
    assert.strictEqual(new Store(dir).getSettings().language, 'en');
    // Existing users with a settings file from an older version: still English.
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({theme: 'dark', exclusions: []}));
    assert.strictEqual(new Store(dir).getSettings().language, 'en');
    const store = new Store(dir);
    assert.strictEqual(store.updateSettings({language: 'ru'}).language, 'ru');
    assert.strictEqual(new Store(dir).getSettings().language, 'ru');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).language, 'ru');
    assert.strictEqual(store.updateSettings({language: 'de'}).language, 'en');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('the History list is shown in the interface language, including entries from older versions', () => {
  const {Store} = require('../src/main/store.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aster-i18n-'));
  try {
    const store = new Store(dir);
    store.log({kind: 'registry', key: 'activity.registryFixed', vars: {count: 5}, count: 5});
    store.activity.push({id: 'old', at: new Date(0).toISOString(), kind: 'clean', title: 'Cleaned 18,204 files'});
    assert.deepStrictEqual(store.getActivity().map(a => a.title), ['Fixed 5 registry issues', 'Cleaned 18,204 files']);
    i18n.setLanguage('ru');
    assert.deepStrictEqual(store.getActivity().map(a => a.title), ['Исправлено 5 проблем в реестре', `Удалено ${(18204).toLocaleString('ru-RU')} ненужных файла`]);
  } finally { i18n.setLanguage('en'); fs.rmSync(dir, {recursive: true, force: true}); }
});

test('the interface starts in English and formats numbers for the chosen language', async () => {
  const ui = await import(pathToFileURL(path.join(SRC, 'renderer/js/i18n.js')));
  assert.strictEqual(ui.lang(), 'en');
  assert.deepStrictEqual(ui.LANGUAGES.map(l => l.name), ['English', 'Русский']);
  assert.strictEqual(ui.t('time.daysAgo', {count: 3}), '3 d ago');
  globalThis.document = {documentElement: {}};
  try {
    ui.setLanguage('ru');
    assert.strictEqual(document.documentElement.lang, 'ru');
    assert.deepStrictEqual([1, 2, 5, 21, 1.5].map(count => ui.t('time.daysAgo', {count})), ['1 день назад', '2 дня назад', '5 дней назад', '21 день назад', '1,5 дня назад']);
  } finally { ui.setLanguage('en'); delete globalThis.document; }
});
