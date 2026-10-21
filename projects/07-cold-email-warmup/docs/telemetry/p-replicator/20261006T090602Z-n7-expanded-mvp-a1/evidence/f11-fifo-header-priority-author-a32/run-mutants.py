import os,subprocess,pathlib,json,time
root=pathlib.Path('/tmp/n7-f11-fifo-header-priority-author-a32');p=pathlib.Path('/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup');runtime=p/'src/runtime/store.ts';context=p/'src/replies/context-store.ts';originalR=runtime.read_text();originalC=context.read_text();results=[]
def run(name,args,env):
 return subprocess.run(['python3',str(root/'run-child.py'),name,*args],cwd=p,env=env).returncode
mutants=[
 ('urgency',runtime,originalR.replace("CASE WHEN p.completed_at IS NULL OR p.completed_at+interval '30 seconds'<=$2::timestamptz+interval '5 seconds' THEN 0","CASE WHEN false THEN 0")),
 ('body-authority',context,originalC[:originalC.index('export async function captureHeaderFrontierClient')]+originalC[originalC.index('export async function captureHeaderFrontierClient'):].replace("await authorizeTransport(c,config,row.tenant_id,row.mailbox_id,'imap_body');",'')),
 ('continuation',context,originalC[:originalC.index('export async function captureHeaderFrontierClient')]+originalC[originalC.index('export async function captureHeaderFrontierClient'):].replace('if((await c.query(', 'if(false&&(await c.query(',1)),
 ('windows',context,originalC.replace('Number(capacity.windows)>=3||','')),
 ('physical-cap',context,originalC.replace('Number(capacity.bodies)>=3||','')),
 ('ordinary-free',context,originalC.replace("||Number(capacity.free)===0",'')),
 ('oldest-three',context,originalC[:originalC.index('export async function captureHeaderFrontierClient')]+originalC[originalC.index('export async function captureHeaderFrontierClient'):].replace('LIMIT 3','LIMIT 4')),
 ('turns',runtime,originalR.replace('  await c.query("UPDATE runtime_tenant_turn SET service_seq=nextval(\'runtime_service_seq\') WHERE tenant_id=$1 AND kind=$2",[row.tenant_id,kind]);','').replace('  await c.query("UPDATE runtime_due SET service_seq=nextval(\'runtime_service_seq\') WHERE mailbox_id=$1 AND kind=$2",[row.mailbox_id,kind]);','')),
]
try:
 for i,(name,file,source) in enumerate(mutants):
  assert source!=file.read_text(),name
  env=os.environ.copy();env.pop('PGOPTIONS',None);env.pop('N7_TEST_SCHEMA',None);schema='n7_a32_checks_'+str(261007050250+i);env['N7_SETUP_SCHEMA']=schema
  assert run('setup-mutant-'+name,['./node_modules/.bin/tsx',str(root/'schema-setup.mjs'),'checks'],env)==0
  env['PGOPTIONS']='-c search_path='+schema;env['N7_TEST_SCHEMA']=schema;file.write_text(source)
  try:code=run('mutant-'+name,['./node_modules/.bin/tsx','--test','--test-name-pattern=F11 FIFO HEADER preference','tests/f10-runtime-integration.test.ts'],env)
  finally:runtime.write_text(originalR);context.write_text(originalC)
  log=(root/('mutant-'+name+'.log')).read_text();results.append({'name':name,'exit':code,'materialAssertion':code==1 and 'ERR_ASSERTION' in log,'restored':runtime.read_text()==originalR and context.read_text()==originalC});(root/'mutant-results-v1.json').write_text(json.dumps(results,indent=2)+'\n')
finally:runtime.write_text(originalR);context.write_text(originalC)
assert all(x['materialAssertion'] and x['restored'] for x in results)
