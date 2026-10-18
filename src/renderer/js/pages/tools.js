import {html, ic, api, app, modal, toast, bytes, isMac} from '../lib.js';
import {definePage} from '../page.js';

// The catalog (actions and shortcuts) comes from the platform layer, so Windows and macOS each get their own tools.
const s = {catalog: null, busy: new Set()};

export default definePage({
  id: 'tools', title: 'Tools', icon: 'wrench',
  view() {
    const head = html`<div class="page-head"><div class="titles"><h1>Tools</h1><p>Quick maintenance actions and shortcuts to the ${isMac ? 'macOS' : 'Windows'} utilities you actually need.</p></div></div>`;
    if (!s.catalog) return html`${head}<div class="skeleton" style="height:240px"></div>`;
    const actions = s.catalog.actions.filter(a => a.id !== 'admin' || !app.system?.admin);
    return html`${head}
      <div class="grid grid-2">
        ${actions.map(a => html`<button class="card tool" data-action="run" data-id="${a.id}" ${s.busy.has(a.id) ? 'disabled' : ''}>
          <div class="tile ${a.tone}">${s.busy.has(a.id) ? html`<span class="spinner"></span>` : ic(a.icon, 18)}</div>
          <div class="grow"><div class="t">${a.title} ${a.admin ? html`<span class="badge">${isMac ? 'Password' : 'Admin'}</span>` : ''}</div><div class="d">${a.text}</div></div>
          ${ic('chevronRight', 16, 'go')}
        </button>`)}
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3 class="grow">${isMac ? 'macOS utilities' : 'Windows utilities'}</h3></div>
        <div class="launch-grid">${s.catalog.launchers.map(([id, label, i]) => html`<button class="launch" data-action="launch" data-id="${id}">${ic(i, 17)}<span class="truncate">${label}</span></button>`)}</div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3 class="grow">${isMac ? 'System Settings' : 'Settings pages'}</h3></div>
        <div class="launch-grid">${s.catalog.settings.map(([id, label, i]) => html`<button class="launch" data-action="launch" data-id="${id}">${ic(i, 17)}<span class="truncate">${label}</span></button>`)}</div>
      </div>`;
  },
  onMount() { if (!s.catalog) api('tools.catalog').then(c => { s.catalog = c; this.update(); }); },
  on: {
    async launch(el) { await api('tools.launch', {id: el.dataset.id}); },
    async run(el) {
      const id = el.dataset.id;
      const a = s.catalog.actions.find(x => x.id === id);
      if (id === 'admin') { window.asterRelaunch(); return; }
      if (id === 'restore' && !app.system?.admin && !isMac) { window.asterRelaunch(); return; }
      if (id === 'bin') {
        const est = await api('cleaner.analyze', {ids: [s.catalog.binRule]}).catch(() => null);
        const where = isMac ? 'Trash' : 'Recycle Bin';
        const {ok} = await modal({title: `Empty the ${where}?`, icon: 'trash', danger: true, confirm: 'Empty', body: `${est ? bytes(est.totalBytes) + ' will be permanently deleted. ' : ''}This can’t be undone.${isMac && app.system?.fda === false ? ' Aster needs Full Disk Access to empty the Trash.' : ''}`});
        if (!ok) return;
        s.busy.add(id); this.update();
        try { const r = await api('cleaner.clean', {ids: [s.catalog.binRule]}); toast(`${where} emptied · ${bytes(r.freed)} freed`, {type: 'success'}); } finally { s.busy.delete(id); this.update(); }
        return;
      }
      if (id === 'thin') {
        const {ok} = await modal({title: 'Remove local Time Machine snapshots?', icon: 'drive', confirm: 'Remove snapshots', body: 'macOS keeps hourly snapshots on your disk between Time Machine backups and counts them as “purgeable” space. Removing them frees that space now; your backups on the Time Machine drive are not affected.'});
        if (!ok) return;
      }
      s.busy.add(id); this.update();
      try { const r = await api('tools.run', {id}); toast(r.message || `${a.title}: done`, {type: 'success'}); }
      finally { s.busy.delete(id); this.update(); }
    }
  }
});
