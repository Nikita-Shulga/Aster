import {html, str, ic, api, app, isMac, bytes, num, plural, duration, ring, bar, pct, modal, toast, ago, fail} from '../lib.js';
import {definePage} from '../page.js';
import {shared, notify, analyzeCleaner, scanRegistry, checkUpdates, loadRules, cleanableBytes, fixableCount, persistCleaner} from '../state.js';
import {pendingRecommended} from './optimize.js';

const s = {phase: 'idle', steps: {}, fixed: null, live: null, activity: null, stats: null};
const STEPS = [['junk', 'Junk files'], ['registry', isMac ? 'Leftovers' : 'Registry'], ['speed', 'Speed'], ['startup', 'Startup'], ['updates', 'Updates']];

function greeting() {
  const h = new Date().getHours();
  const name = app.system?.user ? `, ${app.system.user.charAt(0).toUpperCase()}${app.system.user.slice(1)}` : '';
  return `${h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${name}`;
}

const junkBytes = cleanableBytes;
const regCount = fixableCount;
const startupCount = () => shared.startup.items ? shared.startup.items.filter(i => (isMac ? (i.type === 'login' || (i.type === 'agent' && i.scope === 'user')) : (i.type === 'registry' || i.type === 'folder')) && i.enabled).length : null;
const speedCount = () => shared.optimize?.items ? pendingRecommended().length : null;
const updateCount = () => shared.updates.data ? shared.updates.data.items.length : null;

async function smartScan(page) {
  s.phase = 'scanning'; s.fixed = null;
  s.steps = Object.fromEntries(STEPS.map(([k]) => [k, 'running']));
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
  const {ok} = await modal({title: 'Clean up now?', icon: 'sparkles', confirm: 'Fix everything', wide: careful.length > 0, body: html`<ul style="margin:0">
    ${junk ? html`<li>Delete <strong>${bytes(junk)}</strong> of junk files — caches and temporary files that rebuild automatically</li>` : ''}
    ${reg ? html`<li>${isMac ? html`Move <strong>${plural(reg, 'leftover item')}</strong> of removed apps to the Trash` : html`Fix <strong>${plural(reg, 'registry issue')}</strong> in safe categories (backed up first)`}</li>` : ''}
  </ul>
  ${careful.length ? html`<div class="callout amber" style="margin-top:12px;display:block"><strong>Also included — you will notice these:</strong>${careful.map(r => html`<div style="margin-top:6px"><strong>${r.app} · ${r.name}:</strong> ${r.ifDeleted}</div>`)}<div style="margin-top:8px">To keep them, untick them in Cleaner first.</div></div>` : ''}
  <p style="margin-top:10px">Optimizations, startup apps and updates are not changed — review them on their own pages.</p>`});
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
    toast(`Done — freed ${bytes(freed)}${fixedCount ? `, fixed ${plural(fixedCount, 'issue')}` : ''}`, {type: 'success'});
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
  if (scanning) { title = `Scanning your ${isMac ? 'Mac' : 'PC'}…`; text = `Looking for junk, ${isMac ? 'leftovers of removed apps' : 'broken registry entries'}, startup clutter and outdated software.`; actions = html`<button class="btn btn-primary btn-lg" disabled><span class="spinner"></span> Scanning</button>`; }
  else if (fixing) { title = 'Cleaning up…'; text = isMac ? 'Removing junk files and leftovers. Hang tight.' : 'Removing junk files and fixing registry issues. Hang tight.'; actions = html`<button class="btn btn-primary btn-lg" disabled><span class="spinner"></span> Working</button>`; }
  else if (s.fixed) { title = `All done. ${bytes(s.fixed.freed)} freed.`; text = s.fixed.fixedCount ? `${plural(s.fixed.fixedCount, isMac ? 'leftover item' : 'registry issue')} ${isMac ? 'moved to the Trash' : 'fixed and backed up'}. Check startup apps and updates below for more.` : 'Check startup apps and updates below for more improvements.'; actions = html`<button class="btn btn-secondary btn-lg" data-action="scan">${ic('refresh', 18)} Scan again</button>`; }
  else if (s.phase === 'scanned' && found) { title = `Found ${junk ? bytes(junk) + ' of junk' : ''}${junk && reg ? ' and ' : ''}${reg ? plural(reg, isMac ? 'leftover item' : 'registry issue') : ''}`; text = isMac ? 'Review each area below, or clean everything safely in one click. Leftovers go to the Trash.' : 'Review each area below, or clean everything safely in one click. Registry fixes are backed up.'; actions = html`<button class="btn btn-primary btn-lg" data-action="fix">${ic('sparkles', 18)} Fix everything</button><button class="btn btn-ghost" data-action="scan">Scan again</button>`; }
  else if (s.phase === 'scanned') { title = `Your ${isMac ? 'Mac' : 'PC'} looks clean`; text = `No junk or ${isMac ? 'leftovers' : 'registry problems'} found. Have a look at startup apps and updates.`; actions = html`<button class="btn btn-secondary btn-lg" data-action="scan">${ic('refresh', 18)} Scan again</button>`; }
  else { title = greeting(); text = `Run a Smart Scan to check junk files, ${isMac ? 'leftovers of removed apps' : 'the registry'}, startup apps and software updates in one go. Nothing changes until you approve it.`; actions = html`<button class="btn btn-primary btn-lg" data-action="scan">${ic('zap', 18)} Run Smart Scan</button>`; }
  const done = Object.values(s.steps).filter(v => v === 'done' || v === 'error').length;
  return html`<div class="card hero">
    ${ring(scanning ? done / STEPS.length * 100 : s.phase === 'idle' ? 0 : 100, {size: 112, stroke: 9, label: scanning ? `${done}/${STEPS.length}` : s.phase === 'idle' ? '—' : s.fixed || !found ? '✓' : '!', sub: scanning ? 'checks' : s.phase === 'idle' ? 'not scanned' : s.fixed || !found ? 'clean' : 'to review', tone: s.fixed || (s.phase === 'scanned' && !found) ? 'green' : found ? 'amber' : 'accent'})}
    <div>
      <h2>${title}</h2><p>${text}</p>
      ${s.phase !== 'idle' ? html`<div class="scan-steps">${STEPS.map(([k, l]) => html`<span class="scan-step ${s.steps[k] || ''}">${s.steps[k] === 'running' ? html`<span class="spinner" style="width:12px;height:12px"></span>` : s.steps[k] === 'error' ? ic('alert', 14) : ic('check', 14)} ${l}</span>`)}</div>` : ''}
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
    <div class="card-head"><h3 class="grow">This ${isMac ? 'Mac' : 'PC'}</h3><span class="sub truncate" style="max-width:180px">${sys.hostname}</span></div>
    <div style="padding:4px 20px 8px">
      <div class="spec"><span class="k">System</span><span class="v truncate">${sys.os}</span></div>
      <div class="spec"><span class="k">Version</span><span class="v truncate">${sys.osVersion}</span></div>
      ${sys.model ? html`<div class="spec"><span class="k">Device</span><span class="v truncate">${sys.model}</span></div>` : ''}
      <div class="spec"><span class="k">Processor</span><span class="v truncate" title="${sys.cpu}">${sys.cpu}</span></div>
      ${sys.gpu?.length ? html`<div class="spec"><span class="k">Graphics</span><span class="v truncate" title="${sys.gpu.join(', ')}">${sys.gpu[0]}</span></div>` : ''}
      <div class="spec"><span class="k">Memory</span><span class="v">${bytes(sys.memory.total, 0)}</span></div>
      ${sys.battery?.health ? html`<div class="spec"><span class="k">Battery</span><span class="v truncate" title="Maximum capacity compared with when it was new">${sys.battery.health}% health${sys.battery.cycles != null ? ` · ${num(sys.battery.cycles)} cycles` : ''}</span></div>` : ''}
      <div class="spec"><span class="k">Uptime</span><span class="v">${duration((s.live || sys).uptime)}</span></div>
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
    <div class="card-head"><h3 class="grow">Live usage</h3><span class="dot green"></span></div>
    <div class="card-pad row" style="justify-content:space-around;gap:16px;padding:22px 16px">
      <div class="stack" style="align-items:center;gap:10px">${ring(l.cpuLoad, {size: 104, stroke: 9, label: `${l.cpuLoad}%`, sub: 'CPU', tone: tone(l.cpuLoad)})}<span class="faint" style="font-size:12px">${sys ? `${sys.cores} threads` : ''}</span></div>
      <div class="stack" style="align-items:center;gap:10px">${ring(memUsed, {size: 104, stroke: 9, label: `${Math.round(memUsed)}%`, sub: 'Memory', tone: tone(memUsed)})}<span class="faint" style="font-size:12px">${bytes(l.memory.total - l.memory.free)} used</span></div>
    </div>
  </div>`;
}

function storageCard() {
  const drives = app.system?.drives;
  if (!drives) return html`<div class="card card-pad"><div class="skeleton" style="height:180px"></div></div>`;
  return html`<div class="card">
    <div class="card-head"><h3 class="grow">Storage</h3><button class="btn btn-ghost btn-sm" data-action="go" data-page="disk">Analyze</button></div>
    <div style="padding:2px 20px 8px">${drives.map(d => {
      const used = pct(d.total - d.free, d.total);
      return html`<div class="drive"><div class="top">${ic('drive', 16, 'faint')}<span class="name">${d.name}</span><span class="faint truncate" style="font-size:12.5px">${d.label || (d.type === 'Removable' ? 'Removable' : 'Local Disk')}</span><span class="free num">${bytes(d.free)} free of ${bytes(d.total, 0)}</span></div>${bar(used, used > 90 ? 'red' : used > 75 ? 'amber' : 'accent')}</div>`;
    })}</div>
  </div>`;
}

function activityCard() {
  const items = (s.activity || []).slice(0, 5);
  return html`<div class="card">
    <div class="card-head"><h3 class="grow">Recent activity</h3>${s.stats?.cleaned ? html`<span class="badge green">${bytes(s.stats.cleaned)} freed so far</span>` : ''}<button class="btn btn-ghost btn-sm" data-action="go" data-page="history">View all</button></div>
    ${items.length ? html`<div class="list">${items.map(a => html`<div class="list-row" style="padding:10px 20px;min-height:0"><span class="dot accent"></span><span class="grow truncate">${a.title}</span>${a.bytes ? html`<span class="faint num" style="font-size:12.5px">${bytes(a.bytes)}</span>` : ''}<span class="faint" style="font-size:12px;white-space:nowrap">${ago(a.at)}</span></div>`)}</div>`
      : html`<div class="card-pad muted" style="font-size:13px">Nothing yet. Your cleanups and fixes will show up here.</div>`}
  </div>`;
}

export default definePage({
  id: 'overview', title: 'Overview', icon: 'home',
  view() {
    const junk = junkBytes(), reg = regCount(), start = startupCount(), upd = updateCount(), speed = speedCount();
    const pending = v => v == null;
    return html`
      ${hero()}
      <div class="grid grid-4" style="margin-top:16px">
        ${resultCard({page: 'cleaner', icon: 'sparkles', tone: 'green', value: pending(junk) ? '—' : bytes(junk), label: 'Junk files', foot: pending(junk) ? 'Not scanned yet' : junk ? 'Ready to clean' : 'Nothing to clean'})}
        ${resultCard({page: 'registry', icon: 'layers', tone: 'amber', value: pending(reg) ? '—' : num(reg), label: isMac ? 'Leftovers' : 'Registry issues', foot: pending(reg) ? 'Not scanned yet' : reg ? (isMac ? 'Moved to the Trash when cleaned' : 'Backed up before fixing') : 'No problems found'})}
        ${resultCard({page: 'optimize', icon: 'gauge', tone: 'blue', value: pending(speed) ? '—' : num(speed), label: 'Optimizations', foot: pending(speed) ? 'Not checked yet' : speed ? 'Recommended, not applied' : 'All applied'})}
        ${resultCard({page: 'startup', icon: 'power', tone: 'gray', value: pending(start) ? '—' : num(start), label: 'Startup apps', foot: pending(start) ? 'Not scanned yet' : start > 6 ? 'Consider trimming' : 'Looks lean'})}
        ${resultCard({page: 'updates', icon: 'refresh', tone: '', value: pending(upd) ? '—' : num(upd), label: 'App updates', foot: pending(upd) ? (shared.updates.phase === 'error' ? 'WinGet unavailable' : 'Not checked yet') : upd ? 'Updates available' : 'All up to date'})}
      </div>
      <div class="grid grid-3" style="margin-top:16px">${systemCard()}${storageCard()}${liveCard()}</div>
      <div style="margin-top:16px">${activityCard()}</div>`;
  },
  onMount() {
    this.listener = () => this.update();
    shared.listeners.add(this.listener);
    app.listeners.add(this.listener);
    loadActivity(this);
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
    go(el) { window.asterNavigate(el.dataset.page); }
  }
});
