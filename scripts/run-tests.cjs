'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const files=[];
function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory()&&entry.name!=='.fixtures')visit(file);else if(entry.isFile()&&/\.test\.(cjs|js)$/.test(entry.name))files.push(file);}}
visit(path.resolve(__dirname,'../test'));
if(!files.length)throw new Error('No test files found');
const result=spawnSync(process.execPath,['--test',...files.sort()],{stdio:'inherit',shell:false});
process.exitCode=result.status??1;
