'use strict';

// Optional development-only DOM QA. Nothing here is part of the shipped runtime.
// Usage: ASTER_JSDOM_PATH=/path/to/existing/jsdom node scripts/qa-renderer.cjs
// Rebuild the offline preview first to include its CSP/module-bundle checks.
// jsdom supplies a DOM, not browser layout or native Electron/OS validation.

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
let JSDOM;
let jsdomResolved;
try {
  jsdomResolved = require.resolve(process.env.ASTER_JSDOM_PATH || 'jsdom');
  ({ JSDOM } = require(jsdomResolved));
} catch {
  console.error('Optional QA requires jsdom. Set ASTER_JSDOM_PATH to an existing jsdom module directory. No dependency is installed by this script.');
  process.exit(2);
}

const root = path.resolve(__dirname, '..');
const renderer = path.join(root, 'src/renderer');
const html = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8');
const source = ['icons.js', 'demo.js', 'workbench.js', 'studio.js', 'atelier.js','hub.js','dashboard.js','management.js', 'app.js'].map(name => fs.readFileSync(path.join(renderer, name), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/\bexport\s+(?=(?:const|let|function|class)\b)/g, '')).join('\n');
const hooks = '\nglobalThis.qa = {state, render, navigate, files, filteredFiles, normalizedScan, details, reviewSelection, quarantine, restore, treemapLayout, groupStats, storageInfo, mutationAllowed, measure, known, scanWarnings, comparisonPanel, folderExplorer, resetFilters, loadPage, startScan, setSettings};';
const results = [];
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

function check(name, condition) {
  assert(condition, name);
  results.push({ name, passed: true });
  console.log('PASS ' + name);
}

function createDOM(bridge, options = {}) {
  const markup = (options.html || html).replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(markup, { url: 'http://localhost:4173', runScripts: 'outside-only', pretendToBeVisual: true });
  const window = dom.window;
  window.aster = bridge;
  // jsdom does not implement native dialog behavior. Test state/events only.
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.URL.createObjectURL = () => 'blob:qa-report';
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {
    window.qaDownload = { href: this.href, filename: this.download };
  };
  const executable = (options.source || source).replace(/init\(\);\s*$/, 'globalThis.qaReady = init();') + hooks;
  window.eval(executable);
  return dom;
}

async function checkDemo() {
  const dom = createDOM();
  const window = dom.window;
  const document = window.document;
  await window.qaReady;
  const click = selector => { const el = document.querySelector(selector); if(!el&&selector.startsWith('[data-page=')){window.qa.navigate(selector.match(/"([^"]+)"/)[1]);return;}assert(el, selector); el.click(); };
  try {
    for (const page of ['overview', 'startupControls', 'managedUpdates', 'registryLive', 'uninstall', 'recovery', 'footprints', 'optimizer', 'browser', 'tracking', 'drivers', 'updates', 'maintenance', 'drives', 'history', 'storage', 'recommendations', 'cleanup', 'large', 'duplicates', 'insights', 'organize', 'performance', 'registry', 'tools', 'startup', 'applications', 'report', 'activity', 'settings']) {
      await window.qa.navigate(page);
      await tick();
      check('Demo navigation: ' + page, (document.querySelector('[data-page-title]')?.dataset.pageTitle||'overview') === page && !!document.querySelector('h1')?.textContent);
      check('Demo labeling: ' + page, document.querySelector('.hub-mode').textContent.includes('SAMPLE DATA'));
    }
    click('[data-theme="dark"]');
    await tick();
    check('Theme preference persists', document.documentElement.dataset.theme === 'dark' && JSON.parse(window.localStorage.getItem('aster-preferences')).theme === 'dark');
    click('[data-page="storage"]');
    await tick();
    const search = document.querySelector('#file-search');
    search.focus(); search.value = 'Coastline'; search.dispatchEvent(new window.Event('input', { bubbles: true }));
    check('File search filters real DOM rows', document.querySelectorAll('.file-table tbody tr').length === 1);
    check('File search preserves focus', document.activeElement.id === 'file-search');
    click('[data-detail]');
    check('File details dialog opens', document.querySelector('#modal').open && document.querySelector('#modal-title').textContent.includes('Coastline'));
    click('[data-select-detail]');
    check('File details selection updates checkbox', document.querySelector('[data-select]').checked && !document.querySelector('#modal').open);
    const selectedBox=document.querySelector('[data-select]');selectedBox.focus();selectedBox.dispatchEvent(new window.Event('change',{bubbles:true}));
    check('Checkbox focus survives rerender', document.activeElement.dataset.select===selectedBox.dataset.select);
    click('[data-action="review-selection"]'); await tick();
    check('Demo quarantine is disabled', document.querySelector('[data-quarantine]').disabled);
    check('Demo review is labeled', document.querySelector('#modal').textContent.includes('DEMO PREVIEW'));
    click('[data-action="close-modal"]'); click('[data-action="review-selection"]'); await tick();
    check('Repeated review dialog works', document.querySelector('#modal').open);
    click('[data-action="close-modal"]');
    click('[data-page="duplicates"]'); await tick();
    for (const index of [0, 1]) {
      const box = document.querySelectorAll('[data-select]')[index];
      box.checked = true; box.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
    click('[data-action="review-selection"]'); await tick();
    check('Duplicate view has no bulk selection control', !document.querySelector('#select-all'));
    check('Duplicate review preserves a keeper', !document.querySelector('#modal').open && document.querySelector('#notifications').textContent.includes('Keep at least one'));
    click('[data-page="overview"]'); await tick();
    click('[data-action="choose-folder"]');
    check('Demo folder picker explains native requirement', document.querySelector('#modal').textContent.includes('browser preview uses'));
    click('[data-action="sample-scan"]'); await tick(350);
    check('Demo scan has progress', !!document.querySelector('.scan-progress'));
    click('[data-action="cancel-scan"]');
    check('Demo scan cancellation works', !document.querySelector('.scan-progress'));
    click('[data-action="scan"]'); await tick(2400);
    check('Demo scan completion remains labeled', !document.querySelector('.scan-progress') && document.querySelector('#notifications').textContent.includes('real files were not accessed'));
    click('[data-page="report"]'); await tick(); click('[data-action="export-report"]'); await tick();
    check('Demo export has explicit demo filename', window.qaDownload?.filename === 'aster-demo-report.json');
    click('[data-page="settings"]'); await tick();
    const hidden = document.querySelector('#include-hidden'); hidden.checked = true; hidden.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
    check('Dotfile preference updates', window.qa.state.settings.includeHidden === true);
    window.qa.state.filter = 'Images'; window.qa.state.page = 'storage';
    check('Category filter matches requested type', window.qa.filteredFiles().every(f => f.category === 'Images'));
    window.qa.state.filter = 'all'; window.qa.state.sort = 'size-asc';
    const sorted = window.qa.filteredFiles();
    check('Ascending size order', sorted[0].size <= sorted.at(-1).size);
    const tiles = window.qa.treemapLayout(window.qa.groupStats());
    check('Treemap total area is faithful', Math.abs(tiles.reduce((n, t) => n + t.width * t.height, 0) - 10000) < 0.001);
    check('Treemap rectangles stay in bounds', tiles.every(t => t.x >= 0 && t.y >= 0 && t.x + t.width <= 100.001 && t.y + t.height <= 100.001));
    await window.qa.navigate('recommendations');
    check('Recommendations show evidence and overlap caveat', document.body.textContent.includes('These views overlap') && document.querySelectorAll('.evidence-card').length > 0);
    check('Recommendations never auto-select files', window.qa.state.selected.size === 0);
    check('Session comparison available after rescan', document.querySelector('.comparison-grid'));
    check('Navigation moves keyboard focus to main', document.activeElement.id === 'main');
    await window.qa.navigate('storage');
    check('Folder explorer includes child folders', document.querySelectorAll('[data-folder]').length > 0);
    click('[data-folder]');
    check('Folder drill-down restricts file paths', window.qa.state.folder && window.qa.filteredFiles().every(f => f.path.replaceAll('\\', '/').startsWith(window.qa.state.folder + '/')));
    click('[data-action="reset-filters"]');
    check('Reset clears folder and file filters', window.qa.state.folder === '' && window.qa.state.extension === 'all' && window.qa.state.age === 'all');
    const ext = document.querySelector('#extension-filter');ext.value = 'pdf';ext.dispatchEvent(new window.Event('change', {bubbles:true}));
    check('Extension filter is exact', window.qa.filteredFiles().every(f => f.name.toLowerCase().endsWith('.pdf')));
    window.qa.state.scan={root:'/age',files:[{path:'/age/a',name:'a',size:1,category:'Other',modifiedAt:0},{path:'/age/b',name:'b',size:2,category:'Other',modifiedAt:null},{path:'/age/c',name:'c',size:3,category:'Other',modifiedAt:'bad-date'},{path:'/age/d',name:'d',size:4,category:'Other',modifiedAt:Date.now()}]};
    window.qa.resetFilters();window.qa.state.age='365';
    check('Age filter excludes unknown and recent dates', window.qa.filteredFiles().length === 1 && window.qa.filteredFiles()[0].name === 'a');
    window.qa.state.age='unknown';
    check('Unknown-date filter preserves missing readings', window.qa.filteredFiles().length === 2);
    window.qa.resetFilters();
    window.qa.state.previousScan={root:'/age',files:[],truncated:true};
    check('Partial comparison includes coverage warning', window.qa.comparisonPanel().includes('not directly comparable'));
    window.qa.state.previousScan={root:'/other',files:[]};
    check('Different roots do not produce a comparison', !window.qa.comparisonPanel().includes('comparison-grid'));
    const malicious = ['<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>'];
    window.qa.state.scan = { id: 'demo', root: '/example', files: malicious.map((name, index) => ({ path: '/example/' + name, name, size: 100, category: 'Documents', modifiedAt: 0 })) };
    await window.qa.navigate('storage');
    check('Untrusted filenames stay text', document.querySelectorAll('img,[onload],[onerror]').length === 0 && document.body.textContent.includes(malicious[0]));
    check('Epoch modification time is a date', document.querySelector('.file-table').textContent.includes('1970'));
    window.qa.state.scan.files = Array.from({ length: 600 }, (_, index) => ({ path: '/example/file-' + index, name: 'File ' + index, size: index + 1, category: 'Other' }));
    window.qa.state.selected.clear(); window.qa.render();
    const all = document.querySelector('#select-all'); all.checked = true; all.dispatchEvent(new window.Event('change', { bubbles: true }));
    check('Table limits render to 500 rows', document.querySelectorAll('.file-table tbody tr').length === 500);
    check('Select visible excludes undisplayed rows', window.qa.state.selected.size === 500);
  } finally { window.close(); }
}

async function checkNativeBridge() {
  let chooseFolder, onProgress, pickerCalls = 0, scanCalls = 0, mutationCalls = 0, previewCalls = 0;
  const system = { osName: 'macOS', hostname: 'Test host', memory: { total: 1000, free: null }, storage: { total: null, free: null, used: null }, cpu: { model: 'Test processor', cores: 2 }, uptime: 0, capabilities: { nativePlatform: true, quarantine: false, restore: false, mutationReason: 'Native validation pending' } };
  const bridge = {
    getSystemInfo: async () => system,
    getRecommendations: async () => [{id:'test',title:'Trusted observation',detail:'Native evidence with <script>text</script>',severity:'info',action:'storage',evidence:{files:1}}],
    getDiagnostics: async () => ({status:'partial',collectedAt:new Date().toISOString(),volumes:{items:[{label:'C:',total:1000,free:0}],warnings:['Volume coverage is limited']},battery:{chargePercent:null,powerSource:'unknown',state:'unknown',warnings:['Not a health assessment']},security:{assessed:false},updates:{assessed:false}}),
    getSettings: async () => ({ theme: 'light' }),
    onChooseFolderRequested: callback => { chooseFolder = callback; },
    onScanProgress: callback => { onProgress = callback; },
    selectFolder: async () => { pickerCalls++; return '/granted'; },
    scan: async input => { scanCalls++; onProgress({ files: 1, bytes: 100, phase: 'scanning' }); return { id: 'native-scan', root: input.root, files: [{ path: '/granted/test.txt', name: 'test.txt', size: 100, modifiedAt: 0, category: 'document' }], warnings: [] }; },
    previewQuarantine: async () => { previewCalls++; return { previewId: 'plan', canExecute: false, blockedReason: 'Tests keep mutation disabled' }; },
    quarantine: async () => { mutationCalls++; return { cancelled: true }; },
    restore: async () => { mutationCalls++; return { cancelled: true }; },
    getActivity: async () => [{ id: 'bad-journal', canRestore: false, status: 'unverified', files: [] }, { id: 'good-journal', canRestore: true, status: 'quarantined', files: [{}] }],
    listStartup: async () => ({ items: [{ name: 'Partial test', path: '/path', enabled: null }], warnings: ['Partial inventory. Actual enabled state unknown.'] }),
    listApplications: async () => ({ items: [{ name: 'Test app', version: '1.0' }], warnings: [] }),
    openSystemSettings: async key => ({ key })
  };
  const dom = createDOM(bridge); const window = dom.window; const document = window.document;
  try {
    await window.qaReady;
    check('Native bridge never inherits demo files', window.qa.files().length === 0 && !document.body.textContent.includes('DEMO MODE'));
    check('Native cleanup-off status remains visible', document.body.textContent.includes('CLEANUP OFF'));
    check('Null memory remains unavailable', window.qa.measure(null) === '—');
    check('Null storage remains unavailable', window.qa.storageInfo() === null);
    await window.qa.navigate('report');
    check('Diagnostic unknown battery stays unknown', document.body.textContent.includes('Not reported') && document.body.textContent.includes('Not a health assessment'));
    check('Diagnostic zero free space is valid', document.body.textContent.includes('0 B free'));
    check('Security and updates do not invent a health score', document.body.textContent.includes('Not assessed') && document.body.textContent.includes('Not checked'));
    check('Diagnostic coverage warnings remain visible', document.body.textContent.includes('Volume coverage is limited'));
    check('Zero uptime is valid', document.body.textContent.includes('0d 0h'));
    await chooseFolder(); await tick();
    check('Native menu invokes picker and scan', pickerCalls === 1 && scanCalls === 1 && window.qa.state.scan.id === 'native-scan');
    check('Native singular category normalizes', window.qa.state.scan.files[0].category === 'Documents');
    await window.qa.navigate('recommendations');
    check('Native recommendations use trusted API', document.body.textContent.includes('Trusted observation'));
    check('Native recommendation content remains escaped', document.querySelectorAll('script').length === 0 && document.body.textContent.includes('<script>text</script>'));
    window.qa.state.previousScan={...window.qa.state.scan};
    check('Native UI never infers same scope without engine comparison', !window.qa.comparisonPanel().includes('comparison-grid'));
    window.qa.state.scan.comparison={comparable:false,totals:{addedFiles:1,removedFiles:2,changedFiles:3,deltaBytes:-10},warnings:['Coverage changed'],notes:['Unhashed contents may differ']};
    window.qa.render();
    check('Native comparison honors incomplete coverage', document.body.textContent.includes('Limited comparison') && document.body.textContent.includes('Coverage changed'));
    check('Native comparison renders evidence limitation', document.body.textContent.includes('Unhashed contents may differ'));
    await window.qa.navigate('storage');
    check('Native scan result renders', document.body.textContent.includes('test.txt'));
    const box = document.querySelector('[data-select]'); box.checked = true; box.dispatchEvent(new window.Event('change', { bubbles: true }));
    document.querySelector('[data-action="review-selection"]').click(); await tick();
    check('Native preview calls authoritative API', previewCalls === 1);
    check('Disabled native preview cannot execute', document.querySelector('[data-quarantine]').disabled);
    check('Native blocked reason is visible', document.querySelector('#modal').textContent.includes('Tests keep mutation disabled'));
    await window.qa.quarantine('plan'); await window.qa.restore('bad-journal');
    check('Defensive handler checks capabilities', mutationCalls === 0);
    document.querySelector('[data-action="close-modal"]').click();
    window.qa.state.system.capabilities.quarantine = true;
    document.querySelector('[data-action="review-selection"]').click(); await tick();
    check('Plan permission required separately from capability', document.querySelector('[data-quarantine]').disabled);
    document.querySelector('[data-action="close-modal"]').click();
    window.qa.state.system.capabilities.restore = true;
    await window.qa.navigate('activity');
    check('Unverified journal restore disabled', document.querySelector('[data-restore="bad-journal"]').disabled);
    check('Verified journal honors restore capability', !document.querySelector('[data-restore="good-journal"]').disabled);
    await window.qa.restore('bad-journal');
    check('Handler rejects unverified restore', mutationCalls === 0);
    document.querySelector('[data-restore="good-journal"]').click(); document.querySelector('[data-restore-confirm]').click(); await tick();
    check('Canceled restore never claims success', document.querySelector('#notifications').textContent.includes('Restore canceled.') && !document.querySelector('#notifications').textContent.includes('Restore finished'));
    await window.qa.navigate('startup');
    check('Partial startup warning is visible', document.body.textContent.includes('Actual enabled state unknown'));
    check('Unknown startup enabled state stays unknown', document.querySelector('.inventory-row .pill').textContent === 'Reported');
    check('OS settings uses allowlisted destination', document.querySelector('[data-system-settings]').dataset.systemSettings === 'startup');
    await window.qa.navigate('applications');
    check('Wrapped application inventory supported', document.body.textContent.includes('Test app'));
    window.qa.state.scan.cancelled = true;
    check('Canceled scan described as incomplete', window.qa.scanWarnings().includes('incomplete'));
  } finally { window.close(); }
  const failed = createDOM({ getSystemInfo: async () => { throw new Error('Permission denied'); } });
  try {
    await failed.window.qaReady;
    check('Native read errors never become demo data', failed.window.document.body.textContent.includes('Permission denied') && !failed.window.document.body.textContent.includes('DEMO MODE'));
  } finally { failed.window.close(); }
}

async function checkAsyncFreshness() {
  const pending=[];let requests=0;
  const system={hostname:'Initial',capabilities:{quarantine:false,restore:false}};
  const bridge={getSystemInfo:async()=>system,getRecommendations:()=>new Promise(resolve=>pending.push(resolve)),scan:async()=>({id:'new-scan',root:'/scope',files:[],warnings:[]}),updateSettings:async patch=>patch};
  const dom=createDOM(bridge),w=dom.window;
  try{
    await w.qaReady;
    w.qa.state.root='/scope';w.qa.state.scan={id:'old-scan',root:'/scope',files:[]};
    const stale=w.qa.loadPage('recommendations',true);
    await w.qa.startScan();
    pending.shift()([{title:'Old 99-file evidence',detail:'stale',evidence:{files:99}}]);await stale;
    check('Scan completion rejects old recommendation response', w.qa.state.scan.id==='new-scan' && w.qa.state.recommendations===null);
    check('Rejected old recommendations are not cached', !w.qa.state.loaded.has('recommendations'));
    const first=w.qa.loadPage('recommendations',true),second=w.qa.loadPage('recommendations',true);
    const resolveFirst=pending.shift(),resolveSecond=pending.shift();
    resolveSecond([{title:'Newest evidence',evidence:{files:1}}]);await second;
    resolveFirst([{title:'Older evidence',evidence:{files:99}}]);await first;
    check('Latest recommendation request wins out-of-order responses', w.qa.state.recommendations[0].title==='Newest evidence');
    await w.qa.setSettings({largeFileMinBytes:500*1024**2});
    check('Large-file threshold invalidates recommendation cache', w.qa.state.recommendations===null && !w.qa.state.loaded.has('recommendations'));
    const oldThreshold=w.qa.loadPage('recommendations',true);
    await w.qa.setSettings({largeFileMinBytes:250*1024**2});
    pending.shift()([{title:'Old threshold evidence',evidence:{files:99}}]);await oldThreshold;
    check('Threshold change rejects an in-flight recommendation response', w.qa.state.recommendations===null && !w.qa.state.loaded.has('recommendations'));
    const systemRequests=[],diagnosticRequests=[];
    bridge.getSystemInfo=()=>new Promise(resolve=>systemRequests.push(resolve));
    bridge.getDiagnostics=()=>new Promise(resolve=>diagnosticRequests.push(resolve));
    const oldReport=w.qa.loadPage('report',true);systemRequests.shift()({...system,hostname:'Old host'});await tick();
    const newReport=w.qa.loadPage('report',true);systemRequests.shift()({...system,hostname:'New host'});await tick();
    const oldDiagnostic=diagnosticRequests.shift(),newDiagnostic=diagnosticRequests.shift();
    newDiagnostic({status:'partial',marker:'new'});await newReport;
    oldDiagnostic({status:'partial',marker:'old'});await oldReport;
    check('Report and diagnostics commit only the newest request together', w.qa.state.system.hostname==='New host' && w.qa.state.diagnostics.marker==='new');
  }finally{w.close();}
}

async function checkOfflinePreview() {
  const filename = path.join(root, 'deliverables/Aster-interactive-preview.html');
  if (!fs.existsSync(filename)) throw new Error('Build the preview first: node scripts/build-preview.cjs');
  const content = fs.readFileSync(filename, 'utf8');
  const script = content.match(/<script type="module">([\s\S]*)<\/script>/)?.[1];
  check('Offline preview embeds module source', !!script);
  const digest = crypto.createHash('sha256').update(script).digest('base64');
  check('Offline CSP matches embedded source hash', content.includes("script-src 'sha256-" + digest + "'"));
  check('Offline CSP disables network connections', content.includes("connect-src 'none'"));
  check('Offline preview has no external script/stylesheet', !/<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(content));
  const dom = createDOM(undefined, { html: content, source: script });
  try {
    await dom.window.qaReady;
    check('Offline bundle starts in explicit demo mode', dom.window.document.body.textContent.includes('SAMPLE DATA'));
    dom.window.document.querySelector('[data-page="storage"]').click(); await tick();
    check('Offline bundle navigation is functional', !!dom.window.document.querySelector('.treemap'));
    dom.window.document.querySelector('[data-select]').click();
    dom.window.document.querySelector('[data-action="review-selection"]').click(); await tick();
    check('Offline bundle disables mutations', dom.window.document.querySelector('[data-quarantine]').disabled);
  } finally { dom.window.close(); }
}

async function checkWorkbenches(){
  let mode='category',exports=0,updates=null;
  const system={appVersion:'0.3.0-fixture',capabilities:{nativePlatform:true,quarantine:false,restore:false},memory:{total:1000,free:400},cpu:{cores:2},storage:{total:1000,free:200}};
  const registry={file:{name:'fixture.reg',keyCount:1,valueCount:1,destructiveDirectives:0,sections:[{key:'HKEY_CURRENT_USER\\Software\\<fixture>',action:'set-values',values:[{name:'<script>',type:'string',raw:'"<img src=x>"'}]}],warnings:[]},comparison:null};
  const bridge={getSystemInfo:async()=>system,getSettings:async()=>({theme:'light',excludedFolders:[]}),updateSettings:async p=>{updates=p;return p;},getStorageInsights:async()=>({status:'complete',fileCount:1,totalBytes:10,groups:[{id:'logs',title:'Logs',detail:'Review only',count:1,bytes:10,paths:['/scope/log.txt']}],ages:[],extensions:[],history:[],historyPersistent:true}),getOrganizationPreview:async input=>({scanId:'fixture',mode:input?.mode||'category',proposals:[{source:'/scope/log.txt',destination:'/scope/Aster organized/log.txt',size:10,group:'document'}],totalProposals:1,skipped:[],warnings:[]}),exportOrganizationPlan:async()=>{exports++;return {cancelled:true};},getPerformance:async()=>({status:'partial',items:[{id:1,name:'<unsafe>',memoryBytes:100,cpuSeconds:2},{id:2,name:'Music',memoryBytes:20,cpuSeconds:null}],warnings:['Snapshot only']}),getRegistryData:async()=>({file:null,comparison:null}),openRegistryFile:async()=>registry,compareRegistryFile:async()=>({...registry,comparison:{name:'second.reg',summary:{added:0,removed:0,changed:1,addedKeys:0,removedKeys:0},changed:[{key:'HKEY_CURRENT_USER',name:'Example',before:'"one"',after:'"two"'}]}}),openSystemSettings:async key=>({key})};
  const dom=createDOM(bridge),w=dom.window,d=w.document;await w.qaReady;
  try{
    w.qa.state.scan={id:'fixture',root:'/scope',files:[{path:'/scope/log.txt',name:'log.txt',size:10,category:'Logs'}]};
    for(const page of ['insights','organize','performance','registry','tools']){await w.qa.navigate(page);check('Native workbench navigation: '+page,d.querySelector('[data-page-title]').dataset.pageTitle===page&&!!d.querySelector('#main h1'));}
    await w.qa.navigate('insights');d.querySelector('[data-workbench-group="logs"]').click();check('Storage group review never auto-selects',w.qa.state.selected.size===0&&d.querySelector('.tool-file-row')!==null);
    d.querySelector('[data-select]').click();check('Storage group selection is explicit',w.qa.state.selected.size===1);
    await w.qa.navigate('organize');check('Organization preview does not imply execution',d.querySelector('#main').textContent.includes('Preview only'));
    d.querySelector('#organization-mode').value='extension';d.querySelector('[data-action="preview-organization"]').click();await tick();check('Organization mode calls trusted preview',w.qa.state.organizationPreview.mode==='extension');
    d.querySelector('[data-action="export-organization"]').click();await tick();check('Canceled organization export stays quiet',exports===1&&!d.querySelector('#notifications').textContent.includes('plan saved'));
    await w.qa.navigate('performance');check('Performance process names remain text',!d.querySelector('unsafe')&&d.querySelector('#main').textContent.includes('<unsafe>'));
    const search=d.querySelector('#process-search');search.value='music';search.dispatchEvent(new w.Event('input',{bubbles:true}));check('Process filter is case-insensitive',d.querySelectorAll('.tool-table tbody tr').length===1&&d.querySelector('.tool-table tbody').textContent.includes('Music'));
    await w.qa.navigate('registry');d.querySelector('[data-action="open-registry"]').click();await tick();check('Registry file opens without live import',d.querySelector('#main').textContent.includes('fixture.reg')&&!d.querySelector('#main img'));
    d.querySelector('[data-action="compare-registry"]').click();await tick();check('Registry comparison shows before and after',d.querySelector('#main').textContent.includes('Before: "one"')&&d.querySelector('#main').textContent.includes('After: "two"'));
    await w.qa.navigate('settings');const textarea=d.querySelector('#scan-exclusions');textarea.value='Cache\nnode_modules';d.querySelector('[data-action="save-exclusions"]').click();await tick();check('Scan exclusion editor saves relative paths',JSON.stringify(updates.excludedFolders)==='["Cache","node_modules"]');
    check('Settings show running application version',d.querySelector('.settings-footer').textContent.includes('0.3.0-fixture'));
    d.querySelector('#notifications').textContent='';bridge.updateSettings=async()=>{throw new Error('Invalid relative folder');};d.querySelector('#scan-exclusions').value='../outside';d.querySelector('[data-action="save-exclusions"]').click();await tick();check('Rejected exclusions never show a saved-success message',d.querySelector('#notifications').textContent.includes('Invalid relative folder')&&!d.querySelector('#notifications').textContent.includes('exclusions saved'));
  }finally{w.close();}
}


async function checkStudio(){
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const apps={items:[{id:'app-a',name:'Alpha editor',publisher:'Example Publisher',version:'1.0',size:200,iconPath:'J:\\owned.exe'},{id:'app-b',name:'Beta <unsafe>',publisher:'Other studio',version:'2.0',size:600,installedOn:'2026-10-17'}],status:'partial',warnings:[]};
  const system={appVersion:'0.4.0-fixture',capabilities:{nativePlatform:true,quarantine:false,restore:false},memory:{total:1000,free:400},cpu:{cores:4},storage:{total:1000,free:200}};
  let icons=0,exports=0,reads=0,exportCancelled=true;
  const bridge={getSystemInfo:async()=>system,getSettings:async()=>({theme:'light',excludedFolders:[]}),listApplications:async()=>apps,
   getEntityIcons:async input=>{icons++;check('Icon request contains only kind and identities',Object.keys(input).sort().join(',')==='ids,kind'&&!JSON.stringify(input).includes('owned.exe'));return {icons:input.ids.map(id=>({id,dataUrl:id==='app-b'?'https://invalid.example/icon.png':png}))};},
   getDiagnostics:async()=>({volumes:{items:[{id:'J:',total:1000,free:0,fileSystem:'NTFS'},{id:'X:',total:null,free:null}],warnings:['Partial capacity sources']}}),
   getStorageInsights:async()=>({scopeId:'a'.repeat(24),historyPersistent:true,groups:[],folders:[],history:[{scopeId:'a'.repeat(24),totalBytes:2048,fileCount:2,completedAt:'2026-10-17T00:00:00Z'},{scopeId:'b'.repeat(24),totalBytes:999999,fileCount:5,completedAt:'2026-10-16T00:00:00Z'},{scopeId:'a'.repeat(24),totalBytes:1024,fileCount:1,completedAt:'2026-10-15T00:00:00Z'}]}),
   getPerformance:async()=>({collectedAt:new Date(Date.UTC(2026,9,17,0,0,++reads)).toISOString(),status:'partial',cpuPercent:reads>1?5:null,sampleSeconds:reads>1?1:null,items:Array.from({length:85},(_,i)=>({id:i,name:i===1?'Music player':'Worker '+i,memoryBytes:1000-i,cpuSeconds:i,cpuPercent:reads>1?i/10:null})),warnings:[]}),
   exportInventory:async()=>{exports++;return exportCancelled?{cancelled:true}:{ok:true,path:'J:\\owned\\inventory.csv'};}
  };
  const dom=createDOM(bridge),w=dom.window,d=w.document;await w.qaReady;
  const click=async selector=>{const button=d.querySelector(selector);assert(button,selector);button.click();await tick();};
  try{
   await w.qa.navigate('applications');await tick();
   check('Application library displays metadata and native PNG icons',d.querySelectorAll('.application-card').length===2&&d.querySelector('[data-entity-id="app-a"] img')?.src===png&&icons>0);
   check('Nonlocal icon URL rejected by renderer',!d.querySelector('[data-entity-id="app-b"] img'));
   check('Application names stay text in redesigned cards',d.querySelector('.app-library').textContent.includes('Beta <unsafe>')&&!d.querySelector('unsafe'));
   const search=d.querySelector('#app-search');search.value='example publisher';search.dispatchEvent(new w.Event('input',{bubbles:true}));
   check('Application search includes publisher',d.querySelectorAll('.application-card').length===1&&d.querySelector('.application-card').textContent.includes('Alpha'));
   d.querySelector('#app-search').value='';d.querySelector('#app-search').dispatchEvent(new w.Event('input',{bubbles:true}));
   d.querySelector('#app-sort').value='size';d.querySelector('#app-sort').dispatchEvent(new w.Event('change',{bubbles:true}));
   check('Application sort uses reported size',d.querySelector('.application-card').textContent.includes('Beta'));
   await click('[data-app-view="list"]');check('Application list view works',d.querySelector('.app-library').classList.contains('list-layout'));
   await click('[data-app-detail="1"]');check('Application details open with escaped metadata',d.querySelector('#modal').open&&d.querySelector('#modal-title').textContent==='Beta <unsafe>'&&!d.querySelector('#modal unsafe'));
   await click('[data-action="close-modal"]');
   await w.qa.navigate('drives');check('Drive view preserves zero free and missing capacity',d.querySelectorAll('.drive-card').length===2&&d.querySelector('.drive-card').textContent.includes('0 B')&&d.querySelector('.drive-card').textContent.includes('Low space')&&d.querySelectorAll('.drive-card')[1].textContent.includes('Not reported'));
   await w.qa.navigate('history');check('Storage history subtracts only same-scope scans',d.querySelectorAll('.metric-card')[2].textContent.includes('+1 KB')&&d.querySelectorAll('.timeline article').length===3);
   await w.qa.navigate('performance');check('First process snapshot leaves CPU unavailable',d.querySelectorAll('.metric-card')[1].textContent.includes('—'));
   check('Process rows paginate rather than render an unbounded inventory',d.querySelectorAll('.process-table tbody tr').length===80);
   await click('[data-list-page="processes:1"]');check('Process pagination reaches remaining rows',d.querySelectorAll('.process-table tbody tr').length===5);
   const processSearch=d.querySelector('#process-search');processSearch.value='music';processSearch.dispatchEvent(new w.Event('input',{bubbles:true}));check('Process search resets pagination',d.querySelectorAll('.process-table tbody tr').length===1&&d.querySelector('.process-table').textContent.includes('Music'));
   await click('[data-refresh-tool="performance"]');check('Second snapshot renders sampled CPU and session trend',d.querySelectorAll('.metric-card')[1].textContent.includes('5.0%')&&w.qa.state.performanceHistory.length===2);
   await click('[data-action="toggle-monitor"]');check('Live monitoring starts only on explicit request',w.qa.state.monitorPerformance===true);
   await w.qa.navigate('storage');check('Navigating away pauses live monitoring',w.qa.state.monitorPerformance===false);
   w.qa.state.scan={id:'owned',root:'J:\\owned',files:[{path:'J:\\owned\\sample.txt',name:'sample.txt',size:10,category:'Documents'}]};w.qa.render();
   await click('[data-action="export-inventory"]');check('Canceled inventory export does not claim success',exports===1&&!d.querySelector('#notifications').textContent.includes('inventory saved'));
   exportCancelled=false;await click('[data-action="export-inventory"]');check('Inventory export reports only completed save',exports===2&&d.querySelector('#notifications').textContent.includes('inventory saved'));
   d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));check('Command palette opens with keyboard focus',d.querySelector('#modal').open&&d.activeElement.id==='command-query');
   const query=d.querySelector('#command-query');query.value='drive overview';query.dispatchEvent(new w.Event('input',{bubbles:true}));check('Command search filters navigation destinations',[...d.querySelectorAll('[data-command-name]')].filter(n=>!n.hidden).length===1);
   await click('[data-command-page="drives"]');check('Command result navigates and closes dialog',w.qa.state.page==='drives'&&!d.querySelector('#modal').open&&d.activeElement.id==='main');
  }finally{w.close();}
}


async function checkCare(){
 let saved=0,exports=0,validations=0,catalogs=0;const draft='Windows Registry Editor Version 5.00\n\n[HKEY_CURRENT_USER\\Software\\Fixture]\n"x"="before"\n';
 const bridge={getSystemInfo:async()=>({platform:'win32',capabilities:{quarantine:false,restore:false}}),getSettings:async()=>({theme:'dark'}),getActivity:async()=>[],getRecommendations:async()=>[],
 getBrowserReview:async()=>({scanId:'owned',status:'complete',groups:[{id:'cache',title:'Cache <unsafe>',detail:'Metadata only',count:2,bytes:100,protected:false},{id:'protected',title:'Passwords',detail:'Keep',count:1,bytes:10,protected:true}]}),
 getInstallTracking:async()=>({status:'no-baseline'}),captureInstallBaseline:async()=>({status:'compared',baseline:{files:2,createdAt:'2026-10-17T00:00:00Z'},counts:{added:1,changed:0,removed:0},items:[{path:'J:/owned/<unsafe>.txt',change:'added',size:10}]}),exportInstallTracking:async()=>({cancelled:true}),
 getDrivers:async()=>({status:'complete',items:[{name:'GPU <unsafe>',provider:'Maker',version:'1.0',signed:null},{name:'Audio',provider:'Sound',version:'2',signed:true}]}),
 getMaintenance:async()=>({items:[]}),saveMaintenance:async input=>{saved++;return {items:[{id:input.task,label:'Review storage',intervalDays:input.intervalDays,nextDueAt:'2026-11-17T00:00:00Z'}]};},
 getUpdateReview:async()=>({items:[]}),importUpdateCatalog:async()=>{catalogs++;return {source:'unverified local catalog',items:[{name:'<img src=x>',publisher:'Owner',installed:'1',available:'2',status:'newer-listed'}]};},
 getRegistryData:async()=>({file:{name:'fixture.reg',sections:[],keyCount:0,valueCount:0,warnings:[],destructiveDirectives:0}}),getRegistryEditor:async()=>({text:draft,hasFile:true}),previewRegistryDraft:async input=>{validations++;if(input.text==='invalid')throw new Error('Invalid draft');return {summary:{added:0,changed:1,removed:0},destructiveDirectives:0};},exportRegistryDraft:async()=>{exports++;return {cancelled:true};}};
 const dom=createDOM(bridge),w=dom.window,d=w.document;const click=async selector=>{const el=d.querySelector(selector);assert(el,selector);el.click();await tick();};
 try{await w.qaReady;
  check('Task sidebar keeps eight primary destinations visible',d.querySelectorAll('.control-nav').length===8&&!!d.querySelector('.control-nav.selected[data-page="overview"]'));
  check('Dashboard separates six jobs with explicit next actions',d.querySelectorAll('.dashboard-card').length===6&&d.querySelectorAll('.dashboard-card .dashboard-action').length===6&&d.querySelector('.update-card').textContent.includes('Not checked'));
  check('Home puts folder selection and tool search next to useful actions',!!d.querySelector('.dashboard-scope [data-action="choose-folder"]')&&!!d.querySelector('#hub-tool-search')&&!!d.querySelector('.aster-crossbar'));
  const hubSearch=d.querySelector('#hub-tool-search');hubSearch.focus();hubSearch.value='snapshot';hubSearch.dispatchEvent(new w.Event('input',{bubbles:true}));check('Tool search discovers snapshot comparison and preserves focus',d.querySelectorAll('.dashboard-results>button').length===1&&d.querySelector('.dashboard-results [data-page="tracking"]')&&d.activeElement.id==='hub-tool-search');
  d.querySelector('#hub-tool-search').value='';d.querySelector('#hub-tool-search').dispatchEvent(new w.Event('input',{bubbles:true}));await click('[data-action="hub-all-tools"]');check('Show all reveals every additional tool',d.querySelectorAll('.control-extra>button').length===22&&d.querySelector('[data-action="hub-all-tools"]').getAttribute('aria-expanded')==='true');
  await click('[data-page="applications"]');check('Every tool has a clear back path and current tool name',!!d.querySelector('.hub-back[data-page="overview"]')&&d.querySelector('[data-page-title="applications"]').textContent==='Installed apps');await click('.hub-back');
  await click('.control-extra [data-page="tracking"]');check('Direct hub navigation reaches saved snapshot tool',w.qa.state.page==='tracking');
  w.qa.state.scan={id:'fixture',files:[]};w.qa.render();await click('[data-action="care-baseline"]');check('Baseline action updates comparison results',d.querySelector('.care-totals').textContent.includes('1 added')&&d.querySelector('.path-cell').textContent.includes('<unsafe>')&&!d.querySelector('unsafe'));
  await click('[data-action="care-export-tracking"]');check('Canceled tracking export is not reported saved',!d.querySelector('#notifications').textContent.includes('exported'));
  await w.qa.navigate('browser');check('Browser classification renders protected groups without removal controls',d.querySelectorAll('.care-row').length===2&&d.querySelector('.care-list').textContent.includes('protected')&&!d.querySelector('[data-quarantine]'));
  check('Browser metadata is escaped',d.querySelector('.care-row').textContent.includes('<unsafe>')&&!d.querySelector('unsafe'));
  await w.qa.navigate('drivers');check('Driver view preserves unknown signature state',d.querySelector('tbody').textContent.includes('Unknown')&&!d.querySelector('unsafe'));
  const search=d.querySelector('#driver-query');search.focus();search.value='audio';search.dispatchEvent(new w.Event('input',{bubbles:true}));check('Driver search filters rows and retains keyboard focus',d.querySelectorAll('tbody tr').length===1&&d.activeElement.id==='driver-query'&&d.querySelector('tbody').textContent.includes('Audio'));
  await w.qa.navigate('maintenance');d.querySelector('#maintenance-days').value='7';await click('[data-action="care-save-plan"]');check('Maintenance saves a chosen interval and renders review action',saved===1&&d.querySelector('.care-row').textContent.includes('Every 7 days'));
  await click('[data-action="care-reviewed"]');check('Mark reviewed uses the same task interval',saved===2);
  await w.qa.navigate('updates');await click('[data-action="care-import-catalog"]');check('Catalog comparison displays unverified data as text',catalogs===1&&d.querySelector('tbody').textContent.includes('<img src=x>')&&!d.querySelector('tbody img'));
  await w.qa.navigate('registry');await click('[data-action="care-load-draft"]');check('Registry file loads into inert text editor',d.querySelector('#registry-draft-text').value===draft&&d.querySelector('[data-action="care-export-draft"]').disabled);
  d.querySelector('#registry-find').value='before';d.querySelector('#registry-replace').value='after';await click('[data-action="care-replace"]');check('Registry replacement affects draft only',d.querySelector('#registry-draft-text').value.includes('after')&&exports===0);
  await click('[data-action="care-validate-draft"]');check('Successful registry validation enables export',validations===1&&!d.querySelector('[data-action="care-export-draft"]').disabled);
  await click('[data-action="care-export-draft"]');check('Canceled draft export does not claim an applied change',exports===1&&!d.querySelector('#notifications').textContent.includes('Nothing was applied'));
  const text=d.querySelector('#registry-draft-text');text.value='invalid';text.dispatchEvent(new w.Event('input',{bubbles:true}));check('Editing a validated draft revokes export',d.querySelector('[data-action="care-export-draft"]').disabled);
  await click('[data-action="care-validate-draft"]');check('Failed validation remains disabled with readable error',!w.qa.state.registryDraftValid&&d.querySelector('[data-action="care-export-draft"]').disabled&&d.querySelector('#notifications').textContent.includes('Invalid draft'));
 }finally{w.close();}
}


async function checkHubFunctions(){
 let saved=0,loaded=0,samples=0;const bridge={getSystemInfo:async()=>({memory:{free:null}}),getSettings:async()=>({}),getApplicationFootprints:async()=>({status:'partial',items:[{name:'<unsafe>',publisher:'Fixture',matchedDirectory:'J:/owned/App',scannedBytes:20,reportedBytes:null,files:1}],unassignedBytes:10,ambiguousBytes:5}),getPerformanceAdvice:async()=>{samples++;return {items:[{name:'<unsafe>',processes:2,cpuPercent:null,memoryBytes:40,groupedBy:'executable',systemProcess:null,reason:'Current workload'}]};},getInstallTracking:async()=>({status:'no-baseline'}),captureInstallBaseline:async()=>({status:'compared',baseline:{files:1,createdAt:'2026-10-17'},counts:{added:0,changed:0,removed:0},items:[]}),exportInstallBaseline:async()=>{saved++;return {cancelled:true};},importInstallBaseline:async()=>{loaded++;return {status:'compared',baseline:{imported:true,files:1,createdAt:'2026-10-17'},counts:{added:1,changed:0,removed:0},items:[]};}};
 const dom=createDOM(bridge),w=dom.window,d=w.document;const click=async selector=>{assert(d.querySelector(selector),selector);d.querySelector(selector).click();await tick();};
 try{await w.qaReady;
 check('Unknown home memory is not reported as zero',d.querySelector('.dashboard-machine').textContent.includes('Memory unavailable'));
 await w.qa.navigate('footprints');check('App usage displays measured and unassigned storage with coverage caveat',d.querySelector('tbody').textContent.includes('<unsafe>')&&!d.querySelector('unsafe')&&d.querySelector('.hub-explanation').textContent.includes('incomplete'));
 await w.qa.navigate('optimizer');check('Performance review groups workloads and preserves unknown CPU',d.querySelector('tbody').textContent.includes('—')&&!d.querySelector('unsafe')&&d.querySelector('.hub-explanation').textContent.includes('not reclaimable RAM'));
 await click('[data-refresh-tool="optimizer"]');check('Performance refresh takes a fresh sample without a control action',samples===2&&!d.querySelector('[data-stop-process]'));
 await w.qa.navigate('tracking');check('Snapshot actions require a scan and baseline',d.querySelector('[data-action="hub-save-snapshot"]').disabled&&d.querySelector('[data-action="hub-load-snapshot"]').disabled);
 w.qa.state.scan={id:'owned',files:[]};w.qa.render();await click('[data-action="care-baseline"]');check('Captured baseline enables save snapshot',!d.querySelector('[data-action="hub-save-snapshot"]').disabled);
 await click('[data-action="hub-save-snapshot"]');check('Canceled snapshot export does not claim a saved file',saved===1&&!d.querySelector('#notifications').textContent.includes('snapshot saved'));
 await click('[data-action="hub-load-snapshot"]');check('Imported snapshots show an explicit unverified label',loaded===1&&d.querySelector('.care-summary').textContent.includes('unverified local data'));
 await w.qa.navigate('overview');d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'/',bubbles:true}));check('Slash shortcut focuses home tool search',d.activeElement.id==='hub-tool-search');
 }finally{w.close();}
}


async function checkManagement(){
 let writes=0,updates=0,opened=0,baselines=0;const value={name:'Preference',kind:'DWord',data:1};
 const bridge={getSystemInfo:async()=>({}),getSettings:async()=>({}),getStartupControls:async()=>({items:[{id:'startup-fixture',name:'<unsafe>',data:'J:/fixture.exe',enabled:true,scope:'Current user'}]}),previewStartupChange:async()=>({id:'plan',kind:'startup',title:'Disable <unsafe>',detail:'Inert fixture'}),applyStartupChange:async()=>{writes++;return {cancelled:true};},getManagementHistory:async()=>({items:[]}),getManagedUpdates:async()=>({status:'not-checked',items:[]}),checkManagedUpdates:async()=>{updates++;return {status:'complete',items:[{id:'Vendor.Sample',name:'<unsafe>',installed:'1',available:'2'}]};},previewManagedUpdate:async()=>({id:'update-plan',kind:'update',title:'Update <unsafe>',detail:'Inert package'}),applyManagedUpdate:async()=>({cancelled:true}),browseRegistry:async input=>({path:input.path,children:['Child'],values:[value],partial:false}),previewRegistryChange:async input=>({id:'registry-plan',kind:'registry',title:'Edit Preference',detail:JSON.stringify(input.value)}),getTrackedUninstalls:async()=>({items:baselines?[{id:'track',app:{id:'app',name:'Owned App'},root:'J:/owned',files:1}]:[]}),listApplications:async()=>({items:[{id:'app',name:'Owned App'}]}),beginTrackedUninstall:async()=>{baselines++;return {id:'track'};},openTrackedUninstaller:async()=>{opened++;return {ok:true};},compareTrackedUninstall:async()=>({app:{name:'Owned App'},inventoryObservation:'Still reported installed',comparison:{counts:{removed:0,changed:0}},remainingFiles:1,items:[],note:'Cleanup stays disabled.'})};
 const dom=createDOM(bridge),w=dom.window,d=w.document,click=async selector=>{assert(d.querySelector(selector),selector);d.querySelector(selector).click();await tick();};
 try{await w.qaReady;await w.qa.navigate('startupControls');check('Startup manager escapes commands and presents explicit disable action',d.querySelector('tbody').textContent.includes('<unsafe>')&&!d.querySelector('unsafe')&&d.querySelector('[data-action="manage-startup-preview"]').textContent==='Disable');await click('[data-action="manage-startup-preview"]');check('Startup control opens review without applying',d.querySelector('#modal').open&&writes===0&&!d.querySelector('unsafe'));await click('[data-action="manage-apply"]');check('Canceled native startup confirmation does not claim success',writes===1&&!d.querySelector('#notifications').textContent.includes('Change applied'));
 await w.qa.navigate('managedUpdates');check('Updater does not query network on page navigation',updates===0&&d.querySelector('.manager-empty').textContent.includes('not been checked'));await click('[data-action="manage-check-updates"]');check('Explicit update check renders exact versions and escapes names',updates===1&&d.querySelector('tbody').textContent.includes('Vendor.Sample')&&!d.querySelector('unsafe'));await click('[data-action="manage-update-preview"]');check('Update install requires review first',d.querySelector('#modal').textContent.includes('Update <unsafe>'));await click('[data-action="close-modal"]');
 await w.qa.navigate('registryLive');await click('[data-action="manage-registry-browse"]');check('Registry browser shows subkeys and typed existing values',d.querySelector('tbody').textContent.includes('DWord')&&!!d.querySelector('[data-action="manage-registry-child"]'));await click('[data-action="manage-registry-edit"]');d.querySelector('#live-registry-data').value='2';await click('[data-action="manage-registry-preview"]');check('Registry editor prepares a typed review before native confirmation',d.querySelector('.management-preview').textContent.includes('"data":2'));await click('[data-action="close-modal"]');
 w.qa.state.scan={id:'owned',root:'J:/owned',files:[]};await w.qa.navigate('uninstall');d.querySelector('#uninstall-app').value='app';await click('[data-action="manage-uninstall-begin"]');check('Tracked uninstall saves baseline without launching uninstaller',baselines===1&&opened===0&&!!d.querySelector('[data-action="manage-uninstall-open"]'));await click('[data-action="manage-uninstall-open"]');await click('[data-action="manage-uninstall-compare"]');check('Uninstall handoff and comparison never expose leftover deletion',opened===1&&d.querySelector('#main').textContent.includes('Cleanup stays disabled')&&!d.querySelector('[data-delete-leftover]'));
 }finally{w.close();}
}

(async () => {
  await checkDemo();
  await checkNativeBridge();
  await checkAsyncFreshness();
  await checkWorkbenches();
  await checkStudio();
  await checkCare();
  await checkHubFunctions();
  await checkManagement();
  await checkOfflinePreview();
  const report = { schemaVersion: 1, nodeVersion: process.version, qaDependency: { name: 'jsdom', resolved: jsdomResolved, requiredForRuntime: false }, generatedAt: new Date().toISOString(), mode: 'jsdom DOM/event and simulated-bridge checks', passed: results.length, failed: 0, limitations: ['No pixel/layout/browser-engine validation', 'Native dialog behavior is stubbed for DOM state testing', 'No Windows/macOS execution or Electron packaging validation', 'No real user files scanned, moved, or restored'], tests: results };
  fs.mkdirSync(path.join(root, 'qa'), { recursive: true });
  fs.writeFileSync(path.join(root, 'qa/renderer-dom.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`\n${results.length} renderer checks passed. Report: qa/renderer-dom.json`);
})().catch(error => { console.error(error); process.exitCode = 1; });
