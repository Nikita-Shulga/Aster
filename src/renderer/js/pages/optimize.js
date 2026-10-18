import {html, ic, api, app, bytes, num, plural, modal, toast, ring, pct, avatar, isMac} from '../lib.js';
import {definePage} from '../page.js';
import {tweakRow, applyTweak, isApplied, pendingBanner, restartExplorer, valueLabel} from '../tweaks-ui.js';
import {shared, notify} from '../state.js';
import {chip, search as searchBox, filterHandlers} from '../filters.js';

const DEFAULT_FILTERS = {search: '', show: 'all', verdict: 'all', access: 'all', restart: 'all'};
const of = structuredClone(DEFAULT_FILTERS);
const SHOW = [{value: 'todo', label: 'Recommended, not applied', test: t => t.recommended !== null && t.value !== t.recommended}, {value: 'applied', label: 'Already applied', test: t => t.recommended !== null && t.value === t.recommended}, {value: 'changed', label: 'Changed from Windows default', test: t => t.type === 'toggle' && t.value === true}];
const VERDICT_OPTS = [{value: 'recommended', label: 'Recommended'}, {value: 'optional', label: 'Optional'}, {value: 'situational', label: isMac ? 'Depends on your Mac' : 'Depends on your PC'}, {value: 'preference', label: 'Personal preference'}];
function matchTweak(t, skip) {
  const q = of.search.trim().toLowerCase();
  return (skip === 'show' || of.show === 'all' || SHOW.find(x => x.value === of.show).test(t)) &&
    (skip === 'verdict' || of.verdict === 'all' || t.verdict === of.verdict) &&
    (skip === 'access' || of.access === 'all' || (of.access === 'admin') === !!t.admin) &&
    (skip === 'restart' || of.restart === 'all' || (of.restart === 'none' ? !t.restart : !!t.restart)) &&
    (!q || [t.title, t.what, t.pro, t.con].some(x => String(x || '').toLowerCase().includes(q)));
}

const GROUPS = ['performance', 'gaming', 'privacy'];
const s = {items: null, power: null, procs: null, busy: false};
shared.optimize = s;

// Known Windows power schemes, explained in plain language.
const PLANS = {
  '381b4222-f694-41f0-9685-ff5bb260df2e': {name: 'Balanced', what: 'Full speed when you need it, saves energy when idle. The best choice for almost everyone — modern CPUs boost instantly.'},
  '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c': {name: 'High performance', what: 'Keeps the processor ready at higher speeds. Slightly snappier on some PCs, but uses more power and runs warmer. For desktops and gaming.'},
  'a1841308-3541-4fab-bc81-f71556f20b4a': {name: 'Power saver', what: 'Limits performance to save energy and battery. Things will feel slower.'},
  'e9a42b02-d5df-448d-aa00-03f14749eb61': {name: 'Ultimate performance', what: 'Removes all power-saving delays. Meant for workstations; on normal PCs the gain over High performance is tiny.'}
};

export const pendingRecommended = () => (s.items || []).filter(t => t.recommended !== null && t.value !== null && t.value !== t.recommended && !(t.admin && !app.system?.admin));

async function load(page) {
  const [t, p] = await Promise.all([api('tweaks.list', {groups: GROUPS}), api('power.get').catch(() => null)]);
  s.items = t.items; s.groupNames = t.groups; s.power = p;
  notify(); page.update();
  loadProcs(page);
}
async function loadProcs(page) { try { s.procs = (await api('processes.list')).items; page.update(); } catch {} }

function summary() {
  const rec = s.items.filter(t => t.recommended !== null);
  const done = rec.filter(isApplied).length;
  const todo = pendingRecommended();
  return html`<div class="card hero" style="grid-template-columns:auto 1fr auto">
    ${ring(pct(done, rec.length), {size: 96, stroke: 8, label: `${done}/${rec.length}`, sub: 'applied', tone: todo.length ? 'accent' : 'green'})}
    <div><h2>${todo.length ? `${plural(todo.length, 'recommended optimization')} not applied yet` : 'All recommended optimizations are applied'}</h2>
      <p>Recommended changes are safe for everyone and reversible. Items marked “Depends on your ${isMac ? 'Mac' : 'PC'}” are only worth it in specific cases — read the trade-off first.</p></div>
    <div class="hero-actions">${todo.length ? html`<button class="btn btn-primary btn-lg" data-action="applyAll">${ic('zap', 18)} Apply ${todo.length} recommended</button>` : ''}</div>
  </div>`;
}

function powerCard() {
  const p = s.power;
  if (!p || !p.plans?.length) return '';
  const hasHigh = p.plans.some(x => PLANS[x.guid]?.name === 'High performance' || /high|высок/i.test(x.name));
  return html`<div class="card" style="margin-top:16px">
    <div class="card-head"><div class="tile blue" style="width:32px;height:32px">${ic('zap', 16)}</div><div class="grow"><h3>Power plan</h3><div class="sub">Controls how aggressively Windows trades speed for energy savings.</div></div>
      ${hasHigh ? '' : html`<button class="btn btn-secondary btn-sm" data-action="addHigh">${ic('plus', 14)} Add High performance</button>`}</div>
    <div class="plan-grid">${p.plans.map(x => {
      const known = PLANS[x.guid];
      return html`<button class="plan ${x.active ? 'on' : ''}" data-action="plan" data-guid="${x.guid}">
        <span class="radio"></span>
        <div><div style="font-weight:600">${known?.name || x.name}${known && known.name !== x.name ? html` <span class="faint" style="font-weight:400;font-size:12px">· ${x.name}</span>` : ''} ${known?.name === 'Balanced' ? html`<span class="badge green">Recommended</span>` : ''}</div>
          <div class="muted" style="font-size:12.5px;margin-top:3px">${known?.what || 'A custom power plan, created by you or your PC maker.'}</div></div>
      </button>`;
    })}</div>
  </div>`;
}

function group(id) {
  const items = s.items.filter(t => t.group === id && matchTweak(t));
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
    <div class="card-head"><div class="tile amber" style="width:32px;height:32px">${ic('memory', 16)}</div><div class="grow"><h3>Apps using the most memory</h3><div class="sub">${isMac ? 'Quitting apps you’re not using frees memory right away. macOS components can’t be quit here.' : 'Closing apps you are not using frees memory right away. Windows components can’t be closed here.'}</div></div>
      <button class="btn btn-ghost btn-sm" data-action="refreshProcs">${ic('refresh', 14)} Refresh</button></div>
    ${s.procs ? s.procs.map(p => html`<div class="proc-row">
      ${avatar(p.description || p.name, null, 32)}
      <div class="truncate"><div style="font-weight:500" class="truncate">${p.description || p.name}</div><div class="meta truncate">${[p.company, p.count > 1 ? `${p.count} processes` : `${p.name}.exe`].filter(Boolean).join(' · ')}</div></div>
      <div class="bar"><div class="bar-fill ${p.memory > 2 * 1024 ** 3 ? 'tone-amber' : ''}" style="width:${Math.min(100, pct(p.memory, total) * 3)}%"></div></div>
      <span class="num" style="font-weight:600;text-align:right">${bytes(p.memory)}</span>
      ${p.protected ? html`<span class="badge" title="Part of the system">${isMac ? 'macOS' : 'Windows'}</span>` : html`<button class="btn btn-secondary btn-sm" data-action="endProc" data-name="${p.name}">${isMac ? 'Quit' : 'Close'}</button>`}
    </div>`) : html`<div class="card-pad"><div class="skeleton" style="height:120px"></div></div>`}
  </div>`;
}

export default definePage({
  id: 'optimize', title: 'Optimize', icon: 'gauge',
  badge: () => { const n = pendingRecommended().length; return n ? {text: String(n), tone: 'accent'} : null; },
  view() {
    const head = html`<div class="page-head"><div class="titles"><h1>Optimize</h1><p>Make ${isMac ? 'your Mac' : 'Windows'} faster, quieter and more private. Every option explains what it does and what you give up, and can be switched back at any time.</p></div>
      <div class="actions"><button class="btn btn-secondary" data-action="reload">${ic('refresh', 16)} Refresh</button></div></div>`;
    if (!s.items) return html`${head}<div class="card card-pad"><div class="skeleton" style="height:160px"></div></div>`;
    const cnt = (skip, test) => s.items.filter(t => matchTweak(t, skip) && test(t)).length;
    const active = Object.entries(of).some(([k, v]) => v && v !== 'all');
    const bar = html`<div class="toolbar filterbar" style="margin-top:16px">
      ${searchBox(of.search, 'Search optimizations', 220)}
      ${chip('show', 'Show', SHOW.map(o => ({...o, count: cnt('show', o.test)})), of.show, {allLabel: 'Everything'})}
      ${chip('verdict', 'Recommendation', VERDICT_OPTS.map(o => ({...o, count: cnt('verdict', t => t.verdict === o.value)})), of.verdict)}
      ${chip('access', 'Rights', [{value: 'user', label: 'No admin needed'}, {value: 'admin', label: 'Needs administrator'}].map(o => ({...o, count: cnt('access', t => (o.value === 'admin') === !!t.admin)})), of.access)}
      ${chip('restart', 'Takes effect', [{value: 'none', label: 'Immediately'}, {value: 'restart', label: 'After a restart'}].map(o => ({...o, count: cnt('restart', t => (o.value === 'none') === !t.restart)})), of.restart, {allLabel: 'Any'})}
      ${active ? html`<span class="faint" style="font-size:12.5px">Showing ${s.items.filter(t => matchTweak(t)).length} of ${s.items.length}</span><button class="linkish" data-action="clearFilters">Clear filters</button>` : ''}
    </div>`;
    return html`${head}${pendingBanner()}${summary()}${active ? '' : powerCard()}${bar}${GROUPS.map(group)}${active ? '' : memoryCard()}`;
  },
  onMount() { if (!s.items) load(this).catch(e => { s.items = []; throw e; }); else loadProcs(this); },
  on: {
    reload() { return load(this); },
    ...filterHandlers(() => of, DEFAULT_FILTERS),
    restartExplorer() { return restartExplorer(this); },
    async tweak(el) {
      const t = s.items.find(x => x.id === el.dataset.id);
      el.checked = t.value;
      if (await applyTweak(t, !t.value) !== null) { notify(); }
      this.update();
    },
    async tweakChoice(el) {
      const t = s.items.find(x => x.id === el.dataset.id);
      const v = JSON.parse(el.dataset.value);
      if (v === t.value) return;
      await applyTweak(t, v); notify(); this.update();
    },
    async applyAll() {
      const todo = pendingRecommended();
      const {ok} = await modal({title: `Apply ${plural(todo.length, 'optimization')}?`, icon: 'zap', confirm: 'Apply all', wide: true, body: html`
        <p>Each of these is reversible from this page:</p>
        <div class="modal-list">${todo.map(t => html`<div class="list-row" style="align-items:flex-start;padding:10px 12px">${ic('check', 16, 'tone-text-green')}<div class="grow"><div style="font-weight:600;color:var(--text)">${t.title} <span class="faint" style="font-weight:400">→ ${valueLabel(t, t.recommended)}</span></div><div class="muted">${t.pro || t.what}</div>${t.con ? html`<div class="faint" style="font-size:12px">Trade-off: ${t.con}</div>` : ''}</div></div>`)}</div>`});
      if (!ok) return;
      let n = 0;
      for (const t of todo) { try { await applyTweak(t, t.recommended, {quiet: true}); n++; } catch (e) { toast(`${t.title}: ${e.message}`, {type: 'error'}); } }
      toast(`Applied ${plural(n, 'optimization')}`, {type: 'success'});
      notify(); this.update();
    },
    async plan(el) {
      const guid = el.dataset.guid;
      if (s.power.plans.find(p => p.guid === guid)?.active) return;
      const known = PLANS[guid];
      const {ok} = await modal({title: `Switch to ${known?.name || 'this plan'}?`, icon: 'zap', confirm: 'Switch plan', body: html`<p>${known?.what || 'Windows will use this custom power plan.'}</p><p class="faint" style="margin-top:8px">You can switch back anytime.</p>`});
      if (!ok) return;
      s.power = await api('power.set', {guid});
      toast(`Power plan: ${known?.name || 'changed'}`, {type: 'success'}); this.update();
    },
    async addHigh() {
      const {ok} = await modal({title: 'Add the High performance plan?', icon: 'zap', confirm: 'Add and switch', body: 'Many laptops hide this Windows plan. Aster adds a copy and switches to it. It keeps the processor at higher speeds — more responsive, but more power use and heat. You can switch back to Balanced here at any time.'});
      if (!ok) return;
      s.power = await api('power.addHigh'); toast('High performance plan active', {type: 'success'}); this.update();
    },
    refreshProcs() { s.procs = null; this.update(); return loadProcs(this); },
    async endProc(el) {
      const p = s.procs.find(x => x.name === el.dataset.name);
      const browser = /chrome|msedge|firefox|opera|brave|vivaldi|browser/i.test(p.name);
      const {ok} = await modal({title: `Close ${p.description || p.name}?`, icon: 'x', danger: true, confirm: 'Close app', body: html`
        <p>This frees about <strong>${bytes(p.memory)}</strong> of memory${p.count > 1 ? ` by closing all ${p.count} of its processes` : ''}.</p>
        <div class="callout amber" style="margin-top:10px">${ic('alert', 16)}<div>Unsaved work in this app will be lost.${browser ? ' Most browsers offer to restore your tabs on the next start.' : ''} Save first if needed.</div></div>`});
      if (!ok) return;
      await api('processes.end', {name: p.name});
      toast(`${p.description || p.name} closed`, {type: 'success'});
      setTimeout(() => loadProcs(this), 1200);
    }
  }
});
