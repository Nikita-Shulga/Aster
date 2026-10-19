import en from './locales/en.js';
import ru from './locales/ru.js';

// Interface language. English is the default for everyone; the choice is stored in Aster's settings
// (settings.language) and can be changed at any time on the Settings page without a restart.
//
// Dictionaries map keys to text. "{name}" marks a placeholder. A value can also be a set of plural
// forms ({one, few, many, other}), picked by Intl.PluralRules from the "count" placeholder.
export const LANGUAGES = [{id: 'en', name: 'English', locale: 'en-US'}, {id: 'ru', name: 'Русский', locale: 'ru-RU'}];
const DICTS = {en, ru};

let current = 'en';
const listeners = new Set();
const rules = {};
const pluralRules = l => rules[l] || (rules[l] = new Intl.PluralRules(l));

export const lang = () => current;
export const locale = () => LANGUAGES.find(l => l.id === current).locale;
export const isLanguage = id => LANGUAGES.some(l => l.id === id);

export function setLanguage(id) {
  const next = isLanguage(id) ? id : 'en';
  document.documentElement.lang = next;
  if (next === current) return false;
  current = next;
  listeners.forEach(fn => fn(next));
  return true;
}
// Pages and caches that hold translated text register here to reset themselves when the language changes.
export const onLanguageChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };

const fmtVar = v => typeof v === 'number' ? v.toLocaleString(locale()) : String(v ?? '');

function lookup(key, vars) {
  let v = DICTS[current][key] ?? en[key];
  if (v == null) { console.warn('Missing translation', key); return key; }
  if (typeof v === 'object') {
    const n = Number(vars?.count);
    v = v[pluralRules(current).select(Number.isFinite(n) ? n : 0)] ?? v.other ?? v.many;
  }
  return v;
}

// Plain text; placeholders are filled in as text (numbers are formatted for the current language).
export function t(key, vars) {
  return lookup(key, vars).replace(/\{(\w+)\}/g, (m, k) => vars && k in vars ? fmtVar(vars[k]) : m);
}

// Text that contains markup (<strong>, <br>…): the dictionary text is trusted and each value is passed
// through render (lib.js escapes text and keeps html`` fragments). Use th() from lib.js in pages.
export function tMarkup(key, vars, render) {
  return lookup(key, vars).replace(/\{(\w+)\}/g, (m, k) => !vars || !(k in vars) ? m : typeof vars[k] === 'number' ? fmtVar(vars[k]) : render(vars[k]));
}
