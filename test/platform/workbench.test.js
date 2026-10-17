'use strict';const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os');
const {createCollectors}=require('../../src/platform');const commands=require('../../src/platform/commands');
test('performance metadata is bounded sanitized read-only and never interpreted as CPU utilization',async()=>{
 const c=createCollectors({platform:'win32',runCommand:async(file,args)=>{assert.ok(commands.isAllowedCommand(file,args));return JSON.stringify({items:[{id:1,name:'<test>\u0000',memoryBytes:300,cpuSeconds:4,command:'private secret'},{id:2,name:'lower',memoryBytes:100,cpuSeconds:null},{id:1,name:'duplicate',memoryBytes:3},{id:-2,name:'invalid',memoryBytes:2}],warnings:[]});}});
 const value=await c.getPerformance();assert.equal(value.items.length,2);assert.equal(value.items[0].name,'<test>');assert.equal(value.items[1].cpuSeconds,null);assert.equal(value.items[0].cpuPercent,null);assert.ok(!JSON.stringify(value).includes('private secret'));assert.match(value.warnings[0],/cumulative/);assert.doesNotMatch(commands.WINDOWS_PERFORMANCE,/Kill\(|Stop-Process|CommandLine|Start-Process|Set-/);assert.match(commands.WINDOWS_PERFORMANCE,/MainModule\.FileName/);
});
test('performance source failure stays partial and command allowlist rejects alterations',async()=>{
 const data=await createCollectors({platform:'win32',runCommand:async()=>{throw new Error('secret');}}).getPerformance();assert.equal(data.items.length,0);assert.equal(data.status,'partial');assert.ok(!JSON.stringify(data).includes('secret'));assert.equal(commands.isAllowedCommand('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',[...commands.powershellArgs(commands.WINDOWS_PERFORMANCE),'extra']),false);
});
test('Windows home-volume fallback recovers real capacity shape when statfs is unavailable',async()=>{
 const c=createCollectors({platform:'win32',os:{...os,homedir:()=> 'J:\\Aster\\fixture'},fs:{statfs:async()=>{throw new Error('Unsupported');}},runCommand:async()=>JSON.stringify({volumesAvailable:true,batteryAvailable:false,volumes:[{drive:'J:',total:1000,free:250,fileSystem:'NTFS'}],batteries:[]})});const result=await c.getSystemInfo();assert.deepEqual(result.storage,{total:1000,free:250,used:750});assert.ok(!result.warnings.some(w=>w.includes('unavailable')));assert.match(commands.WINDOWS_DIAGNOSTICS,/\[IO.DriveInfo\]::GetDrives/);
});
