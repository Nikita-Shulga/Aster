import {html, ic, api, app, modal, toast, avatar, checkbox, fixIndeterminate, isMac, t, th, ago} from './lib.js';
import {chip, search as searchBox, filterHandlers, countOptions, resultLine} from './filters.js';

// "Fix search" card on the Tools page. Windows Search finds apps only through Start menu shortcuts and files only
// while its indexer runs; Spotlight the same with its own index. The main process checks those pieces and lists
// apps search can't see; this card explains each finding in plain words and offers the fix next to it.
const DEFAULT_FILTERS = {search: '', drive: 'all'};
const sd = {result: null, busy: null, sel: new Set(), f: structuredClone(DEFAULT_FILTERS)};
const os = () => isMac ? 'Mac' : 'Win';

const matches = (a, skip) => {
  const q = sd.f.search.trim().toLowerCase();
  return (skip === 'drive' || sd.f.drive === 'all' || a.drive === sd.f.drive) &&
    (!q || [a.name, a.exe, a.company].some(x => String(x || '').toLowerCase().includes(q)));
};

function statusRow({ok, title, text, action = ''}) {
  return html`<div class="list-row sd-row">
    <span class="sd-status ${ok ? 'ok' : 'bad'}">${ic(ok ? 'check' : 'alert', 15)}</span>
    <div class="grow"><div class="sd-t">${title}</div><div class="meta">${text}</div></div>
    ${action}
  </div>`;
}

function appsList(r) {
  const shown = r.apps.filter(a => matches(a));
  const picked = shown.filter(a => sd.sel.has(a.id)).length;
  const drives = isMac ? [] : countOptions(r.apps.filter(a => matches(a, 'drive')), a => a.drive, {sort: 'alpha'});
  const bar = r.apps.length > 6 ? html`<div class="filterbar sd-bar">
    ${searchBox(sd.f.search, t('search.filter'), 200)}
    ${drives.length > 1 ? chip('drive', t('search.drive'), drives, sd.f.drive) : ''}
  </div>${resultLine(shown.length, r.apps.length, sd.f)}` : '';
  return html`<div class="sd-apps">
    ${bar}
    <label class="list-row sd-all">${checkbox('data-change="sdAll"', picked && picked === shown.length, picked > 0 && picked < shown.length)}<span class="grow muted">${t('search.selectAll', {count: shown.length})}</span></label>
    ${shown.map(a => html`<label class="list-row sd-app">
      ${checkbox(`data-change="sdPick" data-id="${a.id}"`, sd.sel.has(a.id))}
      ${avatar(a.name, a.icon, 28)}
      <div class="grow"><div class="sd-t">${a.name}
        ${a.older ? html`<span class="badge" title="${t('search.olderHint')}">${t('search.older')}</span>` : ''}
        ${!a.likely && !a.older ? html`<span class="badge amber" title="${t('search.unsureHint')}">${t('search.unsure')}</span>` : ''}</div>
        <div class="meta truncate" title="${a.exe}">${a.company ? `${a.company} · ` : ''}<span class="sd-path">${a.exe}</span></div></div>
      <button class="btn btn-ghost btn-sm" data-action="sdReveal" data-path="${a.exe}" title="${t(isMac ? 'search.revealMac' : 'search.revealWin')}">${ic('folder', 14)}</button>
    </label>`)}
    <div class="sd-foot">
      <div class="faint grow">${t(`search.addNote${os()}`)}</div>
      <button class="btn btn-primary" data-action="sdAdd" ${!sd.sel.size || sd.busy ? 'disabled' : ''}>${sd.busy === 'add' ? html`<span class="spinner"></span>` : ic('plus', 16)} ${sd.sel.size ? t(`search.add${os()}`, {count: sd.sel.size}) : t('search.pickFirst')}</button>
    </div>
  </div>`;
}

function results(r) {
  const busyFix = id => sd.busy === `fix:${id}`;
  const fixBtn = (id, label, primary = false) => html`<button class="btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="sdFix" data-id="${id}" ${sd.busy ? 'disabled' : ''}>${busyFix(id) ? html`<span class="spinner"></span>` : ''}${label}${!isMac && !r.admin && id !== 'restart' ? html` ${ic('shield', 13)}` : ''}</button>`;
  const problems = [!r.service.ok, r.service.ok && !r.index.ok, !isMac && r.service.ok && r.index.ok && !r.startMenu.ok, r.apps.length > 0].filter(Boolean).length;
  return html`
    <div class="callout ${problems ? 'amber' : 'green'} sd-summary">${ic(problems ? 'alert' : 'check', 16)}<div class="grow">
      <strong>${problems ? t('search.problems', {count: problems}) : t(`search.healthy${os()}`)}</strong>
      <div>${problems ? t('search.problemsText') : t(`search.healthyText${os()}`)}</div></div></div>
    <div class="sd-list">
      ${statusRow(r.service.ok
        ? {ok: true, title: t(`search.service${os()}`), text: t(`search.serviceOk${os()}`)}
        : {ok: false, title: t(`search.service${os()}`), text: t(r.service.disabled ? `search.serviceOff${os()}` : 'search.serviceStopped'), action: fixBtn('service', t(`search.turnOn${os()}`), true)})}
      ${r.service.ok ? statusRow(r.index.ok
        ? {ok: true, title: t('search.index'), text: t(`search.indexOk${os()}`)}
        : {ok: false, title: t('search.index'), text: t(`search.indexBad${os()}`), action: fixBtn('rebuild', t('search.rebuild'), true)}) : ''}
      ${!isMac && r.service.ok && r.index.ok ? statusRow(r.startMenu.ok
        ? {ok: true, title: t('search.startMenu'), text: t('search.startMenuOk', {count: r.startMenu.shortcuts})}
        : {ok: false, title: t('search.startMenu'), text: t('search.startMenuBad'), action: fixBtn('rebuild', t('search.rebuild'), true)}) : ''}
      ${statusRow(r.apps.length
        ? {ok: false, title: t(`search.apps${os()}`), text: t(`search.appsBad${os()}`, {count: r.apps.length})}
        : {ok: true, title: t(`search.apps${os()}`), text: t(`search.appsOk${os()}`)})}
    </div>
    ${r.apps.length ? appsList(r) : ''}
    ${r.added.length ? html`<div class="callout sd-added">${ic('info', 16)}<div class="grow">${t('search.added', {count: r.added.length})}<div class="faint">${r.added.map(a => a.name).join(', ')}</div></div>
      <button class="btn btn-secondary btn-sm" data-action="sdRemoveAdded" ${sd.busy ? 'disabled' : ''}>${t('search.removeAdded')}</button></div>` : ''}
    <div class="sd-more">
      <div class="sd-more-item"><div class="grow"><div class="sd-t">${t(`search.restart${os()}`)}</div><div class="meta">${t(`search.restartText${os()}`)}</div></div>${fixBtn('restart', t('search.restartBtn'))}</div>
      <div class="sd-more-item"><div class="grow"><div class="sd-t">${t('search.rebuild')} ${!isMac && !r.admin ? html`<span class="badge">${t('tools.badge.admin')}</span>` : isMac ? html`<span class="badge">${t('tools.badge.password')}</span>` : ''}</div><div class="meta">${t(`search.rebuildText${os()}`)}</div></div>${fixBtn('rebuild', t('search.rebuildBtn'))}</div>
    </div>
    <div class="faint sd-when">${t('search.checked', {when: ago(r.checkedAt)})}</div>`;
}

export function searchCard() {
  const r = sd.result;
  const checking = sd.busy === 'check';
  return html`<div class="card sd" style="margin-bottom:16px">
    <div class="card-head">
      <div class="tile accent" style="width:36px;height:36px">${ic('search', 18)}</div>
      <div class="grow"><h3>${t(`search.title${os()}`)}</h3><div class="sub">${t(`search.subtitle${os()}`)}</div></div>
      <button class="btn ${r ? 'btn-secondary' : 'btn-primary'}" data-action="sdCheck" ${sd.busy ? 'disabled' : ''}>${checking ? html`<span class="spinner"></span>` : ic(r ? 'refresh' : 'search', 16)} ${t(r ? 'search.checkAgain' : 'search.check')}</button>
    </div>
    <div class="card-pad">
      ${checking && !r ? html`<div class="row muted"><span class="spinner"></span> ${t(`search.checking${os()}`)}</div>`
        : r ? results(r)
        : html`<ul class="sd-intro">
            <li>${th(`search.intro1${os()}`)}</li>
            <li>${th(`search.intro2${os()}`)}</li>
            <li>${th(`search.intro3${os()}`)}</li>
          </ul>`}
    </div>
  </div>`;
}

async function check(page, {quiet = false} = {}) {
  sd.busy = 'check'; page.update();
  try {
    sd.result = await api('search.check');
    // A few clear apps are ticked for one click; a long list (often an old Windows on another drive) is left for the
    // user to pick from, so Start doesn't fill up with programs they never open.
    const likely = sd.result.apps.filter(a => a.likely);
    sd.sel = new Set(likely.length <= 10 ? likely.map(a => a.id) : []);
  } finally { sd.busy = null; page.update(); }
  if (!quiet && !sd.result.apps.length && sd.result.service.ok && sd.result.index.ok) toast(t(`search.healthy${os()}`), {type: 'success'});
}

export const searchHandlers = {
  ...filterHandlers(() => sd.f, DEFAULT_FILTERS),
  sdCheck() { return check(this); },
  sdPick(el) { el.checked ? sd.sel.add(el.dataset.id) : sd.sel.delete(el.dataset.id); this.update(); },
  sdAll(el) { for (const a of sd.result.apps.filter(x => matches(x))) el.checked ? sd.sel.add(a.id) : sd.sel.delete(a.id); this.update(); },
  sdReveal(el, e) { e?.preventDefault(); return api('shell.reveal', {path: el.dataset.path}); },
  async sdAdd() {
    const ids = [...sd.sel];
    const names = sd.result.apps.filter(a => sd.sel.has(a.id)).map(a => a.name);
    const {ok} = await modal({title: t(`search.addTitle${os()}`, {count: ids.length}), icon: 'plus', confirm: t(`search.add${os()}`, {count: ids.length}), body: html`
      <p>${t(`search.addBody${os()}`)}</p><p class="faint" style="margin-top:8px">${names.join(', ')}</p>`});
    if (!ok) return;
    sd.busy = 'add'; this.update();
    try {
      const res = await api('search.addApps', {ids});
      toast(t(`search.addedToast${os()}`, {count: res.added}), {type: 'success'});
    } finally { sd.busy = null; }
    await check(this, {quiet: true});
  },
  async sdRemoveAdded() {
    const {ok} = await modal({title: t('search.removeTitle', {count: sd.result.added.length}), icon: 'trash', confirm: t('search.removeAdded'), body: t('search.removeBody')});
    if (!ok) return;
    sd.busy = 'remove'; this.update();
    try { const res = await api('search.removeAdded'); toast(t('search.removedToast', {count: res.removed}), {type: 'success'}); }
    finally { sd.busy = null; }
    await check(this, {quiet: true});
  },
  async sdFix(el) {
    const id = el.dataset.id;
    if (id !== 'restart') {
      const {ok} = await modal({title: t(`search.fix.${id}.title${os()}`), icon: id === 'rebuild' ? 'refresh' : 'power', confirm: t(`search.fix.${id}.confirm${os()}`), body: html`
        <p>${t(`search.fix.${id}.body${os()}`)}</p>
        ${isMac ? html`<p class="faint" style="margin-top:8px">${t('search.passwordNote')}</p>` : !app.system?.admin ? html`<p class="faint" style="margin-top:8px">${t('search.uacNote')}</p>` : ''}`});
      if (!ok) return;
    }
    sd.busy = `fix:${id}`; this.update();
    try {
      await api('search.fix', {id});
      toast(t(`search.fix.${id}.done${os()}`), {type: 'success'});
    } finally { sd.busy = null; this.update(); }
    // A rebuilt index starts empty, so checking right away would only report what is still being built.
    if (id !== 'rebuild') await check(this, {quiet: true});
  }
};
