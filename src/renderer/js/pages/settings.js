import {html, ic, api, app, setApp, toast, isMac} from '../lib.js';
import {definePage} from '../page.js';

async function save(patch) {
  const s = await api('settings.update', patch);
  setApp({settings: s});
  if ('theme' in patch) window.asterApplyTheme(s.theme);
  return s;
}

const swatch = (bg, side, card) => html`<div class="sw" style="background:${bg}"><div style="width:30%;background:${side}"></div><div style="flex:1;padding:8px"><div style="height:10px;border-radius:3px;background:${card};margin-bottom:5px"></div><div style="height:10px;width:60%;border-radius:3px;background:${card}"></div></div></div>`;

export default definePage({
  id: 'settings', title: 'Settings', icon: 'sliders',
  view() {
    const st = app.settings || {};
    const info = app.info || {};
    return html`
      <div class="page-head"><div class="titles"><h1>Settings</h1></div></div>
      <div class="card">
        <div class="card-head"><h3>Appearance</h3></div>
        <div class="setting"><div class="grow"><div class="t">Theme</div><div class="d">Follow ${isMac ? 'macOS' : 'Windows'}, or pick a fixed look.</div></div>
          <div class="theme-picks">
            ${[['system', 'System', html`<div class="sw" style="background:linear-gradient(90deg,#f7f7f9 50%,#121215 50%)"></div>`], ['light', 'Light', swatch('#f7f7f9', '#ececf0', '#fff')], ['dark', 'Dark', swatch('#121215', '#0e0e11', '#22222a')]].map(([id, label, sw]) => html`<button class="theme-pick ${st.theme === id ? 'on' : ''}" data-action="theme" data-v="${id}">${sw}${label}</button>`)}
          </div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>Cleaning</h3></div>
        <div class="setting"><div class="grow"><div class="t">Ask before cleaning</div><div class="d">Show a summary to confirm before files are deleted.</div></div><input type="checkbox" class="switch" data-change="flag" data-k="confirmBeforeCleaning" ${st.confirmBeforeCleaning ? 'checked' : ''}></div>
        <div class="setting"><div class="grow"><div class="t">Close running apps automatically</div><div class="d">Browsers and apps must be closed to clean their caches. When off, running apps are skipped.</div></div><input type="checkbox" class="switch" data-change="flag" data-k="closeAppsBeforeCleaning" ${st.closeAppsBeforeCleaning ? 'checked' : ''}></div>
        <div class="setting" style="align-items:flex-start"><div class="grow"><div class="t">Never clean these folders</div><div class="d">Files inside excluded folders are skipped by the Cleaner.</div>
          <div class="row" style="flex-wrap:wrap;margin-top:10px">${(st.exclusions || []).map((p, i) => html`<span class="chip"><span class="mono truncate" style="max-width:360px">${p}</span><button class="icon-btn sm" data-action="unexclude" data-i="${i}" title="Remove">${ic('x', 13)}</button></span>`)}${(st.exclusions || []).length ? '' : html`<span class="faint" style="font-size:12.5px">No exclusions.</span>`}</div></div>
          <button class="btn btn-secondary btn-sm" data-action="exclude">${ic('plus', 15)} Add folder</button></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>Safety</h3></div>
        <div class="setting"><div class="tile green">${ic('shield', 18)}</div><div class="grow"><div class="t">${isMac ? 'Removals go to the Trash' : 'Registry backups are always on'}</div><div class="d">${isMac ? 'Apps, leftovers, launch agents and duplicate files are moved to the Trash, so you can put them back until you empty it.' : 'Every registry fix, edit, startup removal and leftover cleanup is saved as a .reg file you can restore from History.'}</div></div></div>
        <div class="setting"><div class="tile green">${ic('trash', 18)}</div><div class="grow"><div class="t">Your files go to the ${isMac ? 'Trash' : 'Recycle Bin'}</div><div class="d">Files removed from the Disk analyzer, Duplicates and leftover scans are recoverable. Only caches and temporary files are deleted permanently.</div></div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>About</h3></div>
        <div class="setting"><div class="grow"><div class="t">Aster ${info.version || ''}</div><div class="d">Electron ${info.electron || '—'} · made by Nikita Shulga</div></div><button class="btn btn-secondary btn-sm" data-action="github">${ic('external', 15)} GitHub</button></div>
        <div class="setting"><div class="grow"><div class="t">Data folder</div><div class="d mono selectable">${info.dataPath || '—'}</div></div><button class="btn btn-secondary btn-sm" data-action="data">Open</button></div>
      </div>`;
  },
  onMount() { this.l = () => this.update(); app.listeners.add(this.l); },
  onUnmount() { app.listeners.delete(this.l); },
  on: {
    async theme(el) { await save({theme: el.dataset.v}); },
    async flag(el) { await save({[el.dataset.k]: el.checked}); toast('Saved', {type: 'success', timeout: 1500}); },
    async exclude() { const p = await api('settings.pickExclusion'); if (p) await save({exclusions: [...(app.settings.exclusions || []), p]}); },
    async unexclude(el) { const list = [...app.settings.exclusions]; list.splice(+el.dataset.i, 1); await save({exclusions: list}); },
    github() { api('shell.openUrl', {url: 'https://github.com/Nikita-Shulga/Aster'}); },
    data() { api('backups.openFolder'); }
  }
});
