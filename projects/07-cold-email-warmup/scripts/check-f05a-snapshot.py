#!/usr/bin/env python3
"""Bind final restored source/build/image and copied image input; never print credentials."""
import hashlib, json, os, subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
env={**os.environ,'COMPOSE_PROJECT_NAME':'n7f05a','N7_RUNTIME_DIR':'/tmp/n7-f05a-runtime','N7_WEB_PORT':'18707','N7_APP_ORIGIN':'http://127.0.0.1:18707','MAIL_PROVIDER_ALLOWLIST':'{"smtp.gmail.com":30,"imap.gmail.com":30}'}
def command(args):
 return subprocess.run(args,cwd=root,env=env,capture_output=True,text=True,check=True).stdout.strip()
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
paths=sorted([*root.glob('src/**/*.ts'),*root.glob('tests/*.ts'),*root.glob('db/*.sql'),root/'package.json',root/'package-lock.json',root/'tsconfig.json',root/'tsconfig.build.json',root/'eslint.config.js'])
source={str(p.relative_to(root)):digest(p) for p in paths}
copied=command(['docker','compose','-p','n7f05a','exec','-T','web','sha256sum',*source])
image_inputs={line.split()[1]:line.split()[0] for line in copied.splitlines()}
assert image_inputs==source,'host differs from restored copied image inputs'
build={str(p.relative_to(root)):digest(p) for p in sorted(root.glob('dist/**/*.js'))}
runtime_build=command(['docker','compose','-p','n7f05a','exec','-T','web','sha256sum',*build])
assert {line.split()[1]:line.split()[0] for line in runtime_build.splitlines()}==build
image=command(['docker','image','inspect','n7f05a-web','--format','{{.Id}}'])
container_image=command(['docker','inspect',command(['docker','compose','-p','n7f05a','ps','-q','web']),'--format','{{.Image}}'])
assert image==container_image
r={'source_revision':command(['git','rev-parse','HEAD']),'source_files':source,'source_sha256':hashlib.sha256(json.dumps(source,sort_keys=True).encode()).hexdigest(),'build_files':build,'build_sha256':hashlib.sha256(json.dumps(build,sort_keys=True).encode()).hexdigest(),'image_id':image,'container_image_id':container_image,'copied_input_hashes':image_inputs,'dockerfile_sha256':digest(root/'Dockerfile'),'spec_sha256':digest(root/'docs/features/f05-evidence-billing-growth/01-specification.md')}
(root/'docs/telemetry/features/20261003T010600Z-f05/sol-a-source-image.json').write_text(json.dumps(r,indent=2)+'\n')
print('PASS: host source/build equals restored runtime inputs/build; own running container matches image ID.')
