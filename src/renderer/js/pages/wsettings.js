import {html, str, ic, api, app, modal, toast, isMac, t, th} from '../lib.js';
import {definePage} from '../page.js';
import {onLanguageChange} from '../i18n.js';
import {tweakRow, applyTweak, pendingBanner, restartExplorer} from '../tweaks-ui.js';

const GROUPS = isMac ? ['appearance', 'explorer', 'taskbar', 'input', 'screenshots'] : ['appearance', 'explorer', 'taskbar'];
const s = {displays: null, power: null, items: null, groupNames: null};
// Screen and sleep timeouts in minutes (0 = never).
const TIMEOUTS = [1, 2, 3, 5, 10, 15, 20, 30, 60, 120, 0];
const timeoutLabel = m => !m ? t('wsettings.never') : m % 60 === 0 ? t('wsettings.hours', {count: m / 60}) : t('wsettings.minutes', {count: m});

// Tweak titles, explanations and group names come from the main process in the interface language: drop them so they are fetched again.
onLanguageChange(() => { s.items = null; s.groupNames = null; });

async function load(page) {
  const [d, p, tw] = await Promise.all([api('display.list').catch(() => ({items: []})), api('power.get').catch(() => null), api('tweaks.list', {groups: GROUPS})]);
  s.displays = d.items; s.power = p; s.items = tw.items; s.groupNames = tw.groups;
  page.update();
}

const rates = d => [...new Set(d.modes.filter(m => m.w === d.width && m.h === d.height).map(m => m.f))].sort((a, b) => b - a);
const resolutions = d => [...new Map(d.modes.map(m => [`${m.w}x${m.h}`, m])).values()];
const maxRes = d => resolutions(d)[0];
// Width and height are passed as text so they are never written with thousands separators ("2560 × 1440").
const res = (w, h) => ({w: String(w), h: String(h)});

function displayCard() {
  if (!s.displays?.length) return '';
  return html`<div class="card">
    <div class="card-head"><div class="tile blue" style="width:32px;height:32px">${ic('monitor', 16)}</div><div class="grow"><h3>${t('wsettings.display')}</h3><div class="sub">${t('wsettings.displayText')}</div></div></div>
    ${s.displays.map(d => {
      if (d.readOnly) return html`<div class="monitor"><div><div class="row" style="gap:8px"><span class="tw-title">${d.name}</span>${d.primary ? html`<span class="badge accent">${t('wsettings.mainDisplay')}</span>` : ''}${d.retina ? html`<span class="badge">Retina</span>` : ''}</div>
        <div class="muted" style="margin-top:4px">${d.width ? th('wsettings.looksLike', res(d.width, d.height)) : ''}${d.freq ? html` ${th('wsettings.atFreq', {freq: d.freq})}` : ''}${d.pixels ? html` · ${t('wsettings.pixels', {pixels: d.pixels})}` : ''}</div>
        <p class="faint" style="margin-top:8px;font-size:12.5px">${t('wsettings.macReadOnly')}</p></div>
        <div><button class="btn btn-secondary btn-sm" data-action="openDisplays">${ic('external', 14)} ${t('wsettings.openDisplays')}</button></div></div>`;
      const r = rates(d), top = r[0], best = maxRes(d);
      const notMaxRate = top && d.freq < top;
      const notNative = best && (best.w !== d.width || best.h !== d.height);
      return html`<div class="monitor">
        <div>
          <div class="row" style="gap:8px"><span class="tw-title">${d.name}</span>${d.primary ? html`<span class="badge accent">${t('wsettings.mainDisplay')}</span>` : ''}</div>
          <div class="muted" style="margin-top:4px">${th('wsettings.now', {...res(d.width, d.height), freq: d.freq})}</div>
          <div class="field-row"><label>${t('wsettings.refreshRate')}</label><div class="segmented">${r.map(f => html`<button class="${f === d.freq ? 'on' : ''}" data-action="rate" data-dev="${d.device}" data-f="${f}">${t('wsettings.hz', {freq: f})}</button>`)}</div></div>
          <div class="field-row"><label>${t('wsettings.resolution')}</label><select class="select" data-change="res" data-dev="${d.device}">${resolutions(d).map(m => html`<option value="${m.w}x${m.h}" ${m.w === d.width && m.h === d.height ? 'selected' : ''}>${m.w} × ${m.h}${m === best ? ` ${t('wsettings.native')}` : ''}</option>`)}</select></div>
          ${notMaxRate ? html`<div class="callout amber" style="margin-top:14px">${ic('info', 16)}<div class="grow">${th('wsettings.higherRate', {top, freq: d.freq})}</div><button class="btn btn-sm btn-secondary" data-action="rate" data-dev="${d.device}" data-f="${top}">${t('wsettings.useRate', {freq: top})}</button></div>` : ''}
          ${notNative ? html`<div class="callout amber" style="margin-top:10px">${ic('info', 16)}<div>${t('wsettings.notNative', res(best.w, best.h))}</div></div>` : ''}
        </div>
      </div>`;
    })}
  </div>`;
}

function powerCard() {
  const p = s.power;
  if (!p) return '';
  const sel = (key, val) => html`<select class="select" data-change="powerTimeout" data-key="${key}">${TIMEOUTS.map(m => html`<option value="${m}" ${Math.round((val || 0) / 60) === m ? 'selected' : ''}>${timeoutLabel(m)}</option>`)}${!TIMEOUTS.some(m => m === Math.round((val || 0) / 60)) ? html`<option selected>${t('wsettings.minutes', {count: Math.round(val / 60)})}</option>` : ''}</select>`;
  return html`<div class="card" style="margin-top:16px">
    <div class="card-head"><div class="tile" style="width:32px;height:32px">${ic('power', 16)}</div><div class="grow"><h3>${t(isMac ? 'wsettings.screenSleepMac' : 'wsettings.screenSleep')}</h3><div class="sub">${p.battery ? t('wsettings.bothSources') : t(isMac ? 'wsettings.idleMac' : 'wsettings.idle')}${isMac ? ` ${t('wsettings.askPassword')}` : ''}</div></div></div>
    <div class="setting"><div class="grow"><div class="t">${t('wsettings.screenOff')}</div><div class="d">${t('wsettings.screenOffText')}</div></div>${sel('screen', p.screenAc)}</div>
    <div class="setting"><div class="grow"><div class="t">${t(isMac ? 'wsettings.sleepMac' : 'wsettings.sleep')}</div><div class="d">${t(isMac ? 'wsettings.sleepTextMac' : 'wsettings.sleepText')}</div></div>${sel('sleep', p.sleepAc)}</div>
  </div>`;
}

function group(id) {
  const items = s.items.filter(x => x.group === id);
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
    const paint = () => { dlg.innerHTML = str(html`<form method="dialog" class="modal-inner"><div class="modal-head"><div class="modal-icon">${ic('monitor', 20)}</div><h2>${t('wsettings.keep.title')}</h2></div><div class="modal-body"><p>${t('wsettings.keep.text')}</p><div class="countdown">${left}</div><p class="faint" style="text-align:center">${t('wsettings.keep.seconds', {count: left})}</p></div><div class="modal-actions"><button class="btn btn-secondary" value="revert">${t('wsettings.keep.revert')}</button><button class="btn btn-primary" value="keep" autofocus>${t('wsettings.keep.keep')}</button></div></form>`); };
    paint();
    const timer = setInterval(() => {
      left--;
      if (left <= 0) { dlg.close('revert'); return; }
      const n = dlg.querySelector('.countdown');
      n.textContent = left;
      n.nextElementSibling.textContent = t('wsettings.keep.seconds', {count: left});
    }, 1000);
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
  if (await keepDialog()) { toast(t('wsettings.displayChanged', {...res(w, h), freq: f}), {type: 'success'}); }
  else { await api('display.set', {device, ...prev}); toast(t('wsettings.displayRestored')); }
  await load(page);
}

// Toast after a timeout change: what now happens and when.
function timeoutToast(key, min) {
  const what = key === 'screen' ? 'screen' : isMac ? 'sleepMac' : 'sleep';
  return min ? t(`wsettings.set.${what}`, {time: timeoutLabel(min)}) : t(`wsettings.set.${what}Never`);
}

export default definePage({
  id: 'wsettings', get title() { return t(isMac ? 'page.macSettings' : 'page.windowsSettings'); }, icon: 'monitor',
  view() {
    const head = html`<div class="page-head"><div class="titles"><h1>${t(isMac ? 'page.macSettings' : 'page.windowsSettings')}</h1><p>${t(isMac ? 'wsettings.introMac' : 'wsettings.intro')}</p></div></div>`;
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
      toast(timeoutToast(el.dataset.key, min), {type: 'success'});
      this.update();
    },
    async tweak(el) {
      const tw = s.items.find(x => x.id === el.dataset.id);
      el.checked = tw.value;
      await applyTweak(tw, !tw.value); this.update();
    },
    async tweakChoice(el) {
      const tw = s.items.find(x => x.id === el.dataset.id);
      const v = JSON.parse(el.dataset.value);
      if (v !== tw.value) { await applyTweak(tw, v); this.update(); }
    }
  }
});
