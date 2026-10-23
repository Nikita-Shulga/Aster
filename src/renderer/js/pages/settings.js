import {html, ic, api, app, setApp, toast, isMac, bytes, bar, pct, date, ago, onEvent, t, th} from '../lib.js';
import {definePage} from '../page.js';
import {LANGUAGES, setLanguage} from '../i18n.js';
import {shared, loadRules} from '../state.js';

// Automatic cleaning (a scheduled task / launch agent that runs Aster without a window).
const sched = {info: null, busy: false};
// How many selected Cleaner items the automatic run would clean: Safe ones the user ticked (or the defaults).
function autoItems() {
  const rules = shared.cleaner.rules || [];
  const saved = app.settings?.cleanerSelection;
  const chosen = new Set(Array.isArray(saved) ? saved : rules.filter(r => r.defaultOn).map(r => r.id));
  return rules.filter(r => chosen.has(r.id) && r.installed && r.verdict === 'safe' && !r.admin && !r.fda).length;
}
function autoCard() {
  const a = sched.info;
  if (!a) return html`<div class="card" style="margin-top:16px"><div class="card-head"><h3>${t('settings.auto.title')}</h3></div><div class="card-pad"><div class="skeleton" style="height:60px"></div></div></div>`;
  const count = autoItems();
  return html`<div class="card" style="margin-top:16px">
    <div class="card-head"><h3>${t('settings.auto.title')}</h3></div>
    <div class="setting"><div class="tile ${a.enabled ? 'green' : ''}">${ic('broom', 18)}</div><div class="grow"><div class="t">${t('settings.auto.enable')}</div>
      <div class="d">${t('settings.auto.text', {count})} ${a.last ? t('settings.auto.last', {when: ago(a.last.at), size: bytes(a.last.bytes)}) : ''}</div></div>
      <input type="checkbox" class="switch" data-change="autoEnable" ${a.enabled ? 'checked' : ''} ${sched.busy ? 'disabled' : ''} aria-label="${t('settings.auto.enable')}"></div>
    ${a.enabled ? html`
      <div class="setting"><div class="grow"><div class="t">${t('settings.auto.when')}</div><div class="d">${t(a.frequency === 'daily' ? 'settings.auto.dailyText' : 'settings.auto.weeklyText')}</div></div>
        <div class="segmented">${['daily', 'weekly'].map(v => html`<button class="${a.frequency === v ? 'on' : ''}" data-action="autoFreq" data-v="${v}" ${sched.busy ? 'disabled' : ''}>${t(`settings.auto.${v}`)}</button>`)}</div></div>
      <div class="setting"><div class="grow"><div class="t">${t('settings.auto.notify')}</div><div class="d">${t('settings.auto.notifyText')}</div></div>
        <input type="checkbox" class="switch" data-change="autoNotify" ${a.notify ? 'checked' : ''} ${sched.busy ? 'disabled' : ''}></div>` : ''}
  </div>`;
}
async function setSchedule(patch) {
  sched.busy = true; page?.update();
  try { sched.info = await api('schedule.set', {...sched.info, ...patch}); toast(t(sched.info.enabled ? 'settings.auto.saved' : 'settings.auto.off'), {type: 'success', timeout: 2500}); }
  finally { sched.busy = false; page?.update(); }
}

// Aster's own updates (GitHub releases). Kept outside the page so a download survives navigation.
const up = {state: 'idle', info: null, error: null, done: 0, total: 0, message: ''};
let page = null;
const refresh = () => page?.update();
onEvent(e => {
  if (e.channel !== 'appUpdate') return;
  up.done = e.done; up.total = e.total;
  const el = document.querySelector('[data-update-progress]');
  if (el) { el.querySelector('.bar-fill').style.width = `${pct(e.done, e.total).toFixed(1)}%`; el.querySelector('[data-update-bytes]').textContent = t('settings.update.progress', {done: bytes(e.done), total: bytes(e.total)}); }
});

// First lines of the release notes' "What's new" section (or the whole notes) as plain text, without Markdown marks.
function notesPreview(md) {
  const text = String(md || '');
  const m = /^#+\s*What['’]s new\s*$/im.exec(text);
  const body = m ? text.slice(m.index + m[0].length).split(/^#{1,2}\s/m)[0] : text;
  return body.split(/\r?\n/).map(l => l.replace(/^#+\s*|^\s*[-*]\s+/, '').replace(/\*\*|[*_`]/g, '').trim())
    .filter(l => l && !/^\|/.test(l) && !/^-{3,}$/.test(l)).slice(0, 8).join('\n');
}

function updateCard(info) {
  const u = up.info;
  const canInstall = u && u.asset && !['dev', 'unsupported'].includes(u.kind);
  const restartNote = u?.kind === 'mac' ? t('settings.update.noteMac') : t('settings.update.note');
  let row;
  if (up.state === 'checking') {
    row = html`<div class="setting"><div class="tile">${ic('refresh', 18)}</div><div class="grow"><div class="t">${t('settings.update.checking')}</div><div class="d">${t('settings.update.checkingText')}</div></div><button class="btn btn-secondary btn-sm" disabled><span class="spinner"></span> ${t('settings.update.checkingButton')}</button></div>`;
  } else if (up.state === 'downloading') {
    row = html`<div class="setting" style="align-items:flex-start"><div class="tile accent">${ic('download', 18)}</div><div class="grow"><div class="t">${t('settings.update.downloading', {version: u.latest})}</div>
        <div data-update-progress style="margin-top:10px">${bar(pct(up.done, up.total))}<div class="d" style="margin-top:6px"><span data-update-bytes>${t('settings.update.progress', {done: bytes(up.done), total: bytes(up.total || u.asset?.size || 0)})}</span></div></div></div>
      <button class="btn btn-secondary btn-sm" data-action="cancelUpdate">${t('common.cancel')}</button></div>`;
  } else if (up.state === 'installing' || up.state === 'installed') {
    row = html`<div class="setting"><div class="tile green">${up.state === 'installing' ? html`<span class="spinner"></span>` : ic('check', 18)}</div><div class="grow"><div class="t">${up.state === 'installing' ? t('settings.update.installing', {version: u.latest}) : t('settings.update.ready', {version: u.latest})}</div><div class="d">${up.message || t('settings.update.verified')}</div></div></div>`;
  } else if (u?.available) {
    row = html`<div class="setting" style="align-items:flex-start"><div class="tile accent">${ic('download', 18)}</div><div class="grow"><div class="t">${t('settings.update.available', {version: u.latest})}</div>
        <div class="d">${t('settings.update.youHave', {version: u.current})}${u.publishedAt ? ` ${t('settings.update.released', {date: date(u.publishedAt)})}` : ''} ${canInstall ? restartNote : u.kind === 'dev' ? t('settings.update.devOnly') : t('settings.update.downloadManually')}</div>
        ${notesPreview(u.notes) ? html`<div class="update-notes">${notesPreview(u.notes)}</div>` : ''}</div>
      <div class="row" style="gap:8px;flex:none"><button class="btn btn-secondary btn-sm" data-action="releasePage">${ic('external', 15)} ${t('settings.update.whatsNew')}</button>
        ${canInstall ? html`<button class="btn btn-primary btn-sm" data-action="installUpdate">${ic('download', 15)} ${t('settings.update.updateNow')}</button>` : ''}</div></div>`;
  } else if (u) {
    row = html`<div class="setting"><div class="tile green">${ic('check', 18)}</div><div class="grow"><div class="t">${t('settings.update.upToDate')}</div><div class="d">${t('settings.update.latest', {version: u.current, ago: ago(u.checkedAt)})}</div></div><button class="btn btn-secondary btn-sm" data-action="checkUpdate">${ic('refresh', 15)} ${t('settings.update.checkAgain')}</button></div>`;
  } else {
    row = html`<div class="setting"><div class="tile">${ic('refresh', 18)}</div><div class="grow"><div class="t">Aster ${info.version || ''}</div><div class="d">${t('settings.update.idleText')}</div></div><button class="btn btn-secondary btn-sm" data-action="checkUpdate">${ic('refresh', 15)} ${t('settings.update.check')}</button></div>`;
  }
  return html`<div class="card" style="margin-top:16px">
    <div class="card-head"><h3>${t('settings.updates')}</h3></div>
    ${row}
    ${up.error ? html`<div style="padding:0 20px 16px"><div class="callout amber">${ic('alert', 18)}<div class="grow">${up.error}</div>${up.info?.url ? html`<button class="btn btn-sm btn-secondary" data-action="releasePage">${t('settings.update.releasePage')}</button>` : ''}</div></div>` : ''}
  </div>`;
}

async function save(patch) {
  const s = await api('settings.update', patch);
  setApp({settings: s});
  if ('theme' in patch) window.asterApplyTheme(s.theme);
  return s;
}

const swatch = (bg, side, card) => html`<div class="sw" style="background:${bg}"><div style="width:30%;background:${side}"></div><div style="flex:1;padding:8px"><div style="height:10px;border-radius:3px;background:${card};margin-bottom:5px"></div><div style="height:10px;width:60%;border-radius:3px;background:${card}"></div></div></div>`;

export default definePage({
  id: 'settings', get title() { return t('page.settings'); }, icon: 'sliders',
  view() {
    const st = app.settings || {};
    const info = app.info || {};
    return html`
      <div class="page-head"><div class="titles"><h1>${t('page.settings')}</h1></div></div>
      <div class="card">
        <div class="card-head"><h3>${t('settings.appearance')}</h3></div>
        <div class="setting"><div class="grow"><div class="t">${t('settings.theme')}</div><div class="d">${t('settings.themeText', {os: isMac ? 'macOS' : 'Windows'})}</div></div>
          <div class="theme-picks">
            ${[['system', t('settings.themeSystem'), html`<div class="sw" style="background:linear-gradient(90deg,#f7f7f9 50%,#121215 50%)"></div>`], ['light', t('settings.themeLight'), swatch('#f7f7f9', '#ececf0', '#fff')], ['dark', t('settings.themeDark'), swatch('#121215', '#0e0e11', '#22222a')]].map(([id, label, sw]) => html`<button class="theme-pick ${st.theme === id ? 'on' : ''}" data-action="theme" data-v="${id}">${sw}${label}</button>`)}
          </div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>${t('settings.languageCard')}</h3></div>
        <div class="setting"><div class="grow"><div class="t">${t('settings.language')}</div><div class="d">${t('settings.languageText')}</div></div>
          <div class="segmented" role="radiogroup" aria-label="${t('settings.language')}">${LANGUAGES.map(l => html`<button class="${(st.language || 'en') === l.id ? 'on' : ''}" role="radio" aria-checked="${(st.language || 'en') === l.id ? 'true' : 'false'}" lang="${l.id}" data-action="language" data-v="${l.id}">${l.name}</button>`)}</div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>${t('settings.cleaning')}</h3></div>
        <div class="setting"><div class="grow"><div class="t">${t('settings.confirm')}</div><div class="d">${t('settings.confirmText')}</div></div><input type="checkbox" class="switch" data-change="flag" data-k="confirmBeforeCleaning" ${st.confirmBeforeCleaning ? 'checked' : ''}></div>
        <div class="setting"><div class="grow"><div class="t">${t('settings.closeApps')}</div><div class="d">${t('settings.closeAppsText')}</div></div><input type="checkbox" class="switch" data-change="flag" data-k="closeAppsBeforeCleaning" ${st.closeAppsBeforeCleaning ? 'checked' : ''}></div>
        <div class="setting" style="align-items:flex-start"><div class="grow"><div class="t">${t('settings.exclusions')}</div><div class="d">${t('settings.exclusionsText')}</div>
          <div class="row" style="flex-wrap:wrap;margin-top:10px">${(st.exclusions || []).map((p, i) => html`<span class="chip"><span class="mono truncate" style="max-width:360px">${p}</span><button class="icon-btn sm" data-action="unexclude" data-i="${i}" title="${t('common.remove')}">${ic('x', 13)}</button></span>`)}${(st.exclusions || []).length ? '' : html`<span class="faint" style="font-size:12.5px">${t('settings.noExclusions')}</span>`}</div></div>
          <button class="btn btn-secondary btn-sm" data-action="exclude">${ic('plus', 15)} ${t('settings.addFolder')}</button></div>
      </div>
      ${autoCard()}
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>${t('settings.safety')}</h3></div>
        <div class="setting"><div class="tile green">${ic('shield', 18)}</div><div class="grow"><div class="t">${t(isMac ? 'settings.safetyMac' : 'settings.safetyWin')}</div><div class="d">${t(isMac ? 'settings.safetyMacText' : 'settings.safetyWinText')}</div></div></div>
        <div class="setting"><div class="tile green">${ic('trash', 18)}</div><div class="grow"><div class="t">${t(isMac ? 'settings.filesToTrash' : 'settings.filesToBin')}</div><div class="d">${t('settings.filesText')}</div></div></div>
      </div>
      ${updateCard(info)}
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>${t('settings.about')}</h3></div>
        <div class="setting"><div class="grow"><div class="t">Aster ${info.version || ''}</div><div class="d">${t('settings.aboutText', {electron: info.electron || '—'})}</div></div><button class="btn btn-secondary btn-sm" data-action="github">${ic('external', 15)} GitHub</button></div>
        <div class="setting"><div class="grow"><div class="t">${t('settings.dataFolder')}</div><div class="d mono selectable">${info.dataPath || '—'}</div></div><button class="btn btn-secondary btn-sm" data-action="data">${t('common.open')}</button></div>
      </div>`;
  },
  onMount() {
    page = this; this.l = () => this.update(); app.listeners.add(this.l);
    Promise.all([api('schedule.get'), loadRules()]).then(([info]) => { sched.info = info; if (this.mounted) this.update(); }).catch(() => {});
  },
  onUnmount() { page = null; app.listeners.delete(this.l); },
  on: {
    async checkUpdate() {
      up.state = 'checking'; up.error = null; refresh();
      try { up.info = await api('appUpdate.check'); }
      catch (e) { up.error = e.message; }
      finally { up.state = 'idle'; refresh(); }
    },
    async installUpdate() {
      up.state = 'downloading'; up.error = null; up.done = 0; up.total = up.info?.asset?.size || 0; refresh();
      try {
        await api('appUpdate.download');
        up.state = 'installing'; refresh();
        const r = await api('appUpdate.install');
        up.message = r.message;
        up.state = r.restarting ? 'installing' : 'installed';
      } catch (e) { up.error = e.message; up.state = 'idle'; }
      refresh();
    },
    async cancelUpdate() { await api('appUpdate.cancel'); },
    releasePage() { api('shell.openUrl', {url: up.info?.url || 'https://github.com/Nikita-Shulga/Aster/releases/latest'}); },
    async theme(el) { await save({theme: el.dataset.v}); },
    async language(el) { const s = await save({language: el.dataset.v}); setLanguage(s.language); },
    async flag(el) { await save({[el.dataset.k]: el.checked}); toast(t('common.saved'), {type: 'success', timeout: 1500}); },
    async exclude() { const p = await api('settings.pickExclusion'); if (p) await save({exclusions: [...(app.settings.exclusions || []), p]}); },
    async unexclude(el) { const list = [...app.settings.exclusions]; list.splice(+el.dataset.i, 1); await save({exclusions: list}); },
    autoEnable(el) { return setSchedule({enabled: el.checked}); },
    autoFreq(el) { return setSchedule({frequency: el.dataset.v}); },
    autoNotify(el) { return setSchedule({notify: el.checked}); },
    github() { api('shell.openUrl', {url: 'https://github.com/Nikita-Shulga/Aster'}); },
    data() { api('backups.openFolder'); }
  }
});
