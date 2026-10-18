import {html, ic, api, bytes, num, date, time, empty, modal, toast, ago} from '../lib.js';
import {definePage} from '../page.js';
import {chip, search as searchBox, daysSince} from '../filters.js';
const PERIODS = [{value: '1', label: 'Today'}, {value: '7', label: 'Last 7 days'}, {value: '30', label: 'Last 30 days'}, {value: '365', label: 'Last year'}];

const s = {items: null, stats: null, filter: 'all', search: '', period: 'all'};
const KIND = {
  clean: {icon: 'sparkles', tone: 'green', label: 'Cleaning'},
  registry: {icon: 'layers', tone: 'amber', label: 'Registry'},
  'registry-edit': {icon: 'key', tone: 'amber', label: 'Registry'},
  uninstall: {icon: 'apps', tone: 'blue', label: 'Programs'},
  leftovers: {icon: 'apps', tone: 'blue', label: 'Programs'},
  startup: {icon: 'power', tone: '', label: 'Startup'},
  update: {icon: 'refresh', tone: '', label: 'Updates'},
  trash: {icon: 'trash', tone: 'gray', label: 'Files'},
  tool: {icon: 'wrench', tone: 'gray', label: 'Tools'}
};
const FILTERS = [['all', 'All'], ['clean', 'Cleaning'], ['registry', 'Registry'], ['apps', 'Programs'], ['restorable', 'Restorable']];

async function load(page) {
  [s.items, s.stats] = await Promise.all([api('activity.list'), api('activity.stats')]);
  page.update();
}

function match(a) {
  if (s.period !== 'all' && daysSince(a.at) > +s.period) return false;
  if (s.search.trim() && !`${a.title} ${a.detail || ''}`.toLowerCase().includes(s.search.trim().toLowerCase())) return false;
  if (s.filter === 'all') return true;
  if (s.filter === 'restorable') return a.backupExists;
  if (s.filter === 'registry') return a.kind.startsWith('registry');
  if (s.filter === 'apps') return a.kind === 'uninstall' || a.kind === 'leftovers';
  return a.kind === s.filter;
}

export default definePage({
  id: 'history', title: 'History', icon: 'history',
  view() {
    const head = html`<div class="page-head"><div class="titles"><h1>History</h1><p>Everything Aster changed on this PC. Registry changes are backed up and can be restored with one click.</p></div>
      <div class="actions"><button class="btn btn-secondary" data-action="folder">${ic('folderOpen', 16)} Backup folder</button></div></div>`;
    if (!s.items) return html`${head}<div class="skeleton" style="height:300px"></div>`;
    const list = s.items.filter(match);
    const days = new Map();
    for (const a of list) { const d = date(a.at); if (!days.has(d)) days.set(d, []); days.get(d).push(a); }
    return html`${head}
      <div class="grid grid-3" style="margin-bottom:16px">
        <div class="card card-pad row" style="gap:14px"><div class="tile green">${ic('sparkles', 18)}</div><div class="stat"><span class="k">Space freed in total</span><span class="v num">${bytes(s.stats.cleaned)}</span></div></div>
        <div class="card card-pad row" style="gap:14px"><div class="tile amber">${ic('layers', 18)}</div><div class="stat"><span class="k">Registry issues fixed</span><span class="v num">${num(s.stats.fixed)}</span></div></div>
        <div class="card card-pad row" style="gap:14px"><div class="tile">${ic('clock', 18)}</div><div class="stat"><span class="k">Last cleaned</span><span class="v">${ago(s.stats.lastClean)}</span></div></div>
      </div>
      <div class="card">
        <div class="toolbar filterbar" style="padding:14px 16px 0"><div class="segmented">${FILTERS.map(([id, l]) => html`<button class="${s.filter === id ? 'on' : ''}" data-action="filter" data-f="${id}">${l}</button>`)}</div>${searchBox(s.search, 'Search history', 200)}${chip('period', 'When', PERIODS, s.period, {allLabel: 'All time'})}</div>
        ${list.length ? [...days.entries()].map(([day, rows]) => html`<div class="timeline-day">${day}</div><div class="list">${rows.map(a => {
          const k = KIND[a.kind] || KIND.tool;
          return html`<div class="list-row">
            <div class="tile ${k.tone}" style="width:32px;height:32px;border-radius:9px">${ic(k.icon, 16)}</div>
            <div class="grow truncate"><div style="font-weight:500" class="truncate">${a.title}</div><div class="meta truncate">${time(a.at)} · ${k.label}${a.detail ? html` · <span class="mono">${a.detail}</span>` : ''}</div></div>
            ${a.bytes ? html`<span class="badge green num">${bytes(a.bytes)}</span>` : ''}
            ${a.backupExists ? html`<button class="btn btn-secondary btn-sm" data-action="restore" data-name="${a.backup}" data-title="${a.title}">${ic('undo', 14)} Restore</button>` : ''}
          </div>`;
        })}</div>`) : empty({iconName: 'history', title: 'Nothing here yet', text: 'Cleanups, registry fixes, uninstalls and startup changes will appear here.'})}
      </div>`;
  },
  onMount() { load(this); },
  on: {
    filter(el) { if (el.dataset.key === 'period') s.period = el.value; else s.filter = el.dataset.f; this.update(); },
    search(el) { s.search = el.value; this.update(); },
    clearSearch() { s.search = ''; this.update(); },
    folder() { api('backups.openFolder'); },
    async restore(el) {
      const {ok} = await modal({title: 'Restore this backup?', icon: 'undo', confirm: 'Restore', body: html`<p>The registry entries saved before “${el.dataset.title}” are written back.</p><p style="margin-top:8px" class="faint">Entries in HKEY_LOCAL_MACHINE need administrator rights.</p>`});
      if (!ok) return;
      await api('backups.restore', {name: el.dataset.name});
      toast('Backup restored', {type: 'success'});
    }
  }
});
