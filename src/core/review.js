'use strict';
const path=require('node:path');
const {scopeId}=require('./workbench');
const absolute=value=>typeof value==='string'&&/^[a-z]:[\\/]/i.test(value)&&!value.slice(2).includes(':')&&!/[\x00-\x1f]/.test(value)&&!value.split(/[\\/]/).includes('..');
const fold=value=>path.win32.normalize(value).replace(/[\\/]+$/,'').toLowerCase();
const within=(base,file)=>file===base||file.startsWith(base+'\\');
const size=n=>Number.isSafeInteger(n)&&n>=0?n:0;
function applicationFootprints(scan,inventory){
 if(!scan)return {status:'no-scan',items:[],unassignedBytes:0,ambiguousBytes:0,canExecute:false};
 const roots=new Map(),items=new Map();
 for(const app of inventory?.items||[]){if(!absolute(app.path))continue;const root=fold(app.path);if(root.length<4)continue;const list=roots.get(root)||[];list.push(app);roots.set(root,list);}
 const sorted=[...roots.keys()].sort((a,b)=>b.length-a.length);let unassignedBytes=0,ambiguousBytes=0;
 for(const f of scan.files||[]){const bytes=size(f.size);if(!absolute(f.path)){unassignedBytes+=bytes;continue;}const p=fold(f.path),root=sorted.find(r=>within(r,p));if(!root){unassignedBytes+=bytes;continue;}const matches=roots.get(root);if(matches.length!==1){ambiguousBytes+=bytes;continue;}const app=matches[0],id=String(app.id||root),row=items.get(id)||{id,name:app.name||'Application',publisher:app.publisher||'',reportedBytes:Number.isSafeInteger(app.size)?app.size:null,scannedBytes:0,files:0,matchedDirectory:app.path};row.scannedBytes+=bytes;row.files++;items.set(id,row);}
 return {status:scan.truncated||scan.cancelled||scan.warnings?.length||scan.warningsOmitted?'partial':'complete',items:[...items.values()].sort((a,b)=>b.scannedBytes-a.scannedBytes),unassignedBytes,ambiguousBytes,canExecute:false,scope:'Current selected folder only; install-directory matches are evidence of location, not proof of ownership or safe leftovers.'};
}
function performanceAdvice(performance){
 const groups=new Map();
 for(const row of performance?.items||[]){const executable=absolute(row.executablePath)?fold(row.executablePath):null,key=executable||'pid:'+row.id;let g=groups.get(key);if(!g){g={id:String(row.id),name:row.name||'Process',processes:0,memoryBytes:0,cpuPercent:null,cpuMeasured:0,groupedBy:executable?'executable':'process',systemProcess:executable?/[\\/]windows[\\/](?:system32|syswow64)[\\/]/i.test(executable):null};groups.set(key,g);}g.processes++;g.memoryBytes+=size(row.memoryBytes);if(typeof row.cpuPercent==='number'&&Number.isFinite(row.cpuPercent)&&row.cpuPercent>=0&&row.cpuPercent<=100){g.cpuPercent=(g.cpuPercent||0)+row.cpuPercent;g.cpuMeasured++;}}
 const items=[...groups.values()].map(g=>({...g,cpuPercent:g.cpuMeasured===g.processes?Math.min(100,g.cpuPercent):null,reason:g.memoryBytes>=1024**3?'Large working set':'Current workload',canExecute:false})).sort((a,b)=>(b.cpuPercent||0)-(a.cpuPercent||0)||b.memoryBytes-a.memoryBytes);
 return {status:performance?.status||'unavailable',collectedAt:performance?.collectedAt||null,items,memory:performance?.memory||null,canExecute:false,notes:['CPU needs two comparable samples. Missing readings remain unknown.','Working sets can share memory; totals are not reclaimable RAM.','Review your own app before closing it. Aster does not stop processes, suspend apps or change priority.']};
}
function validateSnapshot(raw){
 if(!raw||raw.schemaVersion!==1||raw.kind!=='aster-folder-snapshot'||!raw.snapshot||typeof raw.snapshot!=='object')throw new Error('Choose an Aster folder snapshot.');
 const s=raw.snapshot;if(!Array.isArray(s.roots)||s.roots.length!==1||!s.roots.every(absolute)||!Array.isArray(s.files)||s.files.length>20000||!/^[a-f0-9]{24}$/.test(s.scopeId||'')||typeof s.createdAt!=='string'||!Number.isFinite(Date.parse(s.createdAt)))throw new Error('Invalid or oversized folder snapshot.');
 const root=fold(s.roots[0]),seen=new Set();if(root.length<4)throw new Error('Whole-drive snapshots are unsupported.');
 const files=s.files.map(f=>{if(!f||!absolute(f.path)||!within(root,fold(f.path))||fold(f.path)===root||seen.has(fold(f.path))||!Number.isSafeInteger(f.size)||f.size<0||f.modifiedAt!==null&&(typeof f.modifiedAt!=='string'||!Number.isFinite(Date.parse(f.modifiedAt)))||f.hash!==null&&!/^[a-f0-9]{64}$/.test(f.hash||''))throw new Error('Invalid snapshot file record.');seen.add(fold(f.path));return {path:f.path,size:f.size,modifiedAt:f.modifiedAt,hash:f.hash};});
 return {scanId:typeof s.scanId==='string'?s.scanId.slice(0,160):'imported',roots:[...s.roots],scopeId:s.scopeId,createdAt:s.createdAt,files,imported:true};
}
function snapshotDocument(snapshot){if(!snapshot)throw new Error('Capture a folder baseline first.');const data={schemaVersion:1,kind:'aster-folder-snapshot',snapshot};validateSnapshot(data);const text=JSON.stringify(data,null,2)+'\n';if(Buffer.byteLength(text)>4*1024**2)throw new Error('Snapshot exceeds the 4 MB export limit.');return text;}
function compatibleSnapshot(snapshot,scan){return !!snapshot&&!!scan&&snapshot.scopeId===scopeId(scan)&&snapshot.roots?.length===1&&scan.roots?.length===1&&fold(snapshot.roots[0])===fold(scan.roots[0]);}
module.exports={applicationFootprints,performanceAdvice,validateSnapshot,snapshotDocument,compatibleSnapshot};
