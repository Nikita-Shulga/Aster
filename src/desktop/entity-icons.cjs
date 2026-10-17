'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');
const {chain}=require('../core/security');
// Only collector-provided local executable/icon locations can reach the OS icon API.
function iconPath(value){
 if(typeof value!=='string'||value.length>32768||/[\x00-\x1f]/.test(value))return null;
 let location=value.trim().replace(/,\s*-?\d+\s*$/,'').trim();
 if(location.startsWith('"')&&location.endsWith('"'))location=location.slice(1,-1);
 if(!/^[A-Za-z]:[\\/]/.test(location)||location.startsWith('\\\\')||location.slice(2).includes(':')||!path.win32.isAbsolute(location)||!/^\.(exe|dll|ico)$/i.test(path.win32.extname(location)))return null;
 if(location.split(/[\\/]/).some(s=>s==='..'))return null;
 return path.win32.normalize(location);
}
class EntityIcons {
 constructor({readIcon=async()=>null,validate=async file=>{await chain(file);const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Not a regular icon source');}}={}){this.readIcon=readIcon;this.validate=validate;this.entities=new Map();this.cache=new Map();this.busy=null;}
 register(kind,items){const entries=new Map();for(const item of items.slice(0,4000)){const location=iconPath(item.iconPath)||iconPath(item.executablePath)||iconPath(item.path);if(item.id!==undefined&&location)entries.set(String(item.id),location);}this.entities.set(kind,entries);}
 async get({kind,ids}={}){
  if(!['applications','performance','startup'].includes(kind)||!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string'||id.length>160)||new Set(ids).size!==ids.length)throw new Error('Invalid icon request');
  const allowed=this.entities.get(kind)||new Map();if(ids.some(id=>!allowed.has(id)))ids=ids.filter(id=>allowed.has(id));
  const icons=[];let next=0;
  // Two native reads at a time; cache includes failed lookups and is bounded.
  const work=async()=>{while(next<ids.length){const id=ids[next++],file=allowed.get(id),key=file.toLowerCase();let data=this.cache.get(key);if(data===undefined){try{await this.validate(file);data=await this.readIcon(file);if(typeof data!=='string'||data.length>131072||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data))data=null;}catch{data=null;}this.cache.set(key,data);while(this.cache.size>512)this.cache.delete(this.cache.keys().next().value);}if(data)icons.push({id,dataUrl:data});}};
  // Serialize batches so repeated renderer requests cannot multiply native work.
  const before=this.busy||Promise.resolve();const run=before.catch(()=>{}).then(()=>Promise.all([work(),work()]));this.busy=run;await run;if(this.busy===run)this.busy=null;
  return {icons};
 }
}
module.exports={EntityIcons,iconPath};
