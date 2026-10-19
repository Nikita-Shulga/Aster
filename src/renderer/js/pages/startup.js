import {html, ic, api, app, num, empty, modal, toast, avatar, isMac, t, th} from '../lib.js';
import {definePage} from '../page.js';
import {onLanguageChange} from '../i18n.js';
import {shared, notify} from '../state.js';
import {chip, countOptions, search as searchBox, resultLine, filterHandlers, driveOf} from '../filters.js';

const DEFAULT_FILTERS = {search: '', status: 'all', drive: 'all', scope: 'all', publisher: 'all'};
const s = {loading: false, tab: 'apps', f: structuredClone(DEFAULT_FILTERS), icons: new Map(), busy: new Set(), page: null};
// Labels are getters so they follow the interface language.
const opt = (value, key, test) => ({value, test, get label() { return t(key); }});
const STATUS = [opt('on', 'startup.status.on', i => i.enabled), opt('off', 'startup.status.off', i => !i.enabled), opt('missing', 'startup.status.missing', i => !i.exists && !!i.file), opt('unsigned', 'startup.status.unsigned', i => !i.publisher)];
const SCOPES = [opt('user', 'startup.scope.user'), opt('machine', 'startup.scope.machine')];
const driveOfItem = i => driveOf(i.file) || driveOf(String(i.command || '').replace(/^"/, ''));
const st = shared.startup;

async function load() {
  s.loading = true; s.page?.update();
  try { const r = await api('startup.list'); st.items = r.items; st.unavailable = !!r.loginItemsUnavailable; notify(); }
  finally { s.loading = false; s.page?.update(); }
}

// Each item's source ("Registry · Current user"…) comes from the main process in the interface language: fetch the list again.
onLanguageChange(() => { if (st.items && !s.loading) { st.items = null; load().catch(() => {}); } });

const tab = (id, key, test) => ({id, test, get label() { return t(key); }});
const TABS = isMac ? [
  tab('apps', 'startup.tab.appsMac', i => i.type === 'login' || (i.type === 'agent' && i.scope === 'user')),
  tab('tasks', 'startup.tab.tasksMac', i => i.type === 'agent' && i.scope === 'machine'),
  tab('services', 'startup.tab.servicesMac', i => i.type === 'daemon')
] : [
  tab('apps', 'startup.tab.apps', i => i.type === 'registry' || i.type === 'folder'),
  tab('tasks', 'startup.tab.tasks', i => i.type === 'task'),
  tab('services', 'startup.tab.services', i => i.type === 'service')
];

async function loadIcons(page, list) {
  const missing = list.filter(i => !s.icons.has(i.id) && i.exists).map(i => i.id);
  if (!missing.length) return;
  missing.forEach(id => s.icons.set(id, null));
  const res = await api('startup.icons', {ids: missing}).catch(() => ({}));
  for (const [id, url] of Object.entries(res)) {
    if (!url) continue;
    s.icons.set(id, url);
    const cell = page.mounted && page.el.querySelector(`[data-icon="${id}"]`);
    if (cell) cell.innerHTML = `<img class="avatar" src="${url}" width="32" height="32" alt="">`;
  }
}

function matches(i, skip) {
  const f = s.f, q = f.search.trim().toLowerCase();
  return (skip === 'status' || f.status === 'all' || STATUS.find(x => x.value === f.status).test(i)) &&
    (skip === 'drive' || f.drive === 'all' || (driveOfItem(i) || '__none') === f.drive) &&
    (skip === 'scope' || f.scope === 'all' || i.scope === f.scope) &&
    (skip === 'publisher' || f.publisher === 'all' || (i.publisher || '__none') === f.publisher) &&
    (!q || i.name.toLowerCase().includes(q) || (i.publisher || '').toLowerCase().includes(q) || (i.command || '').toLowerCase().includes(q));
}
const inTab = () => (st.items || []).filter(TABS.find(x => x.id === s.tab).test);
function visible() {
  return inTab().filter(i => matches(i)).sort((a, b) => (b.enabled - a.enabled) || a.name.localeCompare(b.name));
}

export default definePage({
  id: 'startup', get title() { return t('page.startup'); }, icon: 'power',
  badge: () => { const n = (st.items || []).filter(i => TABS[0].test(i) && i.enabled).length; return n ? {text: String(n)} : null; },
  view() {
    const head = html`<div class="page-head">
      <div class="titles"><h1>${t('page.startup')}</h1><p>${t(isMac ? 'startup.introMac' : 'startup.intro')}</p></div>
      <div class="actions">
        <button class="btn btn-secondary" data-action="add">${ic('plus', 16)} ${t(isMac ? 'startup.addMac' : 'startup.add')}</button>
        <button class="btn btn-secondary" data-action="refresh" ${s.loading ? 'disabled' : ''}>${ic('refresh', 16, s.loading ? 'spin' : '')} ${t('startup.refresh')}</button>
      </div></div>`;
    if (!st.items) return html`${head}<div class="card card-pad">${[1, 2, 3, 4, 5].map(() => html`<div class="skeleton" style="height:44px;margin:8px 0"></div>`)}</div>`;
    const apps = st.items.filter(TABS[0].test);
    const enabled = apps.filter(i => i.enabled).length;
    const missing = st.items.filter(i => i.type !== 'service' && !i.exists && i.file).length;
    const list = visible();
    return html`${head}
      <div class="grid grid-3" style="margin-bottom:16px">
        <div class="card card-pad row" style="gap:14px"><div class="tile green">${ic('play', 18)}</div><div class="stat"><span class="k">${t('startup.stat.enabled')}</span><span class="v num">${num(enabled)}</span></div></div>
        <div class="card card-pad row" style="gap:14px"><div class="tile gray">${ic('stop', 18)}</div><div class="stat"><span class="k">${t('startup.stat.disabled')}</span><span class="v num">${num(apps.length - enabled)}</span></div></div>
        <div class="card card-pad row" style="gap:14px"><div class="tile ${missing ? 'amber' : 'gray'}">${ic('alert', 18)}</div><div class="stat"><span class="k">${t('startup.stat.missing')}</span><span class="v num">${num(missing)}</span></div></div>
      </div>
      <div class="card">
        <div class="toolbar" style="padding:14px 16px 0">
          <div class="segmented">${TABS.map(x => html`<button class="${s.tab === x.id ? 'on' : ''}" data-action="tab" data-tab="${x.id}">${x.label} <span class="count">${st.items.filter(x.test).length}</span></button>`)}</div>
        </div>
        <div class="toolbar filterbar" style="padding:10px 16px 0">
          ${searchBox(s.f.search, t('startup.search'), 220)}
          ${chip('status', t('startup.filter.status'), STATUS.map(o => ({...o, count: inTab().filter(i => matches(i, 'status') && o.test(i)).length})), s.f.status)}
          ${chip('drive', t('startup.filter.drive'), countOptions(inTab().filter(i => matches(i, 'drive')), driveOfItem, {sort: 'alpha', unknown: t('filters.unknown')}), s.f.drive)}
          ${chip('scope', t('startup.filter.scope'), SCOPES.map(o => ({...o, count: inTab().filter(i => matches(i, 'scope') && i.scope === o.value).length})), s.f.scope)}
          ${chip('publisher', t('startup.filter.publisher'), countOptions(inTab().filter(i => matches(i, 'publisher')), i => i.publisher || null, {unknown: t('startup.status.unsigned')}), s.f.publisher)}
        </div>
        ${resultLine(list.length, inTab().length, s.f, 'startup.showing')}
        ${s.tab === 'services' ? html`<div class="callout" style="margin:12px 16px 0">${ic('info', 16)}<div>${isMac ? t('startup.servicesNoteMac') : th('startup.servicesNote')}</div></div>` : ''}
        ${isMac && st.unavailable && s.tab === 'apps' ? html`<div class="callout amber" style="margin:12px 16px 0">${ic('info', 16)}<div>${th('startup.loginItemsUnavailable')}</div></div>` : ''}
        ${list.length ? html`<div class="table-wrap" style="margin-top:8px"><table class="table">
          <thead><tr><th>${t('startup.col.name')}</th><th>${t('startup.filter.drive')}</th><th>${t('startup.col.source')}</th><th style="width:90px">${t('startup.filter.status')}</th><th></th></tr></thead>
          <tbody>${list.map(i => {
            const lockedAdmin = i.admin && !app.system?.admin && !isMac;
            return html`<tr>
              <td style="max-width:460px"><div class="cell-main"><span data-icon="${i.id}">${avatar(i.name, s.icons.get(i.id), 32)}</span>
                <div class="truncate"><div class="t truncate">${i.name} ${!i.exists && i.file && i.type !== 'service' ? html`<span class="badge amber">${t('startup.status.missing')}</span>` : ''} ${i.type === 'service' && i.state === 'Running' ? html`<span class="badge green">${t('startup.running')}</span>` : ''}</div>
                <div class="s truncate mono selectable" title="${i.command}">${i.publisher ? html`<span style="font-family:var(--font)">${i.publisher} · </span>` : ''}${i.command}</div></div></div></td>
              <td>${driveOfItem(i) ? html`<span class="drive-tag">${driveOfItem(i)}</span>` : html`<span class="faint">—</span>`}</td>
              <td class="muted" style="white-space:nowrap;font-size:12.5px">${i.source}</td>
              <td>${i.canToggle ? html`<input type="checkbox" class="switch" data-change="toggle" data-id="${i.id}" ${i.enabled ? 'checked' : ''} ${s.busy.has(i.id) ? 'disabled' : ''} title="${lockedAdmin ? t('startup.requiresAdmin') : i.enabled ? t('startup.status.on') : t('startup.status.off')}" aria-label="${t('startup.runAtStartup', {name: i.name})}">` : html`<span class="faint" style="font-size:12px">${t('startup.once')}</span>`}</td>
              <td class="actions-cell"><div class="row-actions row" style="gap:2px;justify-content:flex-end">
                ${i.file && i.exists ? html`<button class="icon-btn sm" data-action="reveal" data-id="${i.id}" title="${t('startup.showFile')}">${ic('folderOpen', 15)}</button>` : ''}
                ${i.type !== 'service' ? html`<button class="icon-btn sm" data-action="remove" data-id="${i.id}" title="${t('startup.deleteEntry')}">${ic('trash', 15)}</button>` : ''}
              </div></td>
            </tr>`;
          })}</tbody></table></div>` : empty({iconName: 'power', title: t(s.query ? 'startup.noMatch' : 'startup.empty'), text: t(s.query ? 'startup.noMatchText' : 'startup.emptyText')})}
      </div>`;
  },
  afterRender() { if (st.items) loadIcons(this, visible()); },
  onMount() { s.page = this; if (!st.items && !s.loading) load(); },
  onUnmount() { s.page = null; },
  on: {
    refresh() { return load(); },
    tab(el) { s.tab = el.dataset.tab; this.update(); },
    ...filterHandlers(() => s.f, DEFAULT_FILTERS),
    async toggle(el) {
      const item = st.items.find(i => i.id === el.dataset.id);
      if (item.admin && !app.system?.admin && !isMac) {
        el.checked = item.enabled;
        const {ok} = await modal({title: t('startup.adminTitle'), icon: 'shield', confirm: t('startup.restartAdmin'), body: t('startup.adminText', {name: item.name})});
        if (ok) window.asterRelaunch();
        return;
      }
      s.busy.add(item.id);
      try { await api('startup.toggle', {id: item.id, enabled: el.checked}); item.enabled = el.checked; toast(t(el.checked ? 'startup.willStart' : 'startup.wontStart', {name: item.name}), {type: 'success'}); }
      catch (e) { el.checked = item.enabled; throw e; }
      finally { s.busy.delete(item.id); notify(); this.update(); }
    },
    reveal(el) { const i = st.items.find(x => x.id === el.dataset.id); api('shell.reveal', {path: i.type === 'folder' ? i.location : i.file}); },
    async remove(el) {
      const i = st.items.find(x => x.id === el.dataset.id);
      const {ok} = await modal({title: t('startup.removeTitle', {name: i.name}), icon: 'trash', danger: true, confirm: t('common.delete'), body: t(isMac ? (i.type === 'login' ? 'startup.removeLogin' : 'startup.removeAgent') : i.type === 'folder' ? 'startup.removeFolder' : i.type === 'task' ? 'startup.removeTask' : 'startup.removeRegistry')});
      if (!ok) return;
      await api('startup.remove', {id: i.id});
      st.items = st.items.filter(x => x.id !== i.id);
      toast(t('startup.removed'), {type: 'success'}); notify(); this.update();
    },
    async add() { const r = await api('startup.add'); if (!r.cancelled) { toast(t('startup.added'), {type: 'success'}); await load(); } }
  }
});
