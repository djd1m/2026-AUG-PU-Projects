from pathlib import Path
import os,sys,json,time,datetime,subprocess,fcntl,hashlib
root=Path('/tmp/n7-f11-continuation-fleet-diagnostic-a26');mode=sys.argv[1];out=root/mode
schema=json.loads((root/'source-binding.json').read_text())['schemas'][mode]
title={'fault':'^F11 ALL30 finite native BODY fault recovers both2800ms phases full300s$','healthy':'^F11 ALL30 both2800ms phases preserve complete headers and existing fleet lanes full300s$'}[mode]
stamp=lambda:{'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'monotonic_ns':time.monotonic_ns()}
ticks=lambda pid:Path(f'/proc/{pid}/stat').read_text().split(') ')[1].split(' ')[19]
lock=open('/tmp/codex-heavy-build.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
disk=os.statvfs('/tmp');available=disk.f_bavail*disk.f_frsize
launch={'mode':mode,'schema':schema,'pid':os.getpid(),'startTicks':ticks(os.getpid()),'launcher':stamp(),'disk_available_bytes':available,'source':'b6b82cb83cdf7cb1d646784ad169af826e6c6852','trace_prelaunch_absent':not (out/'native.log').exists()}
for f in ['native-runner.py','guard-a26.mjs','schema-setup.mjs','launch.sh','source-before.json']:
 launch[f+'_sha256']=hashlib.sha256((root/f).read_bytes()).hexdigest()
(out/'launch.json').write_text(json.dumps(launch,indent=2));assert available>=1932735283;launch['disk_budget_rationale']={'estimated_new_output_bytes':160000000,'estimate_not_measurement':True,'expected_compact_prior_bytes':26872775,'pg_wal_bytes':'unknown','available_below_2GiB_reconsidered':True,'scope':'one directed fault, no build/copy/cleanup'}
setupenv=dict(os.environ);setupenv.pop('PGOPTIONS',None);setupenv.pop('N7_TEST_SCHEMA',None)
with (out/'setup.log').open('w') as log:
 setup=subprocess.Popen(['/tmp/n7-expanded-runtime-20261006/bin/node',str(root/'schema-setup.mjs'),mode],env=setupenv,stdout=log,stderr=subprocess.STDOUT)
 launch['setup_pid']=setup.pid;launch['setup_startTicks']=ticks(setup.pid);launch['setup_started']=stamp();(out/'launch.json').write_text(json.dumps(launch,indent=2));code=setup.wait();launch['setup_exit']=code;launch['setup_join']=stamp();(out/'launch.json').write_text(json.dumps(launch,indent=2))
if code:sys.exit(code)
disk=os.statvfs('/tmp');launch['before_heavy_disk_bytes']=disk.f_bavail*disk.f_frsize;assert launch['before_heavy_disk_bytes']>=1932735283
env=dict(os.environ,PGOPTIONS='-c search_path='+schema,N7_TEST_SCHEMA=schema,F10_EVIDENCE_DIR=str(out))
command=['/tmp/n7-expanded-runtime-20261006/bin/node','--test','--test-name-pattern',title,'tests/f10-runtime-protocol.test.ts']
launch['command']=command;launch['native_prework']=stamp()
with (out/'native.log').open('w') as log:
 child=subprocess.Popen(command,env=env,stdout=log,stderr=subprocess.STDOUT,cwd='/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup')
 launch['native_pid']=child.pid;launch['native_startTicks']=ticks(child.pid);launch['native_spawned']=stamp();(out/'launch.json').write_text(json.dumps(launch,indent=2))
 try:
  deadline=time.monotonic()+390
  while child.poll() is None and time.monotonic()<deadline:
   d=os.statvfs('/tmp');launch.setdefault('live_disk',[]).append({'stamp':stamp(),'available_bytes':d.f_bavail*d.f_frsize});(out/'launch.json').write_text(json.dumps(launch,indent=2));time.sleep(2)
  code=child.wait(timeout=max(1,deadline-time.monotonic()))
 except subprocess.TimeoutExpired:
  child.terminate();launch['timeout_signal']=stamp();code=child.wait(timeout=15)
 launch['native_exit']=code;launch['native_join']=stamp();(out/'launch.json').write_text(json.dumps(launch,indent=2));(out/'native-exit.txt').write_text(str(code)+'\n')
fcntl.flock(lock,fcntl.LOCK_UN);launch['lock_released']=stamp();(out/'launch.json').write_text(json.dumps(launch,indent=2));sys.exit(code)
