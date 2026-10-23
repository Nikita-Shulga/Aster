import {html, ic, api, app, bytes, checkbox, empty, bar, modal, toast, setApp, VERDICTS, verdictBadge, explain, isMac, previousScan, t, th} from '../lib.js';
import {definePage} from '../page.js';
import {shared, notify, loadRules, usableRule, saveSelection, analyzeCleaner, cleanableBytes, persistCleaner, restoreCleaner} from '../state.js';
import {chip, resultLine, filterHandlers} from '../filters.js';
import {bytes as fmtBytes} from '../lib.js';
import {filesPanel, filesHandlers, filesOpen, resetFiles} from '../cleaner-files.js';

const c = shared.cleaner;
const open = new Set(['windows']);
const openResults = new Set();
const allLocs = new Set();
const DEFAULT_FILTERS = {drive: 'all', verdict: 'all', group: 'all', sort: 'size'};
const cf = structuredClone(DEFAULT_FILTERS);
const bytesOn = r => cf.drive === 'all' ? r.bytes : (r.locations || []).filter(l => l.drive === cf.drive).reduce((n, l) => n + l.bytes, 0);
const filesOn = r => cf.drive === 'all' ? r.files : (r.locations || []).filter(l => l.drive === cf.drive).reduce((n, l) => n + l.files, 0);
const canClean = r => !r.running.length || app.settings?.closeAppsBeforeCleaning;
const APP_ICON = {windows: 'windows', macos: 'monitor'};

function appsOf(group) {
  const map = new Map();
  for (const r of c.rules.filter(r => r.group === group && r.installed)) {
    if (!map.has(r.appId)) map.set(r.appId, {id: r.appId, name: r.app, rules: []});
    map.get(r.appId).rules.push(r);
  }
  return [...map.values()];
}

function appTile(appId, name) {
  if (APP_ICON[appId]) return html`<span class="tile blue" style="width:28px;height:28px;border-radius:8px">${ic(APP_ICON[appId], 16)}</span>`;
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return html`<span class="avatar avatar-letter" style="--h:${h};width:28px;height:28px">${name[0]}</span>`;
}

function ruleTree() {
  return c.groups.map(g => {
    const apps = appsOf(g.id);
    if (!apps.length) return '';
    return html`
      <div class="rule-group-title">${g.name}</div>
      ${apps.map(a => {
        const usable = a.rules.filter(usableRule);
        const on = usable.filter(r => c.selected.has(r.id)).length;
        const key = a.id;
        return html`<div class="rule-app ${open.has(key) ? 'open' : ''}">
          <div class="rule-app-head" data-action="toggleApp" data-app="${key}">
            ${ic('chevronRight', 14, 'chev')}
            ${checkbox(`data-change="selectApp" data-app="${key}" aria-label="${t('cleaner.selectApp', {app: a.name})}" ${usable.length ? '' : 'disabled'}`, usable.length && on === usable.length, on > 0 && on < usable.length)}
            ${appTile(a.id, a.name)}
            <span class="name truncate">${a.name}</span>
            <span class="faint" style="font-size:12px">${on}/${a.rules.length}</span>
          </div>
          <div class="rule-list">
            ${a.rules.map(r => {
              const locked = (r.admin && !app.system?.admin) || (r.fda && app.system?.fda === false);
              const v = VERDICTS[r.verdict] || VERDICTS.safe;
              return html`<label class="rule" title="${locked ? t(isMac ? 'cleaner.rule.needsFda' : 'cleaner.rule.needsAdmin', {verdict: v.label}) : v.label}">
                ${checkbox(`data-change="selectRule" data-id="${r.id}" ${locked ? 'disabled' : ''}`, !locked && c.selected.has(r.id))}
                <span class="vdot ${v.tone}"></span>
                <span class="grow truncate">${r.name}</span>
                ${locked ? ic('lock', 14, 'lock') : ''}
                <button class="icon-btn sm" data-action="ruleInfo" data-id="${r.id}" title="${t('cleaner.rule.info')}" aria-label="${t('cleaner.rule.infoAbout', {name: r.name})}">${ic('info', 14)}</button>
              </label>`;
            })}
          </div>
        </div>`;
      })}`;
  });
}

function progressCard(title) {
  const p = c.progress || {};
  const ratio = p.total ? (p.index / p.total) * 100 : 0;
  return html`<div class="card card-pad">
    <div class="row" style="gap:14px;margin-bottom:16px">
      <div class="tile">${html`<span class="spinner"></span>`}</div>
      <div class="grow"><div class="card-title">${title}</div><div class="muted truncate">${p.label || t('cleaner.progress.preparing')}</div></div>
      <span class="faint num">${p.total ? `${Math.min(p.index + 1, p.total)} / ${p.total}` : ''}</span>
      <button class="btn btn-secondary btn-sm" data-action="cancel">${t('common.cancel')}</button>
    </div>
    <div class="progress"><div style="width:${ratio}%"></div></div>
  </div>`;
}

function results() {
  const a = c.analysis;
  const byId = new Map(c.rules.map(r => [r.id, r]));
  const all = a.results.filter(r => r.bytes > 0 || r.running.length);
  const ruleOf = r => byId.get(r.id);
  const match = (r, skip) => (skip === 'drive' || cf.drive === 'all' || bytesOn(r) > 0) && (skip === 'verdict' || cf.verdict === 'all' || ruleOf(r).verdict === cf.verdict) && (skip === 'group' || cf.group === 'all' || ruleOf(r).group === cf.group);
  const sorters = {size: (x, y) => bytesOn(y) - bytesOn(x), name: (x, y) => `${ruleOf(x).app} ${ruleOf(x).name}`.localeCompare(`${ruleOf(y).app} ${ruleOf(y).name}`), files: (x, y) => filesOn(y) - filesOn(x)};
  const rows = all.filter(r => match(r)).sort(sorters[cf.sort]);
  const max = Math.max(1, ...rows.map(bytesOn));
  const running = [...new Set(rows.flatMap(r => r.running.length ? [ruleOf(r)?.app] : []))].filter(Boolean);
  const cleanable = rows.filter(canClean).reduce((n, r) => n + bytesOn(r), 0);
  const driveTotals = new Map();
  for (const r of all.filter(r => match(r, 'drive'))) for (const l of r.locations || []) driveTotals.set(l.drive, (driveTotals.get(l.drive) || 0) + l.bytes);
  const filtered = cf.drive !== 'all' || cf.verdict !== 'all' || cf.group !== 'all';
  const VERD = [{value: 'safe', label: t('verdict.safe')}, {value: 'review', label: t('verdict.review.short')}, {value: 'keep', label: t('verdict.keep')}];
  const fileCount = rows.reduce((n, r) => n + filesOn(r), 0);
  return html`
    ${c.restored ? previousScan(a.at, {action: null, label: t('cleaner.analyzeAgain')}) : ''}
    <div class="card cleaner-summary">
      <div class="tile green" style="width:52px;height:52px;border-radius:14px">${ic('sparkles', 26)}</div>
      <div class="grow">
        <div class="big num">${bytes(cleanable)}</div>
        <div class="label">${cf.drive !== 'all' ? t('cleaner.summary.freeOn', {drive: cf.drive}) : t('cleaner.summary.free')} · ${t('cleaner.files', {count: fileCount})} ${t(filtered ? 'cleaner.summary.inItemsShown' : 'cleaner.summary.inItems', {count: rows.length})}</div>
      </div>
      <button class="btn btn-secondary" data-action="analyze">${ic('refresh', 16)} ${t('cleaner.analyzeAgain')}</button>
      <button class="btn btn-primary btn-lg" data-action="clean" ${cleanable ? '' : 'disabled'}>${ic('broom', 18)} ${filtered ? t('cleaner.cleanShown') : t('cleaner.cleanNow')}</button>
    </div>
    ${running.length ? html`<div class="callout amber" style="margin-top:12px">${ic('alert', 18)}<div class="grow">${th(running.length === 1 ? 'cleaner.running.one' : 'cleaner.running.many', {apps: running.join(', ')})}</div>
      <label class="row" style="white-space:nowrap;cursor:pointer"><input type="checkbox" class="switch" data-change="autoClose" ${app.settings?.closeAppsBeforeCleaning ? 'checked' : ''}> ${t('cleaner.autoClose')}</label></div>` : ''}
    <div class="toolbar filterbar" style="margin:12px 0 0">
      ${chip('drive', t('cleaner.filter.drive'), [...driveTotals.entries()].sort().map(([d, b]) => ({value: d, label: `${d} — ${fmtBytes(b)}`})), cf.drive, {allLabel: t('cleaner.filter.allDrives')})}
      ${chip('verdict', t('cleaner.filter.verdict'), VERD.map(o => ({...o, count: all.filter(r => match(r, 'verdict') && ruleOf(r).verdict === o.value).length})), cf.verdict)}
      ${chip('group', t('cleaner.filter.category'), c.groups.map(g => ({value: g.id, label: g.name, count: all.filter(r => match(r, 'group') && ruleOf(r).group === g.id).length})), cf.group)}
      <span class="spacer"></span>
      ${chip('sort', t('cleaner.filter.sort'), [{value: 'name', label: t('cleaner.filter.byName')}, {value: 'files', label: t('cleaner.filter.byFiles')}], cf.sort === 'size' ? 'all' : cf.sort, {allLabel: t('cleaner.filter.largest')})}
    </div>
    ${filtered ? html`<div class="filter-result" style="padding:8px 2px 0"><span>${th(cf.drive !== 'all' ? 'cleaner.showingDrive' : 'cleaner.showing', {shown: rows.length, total: all.length, count: all.length, drive: cf.drive})}</span><button class="linkish" data-action="clearFilters">${t('filters.clear')}</button></div>` : ''}
    <div class="card" style="margin-top:12px">
      ${rows.length ? html`<div class="list">${rows.map(r => {
        const rule = byId.get(r.id);
        const locs = (r.locations || []).filter(l => cf.drive === 'all' || l.drive === cf.drive);
        return html`<div class="result-item ${openResults.has(r.id) ? 'open' : ''}">
          <div class="list-row clickable result-row" data-action="toggleResult" data-id="${r.id}">
            ${appTile(rule.appId, rule.app)}
            <div class="grow"><div class="row" style="gap:8px"><span style="font-weight:500">${rule.app} · ${rule.name}</span>${verdictBadge(rule.verdict)}</div><div class="meta">${t('cleaner.files', {count: r.files})} · ${[...new Set((r.locations || []).map(l => l.drive))].join(', ') || '—'}${r.running.length ? html` · <span style="color:var(--amber-text)">${t('cleaner.appRunning', {app: rule.app})}</span>` : ''}</div></div>
            ${bar(bytesOn(r) / max * 100, r.running.length ? 'amber' : 'accent')}
            <span class="size">${bytes(bytesOn(r))}</span>
            ${ic('chevronDown', 16, 'faint')}
          </div>
          <div class="detail-panel">
            ${explain(rule)}
            <div style="margin-top:14px;font-size:12.5px;font-weight:600;color:var(--text-2)">${t('cleaner.whereStored')}</div>
            <table class="loc-table selectable">${(allLocs.has(r.id) ? locs : locs.slice(0, 10)).map(l => html`<tr>
              <td style="width:1%"><span class="drive-b">${l.drive}</span></td>
              <td><div style="font-weight:500">${l.label}</div><div class="p">${l.path}</div></td>
              <td class="num faint" style="white-space:nowrap;text-align:right">${t('cleaner.files', {count: l.files})}</td>
              <td class="num" style="white-space:nowrap;text-align:right;font-weight:600">${bytes(l.bytes)}</td>
              <td style="width:32px"><button class="icon-btn sm" data-action="openLoc" data-path="${l.path}" title="${t(isMac ? 'cleaner.showInFinder' : 'cleaner.openInExplorer')}">${ic('external', 14)}</button></td>
              ${(r.locations || []).length > 1 ? html`<td style="width:32px"><button class="icon-btn sm" data-action="cleanLoc" data-id="${r.id}" data-path="${l.path}" title="${t('cleaner.cleanLocation')}" aria-label="${t('cleaner.cleanOnly', {label: l.label})}" ${canClean(r) ? '' : 'disabled'}>${ic('broom', 14)}</button></td>` : ''}
            </tr>`)}</table>
            ${locs.length > 10 && !allLocs.has(r.id) ? html`<div style="margin-top:6px"><button class="linkish" data-action="moreLocs" data-id="${r.id}">${t('cleaner.allLocations', {count: locs.length})}</button></div>` : ''}
            <div style="margin-top:12px"><button class="btn btn-secondary btn-sm" data-action="toggleFiles" data-id="${r.id}">${ic(filesOpen(r.id) ? 'chevronDown' : 'list', 14)} ${t(filesOpen(r.id) ? 'cleaner.fb.hide' : 'cleaner.fb.show', {count: r.files})}</button></div>
            ${filesPanel(r, rule)}
          </div>
        </div>`;
      })}</div>` : empty({iconName: 'check', title: t('cleaner.empty.title'), text: t('cleaner.empty.text')})}
    </div>`;
}

function done() {
  const d = c.lastClean;
  const text = [t('cleaner.done.removed', {count: d.deleted}), d.skipped ? t('cleaner.done.skipped', {count: d.skipped}) : '', d.blocked ? t('cleaner.done.blocked', {apps: d.blocked}) : ''].filter(Boolean).join(' ');
  return html`<div class="card">${empty({iconName: 'check', title: t('cleaner.freed', {size: bytes(d.freed)}), text, action: html`<button class="btn btn-secondary" data-action="reset">${t('common.done')}</button>`})}</div>`;
}

function rightPane() {
  if (c.phase === 'analyzing') return progressCard(t('cleaner.progress.analyzing'));
  if (c.phase === 'cleaning') return progressCard(t('cleaner.progress.cleaning'));
  if (c.lastClean) return done();
  if (c.analysis) return results();
  const count = c.rules.filter(r => c.selected.has(r.id) && usableRule(r)).length;
  return html`<div class="card">${empty({iconName: 'sparkles', title: t('cleaner.start.title'), text: t('cleaner.start.text', {count}), action: html`<button class="btn btn-primary btn-lg" data-action="analyze" ${count ? '' : 'disabled'}>${ic('search', 18)} ${t('cleaner.analyze')}</button>`})}</div>`;
}

export default definePage({
  id: 'cleaner', get title() { return t('page.cleaner'); }, icon: 'sparkles',
  badge: () => c.phase === 'analyzed' && cleanableBytes() > 50 * 1024 ** 2 ? {text: bytes(cleanableBytes(), 1), tone: 'accent'} : null,
  view() {
    if (!c.rules) return html`<div class="page-head"><div class="titles"><h1>${t('page.cleaner')}</h1></div></div><div class="card card-pad"><div class="skeleton" style="height:240px"></div></div>`;
    const lockedCount = c.rules.filter(r => r.installed && ((r.admin && !app.system?.admin) || (r.fda && app.system?.fda === false))).length;
    return html`
      <div class="page-head">
        <div class="titles"><h1>${t('page.cleaner')}</h1><p>${t('cleaner.intro')}</p></div>
      </div>
      ${lockedCount && app.system ? html`<div class="callout blue" style="margin-bottom:16px">${ic('shield', 18)}<div class="grow">${t(isMac ? 'cleaner.locked.fda' : 'cleaner.locked.admin', {count: lockedCount})}</div><button class="btn btn-sm btn-secondary" data-action="relaunch">${t(isMac ? 'cleaner.locked.allow' : 'cleaner.locked.restart')}</button></div>` : ''}
      <div class="cleaner-layout">
        <div class="card rules">
          <div class="card-head"><h3 class="grow">${t('cleaner.rules.title')}</h3><button class="btn btn-ghost btn-sm" data-action="defaults">${t('cleaner.rules.defaults')}</button></div>
          <div class="rules-scroll">${ruleTree()}</div>
        </div>
        <div>${rightPane()}</div>
      </div>`;
  },
  onMount() {
    this.listener = () => this.update();
    shared.listeners.add(this.listener);
    loadRules().then(() => this.update()).then(() => restoreCleaner()).catch(() => {});
  },
  onUnmount() { shared.listeners.delete(this.listener); },
  on: {
    toggleApp(el, e) { if (e.target.closest('input')) return; const k = el.dataset.app; open.has(k) ? open.delete(k) : open.add(k); this.update(); },
    selectApp(el) {
      const rules = c.rules.filter(r => r.appId === el.dataset.app && usableRule(r));
      rules.forEach(r => el.checked ? c.selected.add(r.id) : c.selected.delete(r.id));
      c.analysis = null; saveSelection(); this.update();
    },
    selectRule(el) { el.checked ? c.selected.add(el.dataset.id) : c.selected.delete(el.dataset.id); c.analysis = null; saveSelection(); this.update(); },
    ...filterHandlers(() => cf, DEFAULT_FILTERS),
    ...filesHandlers,
    filter(el) { cf[el.dataset.key] = el.dataset.key === 'sort' && el.value === 'all' ? 'size' : el.value; this.update(); },
    defaults() { c.selected = new Set(c.rules.filter(r => r.defaultOn).map(r => r.id)); c.analysis = null; saveSelection(); this.update(); },
    ruleInfo(el, e) {
      e.preventDefault();
      const r = c.rules.find(x => x.id === el.dataset.id);
      modal({title: `${r.app} · ${r.name}`, icon: VERDICTS[r.verdict]?.icon || 'info', cancel: null, confirm: t('cleaner.gotIt'), wide: true, body: explain(r)});
    },
    openLoc(el) { api('shell.reveal', {path: el.dataset.path}); },
    revealFile(el) { api('shell.reveal', {path: el.dataset.path}); },
    moreLocs(el) { allLocs.add(el.dataset.id); this.update(); },
    async cleanLoc(el) {
      const {id, path} = el.dataset;
      const r = c.analysis?.results.find(x => x.id === id);
      const rule = c.rules.find(x => x.id === id);
      const loc = r?.locations.find(l => l.path === path);
      if (!loc) return;
      const {ok} = await modal({title: t('cleaner.cleanLoc.title', {size: bytes(loc.bytes), label: loc.label}), icon: 'broom', confirm: t('cleaner.cleanNow'), body: html`<p>${th('cleaner.cleanLoc.body', {count: loc.files, path: loc.path, rule: `${rule.app} · ${rule.name}`})}</p><p class="muted" style="margin-top:8px">${rule.ifDeleted}</p>`});
      if (!ok) return;
      resetFiles();
      c.phase = 'cleaning'; c.progress = {index: 0, total: 1, label: loc.label}; notify();
      try {
        const res = await api('cleaner.clean', {ids: [id], paths: [path], closeApps: !!app.settings?.closeAppsBeforeCleaning});
        loc.bytes = 0; loc.files = 0;
        r.locations = r.locations.filter(l => l !== loc);
        r.bytes = Math.max(0, r.bytes - res.freed); r.files = Math.max(0, r.files - res.deleted);
        r.sample = r.sample.filter(f => !f.path.startsWith(path));
        persistCleaner();
        toast(res.skipped ? t('cleaner.freedSkipped', {size: bytes(res.freed), count: res.skipped}) : t('cleaner.freed', {size: bytes(res.freed)}), {type: 'success'});
      } finally { c.phase = 'analyzed'; notify(); }
    },
    toggleResult(el) { const id = el.dataset.id; openResults.has(id) ? openResults.delete(id) : openResults.add(id); this.update(); },
    async analyze() { resetFiles(); await analyzeCleaner(); },
    async cancel() { await api('cleaner.cancel'); },
    reset() { c.lastClean = null; c.analysis = null; notify(); },
    relaunch() { window.asterRelaunch(); },
    async autoClose(el) { setApp({settings: await api('settings.update', {closeAppsBeforeCleaning: el.checked})}); this.update(); },
    async clean() {
      const byId = new Map(c.rules.map(r => [r.id, r]));
      const shown = c.analysis.results.filter(r => bytesOn(r) > 0 && (cf.verdict === 'all' || byId.get(r.id).verdict === cf.verdict) && (cf.group === 'all' || byId.get(r.id).group === cf.group));
      const ids = shown.map(r => r.id);
      const drives = cf.drive === 'all' ? null : [cf.drive];
      const shownBytes = shown.filter(canClean).reduce((n, r) => n + bytesOn(r), 0);
      const chosen = c.rules.filter(r => ids.includes(r.id));
      const careful = chosen.filter(r => r.verdict !== 'safe');
      const size = id => bytesOn(c.analysis.results.find(x => x.id === id) || {bytes: 0, locations: []});
      if (app.settings?.confirmBeforeCleaning !== false || careful.length) {
        const {ok} = await modal({
          title: drives ? t('cleaner.confirm.titleDrive', {size: bytes(shownBytes), drive: drives[0]}) : t('cleaner.confirm.title', {size: bytes(shownBytes)}), icon: 'broom', confirm: t('cleaner.cleanNow'), wide: careful.length > 0,
          body: html`<p>${t(isMac ? 'cleaner.confirm.safeMac' : 'cleaner.confirm.safeWin', {count: chosen.length - careful.length})}</p>
            ${careful.length ? html`<div class="callout amber" style="margin-top:12px;display:block"><strong>${t('cleaner.confirm.careful')}</strong>
              <div class="modal-list" style="background:var(--surface)">${careful.map(r => html`<div class="list-row" style="align-items:flex-start;padding:10px 12px">${verdictBadge(r.verdict)}<div class="grow"><div style="font-weight:600;color:var(--text)">${r.app} · ${r.name} <span class="faint num" style="font-weight:400">${bytes(size(r.id))}</span></div><div class="muted">${r.ifDeleted}</div></div></div>`)}</div>
              <div style="margin-top:8px">${t('cleaner.confirm.carefulKeep')}</div></div>` : ''}`
        });
        if (!ok) return;
      }
      resetFiles();
      c.phase = 'cleaning'; c.progress = {index: 0, total: ids.length, label: t('cleaner.progress.starting')}; notify();
      try {
        const r = await api('cleaner.clean', {ids, drives, closeApps: !!app.settings?.closeAppsBeforeCleaning});
        const blocked = r.results.filter(x => x.blocked).map(x => x.blocked);
        // Names of apps that were running (text from the main process); done() adds "— skipped".
        c.lastClean = {...r, blocked: blocked.length ? [...new Set(blocked)].join(', ') : ''};
        c.analysis = null; c.restored = false;
        persistCleaner();
        toast(t('cleaner.freed', {size: bytes(r.freed)}), {type: 'success'});
      } finally { c.phase = 'idle'; notify(); }
    }
  }
});
