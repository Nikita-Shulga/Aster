'use strict';
const path=require('node:path');
const {createHash}=require('node:crypto');
const DAY=86400000;
const PROTECTED=/(^|[\\/])(?:\.git|\.ssh|\.aws|\.gnupg|saves?|savegames?|backups?|sourceassets|nativeoriginals)(?:[\\/]|$)/i;
const safeBytes=n=>Number.isSafeInteger(n)&&n>=0?n:0;
function filesOf(scan){return (Array.isArray(scan?.files)?scan.files:[]).slice(0,100000).filter(f=>f&&typeof f.path==='string'&&typeof f.name==='string'&&Number.isSafeInteger(f.size)&&f.size>=0);}
function analyzeStorage(scan,{now=Date.now()}={}){
  const files=filesOf(scan), rules={temporary:[],logs:[],empty:[],oldInstallers:[],oldArchives:[],applicationCaches:[],buildArtifacts:[],protected:[]};
  const extensions=new Map(), ages={'Under 30 days':0,'30–180 days':0,'180–365 days':0,'Over a year':0,'Unknown date':0};
  for(const f of files){
    const ext=path.extname(f.name).toLowerCase()||'(no extension)';
    const current=extensions.get(ext)||{extension:ext,files:0,bytes:0};current.files++;current.bytes+=f.size;extensions.set(ext,current);
    const time=Date.parse(f.modifiedAt),age=Number.isFinite(time)&&time<=now?Math.floor((now-time)/DAY):null;
    ages[age===null?'Unknown date':age<30?'Under 30 days':age<180?'30–180 days':age<365?'180–365 days':'Over a year']+=f.size;
    if(PROTECTED.test(f.path)){rules.protected.push(f);continue;}
    if(/(^|[\\/])(?:Cache_Data|Code Cache|GPUCache|DawnCache|GrShaderCache|ShaderCache|Media Cache)(?:[\\/]|$)/i.test(f.path))rules.applicationCaches.push(f);
    else if(/(^|[\\/])(?:node_modules|__pycache__|\.next|DerivedData)(?:[\\/]|$)/i.test(f.path))rules.buildArtifacts.push(f);
    else if(f.size===0)rules.empty.push(f);
    else if(/\.(?:tmp|temp|dmp)$/i.test(f.name))rules.temporary.push(f);
    else if(/\.(?:log|etl)$/i.test(f.name))rules.logs.push(f);
    else if(age!==null&&age>=90&&/\.(?:msi|msix|exe|pkg|dmg)$/i.test(f.name))rules.oldInstallers.push(f);
    else if(age!==null&&age>=365&&/\.(?:zip|7z|rar|tar|gz)$/i.test(f.name))rules.oldArchives.push(f);
  }
  const descriptions={applicationCaches:['Application cache folders','Recognized cache-folder names inside your chosen scope. Close the owning app and review its supported cache controls; caches can improve performance.'],buildArtifacts:['Dependencies and generated builds','Generated-folder names inside your scan. Rebuilding may require downloads or project tools. These are review suggestions, never automatic junk.'],temporary:['Temporary and crash files','Extensions can suggest generated data. Check the owner and close the application before reviewing.'],logs:['Logs and diagnostic traces','Logs can help diagnose a problem. Age or extension does not establish that removal is safe.'],empty:['Empty files','Empty files use little space and can be meaningful application markers.'],oldInstallers:['Installers older than 90 days','Keep offline installers you still need. An installer can be the only available copy.'],oldArchives:['Archives older than a year','An old archive may be an important backup. Review its contents and provenance.'],protected:['Protected projects, saves and backups','Excluded from candidate suggestions. Keep original artwork, source history, save data and recovery copies.']};
  return {scanId:scan?.id||null,status:!scan?'no-scan':scan.cancelled||scan.truncated||scan.warnings?.length||scan.warningsOmitted?'partial':'complete',fileCount:files.length,totalBytes:files.reduce((n,f)=>n+safeBytes(f.size),0),extensions:[...extensions.values()].sort((a,b)=>b.bytes-a.bytes||a.extension.localeCompare(b.extension)).slice(0,40),ages:Object.entries(ages).map(([label,bytes])=>({label,bytes})),groups:Object.entries(rules).map(([id,list])=>({id,title:descriptions[id][0],detail:descriptions[id][1],count:list.length,bytes:list.reduce((n,f)=>n+f.size,0),paths:list.slice(0,500).map(f=>f.path),protected:id==='protected'})),automaticSelection:false,spaceFreed:0};
}
function organizationPreview(scan,mode='category'){
  if(!['category','year','extension'].includes(mode))throw new Error('Choose category, year or extension organization');
  const files=filesOf(scan);const proposals=[],skipped=[];const targets=new Set();
  const roots=scan?.roots||[scan?.root].filter(Boolean);
  for(const f of files){
    if(PROTECTED.test(f.path)){skipped.push({name:f.name,reason:'Protected project, save or backup location'});continue;}
    let group;
    if(mode==='year'){const time=Date.parse(f.modifiedAt);group=Number.isFinite(time)&&time<=Date.now()?String(new Date(time).getFullYear()):'Unknown date';}
    else if(mode==='extension')group=(path.extname(f.name).slice(1)||'No extension').replace(/[^a-z0-9_-]/gi,'_').slice(0,32);
    else group=String(f.category||'Other').replace(/[^a-z0-9 _-]/gi,'').slice(0,48)||'Other';
    const root=roots.find(r=>f.path.toLowerCase().startsWith(r.toLowerCase()+path.sep));
    if(!root){skipped.push({name:f.name,reason:'No trusted containing scan root'});continue;}
    const destination=path.join(root,'Aster organized',group,f.name),folded=destination.toLowerCase();
    if(targets.has(folded)){skipped.push({name:f.name,reason:'Two scanned files would use the same destination; rename manually'});continue;}
    if(f.path.toLowerCase().includes(path.sep+'aster organized'+path.sep)){skipped.push({name:f.name,reason:'Already inside the organization output folder'});continue;}
    targets.add(folded);proposals.push({source:f.path,destination,size:f.size,group});
  }
  return {scanId:scan?.id||null,mode,proposals:proposals.slice(0,1000),totalProposals:proposals.length,truncated:proposals.length>1000,skipped:skipped.slice(0,100),canExecute:false,operation:'preview-only',warnings:['Preview only: no folders are created and no files are moved.','Existing destination files have not been inspected. Any later execution must refuse overwrites.','Keep originals, save data, active project paths and backups in their current locations.']};
}
function scopeId(scan){return createHash('sha256').update(JSON.stringify([scan.roots,scan.includeHidden===true,scan.exclusions||[],scan.limits||{}])).digest('hex').slice(0,24);}
function folderBreakdown(scan){
 const roots=scan?.roots||[],groups=new Map();
 for(const file of filesOf(scan)){
  const root=roots.find(r=>{const relative=path.relative(r,file.path);return relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);});if(!root)continue;
  const relative=path.relative(root,file.path),parts=relative.split(path.sep);const folder=parts.length>1?path.join(root,parts[0]):root;
  const current=groups.get(folder)||{path:folder,name:parts.length>1?parts[0]:'Files at folder root',files:0,bytes:0,protected:PROTECTED.test(folder)};
  current.files++;current.bytes+=file.size;groups.set(folder,current);
 }
 return [...groups.values()].sort((a,b)=>b.bytes-a.bytes||a.name.localeCompare(b.name)).slice(0,50);
}
module.exports={analyzeStorage,organizationPreview,scopeId,folderBreakdown,PROTECTED};
