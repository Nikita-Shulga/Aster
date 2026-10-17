'use strict';
const {execFile}=require('node:child_process'),{windowsPowerShell}=require('./commands'),m=require('../core/management');
const SCRIPT=String.raw`
$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$p=ConvertFrom-Json ([Console]::In.ReadToEnd())
function Open-Key($location,$write){$parts=$location.Split('\',2);$hive=if($parts[0] -eq 'HKCU'){[Microsoft.Win32.RegistryHive]::CurrentUser}else{[Microsoft.Win32.RegistryHive]::LocalMachine};$base=[Microsoft.Win32.RegistryKey]::OpenBaseKey($hive,[Microsoft.Win32.RegistryView]::Registry64);try{return $base.OpenSubKey($parts[1],$write)}finally{$base.Close()}}
function Value($key,$name){if($key.GetValueNames() -notcontains $name){return $null};$kind=$key.GetValueKind($name).ToString();$data=$key.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);if($kind -eq 'QWord'){$data=$data.ToString()};return [pscustomobject]@{name=$name;kind=$kind;data=$data}}
if($p.action -eq 'read'){$key=Open-Key $p.path $false;if($null -eq $key){throw 'Registry key is unavailable'};try{$values=@($key.GetValueNames()|Select-Object -First 256|ForEach-Object {Value $key $_});$children=@($key.GetSubKeyNames()|Select-Object -First 256);$result=@{path=$p.path;values=$values;children=$children;partial=($key.ValueCount -gt 256 -or $key.SubKeyCount -gt 256)}}finally{$key.Close()};$result|ConvertTo-Json -Depth 8 -Compress;exit}
if($p.action -eq 'write'){
 if($p.path -ne 'HKCU\Software\Microsoft\Windows\CurrentVersion\Run' -and ($p.path -notmatch '^HKCU\\Software\\[^\\]+' -or $p.path -match '^HKCU\\Software\\(Microsoft|Classes|Policies|Aster)(\\|$)')){throw 'Registry write scope refused'}
 $key=Open-Key $p.path $true;if($null -eq $key){throw 'Registry key is unavailable'}
 try{$current=Value $key $p.name;$a=ConvertTo-Json -InputObject $current -Depth 8 -Compress;$b=ConvertTo-Json -InputObject $p.expected -Depth 8 -Compress;if($a -cne $b){throw 'Registry value changed since preview'}
 if($null -eq $p.after){$key.DeleteValue($p.name,$true)}else{$data=$p.after.data;switch($p.after.kind){'DWord'{$data=[int]$data}'QWord'{$data=[long]$data}'Binary'{$data=[byte[]]$data}'MultiString'{$data=[string[]]$data}};$key.SetValue($p.name,$data,([Enum]::Parse([Microsoft.Win32.RegistryValueKind],[string]$p.after.kind)))};$key.Flush();$result=Value $key $p.name;ConvertTo-Json -InputObject $result -Depth 8 -Compress}finally{$key.Close()};exit
}
if($p.action -eq 'winget'){
 $package=Get-AppxPackage -Name Microsoft.DesktopAppInstaller -PackageTypeFilter Main|Select-Object -First 1;if($null -eq $package){throw 'Microsoft App Installer is unavailable'}
 $file=Join-Path $package.InstallLocation 'winget.exe';$sig=Get-AuthenticodeSignature -LiteralPath $file;if($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation'){throw 'WinGet signature could not be verified'}
 $wingetArgs=@($p.args);foreach($arg in $wingetArgs){if($arg -notmatch '^[A-Za-z0-9._+-]+$'){throw 'Invalid WinGet argument'}}
 & $file @wingetArgs;exit $LASTEXITCODE
}
throw 'Unsupported management action'
`;
function createManagementAdapter({execute=execFile,platform=process.platform,env=process.env}={}){
 const run=(payload,timeout=15000,maxBuffer=2*1024**2)=>new Promise((resolve,reject)=>{if(platform!=='win32')return reject(new Error('This management tool requires Windows.'));const script=SCRIPT;const child=execute(windowsPowerShell(env),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,shell:false,timeout,maxBuffer,encoding:'utf8',env:{...env}},(error,stdout)=>{if(error){const e=new Error(payload.action==='winget'?'WinGet could not complete the request. App Installer, source agreements, package support or administrator approval may be required. No success was assumed. If the request timed out, the installer may still be running; check Windows before retrying.':'Registry operation failed or the value changed. Refresh before retrying.');e.code=error.killed?'TIMEOUT':'MANAGEMENT_SOURCE_FAILED';reject(e);}else resolve(stdout.replace(/^\uFEFF/,''));});if(child?.stdin){child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(payload));}});
 return {readRegistry:async location=>JSON.parse(await run({action:'read',path:m.keyPath(location)})),writeRegistry:async(location,name,expected,after)=>{if(location!=='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run')m.editableKey(location);if(expected)m.registryValue(expected);if(after)m.registryValue(after);return JSON.parse(await run({action:'write',path:location,name,expected,after}));},checkUpdates:async()=>m.parseWingetUpdates(await run({action:'winget',args:['upgrade','--source','winget','--disable-interactivity']},90000)),installUpdate:async row=>{await run({action:'winget',args:m.updateArguments(row)},900000);return {processCompleted:true,requiresVerification:true};}};
}
module.exports={createManagementAdapter,SCRIPT};
