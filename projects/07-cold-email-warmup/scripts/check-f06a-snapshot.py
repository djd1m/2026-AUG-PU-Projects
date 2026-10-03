#!/usr/bin/env python3
from pathlib import Path
import hashlib,json,subprocess,datetime,sys
root=Path(__file__).resolve().parent.parent;e=root/'docs/telemetry/features/20261003T023900Z-f06'
def command(*args):return subprocess.check_output(args,cwd=root,text=True).strip()
def digest(paths):return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths) if p.is_file()}
source=digest([*root.glob('src/**/*.ts'),*root.glob('tests/*.ts'),root/'package-lock.json',root/'package.json',root/'Dockerfile',root/'tsconfig.build.json',root/'tsconfig.json',root/'eslint.config.js',*root.glob('db/**/*.sql')])
source_sha=hashlib.sha256(json.dumps(source,sort_keys=True).encode()).hexdigest()
mode=sys.argv[1]
now=datetime.datetime.now(datetime.timezone.utc).isoformat();revision=command('git','rev-parse','HEAD')
if mode=='freeze':
 (e/'sol-a-frozen-source.json').write_text(json.dumps({'at':now,'source_revision':revision,'source_sha256':source_sha,'files':source},indent=2)+'\n')
else:
 frozen=json.loads((e/'sol-a-frozen-source.json').read_text());assert source==frozen['files'],'source drift after freeze'
 image=command('docker','image','inspect','n7f06a-web','--format','{{.Id}}')
 build=digest(root.glob('dist/**/*.js'))
 if mode in ['preflight','ready']:
  data={'at':now,'status':'ready','source_revision':revision,'source_sha256':source_sha,'build_revision':revision,'build_sha256':hashlib.sha256(json.dumps(build,sort_keys=True).encode()).hexdigest(),'image_id':image,'environment':'own n7f06a loopback18709 privatePG CPU2','environment_available':True,'inputs':[{'name':'random external runtime key files','available':True},{'name':'accepted TEST fixtures and realPG suite','available':True}], 'test_command':'docker compose -p n7f06a exec -T web npm run test:integration','expected_effects':['own DB fixture tenant resets only','no external SMTP/IMAP/charge'], 'evidence_root':{'root':'project','path':'docs/telemetry/features/20261003T023900Z-f06'},'external_actions_executed':False,'e2e_claim':None}
  (e/('sol-a-preflight-runtime.json' if mode=='preflight' else 'sol-a-preflight-http.json')).write_text(json.dumps(data,indent=2)+'\n')
 else:
  container=command('docker','compose','-p','n7f06a','ps','-q','web');db=command('docker','compose','-p','n7f06a','ps','-q','db')
  bindings=json.loads(command('docker','inspect',container))[0];database=json.loads(command('docker','inspect',db))[0]
  assert bindings['Image']==image;assert not database['NetworkSettings']['Ports'].get('5432/tcp');assert bindings['NetworkSettings']['Ports']['3000/tcp']==[{'HostIp':'127.0.0.1','HostPort':'18709'}]
  for relative,sha in build.items():
   actual=command('docker','compose','-p','n7f06a','exec','-T','web','sha256sum','/app/'+relative).split()[0];assert actual==sha,relative
  for relative,sha in source.items():
   actual=command('docker','compose','-p','n7f06a','exec','-T','web','sha256sum','/app/'+relative).split()[0];assert actual==sha,relative
  logs=command('docker','compose','-p','n7f06a','logs','--no-color');assert 'N7_F06_PRIVATE_' not in logs
  (e/'sol-a-image-receipt.json').write_text(json.dumps({'at':now,'source_revision':revision,'source_sha256':source_sha,'image_id':image,'image_matches_container':True,'exact_source_and_build_files':True,'db_no_ports':True,'loopback18709':True,'canary_logs_absent':True,'asset_entrypoint':'/assets/app.js','shell':'/app'},indent=2)+'\n')
