import {html, ic, api, ago, plural, empty, modal, toast, avatar, onEvent, isMac} from '../lib.js';
import {definePage} from '../page.js';
import {chip, search as searchBox, filterHandlers} from '../filters.js';

const DEFAULT_FILTERS = {search: '', change: 'all'};
const pf = structuredClone(DEFAULT_FILTERS);
// How big the version jump is: major (1.x → 2.x), minor (1.2 → 1.3) or patch (1.2.3 → 1.2.4).
function changeOf(i) {
  const a = String(i.installed).match(/\d+/g) || [], b = String(i.available).match(/\d+/g) || [];
  if (!a.length || !b.length) return 'other';
  if (+a[0] !== +b[0]) return 'major';
  if (+(a[1] || 0) !== +(b[1] || 0)) return 'minor';
  return 'patch';
}
const CHANGES = [{value: 'major', label: 'Major upgrade', hint: 'May look or work differently'}, {value: 'minor', label: 'Feature update'}, {value: 'patch', label: 'Bug-fix / security'}, {value: 'other', label: 'Other'}];
const matchUpd = (i, skip) => (skip === 'change' || pf.change === 'all' || changeOf(i) === pf.change) && (!pf.search.trim() || (i.name + ' ' + i.id).toLowerCase().includes(pf.search.trim().toLowerCase()));
import {shared, notify, checkUpdates} from '../state.js';

const u = shared.updates;
const s = {available: null, running: null, log: new Map(), results: new Map(), queue: []};

onEvent(e => {
  if (e.channel !== 'updates') return;
  if (/[█▒]|^\d+%$|^[\d.]+\s*[KMG]?B\s*\/\s*[\d.]+/.test(e.line)) return;
  s.log.set(e.id, e.line);
  const el = document.querySelector(`[data-log="${CSS.escape(e.id)}"]`);
  if (el) el.textContent = e.line;
});

async function runUpdate(page, id) {
  s.running = id; s.results.delete(id); page.update();
  try {
    const r = await api('updates.update', {id});
    s.results.set(id, r);
    const row = u.data?.items.find(x => x.id === id);
    if (r.ok && r.opened) toast(r.message);
    else if (r.ok) { toast(`${row?.name || id} updated`, {type: 'success'}); u.data.items = u.data.items.filter(x => x.id !== id); }
    else toast(`${row?.name || id}: ${r.message}`, {type: 'error'});
  } catch (e) { s.results.set(id, {ok: false, message: e.message}); toast(e.message, {type: 'error'}); }
  finally { s.running = null; notify(); page.update(); }
}

export default definePage({
  id: 'updates', title: 'Updates', icon: 'refresh',
  badge: () => u.data?.items.length ? {text: String(u.data.items.length), tone: 'accent'} : null,
  view() {
    const items = u.data?.items || [];
    const brewNote = isMac && s.available && s.brew === false ? html`<div class="callout blue" style="margin-bottom:12px">${ic('info', 18)}<div class="grow"><strong>Install Homebrew to update your apps.</strong> Homebrew is the free package manager most Mac users use; Aster can then update apps installed with it. Without it, Aster checks macOS updates only.</div><button class="btn btn-sm btn-secondary" data-action="brew">brew.sh</button></div>` : '';
    const head = html`<div class="page-head">
      <div class="titles"><h1>Updates</h1><p>${isMac ? 'Keep your software current: macOS updates, apps installed with Homebrew, and Mac App Store apps (when the free “mas” tool is installed).' : 'Keep your software current. Aster uses Microsoft’s WinGet package manager to find newer versions and installs them silently from the publisher’s official source.'}</p></div>
      <div class="actions">
        ${u.data ? html`<span class="faint" style="font-size:12.5px">Checked ${ago(u.data.checkedAt)}</span>` : ''}
        ${u.data ? html`<button class="btn btn-secondary" data-action="check" ${u.phase === 'checking' || s.running ? 'disabled' : ''}>${ic('refresh', 16, u.phase === 'checking' ? 'spin' : '')} Check now</button>` : ''}
        ${items.length > 1 ? html`<button class="btn btn-primary" data-action="all" ${s.running ? 'disabled' : ''}>${ic('download', 16)} Update all</button>` : ''}
      </div></div>`;
    if (s.available === false) return html`${head}<div class="card">${empty({iconName: 'box', title: 'WinGet is not installed', text: 'Updates rely on Microsoft’s App Installer. Install it from the Microsoft Store, then come back.', action: html`<button class="btn btn-primary" data-action="store">Open Microsoft Store</button>`})}</div>`;
    if (u.phase === 'checking' && !u.data) return html`${head}<div class="card card-pad"><div class="row" style="gap:14px"><div class="tile"><span class="spinner"></span></div><div><div class="card-title">Checking for updates…</div><div class="muted">${isMac ? 'Checking Apple, Homebrew and the App Store. This can take a minute.' : 'Comparing installed programs with the WinGet catalog.'}</div></div></div><div class="progress indeterminate" style="margin-top:16px"><div></div></div></div>`;
    if (!u.data) return html`${head}${brewNote}<div class="card">${empty({iconName: 'refresh', title: 'See which apps are out of date', text: 'Outdated software is the most common way PCs get compromised. Checking takes a few seconds.', action: html`<button class="btn btn-primary btn-lg" data-action="check">${ic('search', 18)} Check for updates</button>`})}</div>`;
    if (!items.length) return html`${head}<div class="card">${empty({iconName: 'check', title: 'Everything is up to date', text: isMac ? 'macOS and your Homebrew apps are on their latest versions.' : 'All programs that WinGet knows about are on their latest version.'})}</div>`;
    return html`${head}
      <div class="toolbar filterbar">
        ${searchBox(pf.search, 'Search apps', 220)}
        ${chip('change', 'Change', CHANGES.map(o => ({...o, count: items.filter(i => matchUpd(i, 'change') && changeOf(i) === o.value).length})).filter(o => o.count), pf.change)}
        ${pf.search || pf.change !== 'all' ? html`<span class="faint" style="font-size:12.5px">Showing ${items.filter(i => matchUpd(i)).length} of ${items.length}</span><button class="linkish" data-action="clearFilters">Clear filters</button>` : ''}
      </div>
      <div class="card" style="margin-top:12px">
        <div class="card-head"><h3 class="grow">${plural(items.length, 'update')} available</h3><span class="faint" style="font-size:12.5px">Installers may ask for permission</span></div>
        <div class="list">${items.filter(i => matchUpd(i)).map(i => {
          const running = s.running === i.id;
          const res = s.results.get(i.id);
          return html`<div class="list-row">
            ${avatar(i.name, null, 36)}
            <div class="grow truncate"><div style="font-weight:500" class="truncate">${i.name}</div>
              ${running ? html`<div class="meta truncate" data-log="${i.id}">${s.log.get(i.id) || 'Starting…'}</div>`
                : res && !res.ok ? html`<div class="meta truncate" style="color:var(--red-text)">${res.message}</div>`
                : html`<div class="meta mono truncate">${i.id}</div>`}</div>
            <span class="badge ${changeOf(i) === 'major' ? 'amber' : ''}" title="${CHANGES.find(c => c.value === changeOf(i)).hint || ''}">${CHANGES.find(c => c.value === changeOf(i)).label}</span>
            <span class="badge num">${i.installed}</span>${ic('chevronRight', 14, 'faint')}<span class="badge accent num">${i.available}</span>
            ${i.kind ? html`<span class="badge ${i.kind === 'macos' ? 'blue' : ''}">${{macos: 'macOS', cask: 'App (Homebrew)', formula: 'Tool (Homebrew)', appstore: 'App Store'}[i.kind]}</span>` : ''}
            <button class="btn btn-secondary btn-sm" style="min-width:86px" data-action="update" data-id="${i.id}" ${s.running || i.truncated ? 'disabled' : ''}>${running ? html`<span class="spinner"></span> Updating` : i.kind === 'macos' ? 'Open' : 'Update'}</button>
          </div>`;
        })}</div>
      </div>`;
  },
  onMount() {
    this.listener = () => this.update();
    shared.listeners.add(this.listener);
    if (s.available === null) api('updates.available').then(r => { s.available = r.available; s.brew = r.brew; this.update(); });
    if (!u.data) api('updates.last').then(d => { if (d) { u.data = d; u.phase = 'checked'; this.update(); } });
  },
  onUnmount() { shared.listeners.delete(this.listener); },
  on: {
    ...filterHandlers(() => pf, DEFAULT_FILTERS),
    async check() { await checkUpdates(); },
    brew() { api('shell.openUrl', {url: 'https://brew.sh'}); },
    store() { api('shell.openUrl', {url: 'https://apps.microsoft.com/detail/9NBLGGH4NNS1'}); },
    async update(el) { await runUpdate(this, el.dataset.id); },
    async all() {
      const items = (u.data?.items || []).filter(i => !i.truncated && i.kind !== 'macos');
      const {ok} = await modal({title: `Update ${plural(items.length, 'app')}?`, icon: 'download', confirm: 'Update all', body: isMac ? 'Apps update one after another through Homebrew / the App Store. Save your work first — apps being updated may be closed. macOS updates are not included; install those from System Settings.' : 'Apps update one after another. Save your work first — running apps may be closed by their installers. Package license agreements are accepted on your behalf.'});
      if (!ok) return;
      for (const i of items) await runUpdate(this, i.id);
    }
  }
});
