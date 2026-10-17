'use strict';
const crypto=require('node:crypto');
const keyPath=value=>{if(typeof value!=='string'||value.length>1024||!/^HK(?:CU|LM)\\Software(?:\\[^\\\x00-\x1f]+)*$/i.test(value)||value.split('\\').some(x=>x==='.'||x==='..'||/[. ]$/.test(x)))throw new Error('Choose a local HKCU or HKLM Software key.');return value;};
function editableKey(value){keyPath(value);if(!/^HKCU\\Software\\[^\\]+\\?/i.test(value)||/^HKCU\\Software\\(?:Microsoft|Classes|Policies|Aster)(?:\\|$)/i.test(value))throw new Error('Editing is limited to current-user application keys outside Windows, Classes, Policies and Aster.');return value;}
function registryValue(input){if(!input||typeof input.name!=='string'||input.name.length>512||/[\x00-\x1f]/.test(input.name))throw new Error('Invalid registry value name.');const {kind,data}=input;
 const valid=(['String','ExpandString'].includes(kind)&&typeof data==='string'&&data.length<=32768&&!data.includes('\0'))||(kind==='DWord'&&Number.isInteger(data)&&data>=-2147483648&&data<=2147483647)||(kind==='QWord'&&typeof data==='string'&&/^-?\d{1,19}$/.test(data)&&BigInt(data)>=-9223372036854775808n&&BigInt(data)<=9223372036854775807n)||(kind==='Binary'&&Array.isArray(data)&&data.length<=16384&&data.every(x=>Number.isInteger(x)&&x>=0&&x<=255))||(kind==='MultiString'&&Array.isArray(data)&&data.length<=256&&data.every(x=>typeof x==='string'&&x.length<=1024&&!x.includes('\0')));
 if(!valid)throw new Error('Value does not match its registry type or exceeds the limit.');return {name:input.name,kind,data:structuredClone(data)};
}
function startupIcon(command){if(typeof command!=='string')return null;const match=command.match(/^"([^"]+\.exe)"(?:\s|$)|^([a-z]:[\\/][^"]*?\.exe)(?:\s|$)/i);return match?.[1]||match?.[2]||null;}
const fingerprint=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same=(a,b)=>fingerprint(a)===fingerprint(b);
function startupRows(readings,disabled=[]){return readings.filter(r=>r&&typeof r.name==='string'&&['String','ExpandString'].includes(r.kind)).map(r=>({...r,id:fingerprint(['startup',r.name]).slice(0,24),enabled:true,scope:'Current user Run key',control:'disable'})).concat(disabled.map(r=>({...r.value,id:r.id,enabled:false,scope:'Disabled by Aster',control:'enable',recordId:r.recordId})));}
function parseWingetUpdates(text){
 if(typeof text!=='string'||text.length>2*1024**2)throw new Error('Unsupported update response.');
 const lines=text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g,'').split(/\r?\n/);const divider=lines.findIndex(l=>/^\s*-{8,}\s*$/.test(l));
 if(divider<1)throw new Error('WinGet did not return a supported update table. No update status was inferred.');
 const headings=[...lines[divider-1].matchAll(/\S(?:.*?\S)?(?=\s{2,}|$)/g)];
 if(headings.length!==5)throw new Error('Unsupported WinGet table columns.');
 const starts=headings.map(x=>x.index),rows=[];let rejected=0;
 for(const line of lines.slice(divider+1)){if(!line.trim())continue;const cols=starts.map((start,i)=>line.slice(start,starts[i+1]).trim());if(cols[4]!=='winget')continue;const [name,id,installed,available]=cols;if(!packageId(id)||!version(available)||!version(installed)||!name||/[\u2026\x00-\x1f]/.test(name)){rejected++;continue;}if(rows.some(r=>r.id===id)){rejected++;continue;}rows.push({id,name,installed,available,source:'winget'});if(rows.length>=2000)break;}
 return {status:rejected?'partial':'complete',items:rows,rejected,source:'Microsoft WinGet community repository',checkedAt:new Date().toISOString(),note:'Only packages WinGet matched with a known installed version are shown. No automatic or bulk updates.'};
}
const packageId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{1,199}$/.test(value)&&value.includes('.');
const version=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/.test(value)&&!/^unknown$/i.test(value);
function updateArguments(row){if(!row||!packageId(row.id)||!version(row.available)||row.source!=='winget')throw new Error('Choose an exact update from the current checked list.');return ['upgrade','--id',row.id,'--exact','--version',row.available,'--source','winget','--interactive','--disable-interactivity'];}
module.exports={startupIcon,keyPath,editableKey,registryValue,fingerprint,same,startupRows,parseWingetUpdates,updateArguments};
