import {html, ic, api, app, setApp, toast, isMac, bytes, bar, pct, date, ago, onEvent} from '../lib.js';
import {definePage} from '../page.js';

// Aster's own updates (GitHub releases). Kept outside the page so a download survives navigation.
const up = {state: 'idle', info: null, error: null, done: 0, total: 0, message: ''};
let page = null;
const refresh = () => page?.update();
onEvent(e => {
  if (e.channel !== 'appUpdate') return;
  up.done = e.done; up.total = e.total;
  const el = document.querySelector('[data-update-progress]');
  if (el) { el.querySelector('.bar-fill').style.width = `${pct(e.done, e.total).toFixed(1)}%`; el.querySelector('[data-update-bytes]').textContent = `${bytes(e.done)} of ${bytes(e.total)}`; }
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
  const restartNote = u?.kind === 'mac' ? 'The new version opens in Finder, ready to drag into Applications.' : 'Aster downloads it from GitHub, checks it, then closes and reopens on the new version.';
  let row;
  if (up.state === 'checking') {
    row = html`<div class="setting"><div class="tile">${ic('refresh', 18)}</div><div class="grow"><div class="t">Checking for updates…</div><div class="d">Asking GitHub for the latest release.</div></div><button class="btn btn-secondary btn-sm" disabled><span class="spinner"></span> Checking</button></div>`;
  } else if (up.state === 'downloading') {
    row = html`<div class="setting" style="align-items:flex-start"><div class="tile accent">${ic('download', 18)}</div><div class="grow"><div class="t">Downloading Aster ${u.latest}…</div>
        <div data-update-progress style="margin-top:10px">${bar(pct(up.done, up.total))}<div class="d" style="margin-top:6px"><span data-update-bytes>${bytes(up.done)} of ${bytes(up.total || u.asset?.size || 0)}</span></div></div></div>
      <button class="btn btn-secondary btn-sm" data-action="cancelUpdate">Cancel</button></div>`;
  } else if (up.state === 'installing' || up.state === 'installed') {
    row = html`<div class="setting"><div class="tile green">${up.state === 'installing' ? html`<span class="spinner"></span>` : ic('check', 18)}</div><div class="grow"><div class="t">${up.state === 'installing' ? `Installing Aster ${u.latest}…` : `Aster ${u.latest} is ready`}</div><div class="d">${up.message || 'Verified against the published checksum.'}</div></div></div>`;
  } else if (u?.available) {
    row = html`<div class="setting" style="align-items:flex-start"><div class="tile accent">${ic('download', 18)}</div><div class="grow"><div class="t">Aster ${u.latest} is available</div>
        <div class="d">You have ${u.current}.${u.publishedAt ? ` Released ${date(u.publishedAt)}.` : ''} ${canInstall ? restartNote : u.kind === 'dev' ? 'Updates install only in the installed app.' : 'Download it from the release page.'}</div>
        ${notesPreview(u.notes) ? html`<div class="update-notes">${notesPreview(u.notes)}</div>` : ''}</div>
      <div class="row" style="gap:8px;flex:none"><button class="btn btn-secondary btn-sm" data-action="releasePage">${ic('external', 15)} What's new</button>
        ${canInstall ? html`<button class="btn btn-primary btn-sm" data-action="installUpdate">${ic('download', 15)} Update now</button>` : ''}</div></div>`;
  } else if (u) {
    row = html`<div class="setting"><div class="tile green">${ic('check', 18)}</div><div class="grow"><div class="t">Aster is up to date</div><div class="d">${u.current} is the latest version · checked ${ago(u.checkedAt)}</div></div><button class="btn btn-secondary btn-sm" data-action="checkUpdate">${ic('refresh', 15)} Check again</button></div>`;
  } else {
    row = html`<div class="setting"><div class="tile">${ic('refresh', 18)}</div><div class="grow"><div class="t">Aster ${info.version || ''}</div><div class="d">Check GitHub for a newer version. Aster only goes online when you click.</div></div><button class="btn btn-secondary btn-sm" data-action="checkUpdate">${ic('refresh', 15)} Check for updates</button></div>`;
  }
  return html`<div class="card" style="margin-top:16px">
    <div class="card-head"><h3>Updates</h3></div>
    ${row}
    ${up.error ? html`<div style="padding:0 20px 16px"><div class="callout amber">${ic('alert', 18)}<div class="grow">${up.error}</div>${up.info?.url ? html`<button class="btn btn-sm btn-secondary" data-action="releasePage">Release page</button>` : ''}</div></div>` : ''}
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
      ${updateCard(info)}
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>About</h3></div>
        <div class="setting"><div class="grow"><div class="t">Aster ${info.version || ''}</div><div class="d">Electron ${info.electron || '—'} · made by Nikita Shulga</div></div><button class="btn btn-secondary btn-sm" data-action="github">${ic('external', 15)} GitHub</button></div>
        <div class="setting"><div class="grow"><div class="t">Data folder</div><div class="d mono selectable">${info.dataPath || '—'}</div></div><button class="btn btn-secondary btn-sm" data-action="data">Open</button></div>
      </div>`;
  },
  onMount() { page = this; this.l = () => this.update(); app.listeners.add(this.l); },
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
    async flag(el) { await save({[el.dataset.k]: el.checked}); toast('Saved', {type: 'success', timeout: 1500}); },
    async exclude() { const p = await api('settings.pickExclusion'); if (p) await save({exclusions: [...(app.settings.exclusions || []), p]}); },
    async unexclude(el) { const list = [...app.settings.exclusions]; list.splice(+el.dataset.i, 1); await save({exclusions: list}); },
    github() { api('shell.openUrl', {url: 'https://github.com/Nikita-Shulga/Aster'}); },
    data() { api('backups.openFolder'); }
  }
});
