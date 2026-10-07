import sys,os,json,hashlib,subprocess,time,pathlib
root=pathlib.Path('/tmp/n7-f11-fifo-header-priority-author-a32');p=pathlib.Path('/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup');name=sys.argv[1];cmd=sys.argv[2:]
paths=[*p.glob('src/**/*.ts'),*p.glob('dist/**/*.js'),*p.glob('tests/**/*.ts'),root/'guard.mjs',pathlib.Path(__file__)]
facts={'name':name,'startUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'command':cmd,'cwd':str(p),'files':{str(x):hashlib.sha256(x.read_bytes()).hexdigest() for x in paths},'environment':{k:os.getenv(k) for k in ['DATABASE_NAME','PGOPTIONS','N7_TEST_SCHEMA','NODE_OPTIONS','N7_DB_OWNERSHIP_LEASE']},'preflight':'ready; own fresh schema, numeric local PG and inherited socket/DNS guard, no external provider','model':None,'usage':None}
launch=root/(name+'-launch.json');assert not launch.exists();started=time.monotonic()
facts['immutableSources']={}
for rel in ['src/runtime/store.ts','src/replies/context-store.ts','tests/f10-runtime-integration.test.ts','tests/f10-runtime-protocol.test.ts']:
 copy=root/(name+'-'+rel.replace('/','_'));assert not copy.exists();copy.write_bytes((p/rel).read_bytes());facts['immutableSources'][str(copy)]=hashlib.sha256(copy.read_bytes()).hexdigest()
with (root/(name+'.log')).open('x') as out:
 child=subprocess.Popen(cmd,cwd=p,stdout=out,stderr=subprocess.STDOUT);facts['pid']=child.pid;facts['startTicks']=pathlib.Path('/proc/'+str(child.pid)+'/stat').read_text().split(') ')[1].split()[19];launch.write_text(json.dumps(facts,indent=2)+'\n');exit=child.wait()
facts.update(exit=exit,elapsedSeconds=time.monotonic()-started,endUtc=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),pidJoined=True,filesUnchanged=all(hashlib.sha256(x.read_bytes()).hexdigest()==facts['files'][str(x)] for x in paths));(root/(name+'-exit.json')).write_text(json.dumps(facts,indent=2)+'\n');print(json.dumps({k:facts[k] for k in ['name','pid','exit','elapsedSeconds','filesUnchanged']}));sys.exit(exit)
