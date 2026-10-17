'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=name=>(...args)=>ipcRenderer.invoke(`aster:${name}`,...args);
const subscribe=channel=>callback=>{if(typeof callback!=='function')throw new TypeError('A callback is required');const listener=(_event,value)=>callback(value);ipcRenderer.on(channel,listener);return()=>ipcRenderer.removeListener(channel,listener);};
contextBridge.exposeInMainWorld('aster',Object.freeze({
  getBrowserReview:invoke('getBrowserReview'),captureInstallBaseline:invoke('captureInstallBaseline'),getInstallTracking:invoke('getInstallTracking'),exportInstallTracking:invoke('exportInstallTracking'),getStartupReview:invoke('getStartupReview'),getDrivers:invoke('getDrivers'),getRegistryEditor:invoke('getRegistryEditor'),previewRegistryDraft:invoke('previewRegistryDraft'),exportRegistryDraft:invoke('exportRegistryDraft'),getMaintenance:invoke('getMaintenance'),saveMaintenance:invoke('saveMaintenance'),getUpdateReview:invoke('getUpdateReview'),importUpdateCatalog:invoke('importUpdateCatalog'),
  getManagementRecord:invoke('getManagementRecord'),getManagementHistory:invoke("getManagementHistory"),getStartupControls:invoke("getStartupControls"),previewStartupChange:invoke("previewStartupChange"),applyStartupChange:invoke("applyStartupChange"),browseRegistry:invoke("browseRegistry"),previewRegistryChange:invoke("previewRegistryChange"),applyRegistryChange:invoke("applyRegistryChange"),previewManagementUndo:invoke("previewManagementUndo"),checkManagedUpdates:invoke("checkManagedUpdates"),getManagedUpdates:invoke("getManagedUpdates"),previewManagedUpdate:invoke("previewManagedUpdate"),applyManagedUpdate:invoke("applyManagedUpdate"),beginTrackedUninstall:invoke("beginTrackedUninstall"),getTrackedUninstalls:invoke("getTrackedUninstalls"),openTrackedUninstaller:invoke("openTrackedUninstaller"),compareTrackedUninstall:invoke("compareTrackedUninstall"),exportTrackedUninstall:invoke("exportTrackedUninstall"),
  getApplicationFootprints:invoke('getApplicationFootprints'),getPerformanceAdvice:invoke('getPerformanceAdvice'),exportInstallBaseline:invoke('exportInstallBaseline'),importInstallBaseline:invoke('importInstallBaseline'),
  getSystemInfo:invoke('getSystemInfo'),getRecommendations:invoke('getRecommendations'),getDiagnostics:invoke('getDiagnostics'),getScanHistory:invoke('getScanHistory'),selectFolder:invoke('selectFolder'),scan:invoke('scan'),cancelScan:invoke('cancelScan'),
  previewQuarantine:invoke('previewQuarantine'),quarantine:invoke('quarantine'),restore:invoke('restore'),getActivity:invoke('getActivity'),
  listStartup:invoke('listStartup'),listApplications:invoke('listApplications'),revealPath:invoke('revealPath'),openSystemSettings:invoke('openSystemSettings'),
  exportReport:invoke('exportReport'),getSettings:invoke('getSettings'),updateSettings:invoke('updateSettings'),
  getEntityIcons:invoke('getEntityIcons'),exportInventory:invoke('exportInventory'),
  getStorageInsights:invoke('getStorageInsights'),
  getOrganizationPreview:invoke('getOrganizationPreview'),
  exportOrganizationPlan:invoke('exportOrganizationPlan'),
  getPerformance:invoke('getPerformance'),
  getRegistryData:invoke('getRegistryData'),
  openRegistryFile:invoke('openRegistryFile'),
  compareRegistryFile:invoke('compareRegistryFile'),
  onChooseFolderRequested:subscribe('aster:chooseFolderRequested'),onScanProgress:subscribe('aster:scanProgress'),onOperationProgress:subscribe('aster:operationProgress')
}));
