import {html, ic, api, app, modal, toast, bytes, isMac, t, th} from '../lib.js';
import {definePage} from '../page.js';
import {onLanguageChange} from '../i18n.js';
import {searchCard, searchHandlers} from '../search-doctor.js';
import {repairCard, repairHandlers} from '../repair-card.js';

// The catalog (actions and shortcuts) comes from the platform layer, so Windows and macOS each get their own tools.
const s = {catalog: null, busy: new Set()};
// The catalog's titles and descriptions are in the interface language: fetch it again after a switch.
onLanguageChange(() => { s.catalog = null; });

export default definePage({
  id: 'tools', get title() { return t('page.tools'); }, icon: 'wrench',
  view() {
    const head = html`<div class="page-head"><div class="titles"><h1>${t('page.tools')}</h1><p>${t('tools.intro', {os: isMac ? 'macOS' : 'Windows'})}</p></div></div>`;
    if (!s.catalog) return html`${head}<div class="skeleton" style="height:240px"></div>`;
    const actions = s.catalog.actions.filter(a => a.id !== 'admin' || !app.system?.admin);
    return html`${head}
      ${searchCard()}
      ${repairCard()}
      <div class="grid grid-2">
        ${actions.map(a => html`<button class="card tool" data-action="run" data-id="${a.id}" ${s.busy.has(a.id) ? 'disabled' : ''}>
          <div class="tile ${a.tone}">${s.busy.has(a.id) ? html`<span class="spinner"></span>` : ic(a.icon, 18)}</div>
          <div class="grow"><div class="t">${a.title} ${a.admin ? html`<span class="badge">${t(isMac ? 'tools.badge.password' : 'tools.badge.admin')}</span>` : ''}</div><div class="d">${a.text}</div></div>
          ${ic('chevronRight', 16, 'go')}
        </button>`)}
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3 class="grow">${t(isMac ? 'tools.utilitiesMac' : 'tools.utilitiesWin')}</h3></div>
        <div class="launch-grid">${s.catalog.launchers.map(([id, label, i]) => html`<button class="launch" data-action="launch" data-id="${id}">${ic(i, 17)}<span class="truncate">${label}</span></button>`)}</div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3 class="grow">${t(isMac ? 'tools.settingsMac' : 'tools.settingsWin')}</h3></div>
        <div class="launch-grid">${s.catalog.settings.map(([id, label, i]) => html`<button class="launch" data-action="launch" data-id="${id}">${ic(i, 17)}<span class="truncate">${label}</span></button>`)}</div>
      </div>`;
  },
  onMount() { if (!s.catalog) api('tools.catalog').then(c => { s.catalog = c; this.update(); }); },
  on: {
    ...searchHandlers,
    ...repairHandlers,
    async launch(el) { await api('tools.launch', {id: el.dataset.id}); },
    async run(el) {
      const id = el.dataset.id;
      const a = s.catalog.actions.find(x => x.id === id);
      if (id === 'admin') { window.asterRelaunch(); return; }
      if (id === 'restore' && !app.system?.admin && !isMac) { window.asterRelaunch(); return; }
      if (id === 'bin') {
        const est = await api('cleaner.analyze', {ids: [s.catalog.binRule]}).catch(() => null);
        const body = [est ? t('tools.bin.size', {size: bytes(est.totalBytes)}) : '', t('tools.bin.undo'), isMac ? t('tools.bin.finder') : ''].filter(Boolean).join(' ');
        const {ok} = await modal({title: t(isMac ? 'tools.bin.titleMac' : 'tools.bin.titleWin'), icon: 'trash', danger: true, confirm: t('tools.bin.confirm'), body});
        if (!ok) return;
        s.busy.add(id); this.update();
        try {
          if (isMac) { await api('tools.run', {id}); toast(est?.totalBytes ? t('tools.bin.emptiedMacFreed', {size: bytes(est.totalBytes)}) : t('tools.bin.emptiedMac'), {type: 'success'}); }
          else { const r = await api('cleaner.clean', {ids: [s.catalog.binRule]}); toast(t('tools.bin.emptiedWin', {size: bytes(r.freed)}), {type: 'success'}); }
        } finally { s.busy.delete(id); this.update(); }
        return;
      }
      if (id === 'thin') {
        const {ok} = await modal({title: t('tools.thin.title'), icon: 'drive', confirm: t('tools.thin.confirm'), body: t('tools.thin.body')});
        if (!ok) return;
      }
      s.busy.add(id); this.update();
      try { const r = await api('tools.run', {id}); toast(r.message || t('tools.done', {title: a.title}), {type: 'success'}); }
      finally { s.busy.delete(id); this.update(); }
    }
  }
});
