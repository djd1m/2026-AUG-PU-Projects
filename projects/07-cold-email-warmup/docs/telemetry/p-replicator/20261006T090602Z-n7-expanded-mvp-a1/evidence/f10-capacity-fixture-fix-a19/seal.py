from pathlib import Path
import json,hashlib,datetime,os,fcntl,subprocess,re
R=Path('/tmp/n7-f10-capacity-fixture-fix-a19');P=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup');sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat();m=json.loads((R/'baseline-manifest.json').read_text());patched=json.loads((R/'patched-manifest.json').read_text());changes={g:[{'path':f,'before':h,'after':sha(P/f)} for f,h in m[g].items() if sha(P/f)!=h] for g in ['source','build']};assert [x['path'] for x in changes['source']]==['tests/capacity-integration.test.ts'] and not changes['build'];assert all(sha(P/f)==h for g in ['source','build'] for f,h in patched[g].items())
immutable=[]
for stage in ['baseline30','patched30','patched29','capacity']:
 ready=json.loads((R/(stage+'-ready.json')).read_text());assert sha(ready['runner_path'])==ready['runner_sha256']
 for f,h in ready['preloads'].items():assert sha(R/f)==h;immutable.append({'path':f,'sha256':h})
 for f,h in ready['fixtures'].items():assert sha(P/f)==h
 for f,h in ready['witness_inputs'].items():assert sha(R/f)==h
 terminal=json.loads((R/(stage+'-terminal.json')).read_text());assert terminal['post_join_PG']['quiescent'] and not terminal['remaining_owned_nodes'] and not terminal['timed_out']
for stage in ['type','build','compile']:
 ready=json.loads((R/(stage+'-ready.json')).read_text());assert sha(R/'tool-checks.py')==ready['script_sha256'];assert json.loads((R/(stage+'-terminal.json')).read_text())['native_returncode']==0
nodes=[]
for p in Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try:
  if not os.readlink(p/'exe').endswith('/node'):continue
  if any(x.startswith(b'NODE_OPTIONS=') and (str(R).encode() in x or b'/tmp/n7-f10-diagnostic-a18/' in x) for x in (p/'environ').read_bytes().split(b'\0')):
   fields=(p/'stat').read_text().split(') ')[1].split();nodes.append({'pid':int(p.name),'startticks':fields[19],'state':fields[0]})
 except OSError:pass
assert not nodes,nodes
lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);pg=json.loads(subprocess.check_output(['/tmp/n7-expanded-runtime-20261006/bin/node',str(R/'pg-snapshot-v1.mjs')],env=os.environ,text=True));assert pg['quiescent'];fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
(R/'probe-key.pem').unlink();v=os.statvfs(R);revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=P,text=True).strip();summary={}
for stage in ['baseline30','patched30','patched29','capacity']:
 tap=(R/(stage+'.tap')).read_text();counts={k:int(re.search(r'^# '+k+r' (\d+)$',tap,re.M)[1]) for k in ['tests','pass','fail','cancelled','skipped','todo']};summary[stage]={**json.loads((R/(stage+'-native-exit.json')).read_text()),'counts':counts,'TAP_sha256':sha(R/(stage+'.tap'))}
assert summary['baseline30']['native_returncode']==1 and summary['baseline30']['counts']=={'tests':11,'pass':9,'fail':2,'cancelled':0,'skipped':0,'todo':0};assert "expected: 'waiting_capacity'" in (R/'baseline30.tap').read_text() and "actual: 'active'" in (R/'baseline30.tap').read_text()
for stage in ['patched30','patched29','capacity']:assert summary[stage]['native_returncode']==0 and summary[stage]['counts']['pass']==11 and summary[stage]['counts']['fail']==0
seal={'at':now(),'run_id':'20261006T090602Z-n7-expanded-mvp-a1','work_unit_id':'f10-capacity-fixture-fix-a19','revision':revision,'source_count':len(m['source']),'build_count':len(m['build']),'expected_test_changes':changes['source'],'production_source_drift':[],'production_build_drift':changes['build'],'immutable_runner_preload_witness_fixture_drift':[],'own_or_prior_nodes':nodes,'PG':pg,'mutex':'free verified via nonblocking acquire and release','disk_available_bytes':v.f_bavail*v.f_frsize,'free_inodes':v.f_favail,'private_probe_key_removed':True,'native_results':summary,'source_acceptance':False,'overall_F10':'UNACCEPTED; independent review/integration owned by coordinator','next_responsible':'/root/n7_sol_coordinator','no_new_native_tests_after_seal':True};(R/'terminal-seal.json').write_text(json.dumps(seal,indent=2)+'\n');(R/'final-manifest.json').write_text(json.dumps({**patched,'commit':revision,'freezeUtc':seal['at']},indent=2)+'\n');print(json.dumps({'revision':revision,'sealed_at':seal['at'],'production_drift':0,'test_changes':1,'owned_nodes':0,'PG_quiescent':True,'disk_available_bytes':seal['disk_available_bytes']}))
