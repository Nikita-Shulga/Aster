import {html, ic, api, app, bytes, num, date, checkbox, empty, modal, toast, bar, pct, onEvent, previousScan, t, th} from '../lib.js';
import {definePage} from '../page.js';
import {chip, countOptions, search as searchBox, filterHandlers, driveOf, baseName} from '../filters.js';
import {isMac} from '../lib.js';
// Sentences that name the Trash (macOS) or the Recycle Bin (Windows) have a "…Mac" variant of the key.
const tb = (key, vars) => t(isMac ? `${key}Mac` : key, vars);
const rootOf = d => d.root || `${d.name}\\`;

const s = {phase: 'idle', root: null, roots: null, minSize: 1024 * 1024, result: null, selected: new Set(), limit: 100, restored: false, triedLast: false};
// Remember the result so it is still here after Aster restarts.
const persist = () => api('scans.save', {kind: 'duplicates', data: s.result ? {...s.result, root: s.root, roots: s.roots, minSize: s.minSize} : null}).catch(() => {});

onEvent(e => {
  if (e.channel !== 'duplicates' || s.phase !== 'running') return;
  const el = document.getElementById('dupe-progress');
  if (!el) return;
  const hashing = e.phase === 'hash';
  const ratio = hashing && e.totalToHash ? Math.min(100, e.hashed / e.totalToHash * 100) : null;
  el.innerHTML = `<div class="row" style="gap:28px;margin-bottom:8px"><div class="stat"><span class="k">${t(hashing ? 'duplicates.comparing' : 'duplicates.filesScanned')}</span><span class="v num">${hashing ? Math.round(ratio) + '%' : num(e.files)}</span></div><div class="stat"><span class="k">${t('duplicates.scannedSize')}</span><span class="v num">${bytes(e.bytes)}</span></div></div>
    <div class="faint truncate mono" style="font-size:11.5px">${String(e.current || '').replace(/[<>&]/g, '')}</div>
    <div class="progress ${ratio == null ? 'indeterminate' : ''}" style="margin-top:14px"><div style="width:${ratio ?? 0}%"></div></div>`;
});

const DEFAULT_FILTERS = {search: '', drive: 'all', type: 'all', spread: 'all', sort: 'wasted'};
const uf = structuredClone(DEFAULT_FILTERS);
const extOf = p => (baseName(p).includes('.') ? p.split('.').pop().toLowerCase() : '(none)');
const drivesOf = g => [...new Set(g.files.map(f => driveOf(f.path)))];
function matchGroup(g, skip) {
  const q = uf.search.trim().toLowerCase();
  return (skip === 'drive' || uf.drive === 'all' || drivesOf(g).includes(uf.drive)) &&
    (skip === 'type' || uf.type === 'all' || extOf(g.files[0].path) === uf.type) &&
    (skip === 'spread' || uf.spread === 'all' || (uf.spread === 'across') === (drivesOf(g).length > 1)) &&
    (!q || g.files.some(f => f.path.toLowerCase().includes(q)));
}
const SORTS = {wasted: (a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1), size: (a, b) => b.size - a.size, copies: (a, b) => b.files.length - a.files.length};
const shownGroups = () => s.result.groups.map((g, idx) => ({...g, idx})).filter(g => matchGroup(g)).sort(SORTS[uf.sort]);

const SIZES = [100 * 1024, 1024 * 1024, 10 * 1024 * 1024, 100 * 1024 * 1024];
// Where the search ran: a folder or drive path, or all drives (s.root is null then; older saves stored 'all drives').
const allDrives = () => s.roots?.length > 1 || s.root === 'all drives';

function autoSelect(mode) {
  s.selected.clear();
  if (mode === 'none') return;
  for (const g of s.result.groups) {
    const files = [...g.files].sort((a, b) => a.mtime - b.mtime);
    let keep = mode === 'oldest' ? files[0] : files[files.length - 1];
    // "Keep the copy on drive X": prefer a file on that drive, otherwise fall back to the newest.
    if (mode.startsWith('drive:')) keep = [...files].reverse().find(f => driveOf(f.path) === mode.slice(6)) || files[files.length - 1];
    files.forEach(f => { if (f !== keep) s.selected.add(f.path); });
  }
}

async function start(page, root) {
  const roots = Array.isArray(root) ? root : [root];
  s.root = Array.isArray(root) ? (root.length === 1 ? root[0] : null) : root; s.roots = roots; s.phase = 'running'; s.result = null; s.selected.clear(); s.limit = 100; page.update();
  try { s.result = await api('disk.duplicates', {roots, minSize: s.minSize}); s.phase = 'done'; s.restored = false; autoSelect('newest'); persist(); }
  catch (e) { s.phase = 'idle'; if (!/cancel|отмен/i.test(e.message)) throw e; }
  finally { page.update(); }
}

export default definePage({
  id: 'duplicates', get title() { return t('page.duplicates'); }, icon: 'copy',
  view() {
    const head = html`<div class="page-head">
      <div class="titles"><h1>${t('duplicates.heading')}</h1><p>${tb('duplicates.intro')}</p></div>
      ${s.result ? html`<div class="actions"><button class="btn btn-secondary" data-action="reset">${ic('folderOpen', 16)} ${t('duplicates.newSearch')}</button></div>` : ''}
    </div>`;
    if (s.phase === 'running') return html`${head}<div class="card card-pad"><div class="row" style="gap:14px;margin-bottom:18px"><div class="tile"><span class="spinner"></span></div><div class="grow"><div class="card-title">${allDrives() ? t('duplicates.searchingAll') : t('duplicates.searching', {root: s.root})}</div><div class="muted">${t('duplicates.searchingText')}</div></div><button class="btn btn-secondary btn-sm" data-action="cancel">${t('common.cancel')}</button></div><div id="dupe-progress"><div class="skeleton" style="height:48px"></div></div></div>`;
    if (!s.result) {
      const drives = app.system?.drives || [];
      return html`${head}
        <div class="card card-pad" style="margin-bottom:16px"><div class="row" style="gap:14px;flex-wrap:wrap"><span style="font-weight:500">${t('duplicates.ignoreSmaller')}</span>
          <div class="segmented">${SIZES.map(v => html`<button class="${s.minSize === v ? 'on' : ''}" data-action="min" data-v="${v}">${bytes(v)}</button>`)}</div>
          <span class="faint" style="font-size:12.5px">${t(isMac ? 'duplicates.skippedMac' : 'duplicates.skipped')}</span></div></div>
        <div class="drive-picks">
          ${drives.map(d => html`<button class="card drive-pick" data-action="go" data-root="${rootOf(d)}"><div class="row"><div class="tile blue">${ic('drive', 18)}</div><div><div style="font-weight:600">${d.label || t('disk.localDisk')} (${d.name})</div><div class="faint" style="font-size:12px">${t('duplicates.used', {size: bytes(d.total - d.free)})}</div></div></div></button>`)}
          ${drives.length > 1 ? html`<button class="card drive-pick" data-action="goAll"><div class="row"><div class="tile">${ic('copy', 18)}</div><div><div style="font-weight:600">${t('duplicates.allDrives')}</div><div class="faint" style="font-size:12px">${t('duplicates.allDrivesText', {drives: drives.map(d => d.name).join(', ')})}</div></div></div></button>` : ''}
          <button class="card drive-pick" data-action="choose" style="justify-content:center;align-items:center;border-style:dashed"><div class="tile gray">${ic('folderOpen', 18)}</div><div style="font-weight:500">${t('disk.chooseFolder')}</div></button>
        </div>`;
    }
    const all = s.result.groups;
    const groups = shownGroups();
    const filtered = groups.length !== all.length;
    const note = s.restored ? previousScan(s.result.at, {label: t('duplicates.searchAgain')}) : '';
    if (!all.length) return html`${head}${note}<div class="card">${empty({iconName: 'check', title: t('duplicates.none'), text: allDrives() ? t('duplicates.checkedAll', {count: s.result.files}) : s.root ? t('duplicates.checkedIn', {count: s.result.files, root: s.root}) : t('duplicates.checkedPrevious', {count: s.result.files})})}</div>`;
    const selSize = all.reduce((n, g) => n + g.files.filter(f => s.selected.has(f.path)).length * g.size, 0);
    return html`${head}
      ${note}
      <div class="card cleaner-summary">
        <div class="tile amber" style="width:52px;height:52px;border-radius:14px">${ic('copy', 26)}</div>
        <div class="grow"><div class="big num">${bytes(s.result.wasted)}</div><div class="label">${t('duplicates.takenBy')} · ${t('duplicates.groupsIn', {count: all.length, files: t('duplicates.scannedFiles', {count: s.result.files})})}</div></div>
        <label class="fchip"><span class="fchip-k">${t('duplicates.autoSelect')}</span><span class="fchip-v">${t('duplicates.chooseKeep')}</span>${ic('chevronDown', 13)}
          <select data-change="autoSel"><option value="">${t('duplicates.chooseKeep')}</option><option value="newest">${t('duplicates.keepNewest')}</option><option value="oldest">${t('duplicates.keepOldest')}</option>${[...new Set(all.flatMap(drivesOf))].sort().map(d => html`<option value="drive:${d}">${t('duplicates.keepOnDrive', {drive: d})}</option>`)}<option value="none">${t('duplicates.unselectAll')}</option></select></label>
      </div>
      <div class="toolbar filterbar" style="margin:12px 0 0">
        ${searchBox(uf.search, t('duplicates.search'), 220)}
        ${chip('drive', t('duplicates.drive'), countOptions(all.filter(g => matchGroup(g, 'drive')).flatMap(g => drivesOf(g).map(d => ({d}))), x => x.d, {sort: 'alpha'}), uf.drive, {allLabel: t('duplicates.allDrives')})}
        ${chip('type', t('disk.fileType'), countOptions(all.filter(g => matchGroup(g, 'type')), g => extOf(g.files[0].path), {label: e => e === '(none)' ? t('duplicates.noExtension') : '.' + e}).slice(0, 30), uf.type)}
        ${chip('spread', t('duplicates.copiesAre'), [{value: 'same', label: t('duplicates.sameDrive')}, {value: 'across', label: t('duplicates.differentDrives')}].map(o => ({...o, count: all.filter(g => matchGroup(g, 'spread') && (o.value === 'across') === (drivesOf(g).length > 1)).length})), uf.spread, {allLabel: t('duplicates.anywhere')})}
        <span class="spacer"></span>
        ${chip('sort', t('duplicates.sort'), [{value: 'size', label: t('duplicates.sortSize')}, {value: 'copies', label: t('duplicates.sortCopies')}], uf.sort === 'wasted' ? 'all' : uf.sort, {allLabel: t('duplicates.sortWasted')})}
      </div>
      ${filtered ? html`<div class="filter-result" style="padding:8px 2px 0"><span>${th('duplicates.showing', {shown: groups.length, total: all.length, count: all.length})}</span><button class="linkish" data-action="clearFilters">${t('filters.clear')}</button></div>` : ''}
      <div class="card" style="margin-top:12px">
        ${!groups.length ? empty({iconName: 'search', title: t('duplicates.noMatch'), text: t('duplicates.noMatchText')}) : ''}
        ${groups.slice(0, s.limit).map(g => html`<div class="dupe-group">
          <div class="dupe-head"><span class="badge">${t('duplicates.copies', {count: g.files.length})}</span><span style="font-weight:600" class="num">${t('duplicates.each', {size: bytes(g.size)})}</span><span class="faint truncate grow">${baseName(g.files[0].path)}</span>${drivesOf(g).length > 1 ? html`<span class="badge blue">${drivesOf(g).join(' + ')}</span>` : ''}<span class="faint num" style="font-size:12px">${t('duplicates.reclaimable', {size: bytes(g.size * (g.files.length - 1))})}</span></div>
          ${g.files.map(f => html`<label class="dupe-file">
            ${checkbox(`data-change="pickFile" data-path="${f.path}" data-g="${g.idx}"`, s.selected.has(f.path))}
            <span class="drive-tag">${driveOf(f.path)}</span>
            <span class="p truncate grow selectable" title="${f.path}">${f.path}</span>
            <span class="faint num" style="font-size:12px;white-space:nowrap">${date(f.mtime)}</span>
            <button class="icon-btn sm" data-action="reveal" data-path="${f.path}" title="${t(isMac ? 'disk.revealMac' : 'disk.reveal')}">${ic('external', 14)}</button>
          </label>`)}
        </div>`)}
        ${groups.length > s.limit ? html`<div style="padding:12px 20px"><button class="btn btn-ghost btn-sm" data-action="more">${t('duplicates.showMore', {count: groups.length - s.limit})}</button></div>` : ''}
      </div>
      ${s.selected.size ? html`<div class="selection-bar"><strong>${t('duplicates.selected', {count: s.selected.size})}</strong><span style="opacity:.7">${bytes(selSize)}</span><span class="spacer"></span><button class="btn btn-ghost btn-sm" data-action="auto" data-mode="none">${t('disk.clear')}</button><button class="btn btn-danger btn-sm" data-action="trash">${ic('trash', 15)} ${tb('disk.moveTo')}</button></div>` : ''}`;
  },
  onMount() {
    // Bring back the last search (from before Aster was closed) the first time the page opens.
    if (s.triedLast || s.result || s.phase !== 'idle') return;
    s.triedLast = true;
    api('scans.load', {kind: 'duplicates'}).then(saved => {
      const d = saved?.data;
      if (!d || !Array.isArray(d.groups) || s.result || s.phase !== 'idle') return;
      s.result = {...d, at: d.at || saved.savedAt};
      s.root = d.root || null; s.roots = Array.isArray(d.roots) ? d.roots : null;
      if (d.minSize) s.minSize = d.minSize;
      s.phase = 'done'; s.restored = true; autoSelect('newest');
      if (this.mounted) this.update();
    }).catch(() => {});
  },
  on: {
    async rescan() { if (s.roots?.length) await start(this, s.roots.length > 1 ? s.roots : s.roots[0]); else { s.result = null; s.phase = 'idle'; s.restored = false; this.update(); } },
    ...filterHandlers(() => uf, DEFAULT_FILTERS),
    filter(el) { uf[el.dataset.key] = el.dataset.key === 'sort' && el.value === 'all' ? 'wasted' : el.value; this.update(); },
    autoSel(el) { if (el.value) { autoSelect(el.value); this.update(); } },
    async goAll() { await start(this, (app.system?.drives || []).map(rootOf)); },
    min(el) { s.minSize = +el.dataset.v; this.update(); },
    async go(el) { await start(this, el.dataset.root); },
    async choose() { const p = await api('disk.pickFolder'); if (p) await start(this, p); },
    async cancel() { await api('disk.cancel'); },
    reset() { s.result = null; s.phase = 'idle'; s.restored = false; this.update(); },
    more() { s.limit += 200; this.update(); },
    reveal(el) { api('shell.reveal', {path: el.dataset.path}); },
    auto(el) { autoSelect(el.dataset.mode); this.update(); },
    pickFile(el) {
      const g = s.result.groups[+el.dataset.g];
      if (el.checked && g.files.filter(f => f.path !== el.dataset.path).every(f => s.selected.has(f.path))) {
        el.checked = false;
        toast(t('duplicates.oneKept'), {type: 'info'});
        return;
      }
      el.checked ? s.selected.add(el.dataset.path) : s.selected.delete(el.dataset.path);
      this.update();
    },
    async trash() {
      const paths = [...s.selected];
      const {ok} = await modal({title: tb('duplicates.trashTitle', {count: paths.length}), icon: 'trash', danger: true, confirm: tb('disk.moveTo'), body: tb('duplicates.trashBody')});
      if (!ok) return;
      const r = await api('disk.trash', {paths});
      const gone = new Set(r.done);
      s.result.groups = s.result.groups.map(g => ({...g, files: g.files.filter(f => !gone.has(f.path))})).filter(g => g.files.length > 1);
      s.result.wasted = s.result.groups.reduce((n, g) => n + g.size * (g.files.length - 1), 0);
      gone.forEach(p => s.selected.delete(p));
      persist();
      toast(tb('duplicates.moved', {count: r.done.length, size: bytes(r.bytes)}), {type: 'success'});
      this.update();
    }
  }
});
