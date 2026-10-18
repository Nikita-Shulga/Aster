import {html, ic, api, app, num, plural, empty, modal, toast, avatar, isMac} from '../lib.js';
import {definePage} from '../page.js';
import {shared, notify} from '../state.js';
import {chip, countOptions, search as searchBox, resultLine, filterHandlers, driveOf} from '../filters.js';

const DEFAULT_FILTERS = {search: '', status: 'all', drive: 'all', scope: 'all', publisher: 'all'};
const s = {loading: false, tab: 'apps', f: structuredClone(DEFAULT_FILTERS), icons: new Map(), busy: new Set()};
const STATUS = [{value: 'on', label: 'Enabled', test: i => i.enabled}, {value: 'off', label: 'Disabled', test: i => !i.enabled}, {value: 'missing', label: 'File missing', test: i => !i.exists && !!i.file}, {value: 'unsigned', label: 'Unknown publisher', test: i => !i.publisher}];
const SCOPES = [{value: 'user', label: 'Only me'}, {value: 'machine', label: 'All users'}];
const driveOfItem = i => driveOf(i.file) || driveOf(String(i.command || '').replace(/^"/, ''));
const st = shared.startup;

async function load(page) {
  s.loading = true; page.update();
  try { const r = await api('startup.list'); st.items = r.items; st.unavailable = !!r.loginItemsUnavailable; notify(); }
  finally { s.loading = false; page.update(); }
}

const TABS = isMac ? [
  {id: 'apps', label: 'Login items & agents', test: i => i.type === 'login' || (i.type === 'agent' && i.scope === 'user')},
  {id: 'tasks', label: 'Agents for all users', test: i => i.type === 'agent' && i.scope === 'machine'},
  {id: 'services', label: 'Background services', test: i => i.type === 'daemon'}
] : [
  {id: 'apps', label: 'Apps', test: i => i.type === 'registry' || i.type === 'folder'},
  {id: 'tasks', label: 'Scheduled tasks', test: i => i.type === 'task'},
  {id: 'services', label: 'Services', test: i => i.type === 'service'}
];

async function loadIcons(page, list) {
  const missing = list.filter(i => !s.icons.has(i.id) && i.exists).map(i => i.id);
  if (!missing.length) return;
  missing.forEach(id => s.icons.set(id, null));
  const res = await api('startup.icons', {ids: missing}).catch(() => ({}));
  for (const [id, url] of Object.entries(res)) {
    if (!url) continue;
    s.icons.set(id, url);
    const cell = page.mounted && page.el.querySelector(`[data-icon="${id}"]`);
    if (cell) cell.innerHTML = `<img class="avatar" src="${url}" width="32" height="32" alt="">`;
  }
}

function matches(i, skip) {
  const f = s.f, q = f.search.trim().toLowerCase();
  return (skip === 'status' || f.status === 'all' || STATUS.find(x => x.value === f.status).test(i)) &&
    (skip === 'drive' || f.drive === 'all' || (driveOfItem(i) || '__none') === f.drive) &&
    (skip === 'scope' || f.scope === 'all' || i.scope === f.scope) &&
    (skip === 'publisher' || f.publisher === 'all' || (i.publisher || '__none') === f.publisher) &&
    (!q || i.name.toLowerCase().includes(q) || (i.publisher || '').toLowerCase().includes(q) || (i.command || '').toLowerCase().includes(q));
}
const inTab = () => (st.items || []).filter(TABS.find(t => t.id === s.tab).test);
function visible() {
  return inTab().filter(i => matches(i)).sort((a, b) => (b.enabled - a.enabled) || a.name.localeCompare(b.name));
}

export default definePage({
  id: 'startup', title: 'Startup', icon: 'power',
  badge: () => { const n = (st.items || []).filter(i => TABS[0].test(i) && i.enabled).length; return n ? {text: String(n)} : null; },
  view() {
    const head = html`<div class="page-head">
      <div class="titles"><h1>Startup</h1><p>${isMac ? 'Choose what opens and runs in the background when you log in. Fewer items means a faster login and less battery drain. Switching off is reversible; it uses the same mechanism as System Settings → Login Items.' : 'Choose what runs when you sign in. Fewer startup apps means a faster boot and fewer background processes. Disabling is reversible; it uses the same switch as Task Manager.'}</p></div>
      <div class="actions">
        <button class="btn btn-secondary" data-action="add">${ic('plus', 16)} ${isMac ? 'Add login item' : 'Add program'}</button>
        <button class="btn btn-secondary" data-action="refresh" ${s.loading ? 'disabled' : ''}>${ic('refresh', 16, s.loading ? 'spin' : '')} Refresh</button>
      </div></div>`;
    if (!st.items) return html`${head}<div class="card card-pad">${[1, 2, 3, 4, 5].map(() => html`<div class="skeleton" style="height:44px;margin:8px 0"></div>`)}</div>`;
    const apps = st.items.filter(TABS[0].test);
    const enabled = apps.filter(i => i.enabled).length;
    const missing = st.items.filter(i => i.type !== 'service' && !i.exists && i.file).length;
    const list = visible();
    return html`${head}
      <div class="grid grid-3" style="margin-bottom:16px">
        <div class="card card-pad row" style="gap:14px"><div class="tile green">${ic('play', 18)}</div><div class="stat"><span class="k">Enabled at sign-in</span><span class="v num">${num(enabled)}</span></div></div>
        <div class="card card-pad row" style="gap:14px"><div class="tile gray">${ic('stop', 18)}</div><div class="stat"><span class="k">Disabled</span><span class="v num">${num(apps.length - enabled)}</span></div></div>
        <div class="card card-pad row" style="gap:14px"><div class="tile ${missing ? 'amber' : 'gray'}">${ic('alert', 18)}</div><div class="stat"><span class="k">Pointing to missing files</span><span class="v num">${num(missing)}</span></div></div>
      </div>
      <div class="card">
        <div class="toolbar" style="padding:14px 16px 0">
          <div class="segmented">${TABS.map(t => html`<button class="${s.tab === t.id ? 'on' : ''}" data-action="tab" data-tab="${t.id}">${t.label} <span class="count">${st.items.filter(t.test).length}</span></button>`)}</div>
        </div>
        <div class="toolbar filterbar" style="padding:10px 16px 0">
          ${searchBox(s.f.search, 'Search startup entries', 220)}
          ${chip('status', 'Status', STATUS.map(o => ({...o, count: inTab().filter(i => matches(i, 'status') && o.test(i)).length})), s.f.status)}
          ${chip('drive', 'Drive', countOptions(inTab().filter(i => matches(i, 'drive')), driveOfItem, {sort: 'alpha', unknown: 'Unknown'}), s.f.drive)}
          ${chip('scope', 'Applies to', SCOPES.map(o => ({...o, count: inTab().filter(i => matches(i, 'scope') && i.scope === o.value).length})), s.f.scope)}
          ${chip('publisher', 'Publisher', countOptions(inTab().filter(i => matches(i, 'publisher')), i => i.publisher || null, {unknown: 'Unknown publisher'}), s.f.publisher)}
        </div>
        ${resultLine(list.length, inTab().length, s.f, 'entries')}
        ${s.tab === 'services' ? html`<div class="callout" style="margin:12px 16px 0">${ic('info', 16)}<div>${isMac ? 'System-wide background services installed by apps (Apple’s own are hidden). Switching one off asks for your password.' : html`Third-party services only. Switching off sets the service to <strong>Manual</strong> start, so it still runs when an app needs it. Requires administrator rights.`}</div></div>` : ''}
        ${isMac && st.unavailable && s.tab === 'apps' ? html`<div class="callout amber" style="margin:12px 16px 0">${ic('info', 16)}<div>Login items couldn’t be read. Allow Aster to control <strong>System Events</strong> in System Settings → Privacy & Security → Automation, then refresh.</div></div>` : ''}
        ${list.length ? html`<div class="table-wrap" style="margin-top:8px"><table class="table">
          <thead><tr><th>Name</th><th>Drive</th><th>Source</th><th style="width:90px">Status</th><th></th></tr></thead>
          <tbody>${list.map(i => {
            const lockedAdmin = i.admin && !app.system?.admin && !isMac;
            return html`<tr>
              <td style="max-width:460px"><div class="cell-main"><span data-icon="${i.id}">${avatar(i.name, s.icons.get(i.id), 32)}</span>
                <div class="truncate"><div class="t truncate">${i.name} ${!i.exists && i.file && i.type !== 'service' ? html`<span class="badge amber">File missing</span>` : ''} ${i.type === 'service' && i.state === 'Running' ? html`<span class="badge green">Running</span>` : ''}</div>
                <div class="s truncate mono selectable" title="${i.command}">${i.publisher ? html`<span style="font-family:var(--font)">${i.publisher} · </span>` : ''}${i.command}</div></div></div></td>
              <td>${driveOfItem(i) ? html`<span class="drive-tag">${driveOfItem(i)}</span>` : html`<span class="faint">—</span>`}</td>
              <td class="muted" style="white-space:nowrap;font-size:12.5px">${i.source}</td>
              <td>${i.canToggle ? html`<input type="checkbox" class="switch" data-change="toggle" data-id="${i.id}" ${i.enabled ? 'checked' : ''} ${s.busy.has(i.id) ? 'disabled' : ''} title="${lockedAdmin ? 'Requires administrator' : i.enabled ? 'Enabled' : 'Disabled'}" aria-label="Run ${i.name} at startup">` : html`<span class="faint" style="font-size:12px">Once</span>`}</td>
              <td class="actions-cell"><div class="row-actions row" style="gap:2px;justify-content:flex-end">
                ${i.file && i.exists ? html`<button class="icon-btn sm" data-action="reveal" data-id="${i.id}" title="Show file">${ic('folderOpen', 15)}</button>` : ''}
                ${i.type !== 'service' ? html`<button class="icon-btn sm" data-action="remove" data-id="${i.id}" title="Delete entry">${ic('trash', 15)}</button>` : ''}
              </div></td>
            </tr>`;
          })}</tbody></table></div>` : empty({iconName: 'power', title: s.query ? 'Nothing matches' : 'Nothing here', text: s.query ? 'Try another search.' : 'No entries of this type start automatically.'})}
      </div>`;
  },
  afterRender() { if (st.items) loadIcons(this, visible()); },
  onMount() { if (!st.items && !s.loading) load(this); },
  on: {
    refresh() { return load(this); },
    tab(el) { s.tab = el.dataset.tab; this.update(); },
    ...filterHandlers(() => s.f, DEFAULT_FILTERS),
    async toggle(el) {
      const item = st.items.find(i => i.id === el.dataset.id);
      if (item.admin && !app.system?.admin && !isMac) {
        el.checked = item.enabled;
        const {ok} = await modal({title: 'Administrator rights needed', icon: 'shield', confirm: 'Restart as admin', body: `${item.name} applies to all users, so changing it requires administrator rights.`});
        if (ok) window.asterRelaunch();
        return;
      }
      s.busy.add(item.id);
      try { await api('startup.toggle', {id: item.id, enabled: el.checked}); item.enabled = el.checked; toast(`${item.name} ${el.checked ? 'will start' : 'won’t start'} automatically`, {type: 'success'}); }
      catch (e) { el.checked = item.enabled; throw e; }
      finally { s.busy.delete(item.id); notify(); this.update(); }
    },
    reveal(el) { const i = st.items.find(x => x.id === el.dataset.id); api('shell.reveal', {path: i.type === 'folder' ? i.location : i.file}); },
    async remove(el) {
      const i = st.items.find(x => x.id === el.dataset.id);
      const {ok} = await modal({title: `Delete ${i.name} from startup?`, icon: 'trash', danger: true, confirm: 'Delete', body: isMac ? (i.type === 'login' ? 'The app stays installed; it just won’t open at login anymore.' : 'The agent’s file moves to the Trash, so you can put it back. Prefer switching it off if you might want it later.') : i.type === 'folder' ? 'The shortcut moves to the Recycle Bin.' : i.type === 'task' ? 'The scheduled task is deleted. A copy of its definition is saved in Aster’s backup folder.' : 'The entry is removed and backed up — restore it anytime from History. Prefer switching it off if you might want it back.'});
      if (!ok) return;
      await api('startup.remove', {id: i.id});
      st.items = st.items.filter(x => x.id !== i.id);
      toast('Removed from startup', {type: 'success'}); notify(); this.update();
    },
    async add() { const r = await api('startup.add'); if (!r.cancelled) { toast('Added to startup', {type: 'success'}); await load(this); } }
  }
});
