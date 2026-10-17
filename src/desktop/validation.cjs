'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const SETTINGS = Object.freeze({ theme:'system', includeHidden:false, largeFileMinBytes:100*1024*1024, excludedFolders:[] });
function trustedEntryUrl(value) { try { const url = new URL(value); url.hash = ''; return url.href; } catch { return ''; } }
function assertSender(event, window, entryFile) {
  const expected = pathToFileURL(path.resolve(entryFile)).href;
  if (!window || window.isDestroyed() || event.sender !== window.webContents || !event.senderFrame || event.senderFrame !== window.webContents.mainFrame || trustedEntryUrl(event.senderFrame.url) !== expected) throw new Error('Untrusted application request');
}
function settingsPatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid settings');
  const out = {};
  for (const [key,v] of Object.entries(value)) {
    if (key==='theme' && ['light','dark','system'].includes(v)) out[key]=v;
    else if (key==='includeHidden' && typeof v==='boolean') out[key]=v;
    else if (key==='largeFileMinBytes' && Number.isSafeInteger(v) && v>=1024*1024 && v<=1024**4) out[key]=v;
    else if (key==='excludedFolders' && Array.isArray(v) && v.length<=100 && v.every(p=>typeof p==='string'&&p.length>0&&p.length<=256&&!path.isAbsolute(p)&&!/[\x00-\x1f<>:"|?*]/.test(p)&&!p.split(/[\\/]/).some(s=>!s||s==='.'||s==='..'||/[. ]$/.test(s)))) out[key]=[...new Set(v)];
    else throw new Error('Unsupported setting');
  }
  return out;
}
function selectedPaths(value) {
  if (!Array.isArray(value)||!value.length||value.length>1000||value.some(p=>typeof p!=='string'||p.length>32768||p.includes('\0'))) throw new Error('Select between 1 and 1,000 valid files');
  if(new Set(value).size!==value.length)throw new Error('Duplicate selection');
  return value;
}
function textId(value) { if(typeof value!=='string'||!/^[a-zA-Z0-9._:-]{1,160}$/.test(value))throw new Error('Invalid identifier');return value; }
module.exports={SETTINGS,assertSender,settingsPatch,selectedPaths,textId};
