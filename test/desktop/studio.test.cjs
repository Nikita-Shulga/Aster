'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {EntityIcons,iconPath}=require('../../src/desktop/entity-icons.cjs');
const {DesktopService}=require('../../src/desktop/service.cjs');const {createService}=require('../../src/core');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
test('icon source accepts local executable resources and refuses network, command and traversal paths',()=>{
 assert.equal(iconPath('"J:\\Owned App\\owned.exe",-42'),'J:\\Owned App\\owned.exe');
 for(const value of ['\\\\server\\share\\app.exe','https://site/app.exe','J:\\owned.exe --run','J:\\owned.exe:stream','J:\\..\\outside.exe','relative.exe','J:\\passwords.txt','%TEMP%\\app.exe','J:\\owned.exe\n'])assert.equal(iconPath(value),null,value);
});
test('icons come only from registered identities, are cached and reject untrusted image types',async()=>{
 const calls=[];const icons=new EntityIcons({validate:async()=>{},readIcon:async file=>{calls.push(file);return file.includes('bad')?'data:image/svg+xml;base64,AAAA':png;}});icons.register('applications',[{id:'known',iconPath:'J:\\owned.exe'},{id:'bad',iconPath:'J:\\bad.exe'}]);
 const a=await icons.get({kind:'applications',ids:['known','unregistered','bad']});assert.deepEqual(a.icons,[{id:'known',dataUrl:png}]);assert.equal(calls.length,2);await icons.get({kind:'applications',ids:['known','bad']});assert.equal(calls.length,2);
 for(const input of [{kind:'other',ids:[]},{kind:'applications',ids:['known','known']},{kind:'applications',ids:Array.from({length:101},(_,i)=>String(i))}])await assert.rejects(icons.get(input),/Invalid icon/);
});
test('native icon concurrency stays bounded across overlapping requests',async()=>{
 let active=0,peak=0;const icons=new EntityIcons({validate:async()=>{},readIcon:async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return png;}});icons.register('performance',Array.from({length:8},(_,i)=>({id:i,executablePath:'J:\\owned'+i+'.exe'})));await Promise.all([icons.get({kind:'performance',ids:['0','1','2','3']}),icons.get({kind:'performance',ids:['4','5','6','7']})]);assert.ok(peak<=2);
});
async function fixture(){const base=path.resolve('test/desktop/.fixtures');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'studio-'));await fs.writeFile(path.join(dir,'fixture-owner.json'),'{"purpose":"Aster disposable studio tests"}',{flag:'wx'});const selected=path.join(dir,'Samples');await fs.mkdir(selected);await fs.writeFile(path.join(selected,'=formula.txt'),'fixture bytes',{flag:'wx'});const dialog={showOpenDialog:async()=>({canceled:false,filePaths:[selected]}),showSaveDialog:async()=>({canceled:true})};const deps={core:createService(),platform:{getSystemInfo:async()=>({capabilities:{}}),listStartup:async()=>({items:[]}),listApplications:async()=>({items:[]})},dialog,shell:{},userData:path.join(dir,'profile'),window:()=>null};return {dir,selected,dialog,deps,service:await new DesktopService(deps).initialize()};}
test('CSV export needs a picked scan, respects cancellation and never overwrites an existing file',async()=>{
 const f=await fixture();await assert.rejects(f.service.exportInventory(),/Scan a folder/);await f.service.selectFolder();await f.service.scan({root:f.selected});assert.equal((await f.service.exportInventory()).cancelled,true);const output=path.join(f.dir,'inventory.csv');f.dialog.showSaveDialog=async()=>({canceled:false,filePath:output});assert.equal((await f.service.exportInventory()).ok,true);const bytes=await fs.readFile(output);assert.ok(bytes.toString().includes("'=formula.txt"));await assert.rejects(f.service.exportInventory(),/already exists/);assert.deepEqual(await fs.readFile(output),bytes);assert.equal(await fs.readFile(path.join(f.selected,'=formula.txt'),'utf8'),'fixture bytes');
});
test('scope-aware history survives restart while filenames and paths remain absent',async()=>{
 const f=await fixture();await f.service.selectFolder();await f.service.scan({root:f.selected});const insights=f.service.getStorageInsights();assert.equal(insights.scopeId,insights.history[0].scopeId);const again=await new DesktopService({...f.deps,core:createService()}).initialize();assert.equal(again.getScanHistory()[0].scopeId,insights.scopeId);const stored=await fs.readFile(path.join(f.deps.userData,'scan-history.json'),'utf8');assert.ok(!stored.includes('formula'));assert.ok(!stored.includes(f.selected));assert.equal(insights.folders.length,1);
});
