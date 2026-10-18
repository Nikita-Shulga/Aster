import {html, ic, api, app, bytes, num, plural, date, checkbox, empty, modal, toast, avatar, busyModal, str, raw, isMac} from '../lib.js';
import {definePage} from '../page.js';
import {chip, countOptions, search as searchBox, resultLine, filterHandlers, SIZE_BUCKETS, AGE_BUCKETS, daysSince, bucketTest} from '../filters.js';

const DEFAULT_FILTERS = {search: '', type: 'all', drive: 'all', publisher: 'all', size: 'all', age: 'all', used: 'all'};
// macOS tracks when each app was last opened — great for finding apps you never use.
const USED_BUCKETS = [{value: 'month', label: 'In the last month', test: d => d != null && d <= 30}, {value: 'q', label: 'Not in 3 months', test: d => d != null && d > 90}, {value: 'y', label: 'Not in a year', test: d => d != null && d > 365}, {value: 'never', label: 'Never / unknown', test: d => d == null}];
const s = {items: null, loading: false, f: structuredClone(DEFAULT_FILTERS), sort: 'name', dir: 1, selected: new Set(), icons: new Map(), sizes: new Map()};
const sizeOf = i => i.size ?? s.sizes.get(i.id) ?? null;
const TYPES = isMac
  ? [{value: 'app', label: 'Downloaded apps'}, {value: 'store', label: 'App Store apps'}, {value: 'apple', label: 'Apple apps'}]
  : [{value: 'desktop', label: 'Desktop apps'}, {value: 'store', label: 'Microsoft Store apps'}, {value: 'broken', label: 'Broken entries'}, {value: 'noremove', label: 'Can’t be uninstalled'}];
const typeTest = (i, v) => v === 'all' || (v === 'broken' ? i.broken : v === 'noremove' ? !i.canUninstall && !i.broken : i.type === v);

async function load(page) {
  s.loading = true; page.update();
  try { s.items = (await api('programs.list')).items; s.selected.clear(); }
  finally { s.loading = false; page.update(); }
}

// Every filter except `skip` — used so each chip's counts reflect the other active filters.
function matches(i, skip) {
  const f = s.f, q = f.search.trim().toLowerCase();
  return (skip === 'type' || typeTest(i, f.type)) &&
    (skip === 'drive' || f.drive === 'all' || (i.drive || '__none') === f.drive) &&
    (skip === 'publisher' || f.publisher === 'all' || (i.publisher || '__none') === f.publisher) &&
    (skip === 'size' || bucketTest(SIZE_BUCKETS, f.size, sizeOf(i))) &&
    (skip === 'age' || bucketTest(AGE_BUCKETS, f.age, daysSince(i.installDate))) &&
    (skip === 'used' || f.used === 'all' || USED_BUCKETS.find(b => b.value === f.used).test(daysSince(i.lastUsed))) &&
    (!q || i.name.toLowerCase().includes(q) || (i.publisher || '').toLowerCase().includes(q) || (i.location || '').toLowerCase().includes(q));
}

function filtered() {
  let list = s.items.filter(i => matches(i));
  const key = {name: i => i.name.toLowerCase(), size: i => sizeOf(i) ?? -1, date: i => i.installDate || '', used: i => i.lastUsed || '', publisher: i => (i.publisher || '').toLowerCase(), drive: i => i.drive || 'Z'}[s.sort];
  list = [...list].sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * s.dir; });
  return list;
}

function sortHead(id, label, cls = '') {
  const on = s.sort === id;
  return html`<th class="sortable ${cls}" data-action="sort" data-sort="${id}">${label}${on ? ic(s.dir > 0 ? 'chevronDown' : 'arrowUp', 12) : ''}</th>`;
}

async function loadIcons(page, list) {
  const missing = list.filter(i => !s.icons.has(i.id)).slice(0, 80).map(i => i.id);
  if (!missing.length) return;
  missing.forEach(id => s.icons.set(id, null));
  const res = await api('programs.icons', {ids: missing}).catch(() => ({}));
  let changed = false;
  for (const [id, url] of Object.entries(res)) if (url) { s.icons.set(id, url); changed = true; }
  if (changed && page.mounted) {
    // swap icons in place to avoid re-rendering the whole table
    for (const [id, url] of Object.entries(res)) {
      const cell = page.el.querySelector(`[data-icon="${id}"]`);
      if (cell && url) cell.innerHTML = `<img class="avatar" src="${url}" width="32" height="32" alt="">`;
    }
  }
  if (list.some(i => !s.icons.has(i.id))) loadIcons(page, list);
}

async function leftovers(page, item, {afterUninstall = false} = {}) {
  const busy = busyModal('Looking for leftovers…', `Searching folders and registry keys related to ${item.name}.`);
  let res;
  try { res = await api('programs.leftovers', {id: item.id}); } finally { busy.close(); }
  if (!res.items.length) { toast(afterUninstall ? `${item.name} was removed cleanly — no leftovers found.` : 'No leftovers found.', {type: 'success'}); return; }
  const total = res.items.reduce((n, x) => n + (x.size || 0), 0);
  const body = html`
    <p>${afterUninstall ? `${item.name} left these items behind.` : `These items appear to belong to ${item.name}.`} ${isMac ? 'Everything goes to the Trash, so you can put it back.' : 'Folders go to the Recycle Bin; registry keys are backed up first.'}</p>
    <div class="modal-list selectable" style="max-height:320px;padding:4px 10px">
      ${res.items.map(x => html`<label class="leftover-row">
        ${raw(`<input type="checkbox" class="cb" name="lo" value="${x.id}" ${x.reason === 'Install folder' && !afterUninstall ? '' : 'checked'}>`)}
        <span class="tile ${x.kind === 'registry' ? 'amber' : 'blue'}" style="width:28px;height:28px;border-radius:8px">${ic(x.kind === 'registry' ? 'key' : x.kind === 'file' ? 'file' : 'folder', 14)}</span>
        <div class="truncate"><div class="p truncate" title="${x.path}">${x.path}</div><div class="faint" style="font-size:11.5px">${x.reason}${x.detail ? ` · ${x.detail}` : ''}</div></div>
        <span class="num faint">${x.kind === 'registry' ? '' : bytes(x.size)}</span>
      </label>`)}
    </div>
    ${total ? html`<p class="faint" style="margin-top:8px;font-size:12px">Up to ${bytes(total)} can be reclaimed.</p>` : ''}`;
  const dlg = document.getElementById('modal');
  const {ok} = await modal({title: `Leftovers of ${item.name}`, icon: 'search', wide: true, confirm: 'Remove selected', cancel: 'Keep all', body: str(body), _grab: true});
  const ids = [...dlg.querySelectorAll('[name=lo]:checked')].map(i => i.value);
  if (!ok || !ids.length) return;
  const r = await api('programs.removeLeftovers', {programId: item.id, ids});
  toast(`Removed ${plural(r.removed, 'leftover')}${r.bytes ? ` · ${bytes(r.bytes)}` : ''}${r.failed.length ? ` · ${r.failed.length} could not be removed` : ''}`, {type: r.failed.length ? 'info' : 'success'});
}

async function uninstall(page, item) {
  if (item.broken) {
    const {ok} = await modal({title: `${item.name} is already gone`, icon: 'alert', confirm: 'Remove entry & scan leftovers', body: 'Its uninstaller no longer exists, so the program can’t be uninstalled normally. Aster can remove the stale entry from the programs list (backed up first) and look for leftover files.'});
    if (!ok) return;
    await leftovers(page, item, {afterUninstall: true});
    await load(page);
    return;
  }
  const {ok} = await modal({title: `Uninstall ${item.name}?`, icon: 'trash', danger: true, confirm: 'Uninstall', body: html`<p>${isMac ? 'Aster quits the app, moves it to the Trash, then shows the settings, caches and data it left in your Library so you can remove them too.' : item.type === 'store' ? 'The app is removed for your account.' : 'Aster starts the program’s own uninstaller. Follow its steps, then Aster scans for leftover files and registry entries.'}</p>`});
  if (!ok) return;
  const busy = busyModal(`Uninstalling ${item.name}…`, isMac ? 'Quitting the app and moving it to the Trash.' : item.type === 'store' ? 'Removing the app package.' : 'Complete the steps in the uninstaller window. Aster continues automatically when it closes.');
  let res;
  try { res = await api('programs.uninstall', {id: item.id}); } finally { busy.close(); }
  if (res.removed) { toast(`${item.name} was ${isMac ? 'moved to the Trash' : 'uninstalled'}`, {type: 'success'}); if (item.type === 'desktop' || isMac) await leftovers(page, item, {afterUninstall: true}); }
  else toast(`${item.name} still appears to be installed. The uninstaller may have been cancelled.`, {type: 'info'});
  await load(page);
}

export default definePage({
  id: 'programs', title: 'Programs', icon: 'apps',
  view() {
    const head = html`<div class="page-head">
      <div class="titles"><h1>Programs</h1><p>${isMac ? 'Remove apps completely. Dragging an app to the Trash leaves its settings, caches and data behind — Aster finds and removes those too.' : 'Uninstall apps completely. After an uninstaller finishes, Aster sweeps up the folders and registry keys it left behind.'}</p></div>
      <div class="actions"><button class="btn btn-secondary" data-action="refresh" ${s.loading ? 'disabled' : ''}>${ic('refresh', 16, s.loading ? 'spin' : '')} Refresh</button></div>
    </div>`;
    if (!s.items) return html`${head}<div class="card card-pad">${[1, 2, 3, 4, 5, 6].map(() => html`<div class="skeleton" style="height:40px;margin:8px 0"></div>`)}</div>`;
    const list = filtered();
    const total = s.items.reduce((n, i) => n + (i.size || 0), 0);
    const counts = {all: s.items.length, desktop: s.items.filter(i => i.type === 'desktop').length, store: s.items.filter(i => i.type === 'store').length, broken: s.items.filter(i => i.broken).length};
    const sel = s.items.filter(i => s.selected.has(i.id));
    return html`${head}
      <div class="card">
        <div class="prog-stats">
          <div class="stat"><span class="k">Installed</span><span class="v num">${num(counts.all)}</span></div>
          <div class="stat"><span class="k">Reported size</span><span class="v num">${bytes(total)}</span></div>
          <div class="stat"><span class="k">${isMac ? 'App Store apps' : 'Store apps'}</span><span class="v num">${num(counts.store)}</span></div>
          ${isMac ? html`<div class="stat"><span class="k">Not used in 3 months</span><span class="v num">${num(s.items.filter(i => (daysSince(i.lastUsed) ?? 0) > 90).length)}</span></div>` : html`<div class="stat"><span class="k">Broken entries</span><span class="v num" style="${counts.broken ? 'color:var(--amber-text)' : ''}">${num(counts.broken)}</span></div>`}
          <div class="stat" style="margin-left:auto"><span class="k">By drive</span><span class="row" style="gap:6px;margin-top:2px">${countOptions(s.items, i => i.drive, {sort: 'alpha', unknown: '?'}).map(o => {
            const size = s.items.filter(i => (i.drive || '__none') === o.value).reduce((n, i) => n + (i.size || 0), 0);
            return html`<button class="fchip ${s.f.drive === o.value ? 'on' : ''}" style="height:28px" data-action="quickDrive" data-drive="${o.value}" title="${bytes(size)} reported"><span class="fchip-v">${o.label}</span><span class="fchip-k">${o.count}</span></button>`;
          })}</span></div>
        </div>
        <div class="toolbar filterbar" style="padding:14px 16px 0">
          ${searchBox(s.f.search, 'Search programs', 200)}
          ${chip('type', 'Type', TYPES.map(o => ({...o, count: s.items.filter(i => matches(i, 'type') && typeTest(i, o.value)).length})), s.f.type)}
          ${chip('drive', 'Drive', countOptions(s.items.filter(i => matches(i, 'drive')), i => i.drive, {sort: 'alpha', unknown: 'Unknown drive'}), s.f.drive)}
          ${chip('publisher', 'Publisher', countOptions(s.items.filter(i => matches(i, 'publisher')), i => i.publisher || null, {unknown: 'No publisher'}), s.f.publisher)}
          ${chip('size', 'Size', SIZE_BUCKETS.map(b => ({...b, count: s.items.filter(i => matches(i, 'size') && sizeOf(i) != null && b.test(sizeOf(i))).length})), s.f.size)}
          ${isMac ? chip('used', 'Last opened', USED_BUCKETS.map(b => ({...b, count: s.items.filter(i => matches(i, 'used') && b.test(daysSince(i.lastUsed))).length})), s.f.used, {allLabel: 'Any time'}) : ''}
          ${chip('age', isMac ? 'Added' : 'Installed', AGE_BUCKETS.map(b => ({...b, count: s.items.filter(i => matches(i, 'age') && daysSince(i.installDate) != null && b.test(daysSince(i.installDate))).length})), s.f.age, {allLabel: 'Any time'})}
        </div>
        ${resultLine(list.length, s.items.length, s.f, 'programs')}
        ${list.length ? html`<div class="table-wrap" style="margin-top:8px"><table class="table">
          <thead><tr><th class="w-cb">${checkbox('data-change="all" aria-label="Select all"', list.length && list.every(i => s.selected.has(i.id)), list.some(i => s.selected.has(i.id)) && !list.every(i => s.selected.has(i.id)))}</th>
            ${sortHead('name', 'Program')}${sortHead('drive', isMac ? 'Volume' : 'Drive')}${isMac ? sortHead('used', 'Last opened') : sortHead('date', 'Installed')}${sortHead('size', 'Size', 'right')}<th></th></tr></thead>
          <tbody>${list.map(i => html`<tr class="${s.selected.has(i.id) ? 'selected' : ''}">
            <td class="w-cb">${checkbox(`data-change="pick" data-id="${i.id}" aria-label="Select ${i.name}"`, s.selected.has(i.id))}</td>
            <td><div class="cell-main"><span data-icon="${i.id}">${avatar(i.name, s.icons.get(i.id), 32)}</span>
              <div class="truncate"><div class="t truncate">${i.name} ${i.type === 'store' ? html`<span class="badge blue">${isMac ? 'App Store' : 'Store'}</span>` : ''}${i.type === 'apple' ? html`<span class="badge">Built-in</span>` : ''} ${i.broken ? html`<span class="badge amber">Broken</span>` : ''}</div>
              <div class="s truncate">${[i.publisher, i.version].filter(Boolean).join(' · ') || '—'}</div></div></div></td>
            <td title="${i.location || ''}">${i.drive ? html`<span class="drive-tag">${i.drive}</span>` : html`<span class="faint">—</span>`}</td>
            <td class="muted num" style="white-space:nowrap">${date(isMac ? i.lastUsed : i.installDate)}</td>
            <td class="right num" style="white-space:nowrap">${i.size != null ? bytes(i.size) : s.sizes.has(i.id) ? bytes(s.sizes.get(i.id)) : i.location && (i.type === 'desktop' || isMac) ? html`<button class="btn btn-ghost btn-sm" data-action="measure" data-id="${i.id}">Measure</button>` : html`<span class="faint">—</span>`}</td>
            <td class="actions-cell"><div class="row" style="gap:4px;justify-content:flex-end">
              <span class="row-actions row" style="gap:2px">
                <button class="icon-btn sm" data-action="leftovers" data-id="${i.id}" title="Scan for leftovers">${ic('search', 15)}</button>
                ${i.location ? html`<button class="icon-btn sm" data-action="reveal" data-id="${i.id}" title="Open install folder">${ic('folderOpen', 15)}</button>` : ''}
                ${i.type === 'desktop' ? html`<button class="icon-btn sm" data-action="removeEntry" data-id="${i.id}" title="Remove from list only">${ic('x', 15)}</button>` : ''}
              </span>
              <button class="btn btn-secondary btn-sm" data-action="uninstall" data-id="${i.id}" ${i.canUninstall || i.broken ? '' : 'disabled'}>Uninstall</button>
            </div></td>
          </tr>`)}</tbody></table></div>` : empty({iconName: 'search', title: 'No programs match', text: 'Try a different search or filter.'})}
      </div>
      ${sel.length ? html`<div class="selection-bar"><strong>${plural(sel.length, 'program')} selected</strong><span style="opacity:.7">${bytes(sel.reduce((n, i) => n + (i.size || 0), 0))}</span><span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" data-action="clearSel">Clear</button><button class="btn btn-danger btn-sm" data-action="batch">${ic('trash', 15)} Uninstall ${sel.length}</button></div>` : ''}`;
  },
  afterRender() { if (s.items) loadIcons(this, filtered()); },
  onMount() { if (!s.items && !s.loading) load(this); },
  on: {
    refresh() { return load(this); },
    ...filterHandlers(() => s.f, DEFAULT_FILTERS),
    quickDrive(el) { s.f.drive = s.f.drive === el.dataset.drive ? 'all' : el.dataset.drive; this.update(); },
    sort(el) { const k = el.dataset.sort; if (s.sort === k) s.dir *= -1; else { s.sort = k; s.dir = ['name', 'publisher', 'drive'].includes(k) ? 1 : -1; } this.update(); },
    pick(el) { el.checked ? s.selected.add(el.dataset.id) : s.selected.delete(el.dataset.id); this.update(); },
    all(el) { filtered().forEach(i => el.checked ? s.selected.add(i.id) : s.selected.delete(i.id)); this.update(); },
    clearSel() { s.selected.clear(); this.update(); },
    async measure(el) { el.disabled = true; el.innerHTML = '<span class="spinner"></span>'; const r = await api('programs.size', {id: el.dataset.id}); s.sizes.set(el.dataset.id, r.size || 0); this.update(); },
    reveal(el) { const i = s.items.find(x => x.id === el.dataset.id); if (i?.location) api('shell.reveal', {path: i.location}); },
    async leftovers(el) { await leftovers(this, s.items.find(x => x.id === el.dataset.id)); },
    async uninstall(el) { await uninstall(this, s.items.find(x => x.id === el.dataset.id)); },
    async removeEntry(el) {
      const i = s.items.find(x => x.id === el.dataset.id);
      const {ok} = await modal({title: `Remove ${i.name} from the list?`, icon: 'x', confirm: 'Remove entry', body: 'Only the entry in “Installed apps” is removed — files stay on disk. Use this for programs that were deleted manually. The entry is backed up first.'});
      if (!ok) return;
      await api('programs.removeEntry', {id: i.id});
      toast('Entry removed. Backup saved in History.', {type: 'success'});
      await load(this);
    },
    async batch() {
      const sel = s.items.filter(i => s.selected.has(i.id));
      const {ok} = await modal({title: `Uninstall ${plural(sel.length, 'program')}?`, icon: 'trash', danger: true, confirm: 'Uninstall all', body: html`<p>Uninstallers run one after another. Complete each one when it appears.</p><div class="modal-list">${sel.map(i => html`<div class="list-row">${avatar(i.name, s.icons.get(i.id), 22)}<span class="truncate">${i.name}</span></div>`)}</div>`});
      if (!ok) return;
      let removed = 0;
      for (const [n, item] of sel.entries()) {
        const busy = busyModal(`Uninstalling ${item.name}…`, `Program ${n + 1} of ${sel.length}. Complete the steps in the uninstaller window.`);
        try { const r = await api('programs.uninstall', {id: item.id}); if (r.removed) removed++; }
        catch (e) { toast(`${item.name}: ${e.message}`, {type: 'error'}); }
        finally { busy.close(); }
      }
      toast(`Uninstalled ${removed} of ${sel.length}. Use the leftover scan on any remaining entries.`, {type: 'success'});
      await load(this);
    }
  }
});
