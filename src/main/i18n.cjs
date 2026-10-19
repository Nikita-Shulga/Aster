'use strict';
// Interface language for text made in the main process: messages, errors, dialogs, menus, the activity log,
// and the explanations of cleaner rules, registry categories, tweaks and file types.
//
// Two kinds of text:
//  • Messages written in code use keys: t('updater.noAsset', {name}). locales/en.cjs and locales/ru.cjs hold them
//    with identical keys; "{name}" is a placeholder and {one, few, many, other} objects are plural forms.
//  • Data that lives next to the logic it explains (rule and tweak tables, file types…) stays written in English
//    where it is defined. td(english) looks that exact text up in the Russian phrasebook (locales/ru-data/*.cjs).
//    Templates work the same way: td('Part of {owner}.', {owner}).
// English is the default for everyone; the choice is the "language" setting in settings.json.
const en = require('./locales/en.cjs');
const ru = require('./locales/ru.cjs');
const ruData = require('./locales/ru-data/index.cjs');

const LANGUAGES = {en: 'en-US', ru: 'ru-RU'};
const DICTS = {en, ru};
let current = 'en';
const rules = {};

const isLanguage = id => Object.hasOwn(LANGUAGES, id);
const getLanguage = () => current;
const setLanguage = id => { current = isLanguage(id) ? id : 'en'; return current; };
const locale = (lang = current) => LANGUAGES[lang];

const num = (n, lang = current) => (Number(n) || 0).toLocaleString(locale(lang));
const fill = (text, vars, lang) => vars ? text.replace(/\{(\w+)\}/g, (m, k) => k in vars ? (typeof vars[k] === 'number' ? num(vars[k], lang) : String(vars[k] ?? '')) : m) : text;
const pick = (v, vars, lang) => {
  if (v && typeof v === 'object') {
    const n = Number(vars?.count);
    const form = (rules[lang] || (rules[lang] = new Intl.PluralRules(lang))).select(Number.isFinite(n) ? n : 0);
    return v[form] ?? v.other ?? v.many;
  }
  return v;
};

// Message by key in a given language (tIn) or the current one (t).
function tIn(lang, key, vars) {
  const v = pick(DICTS[lang]?.[key] ?? en[key], vars, lang);
  if (v == null) return key;
  return fill(v, vars, lang);
}
const t = (key, vars) => tIn(current, key, vars);

// Data text: English source text (or template) → current language.
function tdIn(lang, text, vars) {
  if (typeof text !== 'string' || !text) return text;
  const tr = lang === 'ru' ? pick(ruData[text], vars, lang) : null;
  return fill(tr ?? text, vars, lang);
}
const td = (text, vars) => tdIn(current, text, vars);
const hasData = text => Object.hasOwn(ruData, text);

// Location labels can carry a browser profile, e.g. "History database (profile 1)" or "… (main profile)".
function tdLabel(label) {
  if (typeof label !== 'string') return label;
  if (current === 'en' || hasData(label)) return td(label);
  const bin = /^Recycle Bin on drive (.+)$/.exec(label);
  if (bin) return t('cleaner.recycleBinOn', {drive: bin[1]});
  const trash = /^Trash on (.+)$/.exec(label); // macOS: the Trash of an external disk
  if (trash) return td('Trash on {volume}', {volume: trash[1]});
  const m = /^(.*) \(([^()]+)\)$/.exec(label);
  if (!m) return td(label);
  const profile = /^profile (\d+)$/i.exec(m[2]);
  return `${td(m[1])} (${profile ? t('cleaner.profileN', {n: profile[1]}) : hasData(m[2]) ? td(m[2]) : m[2]})`;
}

// Errors that cross into the renderer: messages thrown with fixed English text (including those thrown
// by PowerShell scripts) are translated when the phrasebook or the message dictionary knows them.
let reverse = null;
function tError(message) {
  if (current === 'en' || typeof message !== 'string') return message;
  if (hasData(message)) return td(message);
  if (!reverse) { reverse = new Map(); for (const [k, v] of Object.entries(en)) if (typeof v === 'string' && !v.includes('{')) reverse.set(v, k); }
  const key = reverse.get(message);
  return key ? t(key) : message;
}

module.exports = {t, tIn, td, tdIn, tdLabel, tError, hasData, num, locale, getLanguage, setLanguage, isLanguage, LANGUAGES};
