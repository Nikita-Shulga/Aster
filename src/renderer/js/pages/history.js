import {html, ic, api, bytes, num, date, time, empty, modal, toast, ago, isMac, t, th} from '../lib.js';
import {definePage} from '../page.js';
import {chip, search as searchBox, daysSince} from '../filters.js';

// Labels are getters so they follow the interface language. Activity titles come from the main process, already translated.
const option = (value, key) => ({value, get label() { return t(key); }});
const PERIODS = [option('1', 'history.period.today'), option('7', 'filters.bucket.week'), option('30', 'filters.bucket.month'), option('365', 'history.period.year')];

const s = {items: null, stats: null, filter: 'all', search: '', period: 'all'};
const kind = (icon, tone, key) => ({icon, tone, get label() { return t(key); }});
const KIND = {
  clean: kind('sparkles', 'green', 'history.kind.clean'),
  registry: kind('layers', 'amber', 'history.kind.registry'),
  'registry-edit': kind('key', 'amber', 'history.kind.registry'),
  uninstall: kind('apps', 'blue', 'history.kind.programs'),
  leftovers: kind('apps', 'blue', 'history.kind.programs'),
  startup: kind('power', '', 'history.kind.startup'),
  update: kind('refresh', '', 'history.kind.updates'),
  trash: kind('trash', 'gray', 'history.kind.files'),
  tool: kind('wrench', 'gray', 'history.kind.tools')
};
const FILTERS = [['all', 'filters.all'], ['clean', 'history.kind.clean'], ['registry', 'history.kind.registry'], ['apps', 'history.kind.programs'], ['restorable', 'history.filter.restorable']];

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
  id: 'history', get title() { return t('page.history'); }, icon: 'history',
  view() {
    const head = html`<div class="page-head"><div class="titles"><h1>${t('page.history')}</h1><p>${t(isMac ? 'history.introMac' : 'history.intro')}</p></div>
      <div class="actions"><button class="btn btn-secondary" data-action="folder">${ic('folderOpen', 16)} ${t('history.backupFolder')}</button></div></div>`;
    if (!s.items) return html`${head}<div class="skeleton" style="height:300px"></div>`;
    const list = s.items.filter(match);
    const days = new Map();
    for (const a of list) { const d = date(a.at); if (!days.has(d)) days.set(d, []); days.get(d).push(a); }
    return html`${head}
      <div class="grid grid-3" style="margin-bottom:16px">
        <div class="card card-pad row" style="gap:14px"><div class="tile green">${ic('sparkles', 18)}</div><div class="stat"><span class="k">${t('history.stat.freed')}</span><span class="v num">${bytes(s.stats.cleaned)}</span></div></div>
        <div class="card card-pad row" style="gap:14px"><div class="tile amber">${ic('layers', 18)}</div><div class="stat"><span class="k">${t('history.stat.fixed')}</span><span class="v num">${num(s.stats.fixed)}</span></div></div>
        <div class="card card-pad row" style="gap:14px"><div class="tile">${ic('clock', 18)}</div><div class="stat"><span class="k">${t('history.stat.lastClean')}</span><span class="v">${ago(s.stats.lastClean)}</span></div></div>
      </div>
      <div class="card">
        <div class="toolbar filterbar" style="padding:14px 16px 0"><div class="segmented">${FILTERS.map(([id, key]) => html`<button class="${s.filter === id ? 'on' : ''}" data-action="filter" data-f="${id}">${t(key)}</button>`)}</div>${searchBox(s.search, t('history.search'), 200)}${chip('period', t('history.period.label'), PERIODS, s.period, {allLabel: t('history.period.all')})}</div>
        ${list.length ? [...days.entries()].map(([day, rows]) => html`<div class="timeline-day">${day}</div><div class="list">${rows.map(a => {
          const k = KIND[a.kind] || KIND.tool;
          return html`<div class="list-row">
            <div class="tile ${k.tone}" style="width:32px;height:32px;border-radius:9px">${ic(k.icon, 16)}</div>
            <div class="grow truncate"><div style="font-weight:500" class="truncate">${a.title}</div><div class="meta truncate">${time(a.at)} · ${k.label}${a.detail ? html` · <span class="mono">${a.detail}</span>` : ''}</div></div>
            ${a.bytes ? html`<span class="badge green num">${bytes(a.bytes)}</span>` : ''}
            ${a.backupExists ? html`<button class="btn btn-secondary btn-sm" data-action="restore" data-name="${a.backup}" data-title="${a.title}">${ic('undo', 14)} ${t('history.restore')}</button>` : ''}
          </div>`;
        })}</div>`) : empty({iconName: 'history', title: t('history.empty.title'), text: t('history.empty.text')})}
      </div>`;
  },
  onMount() { load(this); },
  on: {
    filter(el) { if (el.dataset.key === 'period') s.period = el.value; else s.filter = el.dataset.f; this.update(); },
    search(el) { s.search = el.value; this.update(); },
    clearSearch() { s.search = ''; this.update(); },
    folder() { api('backups.openFolder'); },
    async restore(el) {
      const {ok} = await modal({title: t('history.restore.title'), icon: 'undo', confirm: t('history.restore'), body: html`<p>${t('history.restore.body', {title: el.dataset.title})}</p><p style="margin-top:8px" class="faint">${t('history.restore.hklm')}</p>`});
      if (!ok) return;
      await api('backups.restore', {name: el.dataset.name});
      toast(t('history.restore.done'), {type: 'success'});
    }
  }
});
