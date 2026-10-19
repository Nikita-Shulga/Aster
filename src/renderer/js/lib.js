import {icon} from './icons.js';
import {mockApi} from './mock.js';
import {t, tMarkup, locale} from './i18n.js';
export {t};

// ---------- Templating ----------
const RAW = Symbol('raw');
export const raw = s => ({[RAW]: String(s ?? '')});
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const part = v => v == null || v === false ? '' : Array.isArray(v) ? v.map(part).join('') : typeof v === 'object' && RAW in v ? v[RAW] : esc(v);
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return raw(out);
}
export const str = h => (h && typeof h === 'object' && RAW in h ? h[RAW] : String(h ?? ''));
export const ic = (name, size, cls) => raw(icon(name, size, cls));
// Translated text with markup; values are escaped like in html``. See i18n.js.
export const th = (key, vars) => raw(tMarkup(key, vars, part));

// ---------- Formatting ----------
// Numbers, sizes and dates follow the interface language (not the Windows/macOS locale), so they match the text around them.
const UNITS = ['units.kb', 'units.mb', 'units.gb', 'units.tb'];
export function bytes(n, digits = 1) {
  n = Number(n) || 0;
  if (n < 1024) return t('units.bytes', {n: String(n)});
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < UNITS.length - 1);
  return t(UNITS[i], {n: n.toLocaleString(locale(), {maximumFractionDigits: n >= 100 ? 0 : digits})});
}
export const num = n => (Number(n) || 0).toLocaleString(locale());
export const time = v => new Date(v).toLocaleTimeString(locale(), {hour: 'numeric', minute: '2-digit'});
export function date(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(locale(), {year: 'numeric', month: 'short', day: 'numeric'}) : '—';
}
export function ago(v) {
  if (!v) return t('time.never');
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return t('time.justNow');
  if (s < 3600) return t('time.minAgo', {count: Math.floor(s / 60)});
  if (s < 86400) return t('time.hoursAgo', {count: Math.floor(s / 3600)});
  if (s < 86400 * 30) return t('time.daysAgo', {count: Math.floor(s / 86400)});
  return date(v);
}
export function duration(sec) {
  sec = Math.floor(sec || 0);
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return d ? t('time.daysHours', {d, h}) : h ? t('time.hoursMinutes', {h, m}) : t('time.minutes', {m});
}
export const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, a / b * 100)) : 0;

// ---------- Bridge ----------
export const demo = !window.aster;
// Preview mode can simulate macOS with ?platform=darwin.
export const platform = window.aster?.platform || new URLSearchParams(location.search).get('platform') || 'win32';
export const isMac = platform === 'darwin';
document.documentElement.dataset.platform = isMac ? 'mac' : 'win';
const bridge = window.aster || mockApi;
export const api = (method, args) => bridge.invoke(method, args);
export const onEvent = fn => bridge.on(fn);

// ---------- Shared app state ----------
export const app = {system: null, settings: null, info: null, listeners: new Set()};
export function setApp(patch) { Object.assign(app, patch); app.listeners.forEach(fn => fn()); }

// ---------- Toasts ----------
export function toast(message, {type = 'info', timeout = 4200} = {}) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info', 18)}<span>${esc(message)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, timeout);
}
export const fail = e => toast(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), {type: 'error', timeout: 6500});

// ---------- Modals ----------
export function modal({title, body = '', confirm = t('common.continue'), cancel = t('common.cancel'), danger = false, checkbox = null, wide = false, icon: iconName = null}) {
  return new Promise(resolve => {
    const dlg = document.getElementById('modal');
    dlg.className = wide ? 'modal wide' : 'modal';
    dlg.innerHTML = str(html`
      <form method="dialog" class="modal-inner">
        <div class="modal-head">
          ${iconName ? html`<div class="modal-icon ${danger ? 'danger' : ''}">${ic(iconName, 20)}</div>` : ''}
          <h2>${title}</h2>
        </div>
        <div class="modal-body">${raw(str(body))}</div>
        ${checkbox ? html`<label class="check-row"><input type="checkbox" class="cb" name="extra" ${checkbox.checked ? 'checked' : ''}><span>${checkbox.label}</span></label>` : ''}
        <div class="modal-actions">
          ${cancel ? html`<button class="btn btn-secondary" value="cancel">${cancel}</button>` : ''}
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok" autofocus>${confirm}</button>
        </div>
      </form>`);
    const done = () => {
      const extra = dlg.querySelector('[name=extra]')?.checked ?? false;
      resolve({ok: dlg.returnValue === 'ok', checked: extra});
      dlg.removeEventListener('close', done);
    };
    dlg.addEventListener('close', done);
    dlg.returnValue = 'cancel';
    dlg.showModal();
  });
}

// Prompt with custom form fields; returns FormData values or null.
export function formModal({title, fields, confirm = t('common.save')}) {
  return new Promise(resolve => {
    const dlg = document.getElementById('modal');
    dlg.className = 'modal';
    dlg.innerHTML = str(html`
      <form method="dialog" class="modal-inner">
        <div class="modal-head"><h2>${title}</h2></div>
        <div class="modal-body form-grid">${raw(str(fields))}</div>
        <div class="modal-actions">
          <button class="btn btn-secondary" value="cancel" formnovalidate>${t('common.cancel')}</button>
          <button class="btn btn-primary" value="ok">${confirm}</button>
        </div>
      </form>`);
    const form = dlg.querySelector('form');
    const done = () => {
      dlg.removeEventListener('close', done);
      resolve(dlg.returnValue === 'ok' ? Object.fromEntries(new FormData(form).entries()) : null);
    };
    dlg.addEventListener('close', done);
    dlg.returnValue = 'cancel';
    dlg.showModal();
    dlg.querySelector('input,textarea,select')?.focus();
  });
}

// ---------- Small UI helpers ----------
export const checkbox = (attrs, checked, indeterminate = false) => raw(`<input type="checkbox" class="cb" ${attrs} ${checked ? 'checked' : ''} ${indeterminate ? 'data-indeterminate="1"' : ''}>`);
export function fixIndeterminate(root) { root.querySelectorAll('[data-indeterminate]').forEach(el => { el.indeterminate = true; }); }

export function ring(value, {size = 120, stroke = 10, label = '', sub = '', tone = 'accent'} = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value));
  return html`<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="ring-track"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="ring-value tone-${tone}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / 100)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <div class="ring-label"><strong>${label}</strong>${sub ? html`<span>${sub}</span>` : ''}</div>
  </div>`;
}

export const bar = (value, tone = 'accent') => html`<div class="bar"><div class="bar-fill tone-${tone}" style="width:${Math.max(0, Math.min(100, value)).toFixed(1)}%"></div></div>`;

export function empty({iconName = 'sparkles', title, text = '', action = ''}) {
  return html`<div class="empty"><div class="empty-icon">${ic(iconName, 26)}</div><h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action}</div>`;
}

// Shown above results that were restored from the last run instead of scanned just now.
// With action: null the page already has its own rescan button, named by label.
export function previousScan(at, {action = 'rescan', label = t('common.rescan')} = {}) {
  const when = at ? `${date(at)}, ${time(at)} (${ago(at)})` : t('previousScan.earlier');
  return html`<div class="callout blue" style="margin-bottom:12px">${ic('history', 18)}<div class="grow">${action ? th('previousScan.text', {when}) : th('previousScan.textPress', {when, label})}</div>${action ? html`<button class="btn btn-sm btn-secondary" data-action="${action}">${ic('refresh', 15)} ${label}</button>` : ''}</div>`;
}

export function avatar(name, src, size = 32) {
  if (src) return html`<img class="avatar" src="${src}" width="${size}" height="${size}" alt="">`;
  const letter = (String(name || '?').match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return html`<span class="avatar avatar-letter" style="--h:${h};width:${size}px;height:${size}px">${letter}</span>`;
}

export function debounce(fn, ms = 180) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export function adminGate(needsAdmin) {
  return needsAdmin && !app.system?.admin;
}

// Non-dismissable progress dialog for long operations (uninstallers, updates).
export function busyModal(title, text = '') {
  const dlg = document.getElementById('modal');
  dlg.className = 'modal';
  const paint = (t, x) => { dlg.innerHTML = str(html`<div class="modal-inner"><div class="modal-head"><div class="modal-icon"><span class="spinner"></span></div><h2>${t}</h2></div><div class="modal-body">${x}</div></div>`); };
  paint(title, text);
  const block = e => e.preventDefault();
  dlg.addEventListener('cancel', block);
  dlg.showModal();
  return {
    update: (t, x) => paint(t ?? title, x ?? text),
    close: () => { dlg.removeEventListener('cancel', block); dlg.close(); }
  };
}

// One vocabulary for "can I delete this?" across Cleaner, Registry, Disk analyzer and Optimize.
const verdict = (id, tone, icon) => ({tone, icon, get label() { return t(`verdict.${id}`); }, get short() { return t(`verdict.${id}.short`); }});
export const VERDICTS = {safe: verdict('safe', 'green', 'check'), review: verdict('review', 'amber', 'info'), keep: verdict('keep', 'red', 'alert')};
export const verdictBadge = (v, long = false) => { const d = VERDICTS[v] || VERDICTS.review; return html`<span class="badge ${d.tone}">${ic(d.icon, 12)} ${long ? d.label : d.short}</span>`; };
export function explain({contains, ifDeleted, advice, verdict}) {
  const d = VERDICTS[verdict] || VERDICTS.review;
  return html`<div class="explain">
    ${contains ? html`<div class="ex-row"><span class="ex-k">${t('explain.what')}</span><span>${contains}</span></div>` : ''}
    ${ifDeleted ? html`<div class="ex-row"><span class="ex-k">${t('explain.ifDeleted')}</span><span>${ifDeleted}</span></div>` : ''}
    <div class="ex-row"><span class="ex-k">${t('explain.advice')}</span><span class="ex-verdict tone-text-${d.tone}">${ic(d.icon, 14)} <strong>${d.label}.</strong> ${advice || ''}</span></div>
  </div>`;
}
