import {html, ic, api, bytes, date, checkbox, modal, toast, isMac, t, th} from './lib.js';
import {shared, notify, persistCleaner} from './state.js';
import {baseName, dirName} from './filters.js';

// "Choose files" inside a Cleaner result: every file of the item (largest 5,000), with search, sorting, a location
// filter and multi-select, so single files can be removed instead of the whole item. Files go to the Recycle Bin /
// Trash, or are deleted right away like a normal clean.
const c = shared.cleaner;
const fb = new Map(); // rule id → {data, q, sort, loc, sel, limit, busy, loading}
const PAGE = 100;
const SORTS = {
  size: (a, b) => b.size - a.size,
  newest: (a, b) => b.mtime - a.mtime,
  oldest: (a, b) => a.mtime - b.mtime,
  name: (a, b) => baseName(a.path).localeCompare(baseName(b.path))
};

const stateOf = id => fb.get(id);
export const filesOpen = id => fb.has(id);
// A new analysis or clean makes the lists stale.
export function resetFiles() { fb.clear(); }

function shown(s) {
  const q = s.q.trim().toLowerCase();
  return s.data.files.filter(f => (s.loc === 'all' || f.loc === s.loc) && (!q || f.path.toLowerCase().includes(q))).sort(SORTS[s.sort]);
}

// Takes removed files out of the analysis numbers (item, location, total) and the panel.
function subtract(r, removed) {
  const gone = new Set(removed.map(f => f.path));
  const size = removed.reduce((n, f) => n + f.size, 0);
  r.bytes = Math.max(0, r.bytes - size); r.files = Math.max(0, r.files - removed.length);
  for (const f of removed) {
    const loc = (r.locations || []).filter(l => f.path.startsWith(l.path)).sort((a, b) => b.path.length - a.path.length)[0];
    if (loc) { loc.bytes = Math.max(0, loc.bytes - f.size); loc.files = Math.max(0, loc.files - 1); }
  }
  r.locations = (r.locations || []).filter(l => l.files > 0);
  r.sample = (r.sample || []).filter(f => !gone.has(f.path));
  c.analysis.totalBytes = Math.max(0, c.analysis.totalBytes - size);
  const s = stateOf(r.id);
  if (s?.data) {
    s.data.files = s.data.files.filter(f => !gone.has(f.path));
    s.data.total = Math.max(0, s.data.total - removed.length); s.data.bytes = Math.max(0, s.data.bytes - size);
    for (const p of gone) s.sel.delete(p);
  }
  persistCleaner();
  return size;
}

export function filesPanel(r, rule) {
  const s = stateOf(r.id);
  if (!s) return '';
  if (s.loading || !s.data) return html`<div class="fb"><div class="row muted fb-pad"><span class="spinner"></span> ${t('cleaner.fb.loading')}</div></div>`;
  const list = shown(s);
  const page = list.slice(0, s.limit);
  const pickedFiles = s.data.files.filter(f => s.sel.has(f.path));
  const pickedBytes = pickedFiles.reduce((n, f) => n + f.size, 0);
  const allOn = list.length > 0 && list.every(f => s.sel.has(f.path));
  const someOn = list.some(f => s.sel.has(f.path));
  const locs = [...new Set(s.data.files.map(f => f.loc))];
  const sortOpt = (v, label) => html`<option value="${v}" ${s.sort === v ? 'selected' : ''}>${label}</option>`;
  return html`<div class="fb">
    <div class="fb-bar">
      <div class="search">${ic('search', 15)}<input class="input" data-key="fb-${r.id}" data-input="fbSearch" data-id="${r.id}" placeholder="${t('cleaner.fb.search')}" value="${s.q}"></div>
      <label class="fchip ${s.sort !== 'size' ? 'on' : ''}"><span class="fchip-k">${t('cleaner.fb.sort')}</span><span class="fchip-v">${t(`cleaner.fb.sort.${s.sort}`)}</span>${ic('chevronDown', 13)}
        <select data-change="fbSort" data-id="${r.id}" aria-label="${t('cleaner.fb.sort')}">${sortOpt('size', t('cleaner.fb.sort.size'))}${sortOpt('newest', t('cleaner.fb.sort.newest'))}${sortOpt('oldest', t('cleaner.fb.sort.oldest'))}${sortOpt('name', t('cleaner.fb.sort.name'))}</select></label>
      ${locs.length > 1 ? html`<label class="fchip ${s.loc !== 'all' ? 'on' : ''}"><span class="fchip-k">${t('cleaner.fb.location')}</span><span class="fchip-v">${s.loc === 'all' ? t('filters.all') : (r.locations.find(l => l.path === s.loc)?.label || baseName(s.loc))}</span>${ic('chevronDown', 13)}
        <select data-change="fbLoc" data-id="${r.id}" aria-label="${t('cleaner.fb.location')}"><option value="all">${t('filters.all')}</option>${locs.map(l => html`<option value="${l}" ${s.loc === l ? 'selected' : ''}>${r.locations.find(x => x.path === l)?.label || l}</option>`)}</select></label>` : ''}
    </div>
    <div class="fb-head">
      <label class="row grow" style="gap:10px;cursor:pointer;min-width:0">${checkbox(`data-change="fbAll" data-id="${r.id}" ${list.length ? '' : 'disabled'}`, allOn, someOn && !allOn)}
        <span class="truncate">${pickedFiles.length ? html`<strong>${t('cleaner.fb.selected', {count: pickedFiles.length})}</strong> · ${bytes(pickedBytes)}` : th('cleaner.fb.count', {count: list.length, size: bytes(list.reduce((n, f) => n + f.size, 0))})}</span></label>
      ${pickedFiles.length ? html`
      <button class="btn btn-ghost btn-sm" data-action="fbClear" data-id="${r.id}">${t('cleaner.fb.clear')}</button>
      ${s.data.recycleBin ? '' : html`<button class="btn btn-secondary btn-sm" data-action="fbRemove" data-id="${r.id}" data-mode="trash" ${s.busy ? 'disabled' : ''}>${ic('trash', 14)} ${t(isMac ? 'cleaner.fb.toTrash' : 'cleaner.fb.toBin')}</button>`}
      <button class="btn btn-danger btn-sm" data-action="fbRemove" data-id="${r.id}" data-mode="delete" ${s.busy ? 'disabled' : ''}>${s.busy ? html`<span class="spinner"></span>` : ic('broom', 14)} ${t('cleaner.fb.delete', {count: pickedFiles.length})}</button>
      ` : ''}
    </div>
    ${page.length ? page.map(f => html`<label class="fb-row">
      ${checkbox(`data-change="fbPick" data-id="${r.id}" data-path="${f.path}"`, s.sel.has(f.path))}
      <div class="grow fb-name"><div class="truncate" title="${f.path}">${baseName(f.path)}</div><div class="truncate fb-dir">${dirName(f.path)}</div></div>
      <span class="faint fb-date">${date(f.mtime)}</span>
      <span class="num fb-size">${bytes(f.size)}</span>
      <button class="icon-btn sm" data-action="revealFile" data-path="${f.path}" title="${t(isMac ? 'cleaner.showInFinder' : 'cleaner.showInExplorer')}" aria-label="${t('cleaner.showFile')}">${ic('external', 13)}</button>
    </label>`) : html`<div class="faint fb-pad">${t('cleaner.fb.none')}</div>`}
    ${list.length > page.length ? html`<div class="fb-pad"><button class="linkish" data-action="fbMore" data-id="${r.id}">${t('cleaner.fb.more', {count: Math.min(PAGE, list.length - page.length), left: list.length - page.length})}</button></div>` : ''}
    ${s.data.truncated ? html`<div class="faint fb-pad">${t('cleaner.fb.truncated', {shown: s.data.files.length, total: s.data.total})}</div>` : ''}
  </div>`;
}

export const filesHandlers = {
  async toggleFiles(el) {
    const id = el.dataset.id;
    if (fb.has(id)) { fb.delete(id); this.update(); return; }
    const s = {data: null, q: '', sort: 'size', loc: 'all', sel: new Set(), limit: PAGE, busy: false, loading: true};
    fb.set(id, s); this.update();
    try { s.data = await api('cleaner.listFiles', {id}); }
    catch (e) { fb.delete(id); throw e; }
    finally { s.loading = false; this.update(); }
  },
  fbSearch(el) { const s = stateOf(el.dataset.id); s.q = el.value; s.limit = PAGE; this.update(); },
  fbSort(el) { const s = stateOf(el.dataset.id); s.sort = el.value; s.limit = PAGE; this.update(); },
  fbLoc(el) { const s = stateOf(el.dataset.id); s.loc = el.value; s.limit = PAGE; this.update(); },
  fbMore(el) { stateOf(el.dataset.id).limit += PAGE; this.update(); },
  fbPick(el) { const s = stateOf(el.dataset.id); el.checked ? s.sel.add(el.dataset.path) : s.sel.delete(el.dataset.path); this.update(); },
  // Selects every file that matches the search and location, not only the rows on screen.
  fbAll(el) { const s = stateOf(el.dataset.id); for (const f of shown(s)) el.checked ? s.sel.add(f.path) : s.sel.delete(f.path); this.update(); },
  fbClear(el) { stateOf(el.dataset.id).sel.clear(); this.update(); },
  async fbRemove(el) {
    const {id, mode} = el.dataset;
    const s = stateOf(id);
    const r = c.analysis?.results.find(x => x.id === id);
    const rule = c.rules.find(x => x.id === id);
    const files = s.data.files.filter(f => s.sel.has(f.path));
    if (!files.length || !r) return;
    const size = bytes(files.reduce((n, f) => n + f.size, 0));
    const permanent = mode === 'delete';
    if (permanent) {
      const {ok} = await modal({title: t('cleaner.fb.deleteTitle', {count: files.length, size}), icon: 'broom', danger: true, confirm: t('cleaner.fb.deleteConfirm'), body: html`
        <p>${t('cleaner.fb.deleteBody')}</p>${rule?.ifDeleted ? html`<p class="muted" style="margin-top:8px">${rule.ifDeleted}</p>` : ''}`});
      if (!ok) return;
    }
    s.busy = true; this.update();
    try {
      const res = await api('cleaner.removeFiles', {id, paths: files.map(f => f.path), permanent});
      const done = new Set(res.done.map(p => p.toLowerCase()));
      const removed = files.filter(f => done.has(f.path.toLowerCase()) || res.done.includes(f.path));
      const freed = subtract(r, removed);
      if (removed.length) toast(t(permanent ? 'cleaner.fb.deleted' : isMac ? 'cleaner.fb.trashed' : 'cleaner.fb.binned', {count: removed.length, size: bytes(freed)}), {type: 'success'});
      if (res.failed.length) toast(t('cleaner.fb.failed', {count: res.failed.length, error: res.failed[0].error}), {type: 'error', timeout: 7000});
      notify();
    } finally { s.busy = false; this.update(); }
  }
};
