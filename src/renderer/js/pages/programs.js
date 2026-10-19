import {html, ic, api, app, bytes, num, date, checkbox, empty, modal, toast, avatar, busyModal, str, raw, isMac, t, th} from '../lib.js';
import {definePage} from '../page.js';
import {chip, countOptions, search as searchBox, resultLine, filterHandlers, SIZE_BUCKETS, AGE_BUCKETS, daysSince, bucketTest} from '../filters.js';

const DEFAULT_FILTERS = {search: '', type: 'all', drive: 'all', publisher: 'all', size: 'all', age: 'all', used: 'all'};
// Labels are getters so they follow the interface language.
const opt = (value, key, extra) => ({value, ...extra, get label() { return t(key); }});
// macOS tracks when each app was last opened — great for finding apps you never use.
const USED_BUCKETS = [opt('month', 'programs.used.month', {test: d => d != null && d <= 30}), opt('q', 'programs.used.q', {test: d => d != null && d > 90}), opt('y', 'programs.used.y', {test: d => d != null && d > 365}), opt('never', 'programs.used.never', {test: d => d == null})];
const s = {items: null, loading: false, f: structuredClone(DEFAULT_FILTERS), sort: 'name', dir: 1, selected: new Set(), icons: new Map(), sizes: new Map()};
const sizeOf = i => i.size ?? s.sizes.get(i.id) ?? null;
const TYPES = isMac
  ? [opt('app', 'programs.type.app'), opt('store', 'programs.type.appStore'), opt('apple', 'programs.type.apple')]
  : [opt('desktop', 'programs.type.desktop'), opt('store', 'programs.type.store'), opt('broken', 'programs.type.broken'), opt('noremove', 'programs.type.noremove')];
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
  const busy = busyModal(t('programs.lookingLeftovers'), t(isMac ? 'programs.lookingLeftoversTextMac' : 'programs.lookingLeftoversText', {name: item.name}));
  let res;
  try { res = await api('programs.leftovers', {id: item.id}); } finally { busy.close(); }
  if (!res.items.length) { toast(afterUninstall ? t('programs.removedCleanly', {name: item.name}) : t('programs.noLeftovers'), {type: 'success'}); return; }
  const total = res.items.reduce((n, x) => n + (x.size || 0), 0);
  // The install folder is left unticked unless the program is already uninstalled (reason text comes translated from main).
  const isInstallFolder = x => x.installFolder || x.install || x.path === item.location || x.reason === 'Install folder';
  const body = html`
    <p>${afterUninstall ? t('programs.leftBehind', {name: item.name}) : t('programs.appearToBelong', {name: item.name})} ${t(isMac ? 'programs.leftoversNoteMac' : 'programs.leftoversNote')}</p>
    <div class="modal-list selectable" style="max-height:320px;padding:4px 10px">
      ${res.items.map(x => html`<label class="leftover-row">
        ${raw(`<input type="checkbox" class="cb" name="lo" value="${x.id}" ${isInstallFolder(x) && !afterUninstall ? '' : 'checked'}>`)}
        <span class="tile ${x.kind === 'registry' ? 'amber' : 'blue'}" style="width:28px;height:28px;border-radius:8px">${ic(x.kind === 'registry' ? 'key' : x.kind === 'file' ? 'file' : 'folder', 14)}</span>
        <div class="truncate"><div class="p truncate" title="${x.path}">${x.path}</div><div class="faint" style="font-size:11.5px">${x.reason}${x.detail ? ` · ${x.detail}` : ''}</div></div>
        <span class="num faint">${x.kind === 'registry' ? '' : bytes(x.size)}</span>
      </label>`)}
    </div>
    ${total ? html`<p class="faint" style="margin-top:8px;font-size:12px">${t('programs.reclaimable', {size: bytes(total)})}</p>` : ''}`;
  const dlg = document.getElementById('modal');
  const {ok} = await modal({title: t('programs.leftoversOf', {name: item.name}), icon: 'search', wide: true, confirm: t('programs.removeSelected'), cancel: t('programs.keepAll'), body: str(body), _grab: true});
  const ids = [...dlg.querySelectorAll('[name=lo]:checked')].map(i => i.value);
  if (!ok || !ids.length) return;
  const r = await api('programs.removeLeftovers', {programId: item.id, ids});
  toast(`${t('programs.removedLeftovers', {count: r.removed})}${r.bytes ? ` · ${bytes(r.bytes)}` : ''}${r.failed.length ? ` · ${t('programs.couldNotRemove', {count: r.failed.length})}` : ''}`, {type: r.failed.length ? 'info' : 'success'});
}

async function uninstall(page, item) {
  if (item.broken) {
    const {ok} = await modal({title: t('programs.goneTitle', {name: item.name}), icon: 'alert', confirm: t('programs.goneConfirm'), body: t('programs.goneBody')});
    if (!ok) return;
    await leftovers(page, item, {afterUninstall: true});
    await load(page);
    return;
  }
  const {ok} = await modal({title: t('programs.uninstallTitle', {name: item.name}), icon: 'trash', danger: true, confirm: t('programs.uninstall'), body: html`<p>${t(isMac ? 'programs.uninstallBodyMac' : item.type === 'store' ? 'programs.uninstallBodyStore' : 'programs.uninstallBody')}</p>`});
  if (!ok) return;
  const busy = busyModal(t('programs.uninstalling', {name: item.name}), t(isMac ? 'programs.uninstallingMac' : item.type === 'store' ? 'programs.uninstallingStore' : 'programs.uninstallingText'));
  let res;
  try { res = await api('programs.uninstall', {id: item.id}); } finally { busy.close(); }
  if (res.removed) { toast(t(isMac ? 'programs.movedToTrash' : 'programs.uninstalled', {name: item.name}), {type: 'success'}); if (item.type === 'desktop' || isMac) await leftovers(page, item, {afterUninstall: true}); }
  else toast(t('programs.stillInstalled', {name: item.name}), {type: 'info'});
  await load(page);
}

export default definePage({
  id: 'programs', get title() { return t('page.programs'); }, icon: 'apps',
  view() {
    const head = html`<div class="page-head">
      <div class="titles"><h1>${t('page.programs')}</h1><p>${t(isMac ? 'programs.introMac' : 'programs.intro')}</p></div>
      <div class="actions"><button class="btn btn-secondary" data-action="refresh" ${s.loading ? 'disabled' : ''}>${ic('refresh', 16, s.loading ? 'spin' : '')} ${t('programs.refresh')}</button></div>
    </div>`;
    if (!s.items) return html`${head}<div class="card card-pad">${[1, 2, 3, 4, 5, 6].map(() => html`<div class="skeleton" style="height:40px;margin:8px 0"></div>`)}</div>`;
    const list = filtered();
    const total = s.items.reduce((n, i) => n + (i.size || 0), 0);
    const counts = {all: s.items.length, desktop: s.items.filter(i => i.type === 'desktop').length, store: s.items.filter(i => i.type === 'store').length, broken: s.items.filter(i => i.broken).length};
    const sel = s.items.filter(i => s.selected.has(i.id));
    return html`${head}
      <div class="card">
        <div class="prog-stats">
          <div class="stat"><span class="k">${t('programs.installed')}</span><span class="v num">${num(counts.all)}</span></div>
          <div class="stat"><span class="k">${t('programs.reportedSize')}</span><span class="v num">${bytes(total)}</span></div>
          <div class="stat"><span class="k">${t(isMac ? 'programs.statAppStore' : 'programs.statStore')}</span><span class="v num">${num(counts.store)}</span></div>
          ${isMac ? html`<div class="stat"><span class="k">${t('programs.notUsed3m')}</span><span class="v num">${num(s.items.filter(i => (daysSince(i.lastUsed) ?? 0) > 90).length)}</span></div>` : html`<div class="stat"><span class="k">${t('programs.type.broken')}</span><span class="v num" style="${counts.broken ? 'color:var(--amber-text)' : ''}">${num(counts.broken)}</span></div>`}
          <div class="stat" style="margin-left:auto"><span class="k">${t('programs.byDrive')}</span><span class="row" style="gap:6px;margin-top:2px">${countOptions(s.items, i => i.drive, {sort: 'alpha', unknown: '?'}).map(o => {
            const size = s.items.filter(i => (i.drive || '__none') === o.value).reduce((n, i) => n + (i.size || 0), 0);
            return html`<button class="fchip ${s.f.drive === o.value ? 'on' : ''}" style="height:28px" data-action="quickDrive" data-drive="${o.value}" title="${t('programs.driveReported', {size: bytes(size)})}"><span class="fchip-v">${o.label}</span><span class="fchip-k">${o.count}</span></button>`;
          })}</span></div>
        </div>
        <div class="toolbar filterbar" style="padding:14px 16px 0">
          ${searchBox(s.f.search, t('programs.search'), 200)}
          ${chip('type', t('programs.typeChip'), TYPES.map(o => ({value: o.value, label: o.label, count: s.items.filter(i => matches(i, 'type') && typeTest(i, o.value)).length})), s.f.type)}
          ${chip('drive', t('programs.drive'), countOptions(s.items.filter(i => matches(i, 'drive')), i => i.drive, {sort: 'alpha', unknown: t('programs.unknownDrive')}), s.f.drive)}
          ${chip('publisher', t('programs.publisher'), countOptions(s.items.filter(i => matches(i, 'publisher')), i => i.publisher || null, {unknown: t('programs.noPublisher')}), s.f.publisher)}
          ${chip('size', t('programs.size'), SIZE_BUCKETS.map(b => ({value: b.value, label: b.label, test: b.test, count: s.items.filter(i => matches(i, 'size') && sizeOf(i) != null && b.test(sizeOf(i))).length})), s.f.size)}
          ${isMac ? chip('used', t('programs.lastOpened'), USED_BUCKETS.map(b => ({value: b.value, label: b.label, test: b.test, count: s.items.filter(i => matches(i, 'used') && b.test(daysSince(i.lastUsed))).length})), s.f.used, {allLabel: t('programs.anyTime')}) : ''}
          ${chip('age', t(isMac ? 'programs.added' : 'programs.installed'), AGE_BUCKETS.map(b => ({value: b.value, label: b.label, test: b.test, count: s.items.filter(i => matches(i, 'age') && daysSince(i.installDate) != null && b.test(daysSince(i.installDate))).length})), s.f.age, {allLabel: t('programs.anyTime')})}
        </div>
        ${resultLine(list.length, s.items.length, s.f, 'programs.showing')}
        ${list.length ? html`<div class="table-wrap" style="margin-top:8px"><table class="table">
          <thead><tr><th class="w-cb">${checkbox(`data-change="all" aria-label="${t('programs.selectAll')}"`, list.length && list.every(i => s.selected.has(i.id)), list.some(i => s.selected.has(i.id)) && !list.every(i => s.selected.has(i.id)))}</th>
            ${sortHead('name', t('programs.program'))}${sortHead('drive', t(isMac ? 'programs.volume' : 'programs.drive'))}${isMac ? sortHead('used', t('programs.lastOpened')) : sortHead('date', t('programs.installed'))}${sortHead('size', t('programs.size'), 'right')}<th></th></tr></thead>
          <tbody>${list.map(i => html`<tr class="${s.selected.has(i.id) ? 'selected' : ''}">
            <td class="w-cb">${checkbox(str(html`data-change="pick" data-id="${i.id}" aria-label="${t('programs.selectOne', {name: i.name})}"`), s.selected.has(i.id))}</td>
            <td><div class="cell-main"><span data-icon="${i.id}">${avatar(i.name, s.icons.get(i.id), 32)}</span>
              <div class="truncate"><div class="t truncate">${i.name} ${i.type === 'store' ? html`<span class="badge blue">${isMac ? 'App Store' : 'Store'}</span>` : ''}${i.type === 'apple' ? html`<span class="badge">${t('programs.builtIn')}</span>` : ''} ${i.broken ? html`<span class="badge amber">${t('programs.broken')}</span>` : ''}</div>
              <div class="s truncate">${[i.publisher, i.version].filter(Boolean).join(' · ') || '—'}</div></div></div></td>
            <td title="${i.location || ''}">${i.drive ? html`<span class="drive-tag">${i.drive}</span>` : html`<span class="faint">—</span>`}</td>
            <td class="muted num" style="white-space:nowrap">${date(isMac ? i.lastUsed : i.installDate)}</td>
            <td class="right num" style="white-space:nowrap">${i.size != null ? bytes(i.size) : s.sizes.has(i.id) ? bytes(s.sizes.get(i.id)) : i.location && (i.type === 'desktop' || isMac) ? html`<button class="btn btn-ghost btn-sm" data-action="measure" data-id="${i.id}">${t('programs.measure')}</button>` : html`<span class="faint">—</span>`}</td>
            <td class="actions-cell"><div class="row" style="gap:4px;justify-content:flex-end">
              <span class="row-actions row" style="gap:2px">
                <button class="icon-btn sm" data-action="leftovers" data-id="${i.id}" title="${t('programs.scanLeftovers')}">${ic('search', 15)}</button>
                ${i.location ? html`<button class="icon-btn sm" data-action="reveal" data-id="${i.id}" title="${t('programs.openFolder')}">${ic('folderOpen', 15)}</button>` : ''}
                ${i.type === 'desktop' ? html`<button class="icon-btn sm" data-action="removeEntry" data-id="${i.id}" title="${t('programs.removeFromList')}">${ic('x', 15)}</button>` : ''}
              </span>
              <button class="btn btn-secondary btn-sm" data-action="uninstall" data-id="${i.id}" ${i.canUninstall || i.broken ? '' : 'disabled'}>${t('programs.uninstall')}</button>
            </div></td>
          </tr>`)}</tbody></table></div>` : empty({iconName: 'search', title: t('programs.noMatch'), text: t('programs.noMatchText')})}
      </div>
      ${sel.length ? html`<div class="selection-bar"><strong>${t('programs.selected', {count: sel.length})}</strong><span style="opacity:.7">${bytes(sel.reduce((n, i) => n + (i.size || 0), 0))}</span><span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" data-action="clearSel">${t('programs.clear')}</button><button class="btn btn-danger btn-sm" data-action="batch">${ic('trash', 15)} ${t('programs.uninstallN', {count: sel.length})}</button></div>` : ''}`;
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
      const {ok} = await modal({title: t('programs.removeEntryTitle', {name: i.name}), icon: 'x', confirm: t('programs.removeEntry'), body: t('programs.removeEntryBody')});
      if (!ok) return;
      await api('programs.removeEntry', {id: i.id});
      toast(t('programs.entryRemoved'), {type: 'success'});
      await load(this);
    },
    async batch() {
      const sel = s.items.filter(i => s.selected.has(i.id));
      const {ok} = await modal({title: t('programs.batchTitle', {count: sel.length}), icon: 'trash', danger: true, confirm: t('programs.uninstallAll'), body: html`<p>${t('programs.batchBody')}</p><div class="modal-list">${sel.map(i => html`<div class="list-row">${avatar(i.name, s.icons.get(i.id), 22)}<span class="truncate">${i.name}</span></div>`)}</div>`});
      if (!ok) return;
      let removed = 0;
      for (const [n, item] of sel.entries()) {
        const busy = busyModal(t('programs.uninstalling', {name: item.name}), t('programs.batchStep', {n: n + 1, total: sel.length}));
        try { const r = await api('programs.uninstall', {id: item.id}); if (r.removed) removed++; }
        catch (e) { toast(`${item.name}: ${e.message}`, {type: 'error'}); }
        finally { busy.close(); }
      }
      toast(t('programs.batchDone', {removed, total: sel.length}), {type: 'success'});
      await load(this);
    }
  }
});
