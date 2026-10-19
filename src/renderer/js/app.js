import {html, str, ic, api, app, setApp, demo, fail, toast, modal, isMac} from './lib.js';
import {logo} from './icons.js';
import overview from './pages/overview.js';
import cleaner from './pages/cleaner.js';
import registry from './pages/registry.js';
import programs from './pages/programs.js';
import startup from './pages/startup.js';
import updates from './pages/updates.js';
import disk from './pages/disk.js';
import duplicates from './pages/duplicates.js';
import tools from './pages/tools.js';
import history from './pages/history.js';
import settings from './pages/settings.js';
import optimize from './pages/optimize.js';
import wsettings from './pages/wsettings.js';

const PAGES = [overview, cleaner, registry, optimize, startup, programs, updates, disk, duplicates, wsettings, tools, history, settings];
const NAV = [
  {label: null, items: ['overview']},
  {label: 'Clean', items: ['cleaner', 'registry']},
  {label: 'Speed up', items: ['optimize', 'startup']},
  {label: 'Manage', items: ['programs', 'updates']},
  {label: 'Storage', items: ['disk', 'duplicates']},
  {label: 'System', items: ['wsettings', 'tools', 'history']}
];
const byId = Object.fromEntries(PAGES.map(p => [p.id, p]));
let current = null;

export function navigate(id) {
  if (!byId[id]) id = 'overview';
  if (location.hash !== `#/${id}`) location.hash = `#/${id}`;
  else show(id);
}
window.asterNavigate = navigate;

function show(id) {
  const page = byId[id] || overview;
  if (current === page) return;
  current?.unmount();
  current = page;
  renderNav();
  document.getElementById('crumb').textContent = page.title;
  const el = document.getElementById('page');
  el.className = 'page';
  void el.offsetWidth; // restart the entrance animation
  document.querySelector('.content').scrollTop = 0;
  page.mount(el);
}

function navItem(id) {
  const p = byId[id];
  const badge = p.badge?.();
  return html`<button class="nav-item ${current === p ? 'active' : ''}" data-nav="${id}">${ic(p.icon, 18)}<span>${p.title}</span>${badge ? html`<span class="badge ${badge.tone || ''}">${badge.text}</span>` : ''}</button>`;
}

export function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = str(html`${NAV.map(g => html`<div class="nav-group">${g.label ? html`<div class="nav-label">${g.label}</div>` : ''}${g.items.map(navItem)}</div>`)}`);
  const foot = document.getElementById('sidebar-foot');
  const s = app.system;
  foot.innerHTML = str(html`
    ${isMac ? (s && s.fda === false ? html`<button class="admin-chip" data-relaunch style="cursor:pointer;text-align:left">${ic('lock', 18)}<div><strong>Limited access</strong><span class="faint">Allow Full Disk Access for Safari, Mail & Trash</span></div></button>`
        : s ? html`<div class="admin-chip ok">${ic('shield', 18)}<div><strong>Full Disk Access</strong><span class="faint">Aster can clean everything</span></div></div>` : '')
      : s && !s.admin ? html`<button class="admin-chip" data-relaunch style="cursor:pointer;text-align:left">${ic('shield', 18)}<div><strong>Standard mode</strong><span class="faint">Restart as admin for system areas</span></div></button>`
      : s ? html`<div class="admin-chip ok">${ic('shield', 18)}<div><strong>Administrator</strong><span class="faint">Full access enabled</span></div></div>` : ''}
    ${navItem('settings')}`);
}
window.asterRenderNav = renderNav;

export async function relaunchAsAdmin() {
  if (isMac) {
    const {ok} = await modal({title: 'Allow Full Disk Access?', icon: 'lock', confirm: 'Open System Settings', body: html`<p>macOS protects some folders — Safari, Mail, the Trash and other apps’ data — even from you. To clean them, allow Aster in <strong>System Settings → Privacy & Security → Full Disk Access</strong>.</p><ol style="margin:10px 0 0;padding-left:18px"><li>Click the <strong>+</strong> button (or switch on Aster if it is listed).</li><li>Choose Aster from Applications.</li><li>Quit and reopen Aster.</li></ol><p class="faint" style="margin-top:10px">Aster never reads your documents or messages; access is only used for cleaning.</p>`});
    if (ok) api('system.openFullDiskAccess');
    return;
  }
  const {ok} = await modal({title: 'Restart as administrator?', icon: 'shield', body: 'Aster will close and reopen with administrator rights so it can clean system folders, fix machine-wide registry entries and manage services. Windows will ask for permission.', confirm: 'Restart'});
  if (!ok) return;
  try { await api('system.relaunchAdmin'); } catch (e) { fail(e); }
}
window.asterRelaunch = relaunchAsAdmin;

export function applyTheme(theme) {
  try { localStorage.setItem('aster-theme', theme); } catch {}
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
window.asterApplyTheme = applyTheme;

async function boot() {
  document.getElementById('app').innerHTML = str(html`
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><span id="logo"></span><span class="brand-name">Aster</span><span class="brand-tag" id="brand-tag"></span></div>
        <nav class="nav" id="nav"></nav>
        <div class="sidebar-foot" id="sidebar-foot"></div>
      </aside>
      <div class="main">
        <header class="topbar"><div class="crumbs">Aster ${ic('chevronRight', 14)} <strong id="crumb"></strong></div></header>
        <main class="content" id="main"><div class="page" id="page"></div></main>
      </div>
    </div>
    ${demo ? html`<div class="demo-banner">Preview mode · sample data, no changes are made</div>` : ''}`);
  document.getElementById('logo').innerHTML = logo(28);
  document.querySelector('.sidebar').addEventListener('click', e => {
    const n = e.target.closest('[data-nav]');
    if (n) navigate(n.dataset.nav);
    if (e.target.closest('[data-relaunch]')) relaunchAsAdmin();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(app.settings?.theme || 'system'));
  window.addEventListener('hashchange', () => show(location.hash.replace('#/', '')));
  app.listeners.add(renderNav);

  try {
    const [settingsData, info] = await Promise.all([api('settings.get'), api('app.info')]);
    setApp({settings: settingsData, info});
    applyTheme(settingsData.theme);
    document.getElementById('brand-tag').textContent = String(info.version || '').split('.').slice(0, 2).join('.');
  } catch (e) { fail(e); }
  show(location.hash.replace('#/', '') || 'overview');
  api('system.info').then(system => setApp({system})).catch(fail);
}

boot();
export {toast};
