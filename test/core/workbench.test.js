'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {analyzeStorage,organizationPreview}=require('../../src/core/workbench');
const {parseRegistryFile,compareRegistryFiles}=require('../../src/core/registry-file');
const root=path.resolve(__dirname,'.fixtures/review');const file=(name,size=10,extra={})=>({name:path.basename(name),path:path.join(root,name),size,category:'document',modifiedAt:'2020-01-01T00:00:00Z',...extra});
test('storage review protects saves and backups, preserves unknown dates, and never authorizes deletion',()=>{
 const scan={id:'test',roots:[root],files:[file('backup/archive.zip'),file('Saves/crash.tmp'),file('debug.log'),file('setup.exe'),file('unknown.zip',10,{modifiedAt:null}),file('zero.txt',0)]};
 const value=analyzeStorage(scan,{now:Date.parse('2026-10-17')});
 assert.equal(value.groups.find(g=>g.id==='protected').count,2);assert.equal(value.groups.find(g=>g.id==='temporary').count,0);assert.equal(value.groups.find(g=>g.id==='oldArchives').count,0);assert.equal(value.groups.find(g=>g.id==='oldInstallers').count,1);assert.equal(value.ages.find(a=>a.label==='Unknown date').bytes,10);assert.equal(value.automaticSelection,false);assert.equal(value.spaceFreed,0);assert.equal(scan.files.length,6);
});
test('organization preview detects name collisions, excludes recovery data and remains preview-only',()=>{
 const scan={id:'test',roots:[root],files:[file('first/note.txt'),file('second/NOTE.txt'),file('backups/old.txt'),file('Aster organized/document/existing.txt')]};
 const plan=organizationPreview(scan);assert.equal(plan.proposals.length,1);assert.equal(plan.skipped.length,3);assert.equal(plan.canExecute,false);assert.equal(plan.operation,'preview-only');assert.ok(plan.proposals.every(p=>p.destination.startsWith(path.join(root,'Aster organized'))));assert.throws(()=>organizationPreview(scan,'../escape'));
});
test('registry viewer decodes Unicode exports, marks deletion directives and never imports',()=>{
 const text='Windows Registry Editor Version 5.00\r\n\r\n[HKEY_CURRENT_USER\\Software\\Example]\r\n"Name"="test"\r\n"Flag"=dword:00000001\r\n"Data"=hex:01,02,\\\r\n  03\r\n"Remove"=-\r\n[-HKEY_CURRENT_USER\\Software\\Old]\r\n';
 const data=parseRegistryFile(Buffer.concat([Buffer.from([255,254]),Buffer.from(text,'utf16le')]));assert.equal(data.keyCount,2);assert.equal(data.valueCount,4);assert.equal(data.sections[0].values[2].raw,'hex:01,02,03');assert.equal(data.destructiveDirectives,2);assert.equal(data.liveRegistryAccess,false);assert.equal(data.imported,false);
});
test('registry file input is bounded and malformed content cannot become executable code',()=>{
 for(const text of ['not a registry file','Windows Registry Editor Version 5.00\n[../../escape]','Windows Registry Editor Version 5.00\n[HKEY_CURRENT_USER\\Bad\u0000Key]'])assert.throws(()=>parseRegistryFile(text));
 assert.throws(()=>parseRegistryFile(Buffer.alloc(1024*1024+1)));
 const data=parseRegistryFile('REGEDIT4\n[HKEY_CURRENT_USER\\Software\\Example]\n"value"=powershell.exe -Command bad');assert.equal(data.sections[0].values[0].type,'unsupported');assert.equal(data.warnings.length,1);
});
test('registry comparison tracks added removed changed values and empty keys without modifying either input',()=>{
 const a=parseRegistryFile('REGEDIT4\n[HKEY_CURRENT_USER\\Software\\Test]\n"A"="one"\n"B"="gone"\n[HKEY_CURRENT_USER\\Empty]');
 const b=parseRegistryFile('REGEDIT4\n[HKEY_CURRENT_USER\\Software\\Test]\n"A"="two"\n"C"="new"\n[HKEY_CURRENT_USER\\Other]');
 const original=JSON.stringify(a);const diff=compareRegistryFiles(a,b);assert.deepEqual(diff.summary,{added:1,removed:1,changed:1,addedKeys:1,removedKeys:1});assert.equal(diff.applied,false);assert.equal(JSON.stringify(a),original);
});
test('registry default value and a literal Default name remain distinct',()=>{
 const a=parseRegistryFile('REGEDIT4\n[HKEY_CURRENT_USER\\Software\\Test]\n@="default"\n"(Default)"="named"');
 const b=parseRegistryFile('REGEDIT4\n[HKEY_CURRENT_USER\\Software\\Test]\n@="changed"\n"(Default)"="named"');
 const diff=compareRegistryFiles(a,b);assert.equal(diff.summary.changed,1);assert.equal(diff.changed[0].isDefault,undefined);assert.equal(a.sections[0].values.length,2);assert.equal(a.sections[0].values[0].isDefault,true);
});
