'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {SETTINGS,settingsPatch,selectedPaths,textId}=require('./validation.cjs');
const policy=require('./release-policy.json');
const analysis=require('../core');
const workbench=require('../core/workbench');
const registryFiles=require('../core/registry-file');
const security=require('../core/security');
const {EntityIcons}=require('./entity-icons.cjs');
const {inventoryCSV}=require('../core/inventory-export');
const SETTINGS_LINKS={win32:{startup:'ms-settings:startupapps',applications:'ms-settings:appsfeatures',storage:'ms-settings:storagesense',updates:'ms-settings:windowsupdate',security:'windowsdefender:',power:'ms-settings:powersleep',recovery:'ms-settings:recovery',privacy:'ms-settings:privacy',temporary:'ms-settings:storagesense'},darwin:{startup:'x-apple.systempreferences:com.apple.LoginItems-Settings.extension',applications:'x-apple.systempreferences:com.apple.settings.Storage',storage:'x-apple.systempreferences:com.apple.settings.Storage',updates:'x-apple.systempreferences:com.apple.Software-Update-Settings.extension',security:'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension'}};
class DesktopService {
  constructor({core,platform,dialog,shell,userData,window,readIcon,getVersion=()=> '0.1.0-alpha.1',onProgress=()=>{},onOperationProgress=()=>{}}){Object.assign(this,{core,platform,dialog,shell,userData,window,getVersion,onProgress,onOperationProgress});this.icons=new EntityIcons({readIcon});this.grants=new Set();this.settings={...SETTINGS,excludedFolders:[]};this.registryFile=null;this.registryComparison=null;this.historyPersistent=true;this.scans=new Map();this.previews=new Map();this.active=null;this.operations=[];this.journals=new Map();this.previousScan=null;this.comparison=null;this.scanHistory=[];this.scanGeneration=0;this.previewBusy=false;this.settingsQueue=Promise.resolve();}
  async initialize(){await fs.mkdir(this.userData,{recursive:true,mode:0o700});const stat=await fs.lstat(this.userData);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Unsafe application data directory');try{const file=path.join(this.userData,'settings.json');const s=await fs.lstat(file);if(s.isSymbolicLink()||s.size>32768)throw new Error('Invalid settings file');this.settings={...SETTINGS,...settingsPatch(JSON.parse(await fs.readFile(file,'utf8')))};}catch(e){if(e.code!=='ENOENT')this.settings={...SETTINGS};}try{const history=path.join(this.userData,'scan-history.json');const stat=await fs.lstat(history);if(stat.isSymbolicLink()||stat.size>32768)throw new Error('Invalid history');const records=JSON.parse(await fs.readFile(history,'utf8'));if(Array.isArray(records))this.scanHistory=records.slice(0,10).filter(r=>r&&typeof r.id==='string'&&/^[a-zA-Z0-9._:-]{1,160}$/.test(r.id)&&Number.isSafeInteger(r.fileCount)&&r.fileCount>=0&&Number.isSafeInteger(r.totalBytes)&&r.totalBytes>=0).map(r=>({id:r.id,startedAt:typeof r.startedAt==='string'?r.startedAt:null,completedAt:typeof r.completedAt==='string'?r.completedAt:null,fileCount:r.fileCount,totalBytes:r.totalBytes,duplicateGroups:Number.isSafeInteger(r.duplicateGroups)?r.duplicateGroups:0,warningsCount:Number.isSafeInteger(r.warningsCount)?r.warningsCount:0,truncated:r.truncated===true,cancelled:r.cancelled===true,...(/^[0-9a-f]{24}$/.test(r.scopeId||'')?{scopeId:r.scopeId}:{})}));}catch(e){if(e.code!=='ENOENT')this.historyPersistent=false;}return this;}
  async getSystemInfo(){const info=await this.platform.getSystemInfo();return {...info,appVersion:this.getVersion(),releaseChannel:policy.channel,capabilities:{...info.capabilities,startupManagement:process.platform==='win32',startupManagementScope:'Current-user Run entries only',registryEditScope:'Existing values in current-user application Software keys',softwareUpdateProvider:'Microsoft WinGet; explicit check and per-package confirmation',scan:true,quarantine:policy.nativeMutationsValidated,restore:policy.nativeMutationsValidated,mutationReason:policy.reason}};}
  async selectFolder(){const r=await this.dialog.showOpenDialog(this.window(),{title:'Choose a folder to inspect',properties:['openDirectory'],message:'Aster will only inspect this folder. Scanning does not change files.'});if(r.canceled||r.filePaths.length!==1)return null;const p=path.resolve(r.filePaths[0]);const s=await fs.lstat(p);if(!s.isDirectory()||s.isSymbolicLink())throw new Error('Choose a real folder, not a link');const canonical=await fs.realpath(p);this.grants.add(canonical);return canonical;}
  async scan(input={}){
    if(this.active)throw new Error('A scan is already running');
    if(!input||typeof input.root!=='string'||!this.grants.has(input.root))throw new Error('Choose a folder using the folder picker first');
    const abort=new AbortController();this.active=abort;this.scanGeneration++;this.previews.clear();
    const previous=[...this.scans.values()][0]||null;
    try{
      const result=await this.core.scan({roots:[input.root],exclusions:this.settings.excludedFolders.map(p=>path.join(input.root,p)),includeHidden:input.includeHidden===true,limits:{maxFiles:100000,maxDepth:64,maxHashBytes:4*1024**3,largeFileThreshold:this.settings.largeFileMinBytes},signal:abort.signal,onProgress:p=>this.onProgress({files:p.files??p.scannedFiles??0,bytes:p.bytes??0,currentPath:p.currentPath??p.path??'',phase:p.phase??'scanning',...p})});
      // Only trusted, immediately preceding same-scope snapshots can be compared.
      const scope=s=>JSON.stringify([s.roots,s.includeHidden===true,s.exclusions||[],s.excludedNames||[],s.limits||{}]);
      this.previousScan=previous&&scope(previous)===scope(result)?previous:null;
      this.comparison=this.previousScan?analysis.compareScans(this.previousScan,result):null;
      this.scans.clear();this.scans.set(result.id,result);
      this.scanHistory.unshift(scanSummary(result));this.scanHistory=this.scanHistory.slice(0,10);await this.persistScanHistory();
      return {...this.publicScan(result),analysis:analysis.analyzeScan(result,{largeFileBytes:this.settings.largeFileMinBytes}),comparison:this.comparison,history:this.getScanHistory()};
    }finally{this.active=null;}
  }
  getScanHistory(){return structuredClone(this.scanHistory);}
  getRecommendations(){return this.recommendationsForScan([...this.scans.values()][0]||null);}
  async recommendationsForScan(scan){
    const unavailable={items:[],status:'unavailable',warnings:['Collection unavailable']};
    const safe=fn=>Promise.resolve().then(fn).catch(()=>unavailable);
    const [systemInfo,applications,startup]=await Promise.all([safe(()=>this.getSystemInfo()),safe(()=>this.listApplications()),safe(()=>this.listStartup())]);
    return analysis.buildRecommendations({scan,systemInfo,applications,startup},{largeFileBytes:this.settings.largeFileMinBytes});
  }
  async getDiagnostics(){return this.platform.getDiagnostics?this.platform.getDiagnostics():{status:'unsupported',warnings:['Extended diagnostics unavailable'],volumes:{items:[],status:'unsupported'}};}
  cancelScan(){if(this.active)this.active.abort();return {cancelled:!!this.active};}
  publicScan(scan){return {...scan,root:scan.roots?.[0],files:scan.files.map(f=>({...f,modifiedAt:f.modifiedAt??null,duplicateGroup:f.duplicateGroupId,category:f.category??'Other'})),summary:{fileCount:scan.totals?.files,totalBytes:scan.totals?.bytes,duplicateBytes:(scan.duplicates||[]).reduce((n,d)=>n+(d.recoverableBytes||0),0)},warnings:(scan.warnings||[]).map(w=>typeof w==='string'?w:w.message||JSON.stringify(w))};}
  async previewQuarantine(input){if(this.active)throw new Error('Wait for the current scan before reviewing files');if(this.previewBusy)throw new Error('A preview is already running');const generation=this.scanGeneration;const scanId=textId(input?.scanId);const scan=this.scans.get(scanId);if(!scan)throw new Error('Scan expired. Scan this folder again.');const paths=selectedPaths(input.paths);const selectedIds=paths.map(p=>{const f=scan.files.find(f=>f.path===p);if(!f)throw new Error('Selection is outside the current scan');return f.id;});this.previewBusy=true;try{const plan=await this.core.createCleanupPlan({scanId,selectedIds});if(this.active||generation!==this.scanGeneration||this.scans.get(scanId)!==scan)throw new Error('Preview expired. Scan changed during review.');this.previews.clear();this.previews.set(plan.id,plan);return {id:plan.id,previewId:plan.id,files:plan.files,totalBytes:plan.totalBytes,fileCount:plan.files.length,spaceFreed:0,canExecute:policy.nativeMutationsValidated,blockedReason:policy.nativeMutationsValidated?null:policy.reason,warnings:[...(plan.warnings||[]),'Restore retains a quarantine recovery copy and needs additional free space.','Files are moved into local quarantine, not permanently deleted.','Quarantine keeps the data on disk; this does not reclaim disk space.','Close applications using the selected files before any reviewed cleanup.'],createdAt:plan.createdAt};}finally{this.previewBusy=false;}}
  async quarantine(input){if(!policy.nativeMutationsValidated)throw new Error(policy.reason);const id=textId(input?.previewId);const plan=this.previews.get(id);if(!plan)throw new Error('Preview expired. Review the files again.');const consent=await this.dialog.showMessageBox(this.window(),{type:'warning',buttons:['Cancel','Move to quarantine'],defaultId:0,cancelId:0,noLink:true,title:'Confirm reviewed cleanup',message:`Move ${plan.files.length} selected files to local quarantine?`,detail:'Review the list in Aster before continuing. This keeps an undo copy and does not free disk space. Files that changed after scanning will be refused.'});if(consent.response!==1)return {cancelled:true};this.previews.delete(id);const result=await this.core.quarantine({planId:id,quarantineRoot:path.join(this.userData,'quarantine'),onProgress:this.onOperationProgress});const opId=result.id||crypto.randomUUID();if(result.journalPath)this.journals.set(opId,result.journalPath);const op={...result,id:opId,type:'quarantine',createdAt:result.createdAt||new Date().toISOString()};this.operations.unshift(op);return op;}
  async restore(input){if(!policy.nativeMutationsValidated)throw new Error(policy.reason);const id=textId(input?.operationId);const journalPath=this.journals.get(id);if(!journalPath)throw new Error('Unknown operation');const consent=await this.dialog.showMessageBox(this.window(),{type:'question',buttons:['Cancel','Restore files'],defaultId:0,cancelId:0,message:'Restore this operation?',detail:'Existing destination files will never be overwritten.'});if(consent.response!==1)return {cancelled:true};return this.core.restore({journalPath,onProgress:this.onOperationProgress});}
  async getActivity(){
    const root=path.join(this.userData,'quarantine');const history=[];
    try { const stat=await fs.lstat(root);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Invalid recovery storage');
      const entries=await fs.readdir(root,{withFileTypes:true});
      for(const entry of entries.filter(e=>e.isDirectory()&&!e.isSymbolicLink()&&/^txn-[0-9a-f-]{36}$/i.test(e.name)).slice(0,200)) {
        const journalPath=path.join(root,entry.name,'journal.json');
        try {const journal=await this.core.inspectJournal({journalPath});this.journals.set(journal.id,journalPath);const {journalPath:ignored,...safe}=journal;history.push({...safe,type:'quarantine',count:journal.entries.length});}
        catch {history.push({id:entry.name,type:'Recovery needs review',status:'unverified',error:'This journal could not be authenticated. No file action is available.',canRestore:false,count:0});}
      }
    } catch(error) {if(error.code!=='ENOENT')return [{id:'recovery-unavailable',type:'Recovery unavailable',status:'unverified',error:'Recovery storage could not be read safely.',canRestore:false}];}
    return history.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  }
  async listStartup(){const result=await this.platform.listStartup();this.icons.register('startup',result.items||[]);return result;}
  async listApplications(){const result=await this.platform.listApplications();this.icons.register('applications',result.items||[]);return result;}
  getEntityIcons(input){return this.icons.get(input);}
  async exportInventory(){const scan=[...this.scans.values()][0];const csv=inventoryCSV(scan);const picked=await this.dialog.showSaveDialog(this.window(),{title:'Export the current folder inventory',defaultPath:'Aster-file-inventory.csv',filters:[{name:'CSV inventory',extensions:['csv']}]});if(picked.canceled||!picked.filePath)return {cancelled:true};await writeNewReport(picked.filePath,csv);return {ok:true,path:picked.filePath};}
  async revealPath(value){if(typeof value!=='string')throw new Error('Invalid file');const known=[...this.scans.values()].some(s=>s.roots.includes(value)||s.files.some(f=>f.path===value));if(!known)throw new Error('Only files in the current scan can be revealed');await fs.lstat(value);this.shell.showItemInFolder(value);return {ok:true};}
  async openSystemSettings(key){const target=SETTINGS_LINKS[process.platform]?.[key];if(!target)throw new Error('This settings page is unavailable on this platform');await this.shell.openExternal(target);return {ok:true};}
  async exportReport(){const snapshots=[...this.scans.values()];const history=this.getScanHistory();const comparison=privateComparison(this.comparison);const system=await this.getSystemInfo();const scalar=(o,keys)=>Object.fromEntries(keys.map(k=>[k,['string','number','boolean'].includes(typeof o?.[k])?o[k]:null]));const publicSystem={...scalar(system,['platform','osName','version','arch','uptime','appVersion','releaseChannel']),memory:scalar(system.memory,['total','free']),cpu:scalar(system.cpu,['model','cores']),storage:scalar(system.storage,['total','free','used']),capabilities:scalar(system.capabilities,['nativePlatform','systemInfo','storage','startupInventory','applicationInventory','scan','quarantine','restore','diskHealth','memoryPressure'])};const scans=snapshots.map(s=>({id:s.id,totals:scalar(s.totals,['files','bytes','hashedBytes','visitedEntries']),truncated:s.truncated,cancelled:s.cancelled,fileCount:s.files.length,duplicateGroups:s.duplicates?.length??0,warningsCount:s.warnings?.length??0}));const recommendationResult=await this.recommendationsForScan(snapshots[0]||null);const report={schemaVersion:2,generatedAt:new Date().toISOString(),system:publicSystem,scans,scanHistory:history,comparison,recommendations:privateRecommendations(recommendationResult),privacy:'File paths, filenames, hostname and command arguments are omitted.'};const picked=await this.dialog.showSaveDialog(this.window(),{title:'Export a private system summary',defaultPath:'Aster-system-report.json',filters:[{name:'JSON report',extensions:['json']}]});if(picked.canceled||!picked.filePath)return {cancelled:true};await writeNewReport(picked.filePath,JSON.stringify(report,null,2)+'\n');return {ok:true,path:picked.filePath};}
  async persistScanHistory(){
    const temp=path.join(this.userData,'history-'+crypto.randomUUID()+'.tmp');
    try{await fs.writeFile(temp,JSON.stringify(this.scanHistory),{flag:'wx',mode:0o600});await fs.rename(temp,path.join(this.userData,'scan-history.json'));this.historyPersistent=true;}
    catch{this.historyPersistent=false;}finally{await fs.unlink(temp).catch(()=>{});}
  }
  getStorageInsights(){const scan=[...this.scans.values()][0]||null;return {...workbench.analyzeStorage(scan),folders:workbench.folderBreakdown(scan),scopeId:scan?workbench.scopeId(scan):null,history:this.getScanHistory(),historyPersistent:this.historyPersistent};}
  getOrganizationPreview(input={}){return workbench.organizationPreview([...this.scans.values()][0]||null,input.mode||'category');}
  async exportOrganizationPlan(input={}){
    const preview=this.getOrganizationPreview(input);if(!preview.scanId)throw new Error('Scan a folder before creating an organization plan');
    const picked=await this.dialog.showSaveDialog(this.window(),{title:'Save a local organization plan',defaultPath:'Aster-organization-plan.json',filters:[{name:'JSON plan',extensions:['json']}]});
    if(picked.canceled||!picked.filePath)return {cancelled:true};
    await writeNewReport(picked.filePath,JSON.stringify({...preview,privacy:'This local plan contains full paths so you can review destinations. No files were moved.'},null,2)+'\n');return {ok:true,path:picked.filePath};
  }
  async getPerformance(){const result=this.platform.getPerformance?await this.platform.getPerformance():{status:'unsupported',items:[],warnings:['Process readings are unavailable on this platform.']};this.icons.register('performance',result.items||[]);return result;}
  getRegistryData(){return {file:this.registryFile?{name:this.registryFile.name,...this.registryFile.data}:null,comparison:this.registryComparison};}
  async readPickedRegistry(){
    const picked=await this.dialog.showOpenDialog(this.window(),{title:'Inspect a registry file without importing it',properties:['openFile'],filters:[{name:'Registry file',extensions:['reg']}]});
    if(picked.canceled||picked.filePaths.length!==1)return null;
    const file=picked.filePaths[0];if(path.extname(file).toLowerCase()!=='.reg')throw new Error('Choose a .reg file');
    await security.chain(file);const before=await fs.lstat(file,{bigint:true});security.regular(before,file);if(before.size>1048576n)throw new Error('Registry files are limited to 1 MB');
    const handle=await fs.open(file,require('node:fs').constants.O_RDONLY|(require('node:fs').constants.O_NOFOLLOW||0));let bytes;
    try{const opened=await handle.stat({bigint:true});if(!security.sameIdentity(security.identity(before),security.identity(opened)))throw new Error('Registry file changed while opening');bytes=Buffer.alloc(1048577);let offset=0;while(offset<bytes.length){const read=await handle.read(bytes,offset,bytes.length-offset,offset);if(!read.bytesRead)break;offset+=read.bytesRead;}if(offset>1048576)throw new Error('Registry file grew beyond the reading limit');bytes=bytes.subarray(0,offset);if(!security.sameIdentity(security.identity(before),security.identity(await handle.stat({bigint:true}))))throw new Error('Registry file changed while reading');}finally{await handle.close();}
    await security.chain(file);if(!security.sameIdentity(security.identity(before),security.identity(await fs.lstat(file,{bigint:true})) ))throw new Error('Registry file changed while reading');
    return {name:path.basename(file),data:registryFiles.parseRegistryFile(bytes)};
  }
  async openRegistryFile(){const file=await this.readPickedRegistry();if(!file)return {cancelled:true};this.registryFile=file;this.registryComparison=null;return this.getRegistryData();}
  async compareRegistryFile(){if(!this.registryFile)throw new Error('Open the first registry file before comparing');const file=await this.readPickedRegistry();if(!file)return {cancelled:true};this.registryComparison={name:file.name,...registryFiles.compareRegistryFiles(this.registryFile.data,file.data)};return this.getRegistryData();}
  getSettings(){return structuredClone(this.settings);}
  async updateSettings(patch){
    const validated=settingsPatch(patch);
    const work=this.settingsQueue.then(async()=>{
      const next={...this.settings,...validated};const dest=path.join(this.userData,'settings.json');const temp=path.join(this.userData,`settings-${crypto.randomUUID()}.tmp`);
      try{await fs.writeFile(temp,JSON.stringify(next,null,2),{mode:0o600,flag:'wx'});await fs.rename(temp,dest);this.settings=next;return this.getSettings();}
      finally{await fs.unlink(temp).catch(()=>{});}
    });this.settingsQueue=work.catch(()=>{});return work;
  }
}
function scanSummary(scan){return {id:scan.id,scopeId:workbench.scopeId(scan),startedAt:scan.startedAt||null,completedAt:scan.completedAt||null,fileCount:scan.files.length,totalBytes:Number.isFinite(scan.totals?.bytes)?scan.totals.bytes:null,duplicateGroups:scan.duplicates?.length||0,warningsCount:(scan.warnings?.length||0)+(scan.warningsOmitted||0),truncated:scan.truncated===true,cancelled:scan.cancelled===true};}
function privateComparison(value){if(!value)return null;return {sameScope:value.sameScope===true,comparable:value.comparable===true,totals:Object.fromEntries(['beforeBytes','afterBytes','deltaBytes','addedBytes','removedBytes','changedBytes','addedFiles','removedFiles','changedFiles','unchangedFiles'].map(key=>[key,Number.isSafeInteger(value.totals?.[key])?value.totals[key]:null]))};}
function privateRecommendations(value){
  const allowed=new Set(['low-storage','storage-unavailable','partial-scan','review-duplicates','review-large-files','review-old-files','applications-coverage','startup-coverage','review-first']);
  return (Array.isArray(value)?value:[]).filter(item=>allowed.has(item.id)).map(item=>({id:item.id,severity:['info','warning'].includes(item.severity)?item.severity:'info',evidence:Object.fromEntries(['freeBytes','totalBytes','groups','potentialBytes','files','days'].filter(key=>Number.isSafeInteger(item.evidence?.[key])).map(key=>[key,item.evidence[key]]))}));
}
async function writeNewReport(destination, data) {
  if(typeof destination!=='string'||!path.isAbsolute(destination))throw new Error('Choose an absolute report destination');
  const parent=path.dirname(destination);const st=await fs.lstat(parent);if(!st.isDirectory()||st.isSymbolicLink())throw new Error('Choose a real folder for the report');
  try { await fs.lstat(destination); throw new Error('A file already exists there. Choose a new report filename.'); } catch(e) { if(e.code!=='ENOENT')throw e; }
  const temp=path.join(parent,`.aster-report-${crypto.randomUUID()}.tmp`);let handle;
  try {handle=await fs.open(temp,'wx',0o600);await handle.writeFile(data,'utf8');await handle.sync();await handle.close();handle=null;
    // Atomic no-replace publication: never follows or overwrites a destination link.
    await fs.link(temp,destination);
  } finally {if(handle)await handle.close();await fs.unlink(temp).catch(()=>{});}
}
Object.assign(DesktopService.prototype,require('./care-service.cjs')({writeNewReport}));
Object.assign(DesktopService.prototype,require('./management-service.cjs')({writeNewReport}));
module.exports={DesktopService,SETTINGS_LINKS,writeNewReport};
