import {html, ic, app, isMac, t, th} from './lib.js';
import {locale} from './i18n.js';

// Compact filter chips used across pages. Each chip is a native <select> (keyboard-friendly)
// styled as a pill; options show how many items they would match.
// "C:" on Windows; on macOS the volume name ("Macintosh HD", or the external drive's name).
export const driveOf = p => {
  if (isMac) {
    if (typeof p !== 'string' || !p.startsWith('/')) return null;
    const m = /^\/Volumes\/([^/]+)/.exec(p);
    return m ? m[1] : (app.system?.drives?.find(d => d.root === '/')?.name || 'Macintosh HD');
  }
  const m = /^([a-z]):/i.exec(p || ''); return m ? `${m[1].toUpperCase()}:` : null;
};
export const sep = isMac ? '/' : '\\';
export const baseName = p => String(p || '').split(/[\\/]/).filter(Boolean).pop() || p;
export const dirName = p => { const s = String(p || ''); const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')); return i > 0 ? s.slice(0, i) : (isMac ? '/' : s); };

// Build options with counts from a list. getter returns a value (or null for "unknown").
export function countOptions(items, getter, {label = v => v, unknown = t('filters.unknown'), sort = 'count'} = {}) {
  const counts = new Map();
  for (const it of items) { const v = getter(it) ?? '__none'; counts.set(v, (counts.get(v) || 0) + 1); }
  const opts = [...counts.entries()].map(([value, count]) => ({value, label: value === '__none' ? unknown : label(value), count}));
  opts.sort(sort === 'alpha' ? (a, b) => String(a.label).localeCompare(String(b.label), locale()) : (a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label), locale()));
  return opts;
}

export function chip(key, label, options, value, {allLabel = t('filters.all')} = {}) {
  const active = value !== 'all';
  const current = options.find(o => String(o.value) === String(value));
  return html`<label class="fchip ${active ? 'on' : ''}" title="${label}">
    <span class="fchip-k">${label}</span>
    <span class="fchip-v">${active ? current?.label ?? value : allLabel}</span>
    ${ic('chevronDown', 13)}
    <select data-change="filter" data-key="${key}" aria-label="${label}">
      <option value="all" ${!active ? 'selected' : ''}>${allLabel}</option>
      ${options.map(o => html`<option value="${o.value}" ${String(o.value) === String(value) ? 'selected' : ''}>${o.label}${o.count != null ? ` (${o.count})` : ''}</option>`)}
    </select>
  </label>`;
}

export function search(value, placeholder, width = 240) {
  return html`<div class="search">${ic('search', 16)}<input class="input" style="width:${width}px" data-key="search" data-input="search" placeholder="${placeholder}" value="${value || ''}">${value ? html`<button class="search-clear" data-action="clearSearch" title="${t('filters.clearSearch')}">${ic('x', 13)}</button>` : ''}</div>`;
}

// "Showing 12 of 136 items · Clear filters". key names the sentence for the kind of item, with {shown} and {total}.
export function resultLine(shown, total, f, key = 'filters.showingItems') {
  const active = Object.entries(f).some(([k, v]) => k !== 'sort' && v && v !== 'all');
  if (!active) return '';
  return html`<div class="filter-result"><span>${th(key, {shown, total, count: total})}</span><button class="linkish" data-action="clearFilters">${t('filters.clear')}</button></div>`;
}

// Mixin handlers: pages spread these into their `on` map. State lives in page.filters.
export function filterHandlers(getState, defaults) {
  return {
    filter(el) { getState()[el.dataset.key] = el.value; this.update(); },
    search(el) { getState().search = el.value; this.update(); },
    clearSearch() { getState().search = ''; this.update(); },
    clearFilters() { Object.assign(getState(), structuredClone(defaults)); this.update(); }
  };
}

// Labels are getters so they follow the interface language.
const bucket = (value, test) => ({value, test, get label() { return t(`filters.bucket.${value}`); }});
export const SIZE_BUCKETS = [
  bucket('huge', b => b >= 1024 ** 3),
  bucket('large', b => b >= 100 * 1024 ** 2 && b < 1024 ** 3),
  bucket('medium', b => b >= 10 * 1024 ** 2 && b < 100 * 1024 ** 2),
  bucket('small', b => b < 10 * 1024 ** 2)
];
export const AGE_BUCKETS = [
  bucket('week', d => d <= 7),
  bucket('month', d => d <= 30),
  bucket('year', d => d <= 365),
  bucket('old', d => d > 365),
  bucket('veryold', d => d > 730)
];
export const daysSince = t => { const ms = typeof t === 'number' ? t : Date.parse(t); return Number.isFinite(ms) ? (Date.now() - ms) / 864e5 : null; };
export const bucketTest = (buckets, value, x) => value === 'all' || (x != null && buckets.find(b => b.value === value)?.test(x));
