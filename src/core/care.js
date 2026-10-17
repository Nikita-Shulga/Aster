'use strict';
const {scopeId}=require('./workbench');
const fileKey=value=>/^[a-z]:[\\/]/i.test(value)?require('node:path').win32.normalize(value).toLowerCase():value;
const DAY=86400000;
const TASKS=Object.freeze({storage:'Review storage',startup:'Review startup apps',updates:'Review software updates',backup:'Check your backup',privacy:'Review browser data'});
function completed(scan){return !!scan&&!scan.cancelled&&!scan.truncated&&!scan.warnings?.length&&!scan.warningsOmitted;}
function browserProfilePath(value){return /(?:^|\/)(?:Google\/Chrome|Microsoft\/Edge|BraveSoftware|Mozilla\/Firefox|Firefox\/Profiles|Chromium|Opera(?: Software)?)(?:\/|$)/i.test(String(value).replace(/\\/g,'/'));}
function browserReview(scan){
  const buckets={cache:[],history:[],sessions:[],protected:[]};
  for(const f of scan?.files||[]){
    const p=f.path.replace(/\\/g,'/');
    if(!browserProfilePath(p))continue;
    if(/(?:^|\/)(?:backups?|saves?|\.git)(?:\/|$)/i.test(p)||/(?:^|\/)(?:Login Data(?:-journal)?|Cookies(?:-journal)?|cookies\.sqlite(?:-wal|-shm)?|logins\.json|key[34]\.db|Bookmarks(?:\.bak)?|places\.sqlite(?:-wal|-shm)?|Web Data(?:-journal)?|Preferences|Secure Preferences)$/i.test(p))buckets.protected.push(f);
    else if(/(?:^|\/)(?:Sessions|Session Storage|sessionstore-backups)(?:\/|$)/i.test(p)||/sessionstore.*\.json/i.test(f.name))buckets.sessions.push(f);
    else if(/(?:^|\/)(?:Cache|Cache_Data|cache2|Code Cache|GPUCache|DawnCache|ShaderCache)(?:\/|$)/i.test(p))buckets.cache.push(f);
    else if(/(?:^|\/)(?:History(?:-journal)?|Visited Links|downloads\.sqlite)$/i.test(p))buckets.history.push(f);
  }
  const labels={cache:['Rebuildable cache','Recognized cache folders. Removal can slow the next visit.'],history:['Browsing history','Sensitive activity records. Contents are never opened.'],sessions:['Tabs and sessions','Can contain unsaved work and signed-in sessions. Keep these.'],protected:['Passwords, cookies and bookmarks','Protected from cleanup suggestions, including mixed Firefox places databases.']};
  return {scanId:scan?.id||null,status:!scan?'no-scan':completed(scan)?'complete':'partial',groups:Object.entries(buckets).map(([id,rows])=>({id,title:labels[id][0],detail:labels[id][1],count:rows.length,bytes:rows.reduce((n,f)=>n+f.size,0),protected:id!=='cache',items:rows.slice(0,200).map(f=>({name:f.name,path:f.path,size:f.size}))})),databaseContentsRead:false,canExecute:false};
}
function snapshot(scan){
  if(!completed(scan))throw new Error('A completed, warning-free folder scan is required for a baseline.');
  return {scanId:scan.id,roots:[...scan.roots],scopeId:scopeId(scan),createdAt:new Date().toISOString(),files:scan.files.map(f=>({path:f.path,size:f.size,modifiedAt:f.modifiedAt??null,hash:f.sha256||null}))};
}
function compareSnapshot(before,scan){
  if(!before)return {status:'no-baseline',items:[],canExecute:false};
  if(!completed(scan)||before.scopeId!==scopeId(scan))return {status:'different-or-incomplete-scope',items:[],canExecute:false};
  const old=new Map(before.files.map(f=>[fileKey(f.path),f])),now=new Map(scan.files.map(f=>[fileKey(f.path),f])),items=[];
  for(const f of scan.files){const prev=old.get(fileKey(f.path));if(!prev)items.push({path:f.path,change:'added',size:f.size});else if(prev.size!==f.size||(prev.modifiedAt??null)!==(f.modifiedAt??null)||(prev.hash&&f.sha256&&prev.hash!==f.sha256))items.push({path:f.path,change:'changed',size:f.size,beforeSize:prev.size});}
  for(const f of before.files)if(!now.has(fileKey(f.path)))items.push({path:f.path,change:'removed',size:f.size});
  return {status:'compared',baselineAt:before.createdAt,baselineScanId:before.scanId,scanId:scan.id,total:items.length,counts:{added:items.filter(i=>i.change==='added').length,changed:items.filter(i=>i.change==='changed').length,removed:items.filter(i=>i.change==='removed').length},items:items.slice(0,2000),truncated:items.length>2000,canExecute:false,attribution:'Observed folder changes only; they do not prove an installer caused them or that remaining files are safe to delete.'};
}
function startupReview(inventory){
  const items=inventory?.items||[],groups=new Map();
  for(const item of items){const key=String(item.command||item.path||'').trim().toLowerCase();if(key){const group=groups.get(key)||[];group.push(item.id);groups.set(key,group);}}
  return {status:inventory?.status||'unavailable',items:items.map(item=>({...item,duplicateCount:groups.get(String(item.command||item.path||'').trim().toLowerCase())?.length||0,review:!item.command&&!item.path?'Target unavailable':(groups.get(String(item.command||item.path||'').trim().toLowerCase())?.length||0)>1?'Repeated target; review each entry':'Review if needed at sign-in',canExecute:false})),canExecute:false};
}
function maintenancePlan(input,now=Date.now()){
  if(!input||!Object.hasOwn(TASKS,input.task)||!Number.isInteger(input.intervalDays)||input.intervalDays<1||input.intervalDays>365)throw new Error('Choose a maintenance task and an interval from 1 to 365 days.');
  return {id:input.task,label:TASKS[input.task],intervalDays:input.intervalDays,lastReviewedAt:new Date(now).toISOString(),nextDueAt:new Date(now+input.intervalDays*DAY).toISOString(),automaticExecution:false};
}
function savedPlans(raw){
  if(!Array.isArray(raw)||raw.length>5)throw new Error('Invalid maintenance plans');
  const seen=new Set();return raw.map(p=>{if(!p||seen.has(p.id)||!Object.hasOwn(TASKS,p.id)||!Number.isFinite(Date.parse(p.lastReviewedAt))||!Number.isFinite(Date.parse(p.nextDueAt)))throw new Error('Invalid maintenance plan');seen.add(p.id);const safe=maintenancePlan({task:p.id,intervalDays:p.intervalDays},Date.parse(p.lastReviewedAt));if(safe.nextDueAt!==p.nextDueAt)throw new Error('Invalid due date');return safe;});
}
function parseDrivers(raw){
  if(!raw||!Array.isArray(raw.items))throw new Error('Invalid driver inventory');
  const text=v=>typeof v==='string'?v.replace(/[\x00-\x1f]/g,' ').slice(0,300):'';
  return {status:raw.items.length>=2000?'partial':'complete',items:raw.items.slice(0,2000).filter(r=>r&&text(r.name)).map((r,i)=>({id:String(i),name:text(r.name),provider:text(r.provider),version:text(r.version),date:text(r.date),signed:typeof r.signed==='boolean'?r.signed:null,inf:text(r.inf)})),updatesAssessed:false,canExecute:false,warnings:['Installed driver metadata only. Driver age does not establish an available update or a problem.']};
}
function compareVersions(a,b){
  if(!/^\d{1,9}(?:\.\d{1,9}){0,7}$/.test(a)||!/^\d{1,9}(?:\.\d{1,9}){0,7}$/.test(b))return null;
  const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0)?1:-1;}return 0;
}
function updateReview(apps,catalog){
  if(!catalog||catalog.schemaVersion!==1||!Array.isArray(catalog.applications)||catalog.applications.length>2000)throw new Error('Choose a version 1 application catalog with at most 2000 entries.');
  const key=r=>r.name.trim().toLowerCase()+'\0'+r.publisher.trim().toLowerCase(),seen=new Set(),map=new Map();
  for(const r of catalog.applications){if(!r||!['name','publisher','version'].every(k=>typeof r[k]==='string'&&r[k].trim()&&r[k].length<=300)||compareVersions(r.version,r.version)===null)throw new Error('Catalog entries need a name, publisher and numeric dotted version.');const k=key(r);if(seen.has(k))throw new Error('Duplicate catalog identity');seen.add(k);map.set(k,r);}
  return {source:'User-selected local catalog; authenticity and currency are not verified',canExecute:false,items:(apps?.items||[]).map(a=>{const r=typeof a.name==='string'&&typeof a.publisher==='string'?map.get(key(a)):null,c=r?compareVersions(String(a.version||''),r.version):null;return {id:a.id,name:a.name,publisher:a.publisher,installed:a.version||'',available:r?.version||null,status:!r?'not-in-catalog':c===null?'incomparable':c<0?'newer-listed':c>0?'installed-newer':'matches-catalog'};})};
}
module.exports={browserProfilePath,browserReview,snapshot,compareSnapshot,startupReview,maintenancePlan,savedPlans,parseDrivers,compareVersions,updateReview,TASKS};
