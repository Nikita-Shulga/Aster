import {html, ic, api, app, bytes, modal, toast, ring, pct, avatar, isMac, t, th} from '../lib.js';
import {definePage} from '../page.js';
import {onLanguageChange} from '../i18n.js';
import {tweakRow, applyTweak, isApplied, pendingBanner, restartExplorer, valueLabel, VERDICT} from '../tweaks-ui.js';
import {shared, notify} from '../state.js';
import {chip, search as searchBox, filterHandlers} from '../filters.js';

const DEFAULT_FILTERS = {search: '', show: 'all', verdict: 'all', access: 'all', restart: 'all'};
const of = structuredClone(DEFAULT_FILTERS);
// Labels are getters so they follow the interface language.
const SHOW = [
  {value: 'todo', get label() { return t('optimize.show.todo'); }, test: x => x.recommended !== null && x.value !== x.recommended},
  {value: 'applied', get label() { return t('optimize.show.applied'); }, test: x => x.recommended !== null && x.value === x.recommended},
  {value: 'changed', get label() { return t('optimize.show.changed'); }, test: x => x.type === 'toggle' && x.value === true}
];
const VERDICT_OPTS = ['recommended', 'optional', 'situational', 'preference'].map(value => ({value, get label() { return VERDICT[value].label; }}));
function matchTweak(tw, skip) {
  const q = of.search.trim().toLowerCase();
  return (skip === 'show' || of.show === 'all' || SHOW.find(x => x.value === of.show).test(tw)) &&
    (skip === 'verdict' || of.verdict === 'all' || tw.verdict === of.verdict) &&
    (skip === 'access' || of.access === 'all' || (of.access === 'admin') === !!tw.admin) &&
    (skip === 'restart' || of.restart === 'all' || (of.restart === 'none' ? !tw.restart : !!tw.restart)) &&
    (!q || [tw.title, tw.what, tw.pro, tw.con].some(x => String(x || '').toLowerCase().includes(q)));
}

const GROUPS = ['performance', 'gaming', 'privacy'];
const s = {items: null, power: null, procs: null, busy: false};
shared.optimize = s;

// Tweak titles, explanations and group names come from the main process in the interface language. Drop them so the
// page loads them again when it is mounted again, and fetch them right away for the counts on Overview and in the sidebar.
onLanguageChange(() => {
  if (!s.items) return;
  s.items = null; s.groupNames = null;
  api('tweaks.list', {groups: GROUPS}).then(r => { if (!s.items) { s.items = r.items; s.groupNames = r.groups; } notify(); }).catch(() => {});
});

// Known Windows power schemes, explained in plain language.
const plan = id => ({id, get name() { return t(`optimize.plan.${id}`); }, get what() { return t(`optimize.plan.${id}.what`); }});
const PLANS = {
  '381b4222-f694-41f0-9685-ff5bb260df2e': plan('balanced'),
  '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c': plan('high'),
  'a1841308-3541-4fab-bc81-f71556f20b4a': plan('saver'),
  'e9a42b02-d5df-448d-aa00-03f14749eb61': plan('ultimate')
};

export const pendingRecommended = () => (s.items || []).filter(x => x.recommended !== null && x.value !== null && x.value !== x.recommended && !(x.admin && !app.system?.admin));

async function load(page) {
  const [tw, p] = await Promise.all([api('tweaks.list', {groups: GROUPS}), api('power.get').catch(() => null)]);
  s.items = tw.items; s.groupNames = tw.groups; s.power = p;
  notify(); page.update();
  loadProcs(page);
}
async function loadProcs(page) { try { s.procs = (await api('processes.list')).items; page.update(); } catch {} }

function summary() {
  const rec = s.items.filter(x => x.recommended !== null);
  const done = rec.filter(isApplied).length;
  const todo = pendingRecommended();
  return html`<div class="card hero" style="grid-template-columns:auto 1fr auto">
    ${ring(pct(done, rec.length), {size: 96, stroke: 8, label: `${done}/${rec.length}`, sub: t('optimize.applied'), tone: todo.length ? 'accent' : 'green'})}
    <div><h2>${todo.length ? t('optimize.notApplied', {count: todo.length}) : t('optimize.allApplied')}</h2>
      <p>${t(isMac ? 'optimize.summaryMac' : 'optimize.summary')}</p></div>
    <div class="hero-actions">${todo.length ? html`<button class="btn btn-primary btn-lg" data-action="applyAll">${ic('zap', 18)} ${t('optimize.applyRecommended', {count: todo.length})}</button>` : ''}</div>
  </div>`;
}

function powerCard() {
  const p = s.power;
  if (!p || !p.plans?.length) return '';
  const hasHigh = p.plans.some(x => PLANS[x.guid]?.id === 'high' || /high|высок/i.test(x.name));
  return html`<div class="card" style="margin-top:16px">
    <div class="card-head"><div class="tile blue" style="width:32px;height:32px">${ic('zap', 16)}</div><div class="grow"><h3>${t('optimize.power')}</h3><div class="sub">${t('optimize.powerText')}</div></div>
      ${hasHigh ? '' : html`<button class="btn btn-secondary btn-sm" data-action="addHigh">${ic('plus', 14)} ${t('optimize.addHigh')}</button>`}</div>
    <div class="plan-grid">${p.plans.map(x => {
      const known = PLANS[x.guid];
      return html`<button class="plan ${x.active ? 'on' : ''}" data-action="plan" data-guid="${x.guid}">
        <span class="radio"></span>
        <div><div style="font-weight:600">${known?.name || x.name}${known && known.name !== x.name ? html` <span class="faint" style="font-weight:400;font-size:12px">· ${x.name}</span>` : ''} ${known?.id === 'balanced' ? html`<span class="badge green">${t('tweaks.verdict.recommended')}</span>` : ''}</div>
          <div class="muted" style="font-size:12.5px;margin-top:3px">${known?.what || t('optimize.plan.custom')}</div></div>
      </button>`;
    })}</div>
  </div>`;
}

function group(id) {
  const items = s.items.filter(x => x.group === id && matchTweak(x));
  if (!items.length) return '';
  const icons = {performance: 'gauge', gaming: 'zap', privacy: 'lock'};
  return html`<div class="card" style="margin-top:16px">
    <div class="card-head"><div class="tile" style="width:32px;height:32px">${ic(icons[id], 16)}</div><h3 class="grow">${s.groupNames[id]}</h3></div>
    ${items.map(tweakRow)}
  </div>`;
}

function memoryCard() {
  const total = app.system?.memory?.total || 0;
  return html`<div class="card" style="margin-top:16px">
    <div class="card-head"><div class="tile amber" style="width:32px;height:32px">${ic('memory', 16)}</div><div class="grow"><h3>${t('optimize.memory')}</h3><div class="sub">${t(isMac ? 'optimize.memoryTextMac' : 'optimize.memoryText')}</div></div>
      <button class="btn btn-ghost btn-sm" data-action="refreshProcs">${ic('refresh', 14)} ${t('optimize.refresh')}</button></div>
    ${s.procs ? s.procs.map(p => html`<div class="proc-row">
      ${avatar(p.description || p.name, null, 32)}
      <div class="truncate"><div style="font-weight:500" class="truncate">${p.description || p.name}</div><div class="meta truncate">${[p.company, p.count > 1 ? t('optimize.processes', {count: p.count}) : `${p.name}.exe`].filter(Boolean).join(' · ')}</div></div>
      <div class="bar"><div class="bar-fill ${p.memory > 2 * 1024 ** 3 ? 'tone-amber' : ''}" style="width:${Math.min(100, pct(p.memory, total) * 3)}%"></div></div>
      <span class="num" style="font-weight:600;text-align:right">${bytes(p.memory)}</span>
      ${p.protected ? html`<span class="badge" title="${t('optimize.systemPart')}">${isMac ? 'macOS' : 'Windows'}</span>` : html`<button class="btn btn-secondary btn-sm" data-action="endProc" data-name="${p.name}">${t(isMac ? 'optimize.quit' : 'common.close')}</button>`}
    </div>`) : html`<div class="card-pad"><div class="skeleton" style="height:120px"></div></div>`}
  </div>`;
}

export default definePage({
  id: 'optimize', get title() { return t('page.optimize'); }, icon: 'gauge',
  badge: () => { const n = pendingRecommended().length; return n ? {text: String(n), tone: 'accent'} : null; },
  view() {
    const head = html`<div class="page-head"><div class="titles"><h1>${t('page.optimize')}</h1><p>${t(isMac ? 'optimize.introMac' : 'optimize.intro')}</p></div>
      <div class="actions"><button class="btn btn-secondary" data-action="reload">${ic('refresh', 16)} ${t('optimize.refresh')}</button></div></div>`;
    if (!s.items) return html`${head}<div class="card card-pad"><div class="skeleton" style="height:160px"></div></div>`;
    const cnt = (skip, test) => s.items.filter(x => matchTweak(x, skip) && test(x)).length;
    const active = Object.entries(of).some(([k, v]) => v && v !== 'all');
    const access = [{value: 'user', label: t('optimize.access.user')}, {value: 'admin', label: t('optimize.access.admin')}];
    const restart = [{value: 'none', label: t('optimize.when.now')}, {value: 'restart', label: t('optimize.when.restart')}];
    const bar = html`<div class="toolbar filterbar" style="margin-top:16px">
      ${searchBox(of.search, t('optimize.search'), 220)}
      ${chip('show', t('optimize.show'), SHOW.map(o => ({...o, count: cnt('show', o.test)})), of.show, {allLabel: t('optimize.show.all')})}
      ${chip('verdict', t('optimize.verdict'), VERDICT_OPTS.map(o => ({...o, count: cnt('verdict', x => x.verdict === o.value)})), of.verdict)}
      ${chip('access', t('optimize.access'), access.map(o => ({...o, count: cnt('access', x => (o.value === 'admin') === !!x.admin)})), of.access)}
      ${chip('restart', t('optimize.when'), restart.map(o => ({...o, count: cnt('restart', x => (o.value === 'none') === !x.restart)})), of.restart, {allLabel: t('optimize.when.any')})}
      ${active ? html`<span class="faint" style="font-size:12.5px">${t('optimize.showing', {shown: s.items.filter(x => matchTweak(x)).length, total: s.items.length})}</span><button class="linkish" data-action="clearFilters">${t('filters.clear')}</button>` : ''}
    </div>`;
    return html`${head}${pendingBanner()}${summary()}${active ? '' : powerCard()}${bar}${GROUPS.map(group)}${active ? '' : memoryCard()}`;
  },
  onMount() { if (!s.items) load(this).catch(e => { s.items = []; throw e; }); else loadProcs(this); },
  on: {
    reload() { return load(this); },
    ...filterHandlers(() => of, DEFAULT_FILTERS),
    restartExplorer() { return restartExplorer(this); },
    async tweak(el) {
      const tw = s.items.find(x => x.id === el.dataset.id);
      el.checked = tw.value;
      if (await applyTweak(tw, !tw.value) !== null) { notify(); }
      this.update();
    },
    async tweakChoice(el) {
      const tw = s.items.find(x => x.id === el.dataset.id);
      const v = JSON.parse(el.dataset.value);
      if (v === tw.value) return;
      await applyTweak(tw, v); notify(); this.update();
    },
    async applyAll() {
      const todo = pendingRecommended();
      const {ok} = await modal({title: t('optimize.applyAllTitle', {count: todo.length}), icon: 'zap', confirm: t('optimize.applyAll'), wide: true, body: html`
        <p>${t('optimize.applyAllText')}</p>
        <div class="modal-list">${todo.map(tw => html`<div class="list-row" style="align-items:flex-start;padding:10px 12px">${ic('check', 16, 'tone-text-green')}<div class="grow"><div style="font-weight:600;color:var(--text)">${tw.title} <span class="faint" style="font-weight:400">→ ${valueLabel(tw, tw.recommended)}</span></div><div class="muted">${tw.pro || tw.what}</div>${tw.con ? html`<div class="faint" style="font-size:12px">${t('optimize.tradeoff', {con: tw.con})}</div>` : ''}</div></div>`)}</div>`});
      if (!ok) return;
      let n = 0;
      for (const tw of todo) { try { await applyTweak(tw, tw.recommended, {quiet: true}); n++; } catch (e) { toast(`${tw.title}: ${e.message}`, {type: 'error'}); } }
      toast(t('optimize.appliedToast', {count: n}), {type: 'success'});
      notify(); this.update();
    },
    async plan(el) {
      const guid = el.dataset.guid;
      if (s.power.plans.find(p => p.guid === guid)?.active) return;
      const known = PLANS[guid];
      const {ok} = await modal({title: known ? t('optimize.plan.switchTo', {name: known.name}) : t('optimize.plan.switchToThis'), icon: 'zap', confirm: t('optimize.plan.switch'), body: html`<p>${known?.what || t('optimize.plan.customText')}</p><p class="faint" style="margin-top:8px">${t('optimize.plan.switchBack')}</p>`});
      if (!ok) return;
      s.power = await api('power.set', {guid});
      toast(known ? t('optimize.plan.toast', {name: known.name}) : t('optimize.plan.toastChanged'), {type: 'success'}); this.update();
    },
    async addHigh() {
      const {ok} = await modal({title: t('optimize.addHighTitle'), icon: 'zap', confirm: t('optimize.addHighConfirm'), body: t('optimize.addHighBody')});
      if (!ok) return;
      s.power = await api('power.addHigh'); toast(t('optimize.addHighDone'), {type: 'success'}); this.update();
    },
    refreshProcs() { s.procs = null; this.update(); return loadProcs(this); },
    async endProc(el) {
      const p = s.procs.find(x => x.name === el.dataset.name);
      const browser = /chrome|msedge|firefox|opera|brave|vivaldi|browser/i.test(p.name);
      const name = p.description || p.name;
      const {ok} = await modal({title: t('optimize.end.title', {name}), icon: 'x', danger: true, confirm: t('optimize.end.confirm'), body: html`
        <p>${p.count > 1 ? th('optimize.end.freesAll', {size: bytes(p.memory), count: p.count}) : th('optimize.end.frees', {size: bytes(p.memory)})}</p>
        <div class="callout amber" style="margin-top:10px">${ic('alert', 16)}<div>${t(browser ? 'optimize.end.warnBrowser' : 'optimize.end.warn')}</div></div>`});
      if (!ok) return;
      await api('processes.end', {name: p.name});
      toast(t('optimize.end.closed', {name}), {type: 'success'});
      setTimeout(() => loadProcs(this), 1200);
    }
  }
});
