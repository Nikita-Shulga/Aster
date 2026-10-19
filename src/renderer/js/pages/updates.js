import {html, ic, api, ago, empty, modal, toast, avatar, onEvent, isMac, t, th} from '../lib.js';
import {onLanguageChange} from '../i18n.js';
import {definePage} from '../page.js';
import {chip, search as searchBox, filterHandlers} from '../filters.js';

const DEFAULT_FILTERS = {search: '', change: 'all'};
const pf = structuredClone(DEFAULT_FILTERS);
// How big the version jump is: major (1.x → 2.x), minor (1.2 → 1.3) or patch (1.2.3 → 1.2.4).
function changeOf(i) {
  const a = String(i.installed).match(/\d+/g) || [], b = String(i.available).match(/\d+/g) || [];
  if (!a.length || !b.length) return 'other';
  if (+a[0] !== +b[0]) return 'major';
  if (+(a[1] || 0) !== +(b[1] || 0)) return 'minor';
  return 'patch';
}
// Labels are getters so they follow the interface language.
const change = (value, hint) => ({value, get label() { return t(`updates.change.${value}`); }, get hint() { return hint ? t(`updates.change.${value}.hint`) : undefined; }});
const CHANGES = [change('major', true), change('minor'), change('patch'), change('other')];
const KINDS = {macos: () => 'macOS', cask: () => t('updates.kind.cask'), formula: () => t('updates.kind.formula'), appstore: () => 'App Store'};
const matchUpd = (i, skip) => (skip === 'change' || pf.change === 'all' || changeOf(i) === pf.change) && (!pf.search.trim() || (i.name + ' ' + i.id).toLowerCase().includes(pf.search.trim().toLowerCase()));
import {shared, notify, checkUpdates} from '../state.js';

const u = shared.updates;
const s = {available: null, running: null, log: new Map(), results: new Map(), queue: []};
// Failed results carry messages from the main process in the old language; drop them after a switch.
onLanguageChange(() => { s.results.clear(); });

onEvent(e => {
  if (e.channel !== 'updates') return;
  if (/[█▒]|^\d+%$|^[\d.]+\s*[KMG]?B\s*\/\s*[\d.]+/.test(e.line)) return;
  s.log.set(e.id, e.line);
  const el = document.querySelector(`[data-log="${CSS.escape(e.id)}"]`);
  if (el) el.textContent = e.line;
});

async function runUpdate(page, id) {
  s.running = id; s.results.delete(id); page.update();
  try {
    const r = await api('updates.update', {id});
    s.results.set(id, r);
    const row = u.data?.items.find(x => x.id === id);
    if (r.ok && r.opened) toast(r.message);
    else if (r.ok) { toast(t('updates.updated', {name: row?.name || id}), {type: 'success'}); u.data.items = u.data.items.filter(x => x.id !== id); }
    else toast(`${row?.name || id}: ${r.message}`, {type: 'error'});
  } catch (e) { s.results.set(id, {ok: false, message: e.message}); toast(e.message, {type: 'error'}); }
  finally { s.running = null; notify(); page.update(); }
}

export default definePage({
  id: 'updates', get title() { return t('page.updates'); }, icon: 'refresh',
  badge: () => u.data?.items.length ? {text: String(u.data.items.length), tone: 'accent'} : null,
  view() {
    const items = u.data?.items || [];
    const brewNote = isMac && s.available && s.brew === false ? html`<div class="callout blue" style="margin-bottom:12px">${ic('info', 18)}<div class="grow">${th('updates.brewNote')}</div><button class="btn btn-sm btn-secondary" data-action="brew">brew.sh</button></div>` : '';
    const head = html`<div class="page-head">
      <div class="titles"><h1>${t('page.updates')}</h1><p>${t(isMac ? 'updates.introMac' : 'updates.intro')}</p></div>
      <div class="actions">
        ${u.data ? html`<span class="faint" style="font-size:12.5px">${t('updates.checked', {ago: ago(u.data.checkedAt)})}</span>` : ''}
        ${u.data ? html`<button class="btn btn-secondary" data-action="check" ${u.phase === 'checking' || s.running ? 'disabled' : ''}>${ic('refresh', 16, u.phase === 'checking' ? 'spin' : '')} ${t('updates.checkNow')}</button>` : ''}
        ${items.length > 1 ? html`<button class="btn btn-primary" data-action="all" ${s.running ? 'disabled' : ''}>${ic('download', 16)} ${t('updates.updateAll')}</button>` : ''}
      </div></div>`;
    if (s.available === false) return html`${head}<div class="card">${empty({iconName: 'box', title: t('updates.noWinget'), text: t('updates.noWingetText'), action: html`<button class="btn btn-primary" data-action="store">${t('updates.openStore')}</button>`})}</div>`;
    if (u.phase === 'checking' && !u.data) return html`${head}<div class="card card-pad"><div class="row" style="gap:14px"><div class="tile"><span class="spinner"></span></div><div><div class="card-title">${t('updates.checking')}</div><div class="muted">${t(isMac ? 'updates.checkingTextMac' : 'updates.checkingText')}</div></div></div><div class="progress indeterminate" style="margin-top:16px"><div></div></div></div>`;
    if (!u.data) return html`${head}${brewNote}<div class="card">${empty({iconName: 'refresh', title: t('updates.emptyTitle'), text: t('updates.emptyText'), action: html`<button class="btn btn-primary btn-lg" data-action="check">${ic('search', 18)} ${t('updates.check')}</button>`})}</div>`;
    if (!items.length) return html`${head}<div class="card">${empty({iconName: 'check', title: t('updates.upToDate'), text: t(isMac ? 'updates.upToDateTextMac' : 'updates.upToDateText')})}</div>`;
    return html`${head}
      <div class="toolbar filterbar">
        ${searchBox(pf.search, t('updates.search'), 220)}
        ${chip('change', t('updates.changeChip'), CHANGES.map(o => ({value: o.value, label: o.label, count: items.filter(i => matchUpd(i, 'change') && changeOf(i) === o.value).length})).filter(o => o.count), pf.change)}
        ${pf.search || pf.change !== 'all' ? html`<span class="faint" style="font-size:12.5px">${t('updates.showing', {shown: items.filter(i => matchUpd(i)).length, total: items.length})}</span><button class="linkish" data-action="clearFilters">${t('filters.clear')}</button>` : ''}
      </div>
      <div class="card" style="margin-top:12px">
        <div class="card-head"><h3 class="grow">${t('updates.available', {count: items.length})}</h3><span class="faint" style="font-size:12.5px">${t('updates.mayAsk')}</span></div>
        <div class="list">${items.filter(i => matchUpd(i)).map(i => {
          const running = s.running === i.id;
          const res = s.results.get(i.id);
          return html`<div class="list-row">
            ${avatar(i.name, null, 36)}
            <div class="grow truncate"><div style="font-weight:500" class="truncate">${i.name}</div>
              ${running ? html`<div class="meta truncate" data-log="${i.id}">${s.log.get(i.id) || t('updates.starting')}</div>`
                : res && !res.ok ? html`<div class="meta truncate" style="color:var(--red-text)">${res.message}</div>`
                : html`<div class="meta mono truncate">${i.id}</div>`}</div>
            <span class="badge ${changeOf(i) === 'major' ? 'amber' : ''}" title="${CHANGES.find(c => c.value === changeOf(i)).hint || ''}">${CHANGES.find(c => c.value === changeOf(i)).label}</span>
            <span class="badge num">${i.installed}</span>${ic('chevronRight', 14, 'faint')}<span class="badge accent num">${i.available}</span>
            ${i.kind ? html`<span class="badge ${i.kind === 'macos' ? 'blue' : ''}">${KINDS[i.kind]?.()}</span>` : ''}
            <button class="btn btn-secondary btn-sm" style="min-width:86px" data-action="update" data-id="${i.id}" ${s.running || i.truncated ? 'disabled' : ''}>${running ? html`<span class="spinner"></span> ${t('updates.updating')}` : i.kind === 'macos' ? t('common.open') : t('updates.update')}</button>
          </div>`;
        })}</div>
      </div>`;
  },
  onMount() {
    this.listener = () => this.update();
    shared.listeners.add(this.listener);
    if (s.available === null) api('updates.available').then(r => { s.available = r.available; s.brew = r.brew; this.update(); });
    if (!u.data) api('updates.last').then(d => { if (d) { u.data = d; u.phase = 'checked'; this.update(); } });
  },
  onUnmount() { shared.listeners.delete(this.listener); },
  on: {
    ...filterHandlers(() => pf, DEFAULT_FILTERS),
    async check() { await checkUpdates(); },
    brew() { api('shell.openUrl', {url: 'https://brew.sh'}); },
    store() { api('shell.openUrl', {url: 'https://apps.microsoft.com/detail/9NBLGGH4NNS1'}); },
    async update(el) { await runUpdate(this, el.dataset.id); },
    async all() {
      const items = (u.data?.items || []).filter(i => !i.truncated && i.kind !== 'macos');
      const {ok} = await modal({title: t('updates.allTitle', {count: items.length}), icon: 'download', confirm: t('updates.updateAll'), body: t(isMac ? 'updates.allBodyMac' : 'updates.allBody')});
      if (!ok) return;
      for (const i of items) await runUpdate(this, i.id);
    }
  }
});
