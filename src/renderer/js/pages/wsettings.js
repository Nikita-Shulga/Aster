import {html, str, ic, api, app, modal, toast, isMac} from '../lib.js';
import {definePage} from '../page.js';
import {tweakRow, applyTweak, pendingBanner, restartExplorer} from '../tweaks-ui.js';

const GROUPS = isMac ? ['appearance', 'explorer', 'taskbar', 'input', 'screenshots'] : ['appearance', 'explorer', 'taskbar'];
const s = {displays: null, power: null, items: null, groupNames: null};
const TIMEOUTS = [[1, '1 minute'], [2, '2 minutes'], [3, '3 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [20, '20 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [0, 'Never']];

async function load(page) {
  const [d, p, t] = await Promise.all([api('display.list').catch(() => ({items: []})), api('power.get').catch(() => null), api('tweaks.list', {groups: GROUPS})]);
  s.displays = d.items; s.power = p; s.items = t.items; s.groupNames = t.groups;
  page.update();
}

const rates = d => [...new Set(d.modes.filter(m => m.w === d.width && m.h === d.height).map(m => m.f))].sort((a, b) => b - a);
const resolutions = d => [...new Map(d.modes.map(m => [`${m.w}x${m.h}`, m])).values()];
const maxRes = d => resolutions(d)[0];

function displayCard() {
  if (!s.displays?.length) return '';
  return html`<div class="card">
    <div class="card-head"><div class="tile blue" style="width:32px;height:32px">${ic('monitor', 16)}</div><div class="grow"><h3>Display</h3><div class="sub">Refresh rate is how many times per second the screen updates. Higher is smoother for scrolling, the mouse and games.</div></div></div>
    ${s.displays.map(d => {
      if (d.readOnly) return html`<div class="monitor"><div><div class="row" style="gap:8px"><span class="tw-title">${d.name}</span>${d.primary ? html`<span class="badge accent">Main display</span>` : ''}${d.retina ? html`<span class="badge">Retina</span>` : ''}</div>
        <div class="muted" style="margin-top:4px">${d.width ? html`Looks like <strong style="color:var(--text)">${d.width} × ${d.height}</strong>` : ''}${d.freq ? html` at <strong style="color:var(--text)">${d.freq} Hz</strong>` : ''}${d.pixels ? html` · ${d.pixels} pixels` : ''}</div>
        <p class="faint" style="margin-top:8px;font-size:12.5px">macOS doesn’t allow other apps to change resolution or refresh rate. On ProMotion and external high-refresh displays, choose the refresh rate in System Settings → Displays → Refresh rate.</p></div>
        <div><button class="btn btn-secondary btn-sm" data-action="openDisplays">${ic('external', 14)} Displays settings</button></div></div>`;
      const r = rates(d), top = r[0], best = maxRes(d);
      const notMaxRate = top && d.freq < top;
      const notNative = best && (best.w !== d.width || best.h !== d.height);
      return html`<div class="monitor">
        <div>
          <div class="row" style="gap:8px"><span class="tw-title">${d.name}</span>${d.primary ? html`<span class="badge accent">Main display</span>` : ''}</div>
          <div class="muted" style="margin-top:4px">Now: <strong style="color:var(--text)">${d.width} × ${d.height} at ${d.freq} Hz</strong></div>
          <div class="field-row"><label>Refresh rate</label><div class="segmented">${r.map(f => html`<button class="${f === d.freq ? 'on' : ''}" data-action="rate" data-dev="${d.device}" data-f="${f}">${f} Hz</button>`)}</div></div>
          <div class="field-row"><label>Resolution</label><select class="select" data-change="res" data-dev="${d.device}">${resolutions(d).map(m => html`<option value="${m.w}x${m.h}" ${m.w === d.width && m.h === d.height ? 'selected' : ''}>${m.w} × ${m.h}${m === best ? ' (native — recommended)' : ''}</option>`)}</select></div>
          ${notMaxRate ? html`<div class="callout amber" style="margin-top:14px">${ic('info', 16)}<div class="grow">Your monitor supports <strong>${top} Hz</strong>, but runs at ${d.freq} Hz. Switching makes motion noticeably smoother at no cost (slightly more power on laptops).</div><button class="btn btn-sm btn-secondary" data-action="rate" data-dev="${d.device}" data-f="${top}">Use ${top} Hz</button></div>` : ''}
          ${notNative ? html`<div class="callout amber" style="margin-top:10px">${ic('info', 16)}<div>This display looks sharpest at its native resolution, ${best.w} × ${best.h}. Lower resolutions look blurry; to make things bigger, use Settings → Display → Scale instead.</div></div>` : ''}
        </div>
      </div>`;
    })}
  </div>`;
}

function powerCard() {
  const p = s.power;
  if (!p) return '';
  const sel = (key, val) => html`<select class="select" data-change="powerTimeout" data-key="${key}">${TIMEOUTS.map(([m, l]) => html`<option value="${m}" ${Math.round((val || 0) / 60) === m ? 'selected' : ''}>${l}</option>`)}${!TIMEOUTS.some(([m]) => m === Math.round((val || 0) / 60)) ? html`<option selected>${Math.round(val / 60)} minutes</option>` : ''}</select>`;
  return html`<div class="card" style="margin-top:16px">
    <div class="card-head"><div class="tile" style="width:32px;height:32px">${ic('power', 16)}</div><div class="grow"><h3>Screen & sleep</h3><div class="sub">${p.battery ? 'Applies both when plugged in and on battery.' : `When the ${isMac ? 'Mac' : 'PC'} is idle.`}${isMac ? ' macOS asks for your password.' : ''}</div></div></div>
    <div class="setting"><div class="grow"><div class="t">Turn off the screen after</div><div class="d">Saves power and prevents screen burn-in on OLED monitors. Moving the mouse turns it back on instantly.</div></div>${sel('screen', p.screenAc)}</div>
    <div class="setting"><div class="grow"><div class="t">Put the ${isMac ? 'Mac' : 'PC'} to sleep after</div><div class="d">Sleep uses almost no power and resumes in seconds with your apps still open. Downloads and game updates pause while asleep.</div></div>${sel('sleep', p.sleepAc)}</div>
  </div>`;
}

function group(id) {
  const items = s.items.filter(t => t.group === id);
  if (!items.length) return '';
  const icons = {appearance: 'sun', explorer: 'folder', taskbar: 'grid', input: 'sliders', screenshots: 'monitor'};
  return html`<div class="card" style="margin-top:16px"><div class="card-head"><div class="tile" style="width:32px;height:32px">${ic(icons[id], 16)}</div><h3 class="grow">${s.groupNames[id]}</h3></div>${items.map(tweakRow)}</div>`;
}

// Like Windows itself: new display settings revert automatically unless confirmed.
function keepDialog(seconds = 15) {
  return new Promise(resolve => {
    const dlg = document.getElementById('modal');
    dlg.className = 'modal';
    let left = seconds;
    const paint = () => { dlg.innerHTML = str(html`<form method="dialog" class="modal-inner"><div class="modal-head"><div class="modal-icon">${ic('monitor', 20)}</div><h2>Keep these display settings?</h2></div><div class="modal-body"><p>If the screen looks wrong or went black, just wait — the previous settings come back automatically.</p><div class="countdown">${left}</div><p class="faint" style="text-align:center">seconds until revert</p></div><div class="modal-actions"><button class="btn btn-secondary" value="revert">Revert</button><button class="btn btn-primary" value="keep" autofocus>Keep changes</button></div></form>`); };
    paint();
    const timer = setInterval(() => { left--; if (left <= 0) { dlg.close('revert'); } else dlg.querySelector('.countdown').textContent = left; }, 1000);
    const done = () => { clearInterval(timer); dlg.removeEventListener('close', done); resolve(dlg.returnValue === 'keep'); };
    dlg.addEventListener('close', done);
    dlg.returnValue = 'revert';
    dlg.showModal();
  });
}

async function setMode(page, device, w, h, f) {
  const d = s.displays.find(x => x.device === device);
  const prev = {width: d.width, height: d.height, freq: d.freq};
  if (prev.width === w && prev.height === h && prev.freq === f) return;
  // If the resolution changes, keep the refresh rate when possible, otherwise use the best one for that resolution.
  if (!d.modes.some(m => m.w === w && m.h === h && m.f === f)) f = Math.max(...d.modes.filter(m => m.w === w && m.h === h).map(m => m.f));
  await api('display.set', {device, width: w, height: h, freq: f});
  if (await keepDialog()) { toast(`Display: ${w} × ${h} at ${f} Hz`, {type: 'success'}); }
  else { await api('display.set', {device, ...prev}); toast('Previous display settings restored'); }
  await load(page);
}

export default definePage({
  id: 'wsettings', title: isMac ? 'Mac settings' : 'Windows settings', icon: 'monitor',
  view() {
    const head = html`<div class="page-head"><div class="titles"><h1>${isMac ? 'Mac settings' : 'Windows settings'}</h1><p>The ${isMac ? 'macOS' : 'Windows'} settings people change most, in one place — each with a short explanation. Changes apply immediately and can be switched back here.</p></div></div>`;
    if (!s.items) return html`${head}<div class="card card-pad"><div class="skeleton" style="height:200px"></div></div>`;
    return html`${head}${pendingBanner()}${displayCard()}${powerCard()}${GROUPS.map(group)}`;
  },
  onMount() { load(this); },
  on: {
    restartExplorer() { return restartExplorer(this); },
    openDisplays() { api('tools.launch', {id: 'displays'}); },
    async rate(el) {
      const d = s.displays.find(x => x.device === el.dataset.dev);
      await setMode(this, d.device, d.width, d.height, +el.dataset.f);
    },
    async res(el) {
      const d = s.displays.find(x => x.device === el.dataset.dev);
      const [w, h] = el.value.split('x').map(Number);
      await setMode(this, d.device, w, h, d.freq);
    },
    async powerTimeout(el) {
      const min = Number(el.value);
      if (!Number.isFinite(min)) return;
      s.power = await api('power.set', {[el.dataset.key]: min});
      toast(`${el.dataset.key === 'screen' ? 'Screen turns off' : (isMac ? 'Mac sleeps' : 'PC sleeps')} after: ${min ? TIMEOUTS.find(t => t[0] === min)[1] : 'never'}`, {type: 'success'});
      this.update();
    },
    async tweak(el) {
      const t = s.items.find(x => x.id === el.dataset.id);
      el.checked = t.value;
      await applyTweak(t, !t.value); this.update();
    },
    async tweakChoice(el) {
      const t = s.items.find(x => x.id === el.dataset.id);
      const v = JSON.parse(el.dataset.value);
      if (v !== t.value) { await applyTweak(t, v); this.update(); }
    }
  }
});
