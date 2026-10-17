'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {DesktopService}=require('../../src/desktop/service.cjs');
// Match the picker realpath grant, including Windows temporary-directory 8.3 aliases.
// Keep production grant checks exact; fixture file records must use the same canonical root.
async function fixture(t){const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'aster-service-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));const requestedFolder=path.join(base,'selected');await fs.mkdir(requestedFolder);const folder=await fs.realpath(requestedFolder);const file=path.join(folder,'note.txt');await fs.writeFile(file,'hello');const core={scan:async o=>({id:'scan-1',roots:o.roots,files:[{id:'f1',path:file,name:'note.txt',size:5}],totals:{files:1,bytes:5},duplicates:[],warnings:[]}),createCleanupPlan:async o=>({id:'plan-1',scanId:o.scanId,files:[{id:'f1',path:file,size:5}],totalBytes:5})};const dialog={showOpenDialog:async()=>({canceled:false,filePaths:[folder]}),showSaveDialog:async()=>({canceled:true}),showMessageBox:async()=>({response:0})};const service=await new DesktopService({core,platform:{getSystemInfo:async()=>({hostname:'private-host',capabilities:{}}),listStartup:async()=>({items:[]}),listApplications:async()=>({items:[]})},dialog,shell:{showItemInFolder:()=>{},openExternal:()=>{}},userData:path.join(base,'data'),window:()=>null}).initialize();return {service,folder,file,core,dialog,base};}
test('scan cannot accept an ungranted renderer path',async t=>{const {service,folder}=await fixture(t);await assert.rejects(service.scan({root:folder}),/folder picker/);const chosen=await service.selectFolder();const result=await service.scan({root:chosen});assert.equal(result.files.length,1);assert.equal(result.summary.totalBytes,5);});
test('plan rejects paths absent from trusted current scan',async t=>{const {service,folder,file}=await fixture(t);await service.selectFolder();await service.scan({root:folder});await assert.rejects(service.previewQuarantine({scanId:'scan-1',paths:['/etc/passwd']}),/outside/);const p=await service.previewQuarantine({scanId:'scan-1',paths:[file]});assert.equal(p.spaceFreed,0);assert.equal(p.canExecute,false);await assert.rejects(service.quarantine({previewId:p.id}),/not yet been completed/);});
test('cancel propagates only to active scan and repeated scans reject',async t=>{const {service,folder,core}=await fixture(t);await service.selectFolder();core.scan=o=>new Promise(resolve=>o.signal.addEventListener('abort',()=>resolve({id:'scan-cancelled',roots:[folder],files:[],totals:{},warnings:[],cancelled:true})));const running=service.scan({root:folder});await assert.rejects(service.scan({root:folder}),/already running/);assert.equal(service.cancelScan().cancelled,true);assert.equal((await running).cancelled,true);assert.equal(service.cancelScan().cancelled,false);});
test('settings persist without arbitrary path/config injection',async t=>{const {service,base}=await fixture(t);await service.updateSettings({theme:'dark'});assert.equal(JSON.parse(await fs.readFile(path.join(base,'data/settings.json'))).theme,'dark');await assert.rejects(service.updateSettings({enableAdmin:true}),/Unsupported/);});
test('reports omit file paths, filenames, and hostname',async t=>{const {service,folder,file,base,dialog}=await fixture(t);await service.selectFolder();await service.scan({root:folder});const out=path.join(base,'report.json');dialog.showSaveDialog=async()=>({canceled:false,filePath:out});await service.exportReport();const data=await fs.readFile(out,'utf8');assert.ok(!data.includes(file));assert.ok(!data.includes('note.txt'));assert.ok(!data.includes('private-host'));});
test('reveal cannot open an arbitrary renderer-supplied path',async t=>{const {service}=await fixture(t);await assert.rejects(service.revealPath('/etc/passwd'),/current scan/);await assert.rejects(service.openSystemSettings('https://attacker.example'),/unavailable/);});

function snapshotCore(core,folder,file){let sequence=0;core.scan=async o=>({id:`snapshot-${++sequence}`,roots:o.roots,includeHidden:o.includeHidden,exclusions:[],limits:o.limits,files:[{id:'f1',path:file,name:'note.txt',size:sequence,mtimeMs:sequence}],totals:{files:1,bytes:sequence},duplicates:[],warnings:[],startedAt:'2026-10-17T00:00:00.000Z',completedAt:'2026-10-17T00:00:01.000Z'});}
test('same-scope comparison uses trusted snapshots and stores only bounded session summaries',async t=>{
 const {service,folder,file,core,base}=await fixture(t);snapshotCore(core,folder,file);await service.selectFolder();
 const first=await service.scan({root:folder,previous:{files:[]}});assert.equal(first.comparison,null);
 const second=await service.scan({root:folder,previousScanId:'forged',comparison:{comparable:false}});assert.equal(second.comparison.comparable,true);assert.equal(second.comparison.totals.deltaBytes,1);assert.equal(second.analysis.totals.files,1);
 for(let i=0;i<12;i++)await service.scan({root:folder});
 const history=service.getScanHistory();assert.equal(history.length,10);assert.ok(!JSON.stringify(history).includes(folder));history[0].fileCount=1000;assert.equal(service.getScanHistory()[0].fileCount,1);
 assert.deepEqual(await fs.readdir(path.join(base,'data')),['scan-history.json']);const saved=await fs.readFile(path.join(base,'data/scan-history.json'),'utf8');assert.ok(!saved.includes(folder));assert.ok(!saved.includes('note.txt'));assert.equal(JSON.parse(saved).length,10);assert.equal(service.scans.size,1);assert.ok(service.previousScan);
});
test('comparison resets when scope or hidden preference changes',async t=>{
 const {service,folder,file,core,dialog,base}=await fixture(t);snapshotCore(core,folder,file);await service.selectFolder();await service.scan({root:folder});
 assert.equal((await service.scan({root:folder,includeHidden:true})).comparison,null);
 const second=path.join(base,'other');await fs.mkdir(second);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[second]});const selected=await service.selectFolder();
 assert.equal((await service.scan({root:selected,includeHidden:true})).comparison,null);assert.equal(service.previousScan,null);
});
test('partial snapshots cannot produce a comparable full-scope result',async t=>{
 const {service,folder,file,core}=await fixture(t);snapshotCore(core,folder,file);await service.selectFolder();await service.scan({root:folder});
 const scan=core.scan;core.scan=async o=>({...await scan(o),cancelled:true,warnings:[{message:'PRIVATE/path failed'}]});
 const result=await service.scan({root:folder});assert.equal(result.comparison.comparable,false);assert.equal(result.analysis.completeness,'partial');
});
test('preview finishing after a new scan is rejected and never repopulates previews',async t=>{
 const {service,folder,file,core}=await fixture(t);await service.selectFolder();await service.scan({root:folder});let resolve;
 core.createCleanupPlan=()=>new Promise(r=>{resolve=r;});
 const pending=service.previewQuarantine({scanId:'scan-1',paths:[file]});
 await assert.rejects(service.previewQuarantine({scanId:'scan-1',paths:[file]}),/already running/);
 await service.scan({root:folder});resolve({id:'stale-plan',files:[],totalBytes:0});await assert.rejects(pending,/expired/);assert.equal(service.previews.size,0);assert.equal(service.previewBusy,false);
});
test('active scans refuse previews and failed scans release the lock',async t=>{
 const {service,folder,file,core}=await fixture(t);await service.selectFolder();await service.scan({root:folder});let reject;
 core.scan=()=>new Promise((_,r)=>{reject=r;});const pending=service.scan({root:folder});
 await assert.rejects(service.previewQuarantine({scanId:'scan-1',paths:[file]}),/current scan/);reject(new Error('collector failed'));await assert.rejects(pending,/collector failed/);assert.equal(service.active,null);
});
test('forged and expired snapshot IDs cannot authorize previews',async t=>{
 const {service,folder,file,core}=await fixture(t);snapshotCore(core,folder,file);await service.selectFolder();const before=await service.scan({root:folder});await service.scan({root:folder});
 for(const scanId of ['forged',before.id])await assert.rejects(service.previewQuarantine({scanId,paths:[file]}),/expired/);
 await assert.rejects(service.previewQuarantine({scanId:{id:'snapshot-2'},paths:[file]}),/identifier/);
});
test('overlapping settings updates serialize and persist every valid patch',async t=>{
 const {service,base}=await fixture(t);await Promise.all([service.updateSettings({theme:'dark'}),service.updateSettings({includeHidden:true}),service.updateSettings({largeFileMinBytes:2*1024**2})]);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(base,'data/settings.json'))),service.getSettings());assert.equal(service.getSettings().theme,'dark');assert.equal(service.getSettings().includeHidden,true);
});
test('settings failed publication does not change in-memory settings and queue recovers',async t=>{
 const {service,base}=await fixture(t);const destination=path.join(base,'data/settings.json');await fs.mkdir(destination);await assert.rejects(service.updateSettings({theme:'dark'}));assert.equal(service.getSettings().theme,'system');await fs.rmdir(destination);await service.updateSettings({includeHidden:true});assert.equal(service.getSettings().includeHidden,true);assert.deepEqual((await fs.readdir(path.dirname(destination))).filter(n=>n.endsWith('.tmp')),[]);
});
test('export comparison and recommendations contain only known scalar fields',async t=>{
 const {service,folder,file,base,dialog,core}=await fixture(t);snapshotCore(core,folder,file);await service.selectFolder();await service.scan({root:folder});await service.scan({root:folder});
 service.comparison.extra='PRIVATE-COMPARISON';service.comparison.totals.secret='PRIVATE-TOTAL';
 service.recommendationsForScan=async()=>[{id:'review-duplicates',severity:'info',title:'PRIVATE-TITLE',detail:'PRIVATE-DETAIL',evidence:{groups:2,potentialBytes:50,path:file,secret:'PRIVATE-EVIDENCE'}},{id:'PRIVATE-ID',evidence:{}}];
 const out=path.join(base,'private-summary.json');dialog.showSaveDialog=async()=>({canceled:false,filePath:out});await service.exportReport();const text=await fs.readFile(out,'utf8');assert.doesNotMatch(text,/PRIVATE-|note\.txt/);assert.ok(!text.includes(folder));const report=JSON.parse(text);assert.equal(report.schemaVersion,2);assert.equal(report.comparison.totals.deltaBytes,1);assert.deepEqual(report.recommendations,[{id:'review-duplicates',severity:'info',evidence:{groups:2,potentialBytes:50}}]);
});
test('recommendations tolerate unavailable inventory without trusting renderer scan input',async t=>{
 const {service}=await fixture(t);service.platform.listStartup=async()=>{throw new Error('PRIVATE-ERROR');};const result=await service.getRecommendations({scan:{files:[{path:'/forged',size:999999999}]}});assert.ok(result.some(r=>r.id==='startup-coverage'));assert.ok(!JSON.stringify(result).includes('PRIVATE-ERROR'));assert.ok(!result.some(r=>r.id==='review-large-files'));
});
