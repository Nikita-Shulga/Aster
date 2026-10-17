'use strict';
const HEADERS=['Windows Registry Editor Version 5.00','REGEDIT4'];
function decode(buffer){if(!Buffer.isBuffer(buffer))buffer=Buffer.from(String(buffer));if(buffer.length>1024*1024)throw new Error('Registry files are limited to 1 MB');if(buffer[0]===0xff&&buffer[1]===0xfe)return buffer.subarray(2).toString('utf16le');if(buffer[0]===0xfe&&buffer[1]===0xff)throw new Error('Big-endian registry files are unsupported');return buffer.toString('utf8').replace(/^\uFEFF/,'');}
function parseRegistryFile(buffer){
  const source=decode(buffer);if(source.includes('\0')||source.includes('\uFFFD'))throw new Error('Unsupported registry file encoding');
  const lines=source.replace(/\r\n?/g,'\n').split('\n');if(!HEADERS.includes(lines[0]?.trim()))throw new Error('Choose a Windows .reg file with a supported header');
  const sections=[],warnings=[];let section=null;
  for(let i=1;i<lines.length;i++){
    let line=lines[i].trim();if(!line||line.startsWith(';')||line.startsWith('#'))continue;
    while(line.endsWith('\\')&&i+1<lines.length){line=line.slice(0,-1)+lines[++i].trim();if(line.length>65536)throw new Error('Registry value is too large');}
    if(line.startsWith('[')&&line.endsWith(']')){
      const key=line.slice(1,-1),remove=key.startsWith('-'),clean=remove?key.slice(1):key;
      if(!/^(?:HKEY_CURRENT_USER|HKEY_LOCAL_MACHINE|HKEY_CLASSES_ROOT|HKEY_USERS|HKEY_CURRENT_CONFIG)(?:\\[^\x00-\x1f\[\]]*)?$/.test(clean))throw new Error('Unsupported registry key at line '+(i+1));
      section={key:clean,action:remove?'delete-key':'set-values',values:[]};sections.push(section);if(sections.length>2000)throw new Error('Too many registry sections');continue;
    }
    const match=line.match(/^(@|"(?:[^"\\]|\\.)*")\s*=\s*(.*)$/);if(!match||!section){warnings.push('Unrecognized syntax at line '+(i+1));continue;}
    const name=match[1]==='@'?'(Default)':match[1].slice(1,-1).replace(/\\(["\\])/g,'$1'),raw=match[2];
    let type='unsupported';if(raw==='-')type='delete-value';else if(/^"(?:[^"\\]|\\["\\])*"$/.test(raw))type='string';else if(/^dword:[0-9a-f]{8}$/i.test(raw))type='dword';else if(/^hex(?:\([0-9a-f]+\))?:(?:[0-9a-f]{2}(?:,[0-9a-f]{2})*)?$/i.test(raw))type='binary';
    section.values.push({name,isDefault:match[1]==='@',type,raw,line:i+1});if(section.values.length>10000)throw new Error('Too many values in a registry section');
    if(type==='unsupported')warnings.push('Unsupported value syntax at line '+(i+1)+'; it will remain visible as text.');
  }
  const count=sections.reduce((n,s)=>n+s.values.length,0);if(count>10000)throw new Error('Registry file has too many values');
  return {header:lines[0].trim(),sections,keyCount:sections.length,valueCount:count,destructiveDirectives:sections.filter(s=>s.action==='delete-key').length+sections.reduce((n,s)=>n+s.values.filter(v=>v.type==='delete-value').length,0),warnings:warnings.slice(0,100),liveRegistryAccess:false,imported:false};
}
function compareRegistryFiles(before,after){
  const flatten=data=>{const map=new Map();for(const s of data.sections)for(const v of s.values)map.set(s.key.toLowerCase()+'\0'+(v.isDefault?'@':'='+v.name.toLowerCase()),{key:s.key,...v});return map;};
  const a=flatten(before),b=flatten(after),added=[],removed=[],changed=[];
  for(const [key,value] of a){if(!b.has(key))removed.push(value);else if(value.raw!==b.get(key).raw)changed.push({key:value.key,name:value.name,before:value.raw,after:b.get(key).raw});}
  for(const [key,value] of b)if(!a.has(key))added.push(value);
  const keysBefore=new Set(before.sections.map(s=>s.key.toLowerCase())),keysAfter=new Set(after.sections.map(s=>s.key.toLowerCase()));
  return {added:added.slice(0,1000),removed:removed.slice(0,1000),changed:changed.slice(0,1000),summary:{added:added.length,removed:removed.length,changed:changed.length,addedKeys:[...keysAfter].filter(k=>!keysBefore.has(k)).length,removedKeys:[...keysBefore].filter(k=>!keysAfter.has(k)).length},directives:after.destructiveDirectives,liveRegistryAccess:false,applied:false};
}
module.exports={decode,parseRegistryFile,compareRegistryFiles};
