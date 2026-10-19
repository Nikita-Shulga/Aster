import {html, ic, api, app, num, checkbox, empty, modal, formModal, toast, esc, raw, str, verdictBadge, explain, isMac, bytes, t, th} from '../lib.js';
import {definePage} from '../page.js';
import {chip, countOptions, search as searchBox, filterHandlers, driveOf} from '../filters.js';
import {shared, notify, loadRegistryCategories, scanRegistry, fixableCount} from '../state.js';

const r = shared.registry;
const ui = {tab: 'cleaner', openGroups: new Set(), showAll: new Set()};
const DEFAULT_FILTERS = {search: '', hive: 'all', verdict: 'all', drive: 'all', access: 'all'};
const rf = structuredClone(DEFAULT_FILTERS);
const hiveOf = i => /^HK(LM|EY_LOCAL_MACHINE)/i.test(i.path) ? 'HKLM' : 'HKCU';
const catOf = i => r.categories.find(c => c.id === i.type);
function matchIssue(i, skip) {
  const q = rf.search.trim().toLowerCase();
  return (skip === 'hive' || rf.hive === 'all' || hiveOf(i) === rf.hive) &&
    (skip === 'verdict' || rf.verdict === 'all' || (catOf(i)?.verdict === 'safe' ? 'safe' : 'review') === rf.verdict) &&
    (skip === 'drive' || rf.drive === 'all' || (driveOf(i.target) || '__none') === rf.drive) &&
    (skip === 'access' || rf.access === 'all' || (rf.access === 'admin') === locked(i)) &&
    (!q || [i.title, i.path, i.value, i.target].some(x => String(x || '').toLowerCase().includes(q)));
}
const shownIssues = () => r.scan.items.filter(i => matchIssue(i));
const ed = {path: 'HKEY_CURRENT_USER\\Software', expanded: new Set(['HKEY_CURRENT_USER', 'HKEY_CURRENT_USER\\Software']), children: new Map(), data: null, loading: false, selected: null, search: null};

const locked = i => i.admin && !app.system?.admin;
// Labels used in several places; functions so they follow the interface language.
const SAFE = () => t(isMac ? 'registry.safeMac' : 'registry.safe');
const OPTIONAL = () => t('registry.optional');
const DEFAULT = () => t('registry.default');

// ---------------- Cleaner tab ----------------
function categoriesCard() {
  return html`<div class="card rules" style="position:sticky;top:0">
    <div class="card-head"><h3 class="grow">${t('registry.scanFor')}</h3><span class="faint" style="font-size:12px">${r.selected.size}/${r.categories.length}</span></div>
    <div class="rules-scroll" style="padding:8px">
      ${r.categories.map(cat => html`<label class="rule" style="align-items:flex-start;padding:7px 8px" title="${cat.description}">
        ${checkbox(`data-change="cat" data-id="${cat.id}" style="margin-top:2px"`, r.selected.has(cat.id))}
        <span class="grow"><span style="color:var(--text);font-weight:500">${cat.name}</span> <span class="vdot ${cat.verdict === 'safe' ? 'green' : 'amber'}" style="display:inline-block;margin-left:2px;vertical-align:1px" title="${cat.verdict === 'safe' ? SAFE() : OPTIONAL()}"></span><br><span class="faint" style="font-size:12px">${cat.description}</span></span>
      </label>`)}
    </div>
  </div>`;
}

function issuesView() {
  if (r.phase === 'scanning') return html`<div class="card card-pad"><div class="row" style="gap:14px"><div class="tile"><span class="spinner"></span></div><div class="grow"><div class="card-title">${t(isMac ? 'registry.scanningMac' : 'registry.scanning')}</div><div class="muted">${t(isMac ? 'registry.scanningTextMac' : 'registry.scanningText', {count: r.selected.size})}</div></div></div><div class="progress indeterminate" style="margin-top:16px"><div></div></div></div>`;
  if (!r.scan) return html`<div class="card">${empty({iconName: 'layers', title: t(isMac ? 'registry.introTitleMac' : 'registry.introTitle'), text: t(isMac ? 'registry.introTextMac' : 'registry.introText'), action: html`<button class="btn btn-primary btn-lg" data-action="scan">${ic('search', 18)} ${t(isMac ? 'registry.scanButtonMac' : 'registry.scanButton')}</button>`})}</div>`;
  const all = r.scan.items;
  const items = all.filter(i => matchIssue(i));
  if (!all.length) return html`<div class="card">${empty({iconName: 'check', title: t(isMac ? 'registry.noneFoundMac' : 'registry.noneFound'), text: t(isMac ? 'registry.noneFoundTextMac' : 'registry.noneFoundText'), action: html`<button class="btn btn-secondary" data-action="scan">${t('registry.scanAgain')}</button>`})}</div>`;
  const cats = r.categories.filter(cat => items.some(i => i.type === cat.id));
  const checked = items.filter(i => r.checked.has(i.id)).length;
  const lockedCount = items.filter(locked).length;
  const selectedCount = num(all.filter(i => r.checked.has(i.id)).length);
  return html`
    <div class="card cleaner-summary">
      <div class="tile amber" style="width:52px;height:52px;border-radius:14px">${ic('layers', 26)}</div>
      <div class="grow"><div class="big num">${num(all.length)}</div><div class="label">${isMac ? t('registry.summaryMac', {count: all.length, size: bytes(all.reduce((n, i) => n + (i.size || 0), 0)), selected: selectedCount}) : t('registry.summary', {count: all.length, selected: selectedCount})}</div></div>
      <button class="btn btn-secondary" data-action="scan">${ic('refresh', 16)} ${t('common.rescan')}</button>
      <button class="btn btn-primary btn-lg" data-action="fix" ${all.some(i => r.checked.has(i.id)) ? '' : 'disabled'}>${ic(isMac ? 'trash' : 'check', 18)} ${t(isMac ? 'registry.moveToTrash' : 'registry.fixSelected')}</button>
    </div>
    ${lockedCount ? html`<div class="callout blue" style="margin-top:12px">${ic('shield', 18)}<div class="grow">${t('registry.lockedNote', {count: lockedCount})}</div><button class="btn btn-sm btn-secondary" data-action="relaunch">${t('registry.restartAdmin')}</button></div>` : ''}
    <div class="callout" style="margin-top:12px">${ic('info', 18)}<div class="grow"><strong style="color:var(--text)">${t('registry.honestNote')}</strong> ${isMac ? t('registry.honestNoteMacText') : th('registry.honestNoteText')}</div></div>
    <div class="toolbar filterbar" style="margin:12px 0 0">
      ${searchBox(rf.search, t(isMac ? 'registry.searchMac' : 'registry.search'), isMac ? 200 : 250)}
      ${chip('verdict', t('registry.filter.verdict'), [{value: 'safe', label: SAFE()}, {value: 'review', label: OPTIONAL()}].map(o => ({...o, count: all.filter(i => matchIssue(i, 'verdict') && (catOf(i)?.verdict === 'safe' ? 'safe' : 'review') === o.value).length})), rf.verdict)}
      ${isMac ? '' : chip('hive', t('registry.filter.hive'), [{value: 'HKCU', label: t('registry.filter.hkcu')}, {value: 'HKLM', label: t('registry.filter.hklm')}].map(o => ({...o, count: all.filter(i => matchIssue(i, 'hive') && hiveOf(i) === o.value).length})), rf.hive)}
      ${isMac ? '' : chip('drive', t('registry.filter.drive'), countOptions(all.filter(i => matchIssue(i, 'drive')), i => driveOf(i.target), {sort: 'alpha', unknown: t('registry.filter.noPath')}), rf.drive, {allLabel: t('registry.filter.anyDrive')})}
      ${isMac ? '' : chip('access', t('registry.filter.access'), [{value: 'user', label: t('registry.filter.fixableNow')}, {value: 'admin', label: t('registry.filter.needsAdmin')}].map(o => ({...o, count: all.filter(i => matchIssue(i, 'access') && (o.value === 'admin') === locked(i)).length})), rf.access)}
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-action="checkShown" data-v="1">${t('registry.selectShown')}</button>
      <button class="btn btn-ghost btn-sm" data-action="checkShown" data-v="">${t('registry.unselectShown')}</button>
    </div>
    ${items.length !== all.length ? html`<div class="filter-result" style="padding:8px 2px 0"><span>${th(isMac ? 'registry.showingMac' : 'registry.showing', {shown: items.length, total: all.length, count: all.length, selected: items.filter(i => r.checked.has(i.id)).length})}</span><button class="linkish" data-action="clearFilters">${t('filters.clear')}</button></div>` : ''}
    ${!items.length ? html`<div class="card" style="margin-top:12px">${empty({iconName: 'search', title: t('registry.noMatch'), text: t('registry.noMatchText')})}</div>` : ''}
    <div class="card" style="margin-top:12px;${items.length ? '' : 'display:none'}">
      ${cats.map(cat => {
        const list = items.filter(i => i.type === cat.id);
        const usable = list.filter(i => !locked(i));
        const on = usable.filter(i => r.checked.has(i.id)).length;
        const isOpen = ui.openGroups.has(cat.id);
        const shown = ui.showAll.has(cat.id) ? list : list.slice(0, 150);
        return html`<div class="issue-group ${isOpen ? 'open' : ''}">
          <div class="issue-group-head" data-action="toggleGroup" data-id="${cat.id}">
            ${ic('chevronRight', 14, 'chev')}
            ${checkbox(`data-change="checkGroup" data-id="${cat.id}" ${usable.length ? '' : 'disabled'}`, usable.length && on === usable.length, on > 0 && on < usable.length)}
            <div class="grow"><div style="font-weight:500">${cat.name}</div><div class="faint" style="font-size:12px">${cat.description}</div></div>
            ${cat.verdict === 'safe' ? html`<span class="badge green">${ic('check', 12)} ${SAFE()}</span>` : html`<span class="badge amber">${ic('info', 12)} ${OPTIONAL()}</span>`}
            <span class="badge">${num(list.length)}</span>
          </div>
          ${isOpen ? html`<div style="padding:0 20px 10px 52px">${explain({...cat, verdict: cat.verdict === 'safe' ? 'safe' : 'review', advice: cat.advice})}</div><div class="issue-items selectable">
            ${shown.map(i => html`<label class="issue" title="${i.path}${i.value != null ? '\n' + i.value : ''}">
              ${checkbox(`data-change="checkIssue" data-id="${i.id}" ${locked(i) ? 'disabled' : ''}`, !locked(i) && r.checked.has(i.id))}
              <div class="truncate"><span style="font-weight:500">${i.title}</span>${i.target ? html`<div class="faint truncate" style="font-size:11.5px">${t('registry.missing', {target: i.target})}</div>` : ''}</div>
              <div class="path truncate">${i.path}${i.value != null ? ` → ${i.value}` : ''}${isMac && i.size ? html` · <strong>${bytes(i.size)}</strong>` : ''}</div>
            </label>`)}
            ${list.length > shown.length ? html`<div style="padding:8px 52px"><button class="btn btn-ghost btn-sm" data-action="showAll" data-id="${cat.id}">${t('registry.showAll', {count: list.length})}</button></div>` : ''}
          </div>` : ''}
        </div>`;
      })}
    </div>`;
}

// ---------------- Editor tab ----------------
const KIND_LABEL = {String: 'REG_SZ', ExpandString: 'REG_EXPAND_SZ', MultiString: 'REG_MULTI_SZ', DWord: 'REG_DWORD', QWord: 'REG_QWORD', Binary: 'REG_BINARY', None: 'REG_NONE'};
function display(v) {
  if (v.kind === 'DWord') return `0x${(v.data >>> 0).toString(16).padStart(8, '0')} (${v.data >>> 0})`;
  if (v.kind === 'MultiString') return (v.data || []).join(' · ');
  if (v.kind === 'Binary' || v.kind === 'None') { const s = String(v.data || '').replace(/,/g, ' '); return s.length > 120 ? s.slice(0, 120) + '…' : s || t('registry.zeroBinary'); }
  return String(v.data ?? '');
}

async function loadChildren(p) {
  const res = await api('registry.list', {path: p});
  ed.children.set(p, res.keys);
  return res;
}
async function openKey(p, page) {
  ed.path = p; ed.loading = true; ed.selected = null; page.update();
  try {
    const res = await loadChildren(p);
    ed.data = res;
    // expand ancestors so the tree shows where we are
    const parts = p.split('\\');
    for (let i = 1; i <= parts.length; i++) {
      const anc = parts.slice(0, i).join('\\');
      ed.expanded.add(anc);
      if (!ed.children.has(anc)) await loadChildren(anc).catch(() => {});
    }
  } catch (e) { ed.data = null; throw e; } finally { ed.loading = false; page.update(); }
}

function tree(p, depth) {
  const kids = ed.children.get(p) || [];
  return kids.map(k => {
    const full = p ? `${p}\\${k.name}` : k.name;
    const isOpen = ed.expanded.has(full);
    return html`<div class="reg-node ${ed.path === full ? 'on' : ''}" style="padding-left:${depth * 14 + 4}px" data-action="node" data-path="${full}" title="${full}">
      <span class="tw ${k.hasChildren ? '' : 'leaf'} ${isOpen ? 'open' : ''}" data-action="twist" data-path="${full}">${ic('chevronRight', 12)}</span>
      ${ic(isOpen ? 'folderOpen' : 'folder', 15, 'k')}<span class="truncate">${k.name}</span>
    </div>${isOpen && ed.children.has(full) ? tree(full, depth + 1) : ''}`;
  });
}

function editorView() {
  const d = ed.data;
  return html`
    <div class="toolbar">
      <button class="btn btn-secondary btn-sm" data-action="newKey">${ic('folder', 15)} ${t('registry.newKey')}</button>
      <button class="btn btn-secondary btn-sm" data-action="newValue">${ic('plus', 15)} ${t('registry.newValue')}</button>
      <button class="btn btn-secondary btn-sm" data-action="search">${ic('search', 15)} ${t('registry.find')}</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-action="importReg">${ic('upload', 15)} ${t('registry.importReg')}</button>
      <button class="btn btn-ghost btn-sm" data-action="exportKey">${ic('download', 15)} ${t('registry.exportKey')}</button>
      <button class="btn btn-ghost btn-sm" data-action="deleteKey" style="color:var(--red-text)">${ic('trash', 15)} ${t('registry.deleteKey')}</button>
    </div>
    ${ed.search ? searchPanel() : ''}
    <div class="card regedit">
      <div class="reg-tree">${tree('', 0)}</div>
      <div class="reg-main">
        <div class="reg-address">
          <input class="input selectable" data-key="addr" data-enter="go" value="${ed.path}" spellcheck="false" aria-label="${t('registry.address')}">
          <button class="btn btn-secondary btn-sm" data-action="go">${t('registry.go')}</button>
          <button class="icon-btn" data-action="up" title="${t('registry.parentKey')}">${ic('arrowUp', 16)}</button>
        </div>
        <div class="reg-values">
          ${ed.loading ? html`<div style="padding:16px"><div class="skeleton" style="height:120px"></div></div>` : d ? html`
          <table class="table selectable">
            <thead><tr><th style="width:32%">${t('registry.col.name')}</th><th style="width:130px">${t('registry.col.type')}</th><th>${t('registry.col.data')}</th><th></th></tr></thead>
            <tbody>
              ${!d.hasDefault ? html`<tr><td><span class="row">${ic('file', 14, 'faint')}<span class="faint">${DEFAULT()}</span></span></td><td><span class="type-pill">REG_SZ</span></td><td class="faint">${t('registry.valueNotSet')}</td><td></td></tr>` : ''}
              ${d.values.map((v, idx) => html`<tr class="${ed.selected === idx ? 'selected' : ''}" data-dblclick="editValue" data-action="selectValue" data-idx="${idx}">
                <td><span class="row">${ic(v.kind.includes('String') ? 'file' : 'hash', 14, 'faint')}<span class="truncate">${v.name === '' ? DEFAULT() : v.name}</span></span></td>
                <td><span class="type-pill">${KIND_LABEL[v.kind] || v.kind}</span></td>
                <td><div class="data truncate">${display(v)}</div></td>
                <td class="actions-cell"><div class="row-actions row" style="gap:2px">
                  <button class="icon-btn sm" data-action="editValue" data-idx="${idx}" title="${t('registry.edit')}">${ic('sliders', 14)}</button>
                  <button class="icon-btn sm" data-action="renameValue" data-idx="${idx}" title="${t('registry.rename')}">${ic('file', 14)}</button>
                  <button class="icon-btn sm" data-action="deleteValue" data-idx="${idx}" title="${t('common.delete')}">${ic('trash', 14)}</button>
                </div></td>
              </tr>`)}
            </tbody>
          </table>
          <div class="faint" style="padding:10px 12px;font-size:12px">${t('registry.subkeys', {count: d.keys.length})} · ${t('registry.values', {count: d.values.length})} · ${t('registry.dblClickHint')}</div>` : html`<div style="padding:16px" class="muted">${t('registry.selectKey')}</div>`}
        </div>
      </div>
    </div>`;
}

function searchPanel() {
  const s = ed.search;
  return html`<div class="card card-pad" style="margin-bottom:12px">
    <div class="row" style="gap:10px;flex-wrap:wrap">
      <div class="search grow">${ic('search', 16)}<input class="input" style="width:100%" data-key="q" data-enter="runSearch" placeholder="${t('registry.findPlaceholder', {scope: s.scope})}" value="${s.query || ''}"></div>
      <label class="row">${checkbox('data-change="sKeys"', s.keys)} ${t('registry.find.keys')}</label>
      <label class="row">${checkbox('data-change="sValues"', s.values)} ${t('registry.find.values')}</label>
      <label class="row">${checkbox('data-change="sData"', s.data)} ${t('registry.find.data')}</label>
      <button class="btn btn-primary btn-sm" data-action="runSearch" ${s.running ? 'disabled' : ''}>${s.running ? html`<span class="spinner"></span>` : ''} ${t('registry.find.run')}</button>
      <button class="icon-btn" data-action="closeSearch" title="${t('common.close')}">${ic('x', 16)}</button>
    </div>
    ${s.results ? html`<div class="faint" style="font-size:12px;margin:12px 0 6px">${t('registry.matches', {count: s.results.results.length})}${s.results.complete ? '' : ` (${t('registry.stoppedEarly')})`}</div>
      <div class="modal-list" style="margin-top:0;max-height:220px">${s.results.results.map(x => html`<div class="list-row clickable" data-action="node" data-path="${x.path}" data-value="${x.kind === 'value' ? x.name : ''}">${ic(x.kind === 'key' ? 'folder' : 'hash', 14, 'faint')}<span class="mono truncate grow" style="font-size:11.5px">${x.path}${x.kind === 'value' ? html` → <strong>${x.name || DEFAULT()}</strong>` : ''}</span></div>`)}</div>` : ''}
  </div>`;
}

function valueFields(v, isNew) {
  const kind = v?.kind || 'String';
  const data = v ? (v.kind === 'MultiString' ? (v.data || []).join('\n') : v.kind === 'DWord' ? String(v.data >>> 0) : String(v.data ?? '')) : '';
  return html`
    <div class="field"><label>${t('registry.col.name')}</label><input class="input" name="name" value="${v ? v.name : ''}" ${isNew ? '' : 'readonly'} placeholder="${DEFAULT()}"></div>
    <div class="field"><label>${t('registry.col.type')}</label><select class="select" name="kind" ${isNew ? '' : 'disabled'}>${Object.keys(KIND_LABEL).filter(k => k !== 'None').map(k => html`<option value="${k}" ${k === kind ? 'selected' : ''}>${KIND_LABEL[k]}</option>`)}</select>${isNew ? '' : html`<input type="hidden" name="kind" value="${kind}">`}</div>
    <div class="field"><label>${t('registry.col.data')} <span class="faint">${kind === 'DWord' || kind === 'QWord' ? t('registry.hint.number') : kind === 'MultiString' ? t('registry.hint.multi') : kind === 'Binary' ? t('registry.hint.binary') : ''}</span></label>
      <textarea class="input" name="data" rows="${kind === 'MultiString' || kind === 'Binary' ? 6 : 3}" spellcheck="false">${data}</textarea></div>`;
}

function parseData(kind, text) {
  if (kind === 'DWord' || kind === 'QWord') {
    const v = text.trim();
    const big = /^0x[0-9a-f]+$/i.test(v) ? BigInt(v) : /^\d+$/.test(v) ? BigInt(v) : null;
    if (big === null) throw new Error(t('registry.error.number'));
    if (kind === 'DWord' && big > 0xffffffffn) throw new Error(t('registry.error.dword'));
    if (big > 0xffffffffffffffffn) throw new Error(t('registry.error.tooLarge'));
    return kind === 'DWord' ? Number(big) : big.toString();
  }
  if (kind === 'MultiString') return text.split(/\r?\n/);
  if (kind === 'Binary') { if (/[^0-9a-f\s,]/i.test(text)) throw new Error(t('registry.error.binary')); return text; }
  return text;
}

async function edit(page, args, success) {
  await api('registry.edit', {path: ed.path, ...args});
  toast(success, {type: 'success'});
  await openKey(ed.path, page);
}

export default definePage({
  id: 'registry', get title() { return t(isMac ? 'page.leftovers' : 'page.registry'); }, icon: 'layers',
  badge: () => fixableCount() ? {text: num(fixableCount()), tone: 'amber'} : null,
  view() {
    return html`
      <div class="page-head">
        <div class="titles"><h1>${t(isMac ? 'page.leftovers' : 'page.registry')}</h1><p>${t(isMac ? 'registry.introMac' : 'registry.intro')}</p></div>
      </div>
      <div class="tabs" style="${isMac ? 'display:none' : ''}">
        <button class="${ui.tab === 'cleaner' ? 'on' : ''}" data-action="tab" data-tab="cleaner">${ic('broom', 16)} ${t('registry.tab.cleaner')}</button>
        <button class="${ui.tab === 'editor' ? 'on' : ''}" data-action="tab" data-tab="editor">${ic('key', 16)} ${t('registry.tab.editor')}</button>
      </div>
      ${ui.tab === 'cleaner' || isMac
        ? (r.categories ? html`<div class="cleaner-layout" style="grid-template-columns:320px 1fr">${categoriesCard()}<div>${issuesView()}</div></div>` : html`<div class="skeleton" style="height:300px"></div>`)
        : editorView()}`;
  },
  onMount() {
    this.listener = () => this.update();
    shared.listeners.add(this.listener);
    loadRegistryCategories().then(() => this.update());
    if (!isMac && !ed.children.has('')) loadChildren('').then(() => openKey(ed.path, this)).catch(() => {});
  },
  onUnmount() { shared.listeners.delete(this.listener); },
  on: {
    tab(el) { ui.tab = el.dataset.tab; this.update(); },
    relaunch() { window.asterRelaunch(); },
    cat(el) { el.checked ? r.selected.add(el.dataset.id) : r.selected.delete(el.dataset.id); api('settings.update', {registryCategories: [...r.selected]}); this.update(); },
    async scan() { await scanRegistry(); },
    toggleGroup(el, e) { if (e.target.closest('input')) return; const id = el.dataset.id; ui.openGroups.has(id) ? ui.openGroups.delete(id) : ui.openGroups.add(id); this.update(); },
    showAll(el) { ui.showAll.add(el.dataset.id); this.update(); },
    ...filterHandlers(() => rf, DEFAULT_FILTERS),
    checkShown(el) { shownIssues().filter(i => !locked(i)).forEach(i => el.dataset.v ? r.checked.add(i.id) : r.checked.delete(i.id)); notify(); },
    checkGroup(el) { shownIssues().filter(i => i.type === el.dataset.id && !locked(i)).forEach(i => el.checked ? r.checked.add(i.id) : r.checked.delete(i.id)); notify(); },
    checkIssue(el) { el.checked ? r.checked.add(el.dataset.id) : r.checked.delete(el.dataset.id); notify(); },
    async fix() {
      const ids = r.scan.items.filter(i => r.checked.has(i.id) && !locked(i)).map(i => i.id);
      const byCat = r.categories.map(c => ({c, n: r.scan.items.filter(i => i.type === c.id && ids.includes(i.id)).length})).filter(x => x.n);
      const {ok} = await modal({title: t(isMac ? 'registry.fixTitleMac' : 'registry.fixTitle', {count: ids.length}), icon: 'layers', confirm: t(isMac ? 'registry.moveToTrash' : 'registry.fixIssues'), body: html`
        <p>${t(isMac ? 'registry.fixListMac' : 'registry.fixList')}</p>
        <div class="modal-list">${byCat.map(({c, n}) => html`<div class="list-row" style="align-items:flex-start;padding:9px 12px"><span class="badge num">${n}</span><div class="grow"><div style="font-weight:600;color:var(--text)">${c.name}</div><div class="muted">${c.ifDeleted}</div></div></div>`)}</div>
        <p style="margin-top:10px">${t(isMac ? 'registry.fixNoteMac' : 'registry.fixNote')}</p>`});
      if (!ok) return;
      r.phase = 'fixing'; notify();
      try {
        const res = await api('registry.fix', {ids});
        const fixed = new Set(res.fixed);
        r.scan.items = r.scan.items.filter(i => !fixed.has(i.id));
        fixed.forEach(id => r.checked.delete(id));
        const key = isMac ? (res.failed.length ? 'registry.movedFailed' : 'registry.moved') : (res.failed.length ? 'registry.fixedFailed' : 'registry.fixed');
        toast(t(key, {count: res.fixed.length, failed: String(res.failed.length)}), {type: res.failed.length ? 'info' : 'success'});
      } finally { r.phase = 'scanned'; notify(); }
    },

    // editor
    async node(el, e) {
      if (e.target.closest('[data-action="twist"]')) return;
      await openKey(el.dataset.path, this);
      if (el.dataset.value) { const idx = ed.data?.values.findIndex(v => v.name === el.dataset.value); if (idx >= 0) { ed.selected = idx; this.update(); } }
    },
    async twist(el) {
      const p = el.dataset.path;
      if (ed.expanded.has(p)) ed.expanded.delete(p);
      else { ed.expanded.add(p); if (!ed.children.has(p)) await loadChildren(p); }
      this.update();
    },
    async go() { const v = this.el.querySelector('[data-key="addr"]').value.trim().replace(/^(Computer|Компьютер)\\/i, ''); if (v) await openKey(v, this); },
    async up() { const parts = ed.path.split('\\'); if (parts.length > 1) await openKey(parts.slice(0, -1).join('\\'), this); },
    selectValue(el) { ed.selected = +el.dataset.idx; this.update(); },
    async editValue(el) {
      const v = ed.data.values[+el.dataset.idx];
      const res = await formModal({title: t('registry.editTitle', {name: v.name || DEFAULT()}), fields: valueFields(v, false)});
      if (!res) return;
      await edit(this, {op: 'setValue', name: v.name, kind: v.kind, data: parseData(v.kind, res.data)}, t('registry.valueSaved'));
    },
    async newValue() {
      const res = await formModal({title: t('registry.newValueTitle'), fields: valueFields(null, true), confirm: t('registry.create')});
      if (!res) return;
      await edit(this, {op: 'setValue', name: res.name, kind: res.kind, data: parseData(res.kind, res.data)}, t('registry.valueCreated'));
    },
    async renameValue(el) {
      const v = ed.data.values[+el.dataset.idx];
      const res = await formModal({title: t('registry.renameTitle'), fields: html`<div class="field"><label>${t('registry.newName')}</label><input class="input" name="newName" value="${v.name}" required></div>`, confirm: t('registry.rename')});
      if (!res || res.newName === v.name) return;
      await edit(this, {op: 'renameValue', name: v.name, newName: res.newName}, t('registry.valueRenamed'));
    },
    async deleteValue(el) {
      const v = ed.data.values[+el.dataset.idx];
      const {ok} = await modal({title: t('registry.deleteValueTitle', {name: v.name || DEFAULT()}), icon: 'trash', danger: true, confirm: t('common.delete'), body: t('registry.deleteValueText')});
      if (ok) await edit(this, {op: 'deleteValue', name: v.name}, t('registry.valueDeleted'));
    },
    async newKey() {
      const res = await formModal({title: t('registry.newKeyTitle'), fields: html`<div class="field"><label>${t('registry.keyName')}</label><input class="input" name="name" required></div><p class="faint" style="font-size:12px">${th('registry.createdUnder', {path: ed.path})}</p>`, confirm: t('registry.create')});
      if (!res) return;
      await api('registry.edit', {op: 'createKey', path: ed.path, name: res.name});
      ed.children.delete(ed.path);
      toast(t('registry.keyCreated'), {type: 'success'});
      await openKey(`${ed.path}\\${res.name}`, this);
    },
    async deleteKey() {
      const {ok} = await modal({title: t('registry.deleteKeyTitle'), icon: 'trash', danger: true, confirm: t('registry.deleteKey'), body: html`<p class="mono selectable" style="font-size:12px;word-break:break-all">${ed.path}</p><p style="margin-top:10px">${t('registry.deleteKeyText')}</p>`});
      if (!ok) return;
      await api('registry.edit', {op: 'deleteKey', path: ed.path});
      const parent = ed.path.split('\\').slice(0, -1).join('\\');
      ed.children.delete(parent);
      toast(t('registry.keyDeleted'), {type: 'success'});
      await openKey(parent, this);
    },
    async exportKey() { const res = await api('registry.export', {path: ed.path}); if (!res.cancelled) toast(t('registry.keyExported'), {type: 'success'}); },
    async importReg() {
      const {ok} = await modal({title: t('registry.importTitle'), icon: 'upload', confirm: t('registry.chooseFile'), body: t('registry.importText')});
      if (!ok) return;
      const res = await api('registry.import');
      if (!res.cancelled) { toast(t('registry.imported'), {type: 'success'}); await openKey(ed.path, this); }
    },
    search() { ed.search = ed.search || {scope: ed.path, keys: true, values: true, data: false}; ed.search.scope = ed.path; this.update(); },
    closeSearch() { ed.search = null; this.update(); },
    sKeys(el) { ed.search.keys = el.checked; }, sValues(el) { ed.search.values = el.checked; }, sData(el) { ed.search.data = el.checked; },
    async runSearch() {
      const s = ed.search;
      s.query = this.el.querySelector('[data-key="q"]').value;
      s.running = true; this.update();
      try { s.results = await api('registry.search', {path: s.scope, query: s.query, keys: s.keys, values: s.values, data: s.data}); }
      finally { s.running = false; this.update(); }
    }
  }
});
