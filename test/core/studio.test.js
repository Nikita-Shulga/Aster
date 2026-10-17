'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {samplePerformance}=require('../../src/core/performance');
const {inventoryCSV,csvCell}=require('../../src/core/inventory-export');
const {scopeId,folderBreakdown,analyzeStorage}=require('../../src/core/workbench');
const row=(extra={})=>({id:7,name:'Owned sample',startedAt:'2026-10-17T00:00:00Z',cpuSeconds:10,memoryBytes:100,...extra});
const snapshot=(seconds,items)=>({collectedAt:new Date(Date.UTC(2026,9,17,1,0,seconds)).toISOString(),items});
test('CPU percentages use elapsed time, logical processor count and a stable process instance',()=>{
 const result=samplePerformance(snapshot(0,[row()]),snapshot(4,[row({cpuSeconds:14})]),{cores:4});assert.equal(result.items[0].cpuPercent,25);assert.equal(result.cpuPercent,25);assert.equal(result.sampleSeconds,4);assert.equal(result.measuredProcesses,1);
 assert.equal(samplePerformance(null,snapshot(4,[row()]),{cores:4}).cpuPercent,null);
});
test('reused PID, missing identity, reversed counters, stale time and unavailable readings never invent usage',()=>{
 for(const item of [row({startedAt:'2026-10-17T00:01:00Z'}),row({startedAt:null}),row({cpuSeconds:9}),row({cpuSeconds:null}),row({cpuSeconds:9999})])assert.equal(samplePerformance(snapshot(0,[row()]),snapshot(4,[item]),{cores:4}).items[0].cpuPercent,null);
 assert.equal(samplePerformance(snapshot(4,[row()]),snapshot(0,[row({cpuSeconds:11})]),{cores:4}).cpuPercent,null);
 assert.equal(samplePerformance(snapshot(0,[row()]),snapshot(121,[row({cpuSeconds:11})]),{cores:4}).cpuPercent,null);
});
test('CSV quoting and formula neutralization keep untrusted filenames inert in spreadsheets',()=>{
 for(const value of ['=SUM(1,2)','+cmd','@formula','-1+2','\t=HYPERLINK("x")'])assert.ok(csvCell(value).startsWith('"\''));
 const scan={id:'owned',files:[{name:'=danger.csv',path:'J:\\fixture\\comma,"name".txt',size:8,category:'document',modifiedAt:'2026-10-17'}]};const before=JSON.stringify(scan),csv=inventoryCSV(scan);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=danger.csv"'));assert.ok(csv.includes('comma,""name"".txt'));assert.equal(JSON.stringify(scan),before);assert.throws(()=>inventoryCSV(null),/Scan a folder/);
});
test('folder totals allocate each trusted file once and omit an outside path',()=>{
 const root=path.resolve('test/core/.fixtures/owned');const make=(name,size)=>({name:path.basename(name),path:path.join(root,name),size});const scan={roots:[root],files:[make('root.txt',2),make('A/one.txt',3),make('A/sub/two.txt',4),make('Backups/three.txt',5),{name:'outside',path:path.resolve(root,'../elsewhere'),size:100}]};
 const groups=folderBreakdown(scan);assert.equal(groups.reduce((n,g)=>n+g.bytes,0),14);assert.equal(groups.find(g=>g.name==='A').files,2);assert.equal(groups.find(g=>g.name==='Backups').protected,true);
});
test('private scan scope changes for roots, exclusions and hidden-file rules',()=>{
 const scan={roots:['J:\\owned'],includeHidden:false,exclusions:[],limits:{maxFiles:10}};const id=scopeId(scan);assert.match(id,/^[0-9a-f]{24}$/);for(const patch of [{roots:['J:\\other']},{includeHidden:true},{exclusions:['cache']},{limits:{maxFiles:20}}])assert.notEqual(scopeId({...scan,...patch}),id);assert.equal(scopeId(structuredClone(scan)),id);
});
test('cache and build review requires recognized folders and always protects original backups',()=>{
 const root=path.resolve('test/core/.fixtures/owned'),make=(name,size)=>({path:path.join(root,name),name:path.basename(name),size,modifiedAt:null});const data=analyzeStorage({id:'sample',roots:[root],warnings:['Incomplete source'],files:[make('Browser/Code Cache/item',10),make('Project/node_modules/package/file.js',20),make('Backups/Code Cache/original',30),make('Other/random.bin',40)]});assert.equal(data.status,'partial');assert.equal(data.groups.find(g=>g.id==='applicationCaches').bytes,10);assert.equal(data.groups.find(g=>g.id==='buildArtifacts').bytes,20);assert.equal(data.groups.find(g=>g.id==='protected').bytes,30);assert.equal(data.automaticSelection,false);assert.equal(data.spaceFreed,0);
});
