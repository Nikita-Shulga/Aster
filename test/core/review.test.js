'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const r=require('../../src/core/review'),care=require('../../src/core/care');
const scan=()=>({id:'owned',roots:['J:/fixture'],includeHidden:false,warnings:[],files:[{path:'J:/fixture/a.txt',size:10,modifiedAt:'2026-10-17T00:00:00Z',sha256:'a'.repeat(64)}]});
test('app usage picks the longest exact directory boundary and never infers ownership',()=>{
 const data={files:[{path:'J:/Apps/One/a',size:10},{path:'J:/Apps/One/plugin/a',size:20},{path:'J:/Apps/OneOther/a',size:30}]};
 const result=r.applicationFootprints(data,{items:[{id:'a',name:'One',path:'j:/apps/one',size:500},{id:'b',name:'Plugin',path:'J:/Apps/One/plugin'}]});
 assert.deepEqual(result.items.map(i=>[i.id,i.scannedBytes,i.files]),[['b',20,1],['a',10,1]]);assert.equal(result.unassignedBytes,30);assert.equal(result.canExecute,false);assert.equal(result.items[1].reportedBytes,500);
});
test('shared roots are ambiguous while invalid drive-root and traversal app paths do not match',()=>{
 const data={files:[{path:'J:/Apps/shared/a',size:100},{path:'J:/Apps/else/a',size:9}],warnings:['partial']};
 const result=r.applicationFootprints(data,{items:[{path:'J:/Apps/shared'},{path:'j:/apps/SHARED/'},{path:'J:/'},{path:'J:/Apps/../Apps/else'},{path:'relative'}]});assert.equal(result.ambiguousBytes,100);assert.equal(result.unassignedBytes,9);assert.equal(result.items.length,0);assert.equal(result.status,'partial');assert.equal(r.applicationFootprints(null,{}).status,'no-scan');
});
test('performance grouping uses executable identity and preserves unknown CPU',()=>{
 const result=r.performanceAdvice({status:'complete',items:[{id:1,name:'App',executablePath:'J:/Apps/App.exe',memoryBytes:10,cpuPercent:0},{id:2,name:'App',executablePath:'j:/apps/app.exe',memoryBytes:20,cpuPercent:null},{id:3,name:'Same name',memoryBytes:30,cpuPercent:1},{id:4,name:'Same name',memoryBytes:40,cpuPercent:2}]});assert.equal(result.items.length,3);const g=result.items.find(i=>i.processes===2);assert.equal(g.memoryBytes,30);assert.equal(g.cpuPercent,null);assert.equal(g.canExecute,false);assert.equal(result.canExecute,false);
});
test('performance group bounds CPU and identifies reported system locations without process control',()=>{
 const result=r.performanceAdvice({items:[{id:1,executablePath:'J:/Windows/System32/tool.exe',memoryBytes:2*1024**3,cpuPercent:70},{id:2,executablePath:'J:/Windows/System32/tool.exe',memoryBytes:1,cpuPercent:60},{id:3,memoryBytes:0,cpuPercent:0}]});assert.equal(result.items[0].cpuPercent,100);assert.equal(result.items[0].systemProcess,true);assert.equal(result.items[1].cpuPercent,0);assert.equal(r.performanceAdvice(null).status,'unavailable');
});
test('snapshot JSON round trips detached metadata with explicit scope and unverified import',()=>{
 const data=scan(),b=care.snapshot(data),doc=JSON.parse(r.snapshotDocument(b)),loaded=r.validateSnapshot(doc);assert.equal(loaded.imported,true);assert.equal(r.compatibleSnapshot(loaded,data),true);doc.snapshot.files[0].size=99;assert.equal(loaded.files[0].size,10);assert.equal(r.compatibleSnapshot(loaded,{...data,roots:['J:/different']}),false);assert.equal(r.compatibleSnapshot(loaded,{...data,includeHidden:true}),false);
});
test('snapshot validation rejects duplicates traversal out-of-scope records invalid metadata and excessive counts',()=>{
 const raw=()=>JSON.parse(r.snapshotDocument(care.snapshot(scan())));
 const edits=[d=>d.snapshot.files.push({...d.snapshot.files[0],path:'j:/FIXTURE/A.txt'}),d=>d.snapshot.files[0].path='J:/fixture/../outside',d=>d.snapshot.files[0].path='J:/fixture-other/a',d=>d.snapshot.files[0].path='J:/fixture/a:stream',d=>d.snapshot.files[0].size=-1,d=>d.snapshot.files[0].hash='bad',d=>d.snapshot.files[0].modifiedAt='bad',d=>d.snapshot.roots=['J:/'],d=>d.snapshot.files=Array(20001).fill(d.snapshot.files[0]),d=>d.snapshot.scopeId='forged'];
 for(const edit of edits){const d=raw();edit(d);assert.throws(()=>r.validateSnapshot(d));}assert.throws(()=>r.validateSnapshot({}));assert.throws(()=>r.snapshotDocument(null));
});
test('imported Windows snapshot paths compare case-insensitively without false added or removed entries',()=>{
 const data=scan(),raw=JSON.parse(r.snapshotDocument(care.snapshot(data)));raw.snapshot.files[0].path='j:\\FIXTURE\\A.txt';assert.deepEqual(care.compareSnapshot(r.validateSnapshot(raw),data).counts,{added:0,changed:0,removed:0});
});
