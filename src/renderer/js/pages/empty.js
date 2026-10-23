import {html, ic, api, app, bytes, num, date, checkbox, empty, modal, toast, onEvent, isMac, t, th} from '../lib.js';
import {definePage} from '../page.js';
import {chip, countOptions, search as searchBox, filterHandlers, driveOf, baseName, dirName, resultLine} from '../filters.js';

// Empty folders: folders with nothing in them, left by uninstalled apps, unpacked archives or old projects.
// They take no space but clutter File Explorer / Finder. Found folders go to the Recycle Bin / Trash, and only if
// they are still empty at that moment.
const tb = (key, vars) => t(isMac ? `${key}Mac` : key, vars);
const rootOf = d => d.root || `${d.name}\\`;
const MONTH = 30 * 864e5;
const s = {phase: 'idle', roots: null, result: null, selected: new Set(), limit: 200};
const DEFAULT_FILTERS = {search: '', drive: 'all', age: 'all'};
const ef = structuredClone(DEFAULT_FILTERS);
const AGES = [{value: 'month', test: f => Date.now() - f.mtime > MONTH}, {value: 'year', test: f => Date.now() - f.mtime > 12 * MONTH}, {value: 'recent', test: f => Date.now() - f.mtime <= MONTH}];

onEvent(e => {
  if (e.channel !== 'empty' || s.phase !== 'running') return;
  const el = document.getElementById('empty-progress');
  if (!el) return;
  el.innerHTML = `<div class="row" style="gap:28px;margin-bottom:8px"><div class="stat"><span class="k">${t('empty.scanned')}</span><span class="v num">${num(e.dirs)}</span></div><div class="stat"><span class="k">${t('empty.found')}</span><span class="v num">${num(e.found)}</span></div></div>
    <div class="faint truncate mono" style="font-size:11.5px">${String(e.current || '').replace(/[<>&]/g, '')}</div>
    <div class="progress indeterminate" style="margin-top:14px"><div></div></div>`;
});

function match(f, skip) {
  const q = ef.search.trim().toLowerCase();
  return (skip === 'drive' || ef.drive === 'all' || driveOf(f.path) === ef.drive) &&
    (skip === 'age' || ef.age === 'all' || AGES.find(a => a.value === ef.age).test(f)) &&
    (!q || f.path.toLowerCase().includes(q));
}

async function start(page, roots) {
  s.roots = roots; s.phase = 'running'; s.result = null; s.selected.clear(); s.limit = 200; page.update();
  try {
    s.result = await api('disk.emptyFolders', {roots});
    s.phase = 'done';
    // Folders untouched for a month are ticked; newer ones may have just been made by an app that is about to use them.
    for (const f of s.result.folders) if (Date.now() - f.mtime > MONTH) s.selected.add(f.path);
  } catch (e) { s.phase = 'idle'; if (!/cancel|отмен/i.test(e.message)) throw e; }
  finally { page.update(); }
}

export default definePage({
  id: 'empty', get title() { return t('page.empty'); }, icon: 'folder',
  view() {
    const head = html`<div class="page-head">
      <div class="titles"><h1>${t('page.empty')}</h1><p>${tb('empty.intro')}</p></div>
      ${s.result ? html`<div class="actions"><button class="btn btn-secondary" data-action="reset">${ic('folderOpen', 16)} ${t('empty.newSearch')}</button></div>` : ''}
    </div>`;
    if (s.phase === 'running') return html`${head}<div class="card card-pad"><div class="row" style="gap:14px;margin-bottom:18px"><div class="tile"><span class="spinner"></span></div><div class="grow"><div class="card-title">${t('empty.searching')}</div><div class="muted">${t('empty.searchingText')}</div></div><button class="btn btn-secondary btn-sm" data-action="cancel">${t('common.cancel')}</button></div><div id="empty-progress"><div class="skeleton" style="height:48px"></div></div></div>`;
    if (!s.result) {
      const drives = app.system?.drives || [];
      return html`${head}
        <div class="callout" style="margin-bottom:16px">${ic('info', 16)}<div class="grow">${tb('empty.safety')}</div></div>
        <div class="drive-picks">
          <button class="card drive-pick" data-action="home"><div class="row"><div class="tile green">${ic('folder', 18)}</div><div><div style="font-weight:600">${t('empty.home')}</div><div class="faint" style="font-size:12px">${t('empty.homeText')}</div></div></div></button>
          ${drives.map(d => html`<button class="card drive-pick" data-action="go" data-root="${rootOf(d)}"><div class="row"><div class="tile blue">${ic('drive', 18)}</div><div><div style="font-weight:600">${d.label || t('disk.localDisk')} (${d.name})</div><div class="faint" style="font-size:12px">${t('duplicates.used', {size: bytes(d.total - d.free)})}</div></div></div></button>`)}
          <button class="card drive-pick" data-action="choose" style="justify-content:center;align-items:center;border-style:dashed"><div class="tile gray">${ic('folderOpen', 18)}</div><div style="font-weight:500">${t('disk.chooseFolder')}</div></button>
        </div>`;
    }
    const all = s.result.folders;
    if (!all.length) return html`${head}<div class="card">${empty({iconName: 'check', title: t('empty.none'), text: t('empty.noneText', {count: s.result.dirs})})}</div>`;
    const shown = all.filter(f => match(f));
    const picked = all.filter(f => s.selected.has(f.path)).length;
    const shownOn = shown.filter(f => s.selected.has(f.path)).length;
    const drives = countOptions(all.filter(f => match(f, 'drive')), f => driveOf(f.path), {sort: 'alpha'});
    const ages = AGES.map(a => ({value: a.value, label: t(`empty.age.${a.value}`), count: all.filter(f => match(f, 'age') && a.test(f)).length}));
    return html`${head}
      <div class="card cleaner-summary">
        <div class="tile amber" style="width:52px;height:52px;border-radius:14px">${ic('folder', 26)}</div>
        <div class="grow"><div class="big num">${num(all.length)}</div><div class="label">${t('empty.summary', {count: all.length, dirs: num(s.result.dirs)})}</div></div>
      </div>
      <div class="toolbar filterbar" style="margin:12px 0 0">
        ${searchBox(ef.search, t('empty.search'), 220)}
        ${drives.length > 1 ? chip('drive', t('duplicates.drive'), drives, ef.drive) : ''}
        ${chip('age', t('empty.age'), ages, ef.age, {allLabel: t('empty.age.any')})}
      </div>
      ${resultLine(shown.length, all.length, ef)}
      <div class="card" style="margin-top:12px">
        <label class="list-row" style="min-height:44px;background:var(--surface-2);cursor:pointer">${checkbox('data-change="pickAll"', shownOn && shownOn === shown.length, shownOn > 0 && shownOn < shown.length)}<span class="muted grow">${t('empty.selectAll', {count: shown.length})}</span></label>
        ${shown.slice(0, s.limit).map(f => html`<label class="list-row" style="cursor:pointer">
          ${checkbox(`data-change="pick" data-path="${f.path}"`, s.selected.has(f.path))}
          <div class="tile" style="width:30px;height:30px;border-radius:8px">${ic('folder', 15)}</div>
          <div class="grow" style="min-width:0"><div class="row" style="gap:8px"><span class="truncate" style="font-weight:500">${baseName(f.path)}</span>${f.nested ? html`<span class="badge">${t('empty.nested', {count: f.nested})}</span>` : ''}</div>
            <div class="meta truncate mono" title="${f.path}">${dirName(f.path)}</div></div>
          <span class="faint num" style="font-size:12px;white-space:nowrap">${date(f.mtime)}</span>
          <button class="icon-btn sm" data-action="reveal" data-path="${f.path}" title="${t(isMac ? 'disk.revealMac' : 'disk.reveal')}">${ic('external', 14)}</button>
        </label>`)}
        ${shown.length > s.limit ? html`<div style="padding:12px 20px"><button class="btn btn-ghost btn-sm" data-action="more">${t('empty.more', {count: shown.length - s.limit})}</button></div>` : ''}
      </div>
      ${picked ? html`<div class="selection-bar"><strong>${t('empty.selected', {count: picked})}</strong><span class="spacer"></span><button class="btn btn-ghost btn-sm" data-action="clearSel">${t('disk.clear')}</button><button class="btn btn-danger btn-sm" data-action="trash">${ic('trash', 15)} ${tb('disk.moveTo')}</button></div>` : ''}`;
  },
  on: {
    ...filterHandlers(() => ef, DEFAULT_FILTERS),
    async home() { await start(this, [await api('system.home')]); },
    async go(el) { await start(this, [el.dataset.root]); },
    async choose() { const p = await api('disk.pickFolder'); if (p) await start(this, [p]); },
    async cancel() { await api('disk.cancel'); },
    reset() { s.result = null; s.phase = 'idle'; this.update(); },
    more() { s.limit += 300; this.update(); },
    reveal(el) { api('shell.reveal', {path: el.dataset.path}); },
    pick(el) { el.checked ? s.selected.add(el.dataset.path) : s.selected.delete(el.dataset.path); this.update(); },
    pickAll(el) { for (const f of s.result.folders.filter(x => match(x))) el.checked ? s.selected.add(f.path) : s.selected.delete(f.path); this.update(); },
    clearSel() { s.selected.clear(); this.update(); },
    async trash() {
      const paths = [...s.selected];
      const {ok} = await modal({title: tb('empty.trashTitle', {count: paths.length}), icon: 'trash', confirm: tb('disk.moveTo'), body: tb('empty.trashBody')});
      if (!ok) return;
      const r = await api('disk.trashEmpty', {paths});
      const gone = new Set(r.done);
      s.result.folders = s.result.folders.filter(f => !gone.has(f.path));
      gone.forEach(p => s.selected.delete(p));
      if (r.done.length) toast(tb('empty.moved', {count: r.done.length}), {type: 'success'});
      if (r.failed.length) toast(t('empty.skipped', {count: r.failed.length}), {type: 'info', timeout: 6500});
      this.update();
    }
  }
});
