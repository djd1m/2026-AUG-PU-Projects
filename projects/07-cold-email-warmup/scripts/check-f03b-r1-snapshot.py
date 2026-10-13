#!/usr/bin/env python3
"""Bind all Docker COPY inputs and restored runtime build without exposing contents."""
import hashlib,json,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
out=root/'docs/telemetry/features/20261002T211800Z-f03/sol-b-r1-source-image.json'
env={**os.environ,'COMPOSE_PROJECT_NAME':'n7f03b','N7_RUNTIME_DIR':'/tmp/n7-f03b-runtime','N7_WEB_PORT':'18704','MAIL_PROVIDER_ALLOWLIST':'{"smtp.gmail.com":30,"imap.gmail.com":30}'}
files=sorted([root/'package.json',root/'package-lock.json',root/'eslint.config.js',*root.glob('tsconfig*.json'),*(p for directory in ['src','db','tests'] for p in (root/directory).rglob('*') if p.is_file())])
inputs={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
code="""const fs=require('fs'),crypto=require('crypto');const files=JSON.parse(process.argv[1]);function walk(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name):[p+'/'+e.name])}const paths=[...files,...walk('dist')];process.stdout.write(JSON.stringify(Object.fromEntries(paths.sort().map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))))"""
result=subprocess.run(['docker','compose','-p','n7f03b','exec','-T','web','node','-e',code,json.dumps(list(inputs))],cwd=root,env=env,capture_output=True,text=True,check=True)
actual=json.loads(result.stdout)
assert all(actual.get(p)==digest for p,digest in inputs.items()),'Restored container COPY inputs differ from host'
build={p:digest for p,digest in actual.items() if p.startswith('dist/')}
aggregate=lambda values:hashlib.sha256(json.dumps(values,sort_keys=True,separators=(',',':')).encode()).hexdigest()
image=subprocess.run(['docker','image','inspect','n7f03b-web','--format','{{.Id}}'],capture_output=True,text=True,check=True).stdout.strip()
container_image=subprocess.run(['docker','inspect','n7f03b-web-1','--format','{{.Image}}'],capture_output=True,text=True,check=True).stdout.strip()
assert image==container_image
out.write_text(json.dumps({'source_revision':subprocess.run(['git','rev-parse','HEAD'],cwd=root,capture_output=True,text=True,check=True).stdout.strip(),'baseline_revision':'e7791cc57d60737e44eb7db33b3f06371dee7425','image':image,'container_image':container_image,'copied_input_count':len(inputs),'copied_input_sha256':aggregate(inputs),'copied_inputs':inputs,'build_sha256':aggregate(build),'build_files':build,'dockerfile_sha256':hashlib.sha256((root/'Dockerfile').read_bytes()).hexdigest(),'host_container_mismatches':0,'capture':'Exact Docker COPY inputs verified host=container; caller binds mutation restoration and suite timing separately. Hashes only, no runtime secrets.'},indent=2)+'\n')
print(f'Snapshot exit0: {len(inputs)} COPY inputs match restored container; image {image}.')
