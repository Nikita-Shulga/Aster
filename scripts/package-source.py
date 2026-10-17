#!/usr/bin/env python3
"""Create a verified source archive; never include local installs or fixture data."""
import hashlib,json,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
files=[]
for name in ('src','test','scripts','assets','docs','.github'):
    for p in (root/name).rglob('*'):
        if p.is_file() and not p.is_symlink() and '__pycache__' not in p.parts and '.fixtures' not in p.parts:
            files.append(p)
for name in ('package.json','package-lock.json','README.md','NOTICE.txt','deliverables/Aster-interactive-preview.html','qa/native-smoke-linux.json','qa/renderer-dom.json'):
    p=root/name
    if p.is_file() and not p.is_symlink(): files.append(p)
files=sorted(set(files))
manifest={'version':json.loads((root/'package.json').read_text())['version'],'status':'development-alpha; native and signing release gates remain','files':{str(p.relative_to(root)):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files}}
out=root/'deliverables/Aster-System-Care-source-alpha.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in files: z.write(p,str(p.relative_to(root)))
    z.writestr('SOURCE-MANIFEST.json',json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(out) as z:
    assert z.testzip() is None
    for name,record in manifest['files'].items():
        b=z.read(name);assert len(b)==record['bytes'] and hashlib.sha256(b).hexdigest()==record['sha256']
print(json.dumps({'path':str(out),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'members':len(files)+1}))
