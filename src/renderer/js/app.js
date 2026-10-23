import {html, str, ic, api, app, setApp, demo, fail, toast, modal, isMac, t, th} from './lib.js';
import {setLanguage, onLanguageChange} from './i18n.js';
import {logo} from './icons.js';
import overview from './pages/overview.js';
import cleaner from './pages/cleaner.js';
import registry from './pages/registry.js';
import programs from './pages/programs.js';
import startup from './pages/startup.js';
import updates from './pages/updates.js';
import disk from './pages/disk.js';
import duplicates from './pages/duplicates.js';
import emptyFolders from './pages/empty.js';
import whatsnew from './pages/whatsnew.js';
import tools from './pages/tools.js';
import history from './pages/history.js';
import settings from './pages/settings.js';
import optimize from './pages/optimize.js';
import wsettings from './pages/wsettings.js';

const PAGES = [overview, cleaner, registry, optimize, startup, programs, updates, disk, duplicates, emptyFolders, wsettings, tools, history, whatsnew, settings];
const NAV = [
  {label: null, items: ['overview']},
  {label: 'nav.clean', items: ['cleaner', 'registry']},
  {label: 'nav.speedUp', items: ['optimize', 'startup']},
  {label: 'nav.manage', items: ['programs', 'updates']},
  {label: 'nav.storage', items: ['disk', 'duplicates', 'empty']},
  {label: 'nav.system', items: ['wsettings', 'tools', 'history', 'whatsnew']}
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
  return html`<button class="nav-item ${current === p ? 'active' : ''}" data-nav="${id}" title="${p.title}">${ic(p.icon, 18)}<span>${p.title}</span>${badge ? html`<span class="badge ${badge.tone || ''}">${badge.text}</span>` : ''}</button>`;
}

export function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = str(html`${NAV.map(g => html`<div class="nav-group">${g.label ? html`<div class="nav-label">${t(g.label)}</div>` : ''}${g.items.map(navItem)}</div>`)}`);
  const foot = document.getElementById('sidebar-foot');
  const s = app.system;
  foot.innerHTML = str(html`
    ${isMac ? (s && s.fda === false ? html`<button class="admin-chip" data-relaunch style="cursor:pointer;text-align:left">${ic('lock', 18)}<div><strong>${t('app.limitedAccess')}</strong><span class="faint">${t('app.limitedAccessHint')}</span></div></button>`
        : s ? html`<div class="admin-chip ok">${ic('shield', 18)}<div><strong>${t('app.fullDiskAccess')}</strong><span class="faint">${t('app.fullDiskAccessHint')}</span></div></div>` : '')
      : s && !s.admin ? html`<button class="admin-chip" data-relaunch style="cursor:pointer;text-align:left">${ic('shield', 18)}<div><strong>${t('app.standardMode')}</strong><span class="faint">${t('app.standardModeHint')}</span></div></button>`
      : s ? html`<div class="admin-chip ok">${ic('shield', 18)}<div><strong>${t('app.administrator')}</strong><span class="faint">${t('app.administratorHint')}</span></div></div>` : ''}
    ${navItem('settings')}`);
}
window.asterRenderNav = renderNav;

export async function relaunchAsAdmin() {
  if (isMac) {
    const {ok} = await modal({title: t('app.fdaTitle'), icon: 'lock', confirm: t('app.fdaConfirm'), body: th('app.fdaBody')});
    if (ok) api('system.openFullDiskAccess');
    return;
  }
  const {ok} = await modal({title: t('app.adminTitle'), icon: 'shield', body: t('app.adminBody'), confirm: t('app.adminConfirm')});
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

// Static text of the window frame; pages render their own text.
function paintChrome() {
  const banner = document.getElementById('demo-banner');
  if (banner) banner.textContent = t('app.demoBanner');
  if (current) document.getElementById('crumb').textContent = current.title;
}

// Switching the language re-renders everything at once: the frame, the sidebar and the current page.
// Cached data from the main process (rules, categories, tweaks…) is reset by its owners through onLanguageChange,
// and the page is mounted again so it reloads that data in the new language.
onLanguageChange(() => {
  paintChrome();
  renderNav();
  if (current) { const page = current; page.unmount(); page.mount(document.getElementById('page')); }
});

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
    ${demo ? html`<div class="demo-banner" id="demo-banner"></div>` : ''}`);
  document.getElementById('logo').innerHTML = logo(28);
  document.querySelector('.sidebar').addEventListener('click', e => {
    const n = e.target.closest('[data-nav]');
    if (n) navigate(n.dataset.nav);
    if (e.target.closest('[data-relaunch]')) relaunchAsAdmin();
  });
  paintChrome();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(app.settings?.theme || 'system'));
  window.addEventListener('hashchange', () => show(location.hash.replace('#/', '')));
  app.listeners.add(renderNav);

  try {
    const [settingsData, info] = await Promise.all([api('settings.get'), api('app.info')]);
    setLanguage(settingsData.language);
    paintChrome();
    setApp({settings: settingsData, info});
    applyTheme(settingsData.theme);
    document.getElementById('brand-tag').textContent = String(info.version || '').split('.').slice(0, 2).join('.');
  } catch (e) { fail(e); }
  show(location.hash.replace('#/', '') || 'overview');
  api('system.info').then(system => setApp({system})).catch(fail);
}

boot();
export {toast};
