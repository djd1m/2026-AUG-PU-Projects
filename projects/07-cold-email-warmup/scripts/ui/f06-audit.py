#!/usr/bin/env python3
"""Read-only own-image/source/secret evidence. Secret values are never emitted."""
import pathlib, subprocess, json, hashlib, datetime, io, tarfile, sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
TRACE=ROOT/'docs/telemetry/features/20261003T023900Z-f06'
binding=None
if len(sys.argv)>1:
 receipt_path=pathlib.Path(sys.argv[1]).resolve()
 assert receipt_path==TRACE/'sol-b-r1-image-receipt.json'
 binding=json.loads(receipt_path.read_text())
 assert binding['exact_source_and_build_files'] and binding['image_matches_container']
 assert binding['source_record']=='sol-b-r1-frozen-source.json'
 subprocess.run(['python3',str(ROOT/'scripts/check-f06b-r1-snapshot.py'),'verify'],check=True,capture_output=True)
source=json.loads((TRACE/(binding['source_record'] if binding else 'sol-b-source.json')).read_text())
if binding:
 source['revision']=source['source_revision']
 assert source['source_sha256']==binding['source_sha256']
source_bad=[n for n,h in source['files'].items() if hashlib.sha256((ROOT/n).read_bytes()).hexdigest()!=h]
raw=subprocess.check_output(['docker','cp','n7f06a-web-1:/app/dist/.','-'])
tar=tarfile.open(fileobj=io.BytesIO(raw));build={}
for member in tar.getmembers():
 if member.isfile() and member.name.endswith('.js'):
  name=member.name.removeprefix('./').removeprefix('dist/')
  build['dist/'+name]=hashlib.sha256(tar.extractfile(member).read()).hexdigest()
build_sha=hashlib.sha256(json.dumps(build,sort_keys=True).encode()).hexdigest()
assert build_sha==(binding['build_sha256'] if binding else '110c84753e81699007417bba0cd92e20288bbee938921657c58e33c183299ac6')
web,db,ui=json.loads(subprocess.check_output(['docker','inspect','n7f06a-web-1','n7f06a-db-1','codex-ui-playwright']))
if binding: assert web['Image']==binding['image_id']
keys=pathlib.Path('/tmp/n7-f06a-runtime')
secrets=[(keys/n).read_text().strip().encode() for n in ['session-key','db-password','recipient-hash-key','operator-token']]
secrets.extend(v.encode() for v in json.loads((keys/'credential-keyring.json').read_text())['keys'].values())
assert all(secrets)
files=[p for p in ROOT.rglob('*') if p.is_file() and not p.is_symlink() and not {'node_modules','.git','dist','__pycache__'}.intersection(p.relative_to(ROOT).parts)]
leaks=[]
for p in files:
 if any(s in p.read_bytes() for s in secrets):leaks.append(str(p.relative_to(ROOT)))
logs=subprocess.check_output(['docker','logs','n7f06a-web-1'],stderr=subprocess.STDOUT)
logs_leak=any(s in logs for s in secrets)
classifications=[]
for p in sorted(TRACE.glob('sol-b-*/checks.json')):
 if p.parent.name=='sol-b-r1-native':continue  # separate narrow native smoke, not full-matrix history
 r=json.loads(p.read_text());http=[]
 for row in r['http']:
  if row['status']>=400:
   reason='expected anonymous initial session lookup' if row['status']==401 and row['path']=='/api/auth/me' else 'unexpected HTTP failure'
   http.append({**row,'classification':reason})
 console=[]
 for row in r['console']:
  expected=row['url']=='http://127.0.0.1:18709/api/auth/me' and row['http_status']=='401'
  console.append({**row,'classification':'expected anonymous initial session lookup' if expected else 'unexpected console error'})
 classifications.append({'attempt':p.parent.name,'http_errors':http,'console_errors':console,'page_errors':r['page_errors'],'requests_failed':[f for f in r['failures'] if f['kind']=='requestfailed'],'product_failure':'SessionClient network_error / native fetch wrong receiver'})
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_revision':source['revision'],'source_sha256':source['source_sha256'],'source_mismatches':source_bad,'image_id':web['Image'],'build_sha256':build_sha,'build_files':build,'secret_values_suppressed':True,'runtime_secrets_count':len(secrets),'project_files_scanned':len(files),'secret_file_leaks':leaks,'own_web_logs_secret_leak':logs_leak,'credential_canary_web_logs_absent':b'N7_F06B_CREDENTIAL_CANARY' not in logs,'credential_canary_browser_api':'not exercised; mailbox UI blocked before credential submission','db_no_host_ports':not any(db['NetworkSettings']['Ports'].values()),'web_loopback_only':web['NetworkSettings']['Ports']['3000/tcp']==[{'HostIp':'127.0.0.1','HostPort':'18709'}],'cpu_limit':web['HostConfig']['NanoCpus']/1e9,'own_network_detached':'n7f06a_network' not in ui['NetworkSettings']['Networks'],'ui_container_running':ui['State']['Running'],'http_console_classification':classifications}
(TRACE/('sol-b-r1-audit.json' if binding else 'sol-b-audit.json')).write_text(json.dumps(result,indent=2)+'\n')
assert not source_bad and not leaks and not logs_leak
assert result['db_no_host_ports'] and result['web_loopback_only'] and result['own_network_detached']
print(json.dumps({'source':'unchanged','build_sha256':build_sha,'secrets':'pass; values suppressed','own_network_detached':True}))
