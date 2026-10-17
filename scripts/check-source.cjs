'use strict';
const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
let count=0;
function walk(dir){if(!fs.existsSync(dir))return;for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())walk(p);else if(/\.(cjs|js)$/.test(p)){cp.execFileSync(process.execPath,['--check',p],{stdio:'inherit'});count++;}}}
for(const p of ['src','scripts','test'])walk(p);console.log(`Syntax checked ${count} JavaScript files`);
