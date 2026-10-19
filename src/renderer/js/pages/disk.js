import {html, ic, api, app, bytes, num, date, checkbox, empty, modal, toast, bar, pct, onEvent, verdictBadge, explain, VERDICTS, previousScan, t, th} from '../lib.js';
import {onLanguageChange} from '../i18n.js';
import {definePage} from '../page.js';
import {chip, search as searchBox, filterHandlers, SIZE_BUCKETS, AGE_BUCKETS, daysSince, bucketTest, sep, baseName, dirName} from '../filters.js';
import {isMac} from '../lib.js';
// Sentences that name the Trash (macOS) or the Recycle Bin (Windows) have a "…Mac" variant of the key.
const tb = (key, vars) => t(isMac ? `${key}Mac` : key, vars);
const reveal = () => t(isMac ? 'disk.revealMac' : 'disk.reveal');
const rootOf = d => d.root || `${d.name}\\`;

const PALETTE = ['#5b4cf0', '#2f7bf5', '#0ea5a4', '#16a34a', '#d48806', '#e0557a', '#8b5cf6', '#64748b', '#0891b2', '#c2410c'];
const TYPE_COLORS = {Video: '#e0557a', Images: '#0ea5a4', Audio: '#8b5cf6', Documents: '#2f7bf5', Archives: '#d48806', Programs: '#5b4cf0', Code: '#16a34a', 'Disk images': '#c2410c', Other: '#94a3b8'};
const ids = new Map(); // path -> what it is / owner / verdict
const EXT_TYPES = {
  Video: 'mp4 mkv avi mov wmv flv webm m4v mpg mpeg ts m2ts vob 3gp', Images: 'jpg jpeg png gif bmp tif tiff webp heic heif raw cr2 nef arw dng psd svg ico',
  Audio: 'mp3 wav flac aac ogg m4a wma opus aiff mid', Documents: 'pdf doc docx xls xlsx ppt pptx odt ods odp txt rtf md csv epub djvu',
  Archives: 'zip rar 7z tar gz bz2 xz iso img cab zst tgz', Programs: 'exe msi dll sys msix appx apk jar bat cmd ps1',
  Code: 'js ts jsx tsx py java c cpp h cs go rs rb php html css json xml yml yaml sql sh', 'Disk images': 'vhd vhdx vmdk vdi qcow2 pak bin dat db sqlite'
};
const EXT_MAP = new Map(Object.entries(EXT_TYPES).flatMap(([t, l]) => l.split(' ').map(e => [e, t])));
const typeOf = p => EXT_MAP.get((p.split('.').pop() || '').toLowerCase()) || 'Other';
// Type names are fixed English identifiers (also from the disk worker and saved scans); shown translated.
const typeName = n => Object.hasOwn(TYPE_COLORS, n) ? t(`disk.type.${n.replace(/\s+(\w)/g, (m, c) => c.toUpperCase())}`) : n;
const DEFAULT_FILTERS = {search: '', kind: 'all', type: 'all', size: 'all', age: 'all', verdict: 'all'};
const df = structuredClone(DEFAULT_FILTERS);
const VERD = [{value: 'safe', key: 'verdict.safe'}, {value: 'review', key: 'verdict.review.short'}, {value: 'keep', key: 'verdict.keep'}];
function matchItem(i, skip) {
  const q = df.search.trim().toLowerCase();
  const isDir = i.dir === true;
  return (skip === 'kind' || df.kind === 'all' || (df.kind === 'dir') === isDir) &&
    (skip === 'type' || df.type === 'all' || (!isDir && typeOf(i.path) === df.type)) &&
    (skip === 'size' || bucketTest(SIZE_BUCKETS, df.size, i.size)) &&
    (skip === 'age' || df.age === 'all' || (!isDir && bucketTest(AGE_BUCKETS, df.age, daysSince(i.mtime)))) &&
    (skip === 'verdict' || df.verdict === 'all' || ids.get(i.path)?.verdict === df.verdict) &&
    (!q || i.path.toLowerCase().includes(q) || (ids.get(i.path)?.owner || '').toLowerCase().includes(q));
}
const visibleItems = () => (s.view?.items || []).filter(i => matchItem(i));
const filtersActive = () => Object.entries(df).some(([k, v]) => v && v !== 'all');
const s = {phase: 'idle', progress: null, result: null, path: null, view: null, selected: new Set(), tab: 'folders', restored: false, triedLast: false};

onEvent(e => {
  if (e.channel !== 'disk' || s.phase !== 'running') return;
  s.progress = e;
  const el = document.getElementById('disk-progress');
  if (el) el.innerHTML = `<div class="row" style="gap:28px;margin-bottom:6px"><div class="stat"><span class="k">${t('disk.statFiles')}</span><span class="v num">${num(e.files)}</span></div><div class="stat"><span class="k">${t('disk.size')}</span><span class="v num">${bytes(e.bytes)}</span></div></div><div class="faint truncate mono" style="font-size:11.5px">${String(e.current).replace(/[<>&]/g, '')}</div>`;
});

// Squarified treemap (Bruls et al.): keeps cells close to square for readability.
function squarify(values, x, y, w, h) {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  const areas = values.map(v => v * scale);
  const rects = [];
  let i = 0;
  const worst = (row, side) => { const sum = row.reduce((a, b) => a + b, 0); const max = Math.max(...row), min = Math.min(...row); return Math.max(side * side * max / (sum * sum), (sum * sum) / (side * side * min)); };
  while (i < areas.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) { row.push(areas[j]); j++; }
    const sum = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const cw = sum / h; let cy = y;
      for (const a of row) { const ch = a / cw; rects.push({x, y: cy, w: cw, h: ch}); cy += ch; }
      x += cw; w -= cw;
    } else {
      const rh = sum / w; let cx = x;
      for (const a of row) { const rw = a / rh; rects.push({x: cx, y, w: rw, h: rh}); cx += rw; }
      y += rh; h -= rh;
    }
    i = j;
  }
  return rects;
}

async function open(page, p) {
  s.path = p; s.selected.clear();
  s.view = await api('disk.children', {path: p});
  page.update();
}

function treemap() {
  const el = document.getElementById('treemap');
  if (!el || !s.view) return;
  const items = visibleItems().filter(i => i.size > 0).slice(0, 40);
  const W = el.clientWidth, H = el.clientHeight;
  const rects = squarify(items.map(i => i.size), 0, 0, W, H);
  el.innerHTML = rects.map((r, k) => {
    const it = items[k];
    const color = it.dir ? PALETTE[k % PALETTE.length] : '#94a3b8';
    const label = r.w > 70 && r.h > 34;
    return `<div class="tm-cell" data-action="${it.dir ? 'enter' : 'revealFile'}" data-path="${it.path.replace(/"/g, '&quot;')}" title="${it.name.replace(/"/g, '&quot;')} — ${bytes(it.size)}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:${color}">${label ? `<div class="n">${it.name.replace(/[<>&]/g, '')}</div><div class="s">${bytes(it.size)}</div>` : ''}</div>`;
  }).join('');
}

function crumbs() {
  const root = s.result.root.replace(/\\$/, '');
  const rel = s.path.replace(/[\\/]$/, '').slice(root.length).split(sep).filter(Boolean);
  const parts = [{name: root, path: s.result.root}];
  rel.forEach((name, i) => parts.push({name, path: (root === '/' ? '' : root) + sep + rel.slice(0, i + 1).join(sep)}));
  return html`<div class="crumbbar">${ic('drive', 16, 'faint')}${parts.map((p, i) => html`${i ? html`<span class="sep">${ic('chevronRight', 12)}</span>` : ''}<button data-action="enter" data-path="${p.path}">${p.name}</button>`)}</div>`;
}

function picker() {
  const drives = app.system?.drives || [];
  return html`<div class="drive-picks">
    ${drives.map(d => html`<button class="card drive-pick" data-action="analyze" data-root="${rootOf(d)}">
      <div class="row"><div class="tile blue">${ic('drive', 18)}</div><div class="grow"><div style="font-weight:600">${d.label && d.label !== d.name ? `${d.label} (${d.name})` : d.name || t('disk.localDisk')}</div><div class="faint" style="font-size:12px">${t('disk.freeOf', {free: bytes(d.free), total: bytes(d.total)})}</div></div></div>
      ${bar(pct(d.total - d.free, d.total), pct(d.total - d.free, d.total) > 90 ? 'red' : pct(d.total - d.free, d.total) > 75 ? 'amber' : 'accent')}
    </button>`)}
    <button class="card drive-pick" data-action="chooseFolder" style="justify-content:center;align-items:center;border-style:dashed"><div class="tile gray">${ic('folderOpen', 18)}</div><div style="font-weight:500">${t('disk.chooseFolder')}</div></button>
  </div>`;
}

function filterBar() {
  const items = s.view.items;
  const cnt = (skip, test) => items.filter(i => matchItem(i, skip) && test(i)).length;
  return html`<div class="toolbar filterbar" style="padding:12px 16px 0;margin:0">
    ${searchBox(df.search, t('disk.search'), 200)}
    ${chip('kind', t('disk.show'), [{value: 'dir', label: t('disk.folders')}, {value: 'file', label: t('disk.filesOption')}].map(o => ({...o, count: cnt('kind', i => (o.value === 'dir') === (i.dir === true))})), df.kind, {allLabel: t('disk.foldersAndFiles')})}
    ${chip('type', t('disk.fileType'), [...Object.keys(EXT_TYPES), 'Other'].map(tp => ({value: tp, label: typeName(tp), count: cnt('type', i => !i.dir && typeOf(i.path) === tp)})).filter(o => o.count), df.type)}
    ${chip('size', t('disk.size'), SIZE_BUCKETS.map(b => ({value: b.value, label: b.label, count: cnt('size', i => b.test(i.size))})), df.size)}
    ${chip('age', t('disk.modified'), AGE_BUCKETS.map(b => ({value: b.value, label: b.label, count: cnt('age', i => !i.dir && daysSince(i.mtime) != null && b.test(daysSince(i.mtime)))})), df.age, {allLabel: t('disk.anyTime')})}
    ${chip('verdict', t('disk.deleteQ'), VERD.map(o => ({value: o.value, label: t(o.key), count: cnt('verdict', i => ids.get(i.path)?.verdict === o.value)})), df.verdict)}
  </div>
  ${filtersActive() ? html`<div class="filter-result"><span>${th('disk.showing', {shown: visibleItems().length, total: items.length, count: items.length})}</span><button class="linkish" data-action="clearFilters">${t('filters.clear')}</button></div>` : ''}`;
}

function filesTable() {
  const v = {...s.view, items: visibleItems()};
  return html`<table class="table">
    <thead><tr><th class="w-cb"></th><th>${t('disk.name')}</th><th>${t('disk.deleteQ')}</th><th class="size-col">${t('disk.size')}</th><th class="right">${t('disk.items')}</th><th></th></tr></thead>
    <tbody>${v.items.slice(0, 300).map(i => html`<tr class="${s.selected.has(i.path) ? 'selected' : ''}" ${i.dir ? html`data-dblclick="enter"` : ''} data-path="${i.path}">
      <td class="w-cb">${checkbox(`data-change="pickRow" data-path="${i.path}"`, s.selected.has(i.path))}</td>
      <td style="max-width:340px"><div class="cell-main">${ic(i.dir ? 'folder' : 'file', 18, i.dir ? '' : 'faint')}<div class="truncate">${i.dir ? html`<button class="btn-link truncate" data-action="enter" data-path="${i.path}" style="border:0;background:none;padding:0;cursor:pointer;font-weight:500;text-align:left;max-width:100%">${i.name}</button>` : html`<div class="truncate" style="font-weight:500">${i.name}</div>`}<div class="s truncate">${describe(i.path)}</div></div></div></td>
      <td>${ids.get(i.path) ? html`<button class="linkish" data-action="info" data-path="${i.path}" data-dir="${i.dir ? 1 : ''}" title="${t('disk.whatIsThis')}">${verdictBadge(ids.get(i.path).verdict)}</button>` : ''}</td>
      <td class="size-col"><div class="row"><div class="bar"><div class="bar-fill ${i.dir ? '' : 'tone-blue'}" style="width:${pct(i.size, v.size)}%"></div></div><span class="num" style="min-width:70px;text-align:right">${bytes(i.size)}</span></div></td>
      <td class="right num faint">${i.dir ? num(i.files) : date(i.mtime)}</td>
      <td class="actions-cell"><div class="row-actions row" style="gap:2px"><button class="icon-btn sm" data-action="revealFile" data-path="${i.path}" title="${reveal()}">${ic('external', 14)}</button><button class="icon-btn sm" data-action="trashOne" data-path="${i.path}" title="${tb('disk.moveTo')}">${ic('trash', 14)}</button></div></td>
    </tr>`)}</tbody></table>
    ${v.items.length > 300 ? html`<div class="faint" style="padding:10px 14px;font-size:12px">${t('disk.showingLargest', {shown: 300, count: v.items.length})}</div>` : ''}`;
}

function sidePanels() {
  const r = s.result;
  const total = r.types.reduce((n, t) => n + t.bytes, 0) || 1;
  return html`
    <div class="card">
      <div class="card-head"><h3 class="grow">${t('disk.fileTypes')}</h3><span class="sub">${t('disk.fileCount', {count: r.files})}</span></div>
      <div class="card-pad" style="padding-top:12px">
        <div class="stacked">${r.types.map(t => html`<div style="width:${t.bytes / total * 100}%;background:${TYPE_COLORS[t.name]}" title="${typeName(t.name)}"></div>`)}</div>
        ${r.types.map(t => html`<div class="type-row" style="cursor:pointer;${df.type === t.name ? 'font-weight:600;color:var(--accent-text)' : ''}" data-action="typeFilter" data-type="${t.name}" title="${t.exts.map(e => `.${e.ext} ${bytes(e.bytes)}`).join('\n')}"><span class="dot" style="background:${TYPE_COLORS[t.name]}"></span><span>${typeName(t.name)} <span class="faint">· ${num(t.count)}</span></span><span class="num muted">${bytes(t.bytes)}</span></div>`)}
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3 class="grow">${t('disk.largest')}</h3><span class="sub">${t(filtersActive() ? 'disk.matchingFilters' : 'disk.onThisDrive')}</span></div>
      <div class="list">${r.top.filter(f => matchItem({...f, dir: false}, 'kind')).slice(0, filtersActive() ? 25 : 12).map(f => html`<div class="list-row clickable" style="padding:10px 16px;min-height:0;align-items:flex-start" data-action="info" data-path="${f.path}" title="${f.path}">
        ${ic('file', 16, 'faint')}<div class="grow truncate"><div class="truncate" style="font-weight:500">${baseName(f.path)}</div><div class="meta truncate">${describe(f.path)}</div><div class="meta truncate mono" style="font-size:11px">${dirName(f.path)}</div></div>
        <div class="stack" style="align-items:flex-end;gap:4px"><span class="num" style="font-weight:600;font-size:12.5px">${bytes(f.size)}</span>${ids.get(f.path) ? verdictBadge(ids.get(f.path).verdict) : ''}</div>
      </div>`)}</div>
    </div>`;
}

export default definePage({
  id: 'disk', get title() { return t('page.disk'); }, icon: 'pie',
  view() {
    const head = html`<div class="page-head">
      <div class="titles"><h1>${t('page.disk')}</h1><p>${tb('disk.intro')}</p></div>
      ${s.result ? html`<div class="actions"><button class="btn btn-secondary" data-action="reset">${ic('drive', 16)} ${t('disk.changeLocation')}</button><button class="btn btn-secondary" data-action="rescan">${ic('refresh', 16)} ${t('common.rescan')}</button></div>` : ''}
    </div>`;
    if (s.phase === 'running') return html`${head}<div class="card card-pad">
      <div class="row" style="gap:14px;margin-bottom:18px"><div class="tile"><span class="spinner"></span></div><div class="grow"><div class="card-title">${t('disk.analyzing', {root: s.root})}</div><div class="muted">${t('disk.analyzingText')}</div></div><button class="btn btn-secondary btn-sm" data-action="cancel">${t('common.cancel')}</button></div>
      <div id="disk-progress"><div class="skeleton" style="height:48px"></div></div><div class="progress indeterminate" style="margin-top:14px"><div></div></div></div>`;
    if (!s.result) return html`${head}${picker()}`;
    const v = s.view;
    const sel = [...s.selected];
    return html`${head}
      ${s.restored ? previousScan(s.result.at, {action: null, label: t('common.rescan')}) : ''}
      <div class="disk-layout">
        <div class="card" style="min-width:0">
          ${crumbs()}
          <div class="row" style="padding:14px 16px 0;gap:24px">
            <div class="stat"><span class="k">${t('disk.thisFolder')}</span><span class="v num">${bytes(v.size)}</span></div>
            <div class="stat"><span class="k">${t('disk.statFiles')}</span><span class="v num">${num(v.files)}</span></div>
            ${s.path !== s.result.root ? html`<span class="spacer"></span><button class="btn btn-ghost btn-sm" data-action="upLevel">${ic('arrowUp', 15)} ${t('disk.upOneLevel')}</button>` : ''}
          </div>
          ${filterBar()}
          <div class="treemap" id="treemap"></div>
          <div class="table-wrap">${filesTable()}</div>
        </div>
        <div>${sidePanels()}</div>
      </div>
      ${sel.length ? html`<div class="selection-bar"><strong>${t('disk.selected', {count: sel.length})}</strong><span class="spacer"></span><button class="btn btn-ghost btn-sm" data-action="clearSel">${t('disk.clear')}</button><button class="btn btn-danger btn-sm" data-action="trashSel">${ic('trash', 15)} ${tb('disk.moveTo')}</button></div>` : ''}`;
  },
  afterRender() { treemap(); identifyVisible(this); },
  onMount() {
    this.onResize = () => treemap(); window.addEventListener('resize', this.onResize);
    // Bring back the last analysis (from before Aster was closed) the first time the page opens.
    if (!s.triedLast && !s.result && s.phase === 'idle') {
      s.triedLast = true;
      api('disk.last').then(async r => {
        if (!r || s.result || s.phase !== 'idle') return;
        s.result = r; s.restored = !!r.restored; s.phase = 'done';
        await open(this, r.root);
      }).catch(() => {});
    }
  },
  onUnmount() { window.removeEventListener('resize', this.onResize); },
  on: {
    async chooseFolder() { const p = await api('disk.pickFolder'); if (p) await analyzeRoot(this, p); },
    async analyze(el) { await analyzeRoot(this, el.dataset.root); },
    async rescan() { await analyzeRoot(this, s.result.root); },
    reset() { s.result = null; s.view = null; this.update(); },
    async cancel() { await api('disk.cancel'); },
    async enter(el) { await open(this, el.dataset.path); },
    async upLevel() { const parent = dirName(s.path.replace(/[\\/]$/, '')); await open(this, !isMac && parent.length <= 2 ? parent + '\\' : parent); },
    revealFile(el) { api('shell.reveal', {path: el.dataset.path}); },
    ...filterHandlers(() => df, DEFAULT_FILTERS),
    typeFilter(el) { df.type = df.type === el.dataset.type ? 'all' : el.dataset.type; df.kind = df.type === 'all' ? df.kind : 'all'; this.update(); },
    async info(el) {
      const p = el.dataset.path;
      const info = ids.get(p) || {verdict: 'review', what: t('disk.stillIdentifying'), advice: ''};
      const item = s.view?.items.find(i => i.path === p) || s.result?.top.find(f => f.path === p);
      const {ok} = await modal({title: baseName(p) || p, icon: VERDICTS[info.verdict]?.icon, wide: true, confirm: reveal(), cancel: t('common.close'), body: html`
        <div class="row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap">${info.kind ? html`<span class="badge">${info.kind}</span>` : ''}${info.owner ? html`<span class="badge accent">${t('disk.belongsTo', {owner: info.owner})}</span>` : ''}${item ? html`<span class="badge num">${bytes(item.size)}</span>` : ''}</div>
        <div class="mono selectable faint" style="font-size:11.5px;word-break:break-all;margin-bottom:12px">${p}</div>
        ${explain({contains: info.what, advice: info.advice, verdict: info.verdict})}`});
      if (ok) api('shell.reveal', {path: p});
    },
    pickRow(el) { el.checked ? s.selected.add(el.dataset.path) : s.selected.delete(el.dataset.path); this.update(); },
    clearSel() { s.selected.clear(); this.update(); },
    async trashOne(el) { await trash(this, [el.dataset.path]); },
    async trashSel() { await trash(this, [...s.selected]); }
  }
});

async function analyzeRoot(pg, root) {
  s.phase = 'running'; s.root = root; s.progress = null; pg.update();
  try {
    s.result = await api('disk.analyze', {root});
    s.phase = 'done'; s.restored = false;
    await open(pg, s.result.root);
  } catch (e) {
    s.phase = 'idle';
    if (!/cancel|отмен/i.test(e.message)) throw e; // "Cancelled" may arrive translated
  } finally { pg.update(); }
}

function describe(p) {
  const i = ids.get(p);
  if (!i) return t('disk.identifying');
  return [i.owner, i.kind].filter(Boolean).filter((x, k, a) => a.indexOf(x) === k).join(' · ');
}

let identifying = false;
// What/owner/advice come from the main process in the interface language: identify again after a switch.
let idGen = 0;
onLanguageChange(() => { ids.clear(); idGen++; });
async function identifyVisible(pg) {
  if (identifying || !s.result) return;
  const want = [...(s.view?.items.slice(0, 80) || []), ...s.result.top.slice(0, 12).map(f => ({path: f.path, dir: false}))].filter(i => !ids.has(i.path));
  if (!want.length) return;
  identifying = true;
  const gen = idGen;
  try {
    const res = await api('disk.identify', {items: want.map(i => ({path: i.path, dir: !!i.dir}))});
    if (gen === idGen) for (const [p, info] of Object.entries(res)) ids.set(p, info);
  } catch {} finally { identifying = false; }
  if (pg.mounted) pg.update();
}

async function trash(pg, paths) {
  const items = [...s.view.items, ...s.result.top.map(f => ({...f, name: baseName(f.path), dir: false}))].filter((i, k, a) => paths.includes(i.path) && a.findIndex(x => x.path === i.path) === k);
  const size = items.reduce((n, i) => n + i.size, 0);
  const risky = items.filter(i => ids.get(i.path)?.verdict === 'keep');
  const {ok} = await modal({title: tb('disk.trashTitle', {count: paths.length}), icon: 'trash', danger: true, confirm: risky.length ? t('disk.moveAnyway') : tb('disk.moveTo'), wide: risky.length > 0, body: html`<p>${tb(paths.length === 1 ? 'disk.trashBodyOne' : 'disk.trashBody', {size: bytes(size)})}</p>
    ${risky.length ? html`<div class="callout amber" style="margin-top:12px;display:block"><strong>${t(risky.length === 1 ? 'disk.recommendKeepOne' : 'disk.recommendKeep')}</strong>${risky.map(i => html`<div style="margin-top:8px"><strong>${i.name}</strong> — ${ids.get(i.path).what} ${ids.get(i.path).advice}</div>`)}</div>` : ''}
    <div class="modal-list">${items.slice(0, 50).map(i => html`<div class="list-row">${ic(i.dir ? 'folder' : 'file', 14, 'faint')}<span class="truncate mono grow" style="font-size:11.5px">${i.path}</span>${ids.get(i.path) ? verdictBadge(ids.get(i.path).verdict) : ''}</div>`)}</div>`});
  if (!ok) return;
  const r = await api('disk.trash', {paths});
  toast(`${tb('disk.moved', {count: r.done.length})}${r.failed.length ? ` · ${t('disk.failed', {count: r.failed.length})}` : ''}`, {type: r.failed.length ? 'info' : 'success'});
  await open(pg, s.path);
}
