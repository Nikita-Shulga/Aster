'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,session,Menu}=require('electron');
const path=require('node:path');
const {DesktopService}=require('./service.cjs');
const {assertSender}=require('./validation.cjs');
const policy=require('./release-policy.json');
const fs=require('node:fs');
const requestedProfile=app.commandLine.getSwitchValue('user-data-dir');
const dataRoot=requestedProfile?path.resolve(requestedProfile):app.isPackaged?path.join(path.dirname(app.getPath('exe')),'AsterData'):path.resolve(__dirname,'../../.aster-data');
fs.mkdirSync(dataRoot,{recursive:true});fs.mkdirSync(path.join(dataRoot,'Temp'),{recursive:true});
app.setPath('userData',dataRoot);app.setPath('sessionData',dataRoot);app.setPath('temp',path.join(dataRoot,'Temp'));process.env.TEMP=process.env.TMP=path.join(dataRoot,'Temp');
let win=null;let service=null;
const entry=path.resolve(__dirname,'../renderer/index.html');
const methods=["getManagementRecord","getManagementHistory","getStartupControls","previewStartupChange","applyStartupChange","browseRegistry","previewRegistryChange","applyRegistryChange","previewManagementUndo","checkManagedUpdates","getManagedUpdates","previewManagedUpdate","applyManagedUpdate","beginTrackedUninstall","getTrackedUninstalls","openTrackedUninstaller","compareTrackedUninstall","exportTrackedUninstall","getApplicationFootprints","getPerformanceAdvice","exportInstallBaseline","importInstallBaseline","getBrowserReview","captureInstallBaseline","getInstallTracking","exportInstallTracking","getStartupReview","getDrivers","getRegistryEditor","previewRegistryDraft","exportRegistryDraft","getMaintenance","saveMaintenance","getUpdateReview","importUpdateCatalog",'getSystemInfo','getRecommendations','getDiagnostics','getScanHistory','selectFolder','scan','cancelScan','previewQuarantine','quarantine','restore','getActivity','listStartup','listApplications','revealPath','openSystemSettings','exportReport','getSettings','updateSettings',"getStorageInsights","getOrganizationPreview","exportOrganizationPlan","getPerformance","getRegistryData","openRegistryFile","compareRegistryFile","getEntityIcons","exportInventory"];
if(!app.requestSingleInstanceLock())app.quit();else{
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
app.whenReady().then(async()=>{
  const core=require('../core').createService({mutationEnabled:policy.nativeMutationsValidated});
  const platform=require('../platform');
  service=await new DesktopService({core,platform,dialog,shell,readIcon:async file=>{const image=await app.getFileIcon(file,{size:'normal'});return image.isEmpty()?null:image.toDataURL();},userData:app.getPath('userData'),window:()=>win,getVersion:()=>app.getVersion(),onProgress:p=>{if(win&&!win.isDestroyed())win.webContents.send('aster:scanProgress',p);},onOperationProgress:p=>{if(win&&!win.isDestroyed())win.webContents.send('aster:operationProgress',p);}}).initialize();
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{const localIcon=details.resourceType==='image'&&details.url.length<=131072&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(details.url);callback({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('devtools:')&&!localIcon});});
  for(const method of methods)ipcMain.handle(`aster:${method}`,async(event,arg)=>{assertSender(event,win,entry);try{return await service[method](arg);}catch(error){throw new Error(error?.message||'The operation could not be completed');}});
  const createWindow=()=>{win=new BrowserWindow({width:1280,height:860,minWidth:820,minHeight:620,title:'Aster',icon:path.resolve(__dirname,'../../assets/icon.png'),backgroundColor:'#101012',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,devTools:!app.isPackaged}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.webContents.on('will-attach-webview',event=>event.preventDefault());
    win.once('ready-to-show',()=>win.show());
    win.on('closed',()=>{service.cancelScan();win=null;});
    win.loadFile(entry).catch(error=>dialog.showErrorBox('Aster could not load its interface',error.message));
  };
  const menu=[...(process.platform==='darwin'?[{label:'Aster',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]}]:[]),{label:'File',submenu:[{label:'Choose folder…',accelerator:'CmdOrCtrl+O',click:()=>win?.webContents.send('aster:chooseFolderRequested')},{label:'Export report…',click:()=>service.exportReport().catch(()=>{})},{type:'separator'},process.platform==='darwin'?{role:'close'}:{role:'quit'}]},{role:'editMenu'},{label:'View',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  createWindow();app.on('activate',()=>{if(!win)createWindow();});
}).catch(error=>{dialog.showErrorBox('Aster could not start',error.message);app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>service?.cancelScan());
}
