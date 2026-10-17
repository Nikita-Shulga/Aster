'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const review=require('../core/review');
const care=require('../core/care'),registry=require('../core/registry-file'),security=require('../core/security');
async function readLocal(file,limit=1048576){
 await security.chain(file);const before=await fs.lstat(file,{bigint:true});security.regular(before,file);if(before.size>BigInt(limit))throw new Error('File exceeds the reading limit.');
 const handle=await fs.open(file,require('node:fs').constants.O_RDONLY|(require('node:fs').constants.O_NOFOLLOW||0));let bytes;
 try{if(!security.sameIdentity(security.identity(before),security.identity(await handle.stat({bigint:true}))))throw new Error('File changed while opening');bytes=Buffer.alloc(limit+1);let offset=0;while(offset<bytes.length){const r=await handle.read(bytes,offset,bytes.length-offset,offset);if(!r.bytesRead)break;offset+=r.bytesRead;}if(offset>limit)throw new Error('File exceeds the reading limit.');bytes=bytes.subarray(0,offset);if(!security.sameIdentity(security.identity(before),security.identity(await handle.stat({bigint:true}))))throw new Error('File changed while reading');}finally{await handle.close();}
 await security.chain(file);if(!security.sameIdentity(security.identity(before),security.identity(await fs.lstat(file,{bigint:true}))))throw new Error('File changed while reading');return bytes;
}
module.exports=({writeNewReport})=>({
 async getApplicationFootprints(){return review.applicationFootprints([...this.scans.values()][0],await this.listApplications());},
 async getPerformanceAdvice(){return review.performanceAdvice(await this.getPerformance());},
 async exportInstallBaseline(){const text=review.snapshotDocument(this.installBaseline);const choice=await this.dialog.showSaveDialog(this.window(),{title:'Save folder snapshot — includes local paths',defaultPath:'Aster-folder-snapshot.json',filters:[{name:'Aster folder snapshot',extensions:['json']}]});if(choice.canceled||!choice.filePath)return {cancelled:true};await writeNewReport(choice.filePath,text);return {ok:true};},
 async importInstallBaseline(){if(this.active)throw new Error('Wait for the current scan to finish.');const generation=this.scanGeneration;const choice=await this.dialog.showOpenDialog(this.window(),{title:'Open a saved Aster folder snapshot',properties:['openFile'],filters:[{name:'Aster folder snapshot',extensions:['json']}]});if(choice.canceled||choice.filePaths?.length!==1)return {cancelled:true};if(path.extname(choice.filePaths[0]).toLowerCase()!=='.json')throw new Error('Choose a JSON folder snapshot.');const loaded=review.validateSnapshot(JSON.parse((await readLocal(choice.filePaths[0],4*1024**2)).toString('utf8')));if(this.active||generation!==this.scanGeneration)throw new Error('The scan changed while importing. Try again.');if(!review.compatibleSnapshot(loaded,[...this.scans.values()][0]))throw new Error('Scan the same folder with the same settings before loading this snapshot.');this.installBaseline=loaded;return this.getInstallTracking();},
 getBrowserReview(){return care.browserReview([...this.scans.values()][0]);},
 captureInstallBaseline(){if(this.active)throw new Error('Wait for the scan to finish.');this.installBaseline=care.snapshot([...this.scans.values()][0]);return this.getInstallTracking();},
 getInstallTracking(){return {...care.compareSnapshot(this.installBaseline,[...this.scans.values()][0]),baseline:this.installBaseline?{createdAt:this.installBaseline.createdAt,files:this.installBaseline.files.length,imported:this.installBaseline.imported===true}:null};},
 async exportInstallTracking(){const report=this.getInstallTracking();if(report.status!=='compared')throw new Error('Compare two completed scans of the same folder first.');const choice=await this.dialog.showSaveDialog(this.window(),{title:'Export observed folder changes',defaultPath:'Aster-folder-changes.json',filters:[{name:'JSON report',extensions:['json']}]});if(choice.canceled||!choice.filePath)return {cancelled:true};await writeNewReport(choice.filePath,JSON.stringify(report,null,2)+'\n');return {ok:true};},
 async getStartupReview(){return care.startupReview(await this.listStartup());},
 async getDrivers(){return this.platform.getDrivers?this.platform.getDrivers():{status:'unsupported',items:[],canExecute:false,updatesAssessed:false};},
 getRegistryEditor(){return {text:this.registryFile?serializeRegistry(this.registryFile.data):'',hasFile:!!this.registryFile,draft:this.registryDraft?{summary:this.registryDraft.comparison.summary,keyCount:this.registryDraft.data.keyCount,valueCount:this.registryDraft.data.valueCount,destructiveDirectives:this.registryDraft.data.destructiveDirectives}:null};},
 previewRegistryDraft(input){
  if(!this.registryFile)throw new Error('Open a registry file first.');
  this.registryDraft=null;
  if(typeof input?.text!=='string'||Buffer.byteLength(input.text,'utf8')>1048576)throw new Error('Registry draft must be at most 1 MB.');
  const data=registry.parseRegistryFile(input.text);if(data.warnings.length)throw new Error('Resolve unsupported syntax before exporting a draft.');
  this.registryDraft={text:input.text,data,source:this.registryFile,comparison:registry.compareRegistryFiles(this.registryFile.data,data)};
  return {summary:this.registryDraft.comparison.summary,keyCount:data.keyCount,valueCount:data.valueCount,destructiveDirectives:data.destructiveDirectives,applied:false};
 },
 async exportRegistryDraft(){
  const draft=this.registryDraft;if(!draft||draft.source!==this.registryFile)throw new Error('Validate the current draft before exporting.');
  const choice=await this.dialog.showSaveDialog(this.window(),{title:'Save a new registry draft — no import',defaultPath:'Aster-registry-draft.reg',filters:[{name:'Registry draft',extensions:['reg']}]});
  if(choice.canceled||!choice.filePath)return {cancelled:true};if(path.extname(choice.filePath).toLowerCase()!=='.reg')throw new Error('Choose a new .reg filename.');
  if(draft!==this.registryDraft||draft.source!==this.registryFile)throw new Error('Draft changed while choosing a destination.');await writeNewReport(choice.filePath,Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(draft.text.replace(/\r?\n/g,'\r\n'),'utf16le')]));return {ok:true,applied:false};
 },
 async getMaintenance(){
  if(!this.maintenanceLoaded){try{this.maintenancePlans=care.savedPlans(JSON.parse((await readLocal(path.join(this.userData,'maintenance.json'),32768)).toString('utf8')));}catch(e){if(e.code!=='ENOENT')this.maintenanceWarning='Saved reminders could not be read. They have not been replaced.';this.maintenancePlans=[];}this.maintenanceLoaded=true;}
  return {items:structuredClone(this.maintenancePlans),warning:this.maintenanceWarning||null,automaticExecution:false};
 },
 async saveMaintenance(input){
  const plan=care.maintenancePlan(input);
  const pending=(this.maintenanceQueue||Promise.resolve()).then(async()=>{await this.getMaintenance();if(this.maintenanceWarning)throw new Error(this.maintenanceWarning);const next=[...this.maintenancePlans.filter(p=>p.id!==plan.id),plan];const file=path.join(this.userData,'maintenance.json'),temp=path.join(this.userData,'maintenance-'+crypto.randomUUID()+'.tmp');await security.chain(this.userData);try{await fs.writeFile(temp,JSON.stringify(next),{flag:'wx'});await fs.rename(temp,file);this.maintenancePlans=next;}finally{await fs.unlink(temp).catch(()=>{});}return this.getMaintenance();});this.maintenanceQueue=pending.catch(()=>{});return pending;
 },
 getUpdateReview(){return this.updateReview||{items:[],source:null,canExecute:false};},
 async importUpdateCatalog(){const choice=await this.dialog.showOpenDialog(this.window(),{title:'Compare installed apps with a local version catalog',properties:['openFile'],filters:[{name:'JSON version catalog',extensions:['json']}]});if(choice.canceled||choice.filePaths?.length!==1)return {cancelled:true};if(path.extname(choice.filePaths[0]).toLowerCase()!=='.json')throw new Error('Choose a JSON catalog.');const catalog=JSON.parse((await readLocal(choice.filePaths[0])).toString('utf8'));this.updateReview=care.updateReview(await this.listApplications(),catalog);return this.updateReview;}
});
function serializeRegistry(data){return data.header+'\n\n'+data.sections.map(s=>'['+(s.action==='delete-key'?'-':'')+s.key+']\n'+s.values.map(v=>(v.isDefault?'@':'"'+v.name.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"')+'='+v.raw).join('\n')).join('\n\n')+'\n';}
