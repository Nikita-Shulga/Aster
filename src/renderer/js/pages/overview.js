import {html, str, ic, api, app, isMac, bytes, num, duration, ring, bar, pct, modal, toast, ago, fail, t, th} from '../lib.js';
import {definePage} from '../page.js';
import {shared, notify, analyzeCleaner, scanRegistry, checkUpdates, loadRules, cleanableBytes, fixableCount, persistCleaner} from '../state.js';
import {pendingRecommended} from './optimize.js';

const s = {phase: 'idle', steps: {}, fixed: null, live: null, activity: null, stats: null, health: null, healthError: false};
// Smart Scan steps; labels are looked up when drawn so they follow the interface language.
const STEPS = ['junk', 'registry', 'speed', 'startup', 'updates'];
const STEP_LABEL = {junk: 'overview.step.junk', registry: isMac ? 'overview.step.leftovers' : 'overview.step.registry', speed: 'overview.step.speed', startup: 'overview.step.startup', updates: 'overview.step.updates'};

function greeting() {
  const h = new Date().getHours();
  const hello = t(h < 5 ? 'overview.greeting.night' : h < 12 ? 'overview.greeting.morning' : h < 18 ? 'overview.greeting.afternoon' : 'overview.greeting.evening');
  return app.system?.user ? t('overview.greeting.named', {greeting: hello, name: `${app.system.user.charAt(0).toUpperCase()}${app.system.user.slice(1)}`}) : hello;
}

const junkBytes = cleanableBytes;
const regCount = fixableCount;
const startupCount = () => shared.startup.items ? shared.startup.items.filter(i => (isMac ? (i.type === 'login' || (i.type === 'agent' && i.scope === 'user')) : (i.type === 'registry' || i.type === 'folder')) && i.enabled).length : null;
const speedCount = () => shared.optimize?.items ? pendingRecommended().length : null;
const updateCount = () => shared.updates.data ? shared.updates.data.items.length : null;

async function smartScan(page) {
  s.phase = 'scanning'; s.fixed = null;
  s.steps = Object.fromEntries(STEPS.map(k => [k, 'running']));
  page.update();
  const step = (k, p) => p.then(() => { s.steps[k] = 'done'; }, e => { s.steps[k] = 'error'; console.warn(k, e); }).finally(() => page.update());
  await loadRules();
  await Promise.all([
    step('junk', analyzeCleaner()),
    step('registry', scanRegistry()),
    step('speed', api('tweaks.list', {groups: ['performance', 'gaming', 'privacy']}).then(r => { shared.optimize.items = r.items; shared.optimize.groupNames = r.groups; notify(); })),
    step('startup', api('startup.list').then(r => { shared.startup.items = r.items; notify(); })),
    step('updates', checkUpdates())
  ]);
  s.phase = 'scanned'; page.update();
}

async function fixAll(page) {
  const junk = junkBytes() || 0, reg = regCount() || 0;
  const careful = (shared.cleaner.analysis?.results || []).filter(r => r.bytes > 0).map(r => shared.cleaner.rules.find(x => x.id === r.id)).filter(r => r && r.verdict !== 'safe');
  const {ok} = await modal({title: t('overview.fix.title'), icon: 'sparkles', confirm: t('overview.fixAll'), wide: careful.length > 0, body: html`<ul style="margin:0">
    ${junk ? html`<li>${th('overview.fix.junk', {size: bytes(junk)})}</li>` : ''}
    ${reg ? html`<li>${th(isMac ? 'overview.fix.leftovers' : 'overview.fix.registry', {count: reg})}</li>` : ''}
  </ul>
  ${careful.length ? html`<div class="callout amber" style="margin-top:12px;display:block"><strong>${t('overview.fix.careful')}</strong>${careful.map(r => html`<div style="margin-top:6px"><strong>${r.app} · ${r.name}:</strong> ${r.ifDeleted}</div>`)}<div style="margin-top:8px">${t('overview.fix.carefulKeep')}</div></div>` : ''}
  <p style="margin-top:10px">${t('overview.fix.notChanged')}</p>`});
  if (!ok) return;
  s.phase = 'fixing'; page.update();
  let freed = 0, fixedCount = 0;
  try {
    if (junk) {
      const c = shared.cleaner;
      const ids = c.analysis.results.filter(r => r.bytes > 0).map(r => r.id);
      c.phase = 'cleaning'; notify();
      try { const r = await api('cleaner.clean', {ids, closeApps: !!app.settings?.closeAppsBeforeCleaning}); freed = r.freed; c.lastClean = null; c.analysis = null; persistCleaner(); }
      finally { c.phase = 'idle'; }
    }
    if (reg) {
      const r = shared.registry;
      const ids = r.scan.items.filter(i => r.checked.has(i.id)).map(i => i.id);
      const res = await api('registry.fix', {ids});
      fixedCount = res.fixed.length;
      const done = new Set(res.fixed);
      r.scan.items = r.scan.items.filter(i => !done.has(i.id));
    }
    s.fixed = {freed, fixedCount};
    toast(fixedCount ? t('overview.fix.doneFixed', {size: bytes(freed), count: fixedCount}) : t('overview.fix.done', {size: bytes(freed)}), {type: 'success'});
  } catch (e) { fail(e); }
  s.phase = 'scanned'; notify(); loadActivity(page);
}

async function loadActivity(page) {
  try { [s.activity, s.stats] = await Promise.all([api('activity.list'), api('activity.stats')]); page.update(); } catch {}
}

function hero() {
  const scanning = s.phase === 'scanning', fixing = s.phase === 'fixing';
  const junk = junkBytes(), reg = regCount();
  const found = (junk || 0) > 0 || (reg || 0) > 0;
  let title, text, actions;
  if (scanning) { title = t(isMac ? 'overview.hero.scanningMac' : 'overview.hero.scanningPc'); text = t(isMac ? 'overview.hero.scanningTextMac' : 'overview.hero.scanningTextPc'); actions = html`<button class="btn btn-primary btn-lg" disabled><span class="spinner"></span> ${t('overview.hero.scanningButton')}</button>`; }
  else if (fixing) { title = t('overview.hero.fixing'); text = t(isMac ? 'overview.hero.fixingTextMac' : 'overview.hero.fixingTextPc'); actions = html`<button class="btn btn-primary btn-lg" disabled><span class="spinner"></span> ${t('overview.hero.working')}</button>`; }
  else if (s.fixed) { title = t('overview.hero.done', {size: bytes(s.fixed.freed)}); text = s.fixed.fixedCount ? t(isMac ? 'overview.hero.doneLeftovers' : 'overview.hero.doneRegistry', {count: s.fixed.fixedCount}) : t('overview.hero.doneText'); actions = html`<button class="btn btn-secondary btn-lg" data-action="scan">${ic('refresh', 18)} ${t('overview.scanAgain')}</button>`; }
  else if (s.phase === 'scanned' && found) {
    title = !reg ? t('overview.hero.foundJunk', {size: bytes(junk)})
      : junk ? t(isMac ? 'overview.hero.foundJunkLeftovers' : 'overview.hero.foundJunkRegistry', {size: bytes(junk), count: reg})
      : t(isMac ? 'overview.hero.foundLeftovers' : 'overview.hero.foundRegistry', {count: reg});
    text = t(isMac ? 'overview.hero.foundTextMac' : 'overview.hero.foundTextPc');
    actions = html`<button class="btn btn-primary btn-lg" data-action="fix">${ic('sparkles', 18)} ${t('overview.fixAll')}</button><button class="btn btn-ghost" data-action="scan">${t('overview.scanAgain')}</button>`;
  }
  else if (s.phase === 'scanned') { title = t(isMac ? 'overview.hero.cleanMac' : 'overview.hero.cleanPc'); text = t(isMac ? 'overview.hero.cleanTextMac' : 'overview.hero.cleanTextPc'); actions = html`<button class="btn btn-secondary btn-lg" data-action="scan">${ic('refresh', 18)} ${t('overview.scanAgain')}</button>`; }
  else { title = greeting(); text = t(isMac ? 'overview.hero.idleTextMac' : 'overview.hero.idleTextPc'); actions = html`<button class="btn btn-primary btn-lg" data-action="scan">${ic('zap', 18)} ${t('overview.hero.run')}</button>`; }
  const done = Object.values(s.steps).filter(v => v === 'done' || v === 'error').length;
  return html`<div class="card hero">
    ${ring(scanning ? done / STEPS.length * 100 : s.phase === 'idle' ? 0 : 100, {size: 112, stroke: 9, label: scanning ? `${done}/${STEPS.length}` : s.phase === 'idle' ? '—' : s.fixed || !found ? '✓' : '!', sub: t(scanning ? 'overview.ring.checks' : s.phase === 'idle' ? 'overview.ring.notScanned' : s.fixed || !found ? 'overview.ring.clean' : 'overview.ring.review'), tone: s.fixed || (s.phase === 'scanned' && !found) ? 'green' : found ? 'amber' : 'accent'})}
    <div>
      <h2>${title}</h2><p>${text}</p>
      ${s.phase !== 'idle' ? html`<div class="scan-steps">${STEPS.map(k => html`<span class="scan-step ${s.steps[k] || ''}">${s.steps[k] === 'running' ? html`<span class="spinner" style="width:12px;height:12px"></span>` : s.steps[k] === 'error' ? ic('alert', 14) : ic('check', 14)} ${t(STEP_LABEL[k])}</span>`)}</div>` : ''}
    </div>
    <div class="hero-actions">${actions}</div>
  </div>`;
}

function resultCard({page, icon: i, tone, value, label, foot}) {
  return html`<div class="card result-card" data-action="go" data-page="${page}" role="button" tabindex="0">
    <div class="row"><div class="tile ${tone}">${ic(i, 18)}</div><span class="spacer"></span>${ic('chevronRight', 16, 'faint')}</div>
    <div><div class="value num">${value}</div><div class="label">${label}</div></div>
    <div class="foot">${foot}</div>
  </div>`;
}

function systemCard() {
  const sys = app.system;
  if (!sys) return html`<div class="card card-pad"><div class="skeleton" style="height:180px"></div></div>`;
  return html`<div class="card">
    <div class="card-head"><h3 class="grow">${t(isMac ? 'overview.sys.thisMac' : 'overview.sys.thisPc')}</h3><span class="sub truncate" style="max-width:180px">${sys.hostname}</span></div>
    <div style="padding:4px 20px 8px">
      <div class="spec"><span class="k">${t('overview.sys.system')}</span><span class="v truncate">${sys.os}</span></div>
      <div class="spec"><span class="k">${t('overview.sys.version')}</span><span class="v truncate">${sys.osVersion}</span></div>
      ${sys.model ? html`<div class="spec"><span class="k">${t('overview.sys.device')}</span><span class="v truncate">${sys.model}</span></div>` : ''}
      <div class="spec"><span class="k">${t('overview.sys.processor')}</span><span class="v truncate" title="${sys.cpu}">${sys.cpu}</span></div>
      ${sys.gpu?.length ? html`<div class="spec"><span class="k">${t('overview.sys.graphics')}</span><span class="v truncate" title="${sys.gpu.join(', ')}">${sys.gpu[0]}</span></div>` : ''}
      <div class="spec"><span class="k">${t('overview.sys.memory')}</span><span class="v">${bytes(sys.memory.total, 0)}</span></div>
      ${sys.battery?.health ? html`<div class="spec"><span class="k">${t('overview.sys.battery')}</span><span class="v truncate" title="${t('overview.sys.batteryHint')}">${t('overview.sys.batteryHealth', {health: sys.battery.health})}${sys.battery.cycles != null ? ` · ${t('overview.sys.batteryCycles', {count: sys.battery.cycles})}` : ''}</span></div>` : ''}
      <div class="spec"><span class="k">${t('overview.sys.uptime')}</span><span class="v">${duration((s.live || sys).uptime)}</span></div>
    </div>
  </div>`;
}

function liveCard() {
  const sys = app.system;
  const l = s.live || sys;
  if (!l) return html`<div class="card card-pad"><div class="skeleton" style="height:180px"></div></div>`;
  const memUsed = pct(l.memory.total - l.memory.free, l.memory.total);
  const tone = v => v > 90 ? 'red' : v > 75 ? 'amber' : 'accent';
  return html`<div class="card">
    <div class="card-head"><h3 class="grow">${t('overview.live.title')}</h3><span class="dot green"></span></div>
    <div class="card-pad row" style="justify-content:space-around;gap:16px;padding:22px 16px">
      <div class="stack" style="align-items:center;gap:10px">${ring(l.cpuLoad, {size: 104, stroke: 9, label: `${l.cpuLoad}%`, sub: t('overview.live.cpu'), tone: tone(l.cpuLoad)})}<span class="faint" style="font-size:12px">${sys ? t('overview.live.threads', {count: sys.cores}) : ''}</span></div>
      <div class="stack" style="align-items:center;gap:10px">${ring(memUsed, {size: 104, stroke: 9, label: `${Math.round(memUsed)}%`, sub: t('overview.live.memory'), tone: tone(memUsed)})}<span class="faint" style="font-size:12px">${t('overview.live.used', {size: bytes(l.memory.total - l.memory.free)})}</span></div>
    </div>
  </div>`;
}

function storageCard() {
  const drives = app.system?.drives;
  if (!drives) return html`<div class="card card-pad"><div class="skeleton" style="height:180px"></div></div>`;
  return html`<div class="card">
    <div class="card-head"><h3 class="grow">${t('overview.storage.title')}</h3><button class="btn btn-ghost btn-sm" data-action="go" data-page="disk">${t('overview.storage.analyze')}</button></div>
    <div style="padding:2px 20px 8px">${drives.map(d => {
      const used = pct(d.total - d.free, d.total);
      return html`<div class="drive"><div class="top">${ic('drive', 16, 'faint')}<span class="name">${d.name}</span><span class="faint truncate" style="font-size:12.5px">${d.label || t(d.type === 'Removable' ? 'overview.storage.removable' : 'overview.storage.local')}</span><span class="free num">${t('overview.storage.free', {free: bytes(d.free), total: bytes(d.total, 0)})}</span></div>${bar(used, used > 90 ? 'red' : used > 75 ? 'amber' : 'accent')}</div>`;
    })}</div>
  </div>`;
}

// Drive health (S.M.A.R.T.): what the disks report about themselves, with what to do when one is not well.
const HEALTH = {good: {tone: 'green', icon: 'check'}, warning: {tone: 'amber', icon: 'alert'}, failing: {tone: 'red', icon: 'alert'}, unknown: {tone: '', icon: 'info'}};
async function loadHealth(page) {
  try { s.health = await api('health.disks'); s.healthError = false; } catch { s.healthError = true; }
  if (page.mounted) page.update();
}
function healthCard() {
  const h = s.health;
  const head = html`<div class="card-head"><h3 class="grow">${t('overview.health.title')}</h3>${h ? html`<button class="btn btn-ghost btn-sm" data-action="healthInfo">${t('overview.health.what')}</button>` : ''}</div>`;
  if (s.healthError) return html`<div class="card">${head}<div class="card-pad muted" style="font-size:13px">${t('overview.health.unavailable')}</div></div>`;
  if (!h) return html`<div class="card">${head}<div class="card-pad"><div class="skeleton" style="height:120px"></div></div></div>`;
  const bad = h.disks.filter(d => d.verdict === 'warning' || d.verdict === 'failing');
  return html`<div class="card">${head}
    ${bad.length ? html`<div class="callout ${bad.some(d => d.verdict === 'failing') ? 'amber' : 'amber'}" style="margin:12px 20px 0">${ic('alert', 16)}<div class="grow">${t('overview.health.backup', {count: bad.length})}</div></div>` : ''}
    <div class="list">${h.disks.map(d => {
      const v = HEALTH[d.verdict] || HEALTH.unknown;
      const facts = [d.wear != null ? t('overview.health.wear', {pct: d.wear}) : '', d.temperature != null ? t('overview.health.temp', {c: d.temperature}) : '', d.hours != null ? t('overview.health.hours', {count: d.hours}) : ''].filter(Boolean);
      return html`<div class="list-row" style="padding:10px 20px;min-height:0;align-items:flex-start">
        <span class="tile ${v.tone}" style="width:30px;height:30px;border-radius:8px">${ic('drive', 15)}</span>
        <div class="grow" style="min-width:0"><div class="truncate" style="font-weight:500">${d.name}</div>
          <div class="meta">${[t(`overview.health.kind.${d.kind}`), bytes(d.size, 0), d.letters.join(' ')].filter(Boolean).join(' · ')}${facts.length ? ' · ' + facts.join(' · ') : ''}</div></div>
        <span class="badge ${v.tone}" title="${d.health || ''}">${ic(v.icon, 12)} ${t(`overview.health.${d.verdict}`)}</span>
      </div>`;
    })}</div>
    ${!isMac && !h.details && !h.admin ? html`<div class="card-pad faint" style="font-size:12px;padding-top:4px">${t('overview.health.adminHint')}</div>` : ''}
  </div>`;
}

function activityCard() {
  const items = (s.activity || []).slice(0, 5);
  return html`<div class="card">
    <div class="card-head"><h3 class="grow">${t('overview.activity.title')}</h3>${s.stats?.cleaned ? html`<span class="badge green">${t('overview.activity.freed', {size: bytes(s.stats.cleaned)})}</span>` : ''}<button class="btn btn-ghost btn-sm" data-action="go" data-page="history">${t('overview.activity.viewAll')}</button></div>
    ${items.length ? html`<div class="list">${items.map(a => html`<div class="list-row" style="padding:10px 20px;min-height:0"><span class="dot accent"></span><span class="grow truncate">${a.title}</span>${a.bytes ? html`<span class="faint num" style="font-size:12.5px">${bytes(a.bytes)}</span>` : ''}<span class="faint" style="font-size:12px;white-space:nowrap">${ago(a.at)}</span></div>`)}</div>`
      : html`<div class="card-pad muted" style="font-size:13px">${t('overview.activity.empty')}</div>`}
  </div>`;
}

export default definePage({
  id: 'overview', get title() { return t('page.overview'); }, icon: 'home',
  view() {
    const junk = junkBytes(), reg = regCount(), start = startupCount(), upd = updateCount(), speed = speedCount();
    const pending = v => v == null;
    return html`
      ${hero()}
      <div class="grid grid-4" style="margin-top:16px">
        ${resultCard({page: 'cleaner', icon: 'sparkles', tone: 'green', value: pending(junk) ? '—' : bytes(junk), label: t('overview.step.junk'), foot: t(pending(junk) ? 'overview.card.notScanned' : junk ? 'overview.card.readyToClean' : 'overview.card.nothingToClean')})}
        ${resultCard({page: 'registry', icon: 'layers', tone: 'amber', value: pending(reg) ? '—' : num(reg), label: t(isMac ? 'overview.step.leftovers' : 'overview.card.registryIssues'), foot: t(pending(reg) ? 'overview.card.notScanned' : reg ? (isMac ? 'overview.card.toTrash' : 'overview.card.backedUp') : 'overview.card.noProblems')})}
        ${resultCard({page: 'optimize', icon: 'gauge', tone: 'blue', value: pending(speed) ? '—' : num(speed), label: t('overview.card.optimizations'), foot: t(pending(speed) ? 'overview.card.notChecked' : speed ? 'overview.card.recommended' : 'overview.card.allApplied')})}
        ${resultCard({page: 'startup', icon: 'power', tone: 'gray', value: pending(start) ? '—' : num(start), label: t('overview.card.startupApps'), foot: t(pending(start) ? 'overview.card.notScanned' : start > 6 ? 'overview.card.trim' : 'overview.card.lean')})}
        ${resultCard({page: 'updates', icon: 'refresh', tone: '', value: pending(upd) ? '—' : num(upd), label: t('overview.card.appUpdates'), foot: t(pending(upd) ? (shared.updates.phase === 'error' ? (isMac ? 'overview.card.updatesUnavailableMac' : 'overview.card.wingetUnavailable') : 'overview.card.notChecked') : upd ? 'overview.card.updatesAvailable' : 'overview.card.upToDate')})}
      </div>
      <div class="grid grid-3" style="margin-top:16px">${systemCard()}${storageCard()}${liveCard()}</div>
      <div class="grid grid-2" style="margin-top:16px">${healthCard()}${activityCard()}</div>`;
  },
  onMount() {
    this.listener = () => this.update();
    shared.listeners.add(this.listener);
    app.listeners.add(this.listener);
    loadActivity(this);
    if (!s.health) loadHealth(this);
    const tick = async () => {
      try { s.live = await api('system.live'); } catch { return; }
      if (!this.mounted) return;
      // Patch only the live card to keep hover states and scroll stable.
      const card = this.el.querySelector('.grid-3 > .card:last-child');
      if (card && !document.querySelector('dialog[open]')) { const tmp = document.createElement('div'); tmp.innerHTML = str(liveCard()); card.replaceWith(tmp.firstElementChild); }
    };
    this.timer = setInterval(tick, 2000); tick();
  },
  onUnmount() { shared.listeners.delete(this.listener); app.listeners.delete(this.listener); clearInterval(this.timer); },
  on: {
    async scan() { await smartScan(this); },
    async fix() { await fixAll(this); },
    go(el) { window.asterNavigate(el.dataset.page); },
    healthInfo() { modal({title: t('overview.health.title'), icon: 'drive', cancel: null, confirm: t('cleaner.gotIt'), body: th(isMac ? 'overview.health.explainMac' : 'overview.health.explain')}); }
  }
});
