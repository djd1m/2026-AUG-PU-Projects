from pathlib import Path
import subprocess,json,datetime,time,hashlib,re,secrets,fcntl,os
raw=Path('/tmp/n8-replicate-i8-restore');cfg=json.loads(Path('/tmp/n8-replicate-i8-4/commands.json').read_text());db=cfg['database'];schema=cfg['schema'];ctr='n8-ui-e2e-db-1';target='n8_restore_'+secrets.token_hex(6);dump=raw/'fixture.dump';created=False;lock=open('/tmp/codex-heavy-build.lock','r');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);start=time.time();out={'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_revision':'98d5111277b788be875b9cb6ded7424e05a994a7','checks':[]};print('heavy_acquired',out['started_at'],flush=True)
def run(args,input=None):
 c=subprocess.run(args,input=input,capture_output=True,text=True,timeout=max(1,180-int(time.time()-start)))
 if c.returncode: raise RuntimeError('command failed: '+args[0]+' '+args[1]+' code '+str(c.returncode))
 return c.stdout.strip()
def query(name,sql):return run(['docker','exec','-i',ctr,'psql','-XAtq','-U','n8_ui_owner','-d',name,'-v','ON_ERROR_STOP=1'],sql)
def snapshot(name):
 tables=query(name,f"SELECT tablename FROM pg_tables WHERE schemaname='{schema}' ORDER BY tablename;").splitlines();assert tables and all(re.fullmatch('[a-z_]+',t) for t in tables)
 rows=[]
 for t in tables:
  s=query(name,f'''SELECT count(*)::text||'|'||md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY md5(to_jsonb(x)::text)),'')) FROM "{schema}"."{t}" x;''');n,h=s.split('|');rows.append({'table':t,'rows':int(n),'aggregate_md5':h})
 constraints=query(name,f"SELECT md5(coalesce(string_agg(conname||contype::text||convalidated::text||pg_get_constraintdef(c.oid),'' ORDER BY conname,pg_get_constraintdef(c.oid)),'')) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='{schema}';")
 triggers=query(name,f"SELECT md5(coalesce(string_agg(pg_get_triggerdef(t.oid),'' ORDER BY pg_get_triggerdef(t.oid)),'')) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='{schema}' AND NOT t.tgisinternal;")
 return {'tables':rows,'constraints_md5':constraints,'triggers_md5':triggers}
try:
 assert re.fullmatch('n8_ui_[a-f0-9]{12}',db) and re.fullmatch('n8_ui_[a-f0-9]{24}',schema) and target!=db
 assert run(['docker','inspect',ctr,'--format','{{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "com.docker.compose.service"}} {{.HostConfig.NanoCpus}} {{json .HostConfig.PortBindings}}']) in ['n8-ui-e2e db 750000000 {}','n8-ui-e2e db 750000000 null']
 for service in ['web','maintenance','proxy']:
  assert run(['docker','inspect','n8-ui-e2e-'+service+'-1','--format','{{index .Config.Labels "com.docker.compose.project"}} {{.State.Running}}'])=='n8-ui-e2e false'
 assert query(db,"SELECT shobj_description(oid,'pg_database')||'|'||pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database();")=='N8_F04B_OWNED_LOCAL_SOFTWARE_FIXTURE|n8_ui_owner'
 assert query(db,f'SELECT count(*) FROM "{schema}".schema_migration;')=='8'
 hosted=json.loads(query(db,f'''SELECT json_build_object('submissions',(SELECT count(*) FROM "{schema}".provider_submission),'budgets',(SELECT count(*) FROM "{schema}".provider_spend_budget),'hosted_evidence',(SELECT count(*) FROM "{schema}".generation_evidence WHERE mode='replicate'),'linked_success',(SELECT count(*) FROM "{schema}".generation_evidence e JOIN "{schema}".job j ON j.id=e.job_id JOIN "{schema}".provider_submission s ON s.job_id=j.id JOIN "{schema}".attempt_ticket t ON t.id=s.attempt_ticket_id WHERE e.mode='replicate'));'''));assert hosted['submissions']>=2 and hosted['budgets']>=1 and hosted['hosted_evidence']>=2 and hosted['linked_success']>=2;out['representative_hosted_rows']=hosted
 before=snapshot(db);out['before']=before;out['checks'].append('ownership_quiescence_schema8_verified')
 fd=os.open(dump,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as dest:
  c=subprocess.run(['docker','exec',ctr,'pg_dump','-U','n8_ui_owner','-d',db,'--format=custom','--schema='+schema,'--no-owner','--no-privileges'],stdout=dest,stderr=subprocess.PIPE,timeout=30);assert c.returncode==0
 out['dump_bytes']=dump.stat().st_size;out['dump_sha256']=hashlib.sha256(dump.read_bytes()).hexdigest();assert out['dump_bytes']>0
 run(['docker','exec',ctr,'createdb','-U','n8_ui_owner','--owner=n8_ui_owner','--template=template0',target]);created=True
 query(target,f"COMMENT ON DATABASE {target} IS 'N8_F06A_OWNED_LOCAL_RESTORE_FIXTURE';")
 with dump.open('rb') as src:
  c=subprocess.run(['docker','exec','-i',ctr,'pg_restore','-U','n8_ui_owner','-d',target,'--exit-on-error','--single-transaction','--no-owner','--no-privileges'],stdin=src,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=45);assert c.returncode==0
 after=snapshot(db);restored=snapshot(target);out['source_after']=after;out['restored']=restored;assert before==after==restored;assert sum(x['rows'] for x in before['tables'])>0
 out['checks']+=['pg_dump_custom_success','pg_restore_distinct_database_success','all_table_counts_and_row_digests_equal','constraints_equal','source_unchanged'];out['status']='pass'
except Exception as e:out['status']='failed';out['reason']=str(e)
finally:
 if created:
  try:
   assert query(target,"SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database();")=='N8_F06A_OWNED_LOCAL_RESTORE_FIXTURE'
   run(['docker','exec',ctr,'dropdb','-U','n8_ui_owner',target]);out['target_cleanup']='removed_only_created_owned_target'
  except Exception as e:out['target_cleanup']='failed';out['status']='failed'
 if dump.exists():dump.unlink();out['raw_dump_cleanup']='removed'
 out['finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();out['duration_ms']=round((time.time()-start)*1000);(raw/'result.json').write_text(json.dumps(out,indent=2)+'\n');fcntl.flock(lock,fcntl.LOCK_UN);print('heavy_released',out['finished_at'],out['status'],flush=True)
