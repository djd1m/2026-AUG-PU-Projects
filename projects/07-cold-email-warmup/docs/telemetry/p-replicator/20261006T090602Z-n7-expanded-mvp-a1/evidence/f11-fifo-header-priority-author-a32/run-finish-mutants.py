import pathlib,subprocess,os,json
r=pathlib.Path('/tmp/n7-f11-fifo-header-priority-author-a32');p=pathlib.Path('/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup');f=p/'src/runtime/store.ts';original=f.read_text();results=[]
noBody=original.replace('else await c.query("UPDATE runtime_due SET due_at=$2,next_check_at=$2','else await c.query("UPDATE runtime_due SET due_at=$2::timestamptz+interval \'12 seconds\',next_check_at=$2::timestamptz+interval \'12 seconds\'')
pos=original.index(' async finish(');gen=original[:pos]+original[pos:].replace('d.owner_id=$2 AND d.generation=$3','$2::uuid IS NOT NULL AND $3::bigint IS NOT NULL').replace('AND owner_id=$3 AND generation=$4','AND $3::uuid IS NOT NULL AND $4::bigint IS NOT NULL')
try:
 for i,(name,source) in enumerate([('phantom-twelve',noBody),('current-owner-generation',gen)]):
  assert source!=original;env=os.environ.copy();env.pop('N7_TEST_SCHEMA',None);env.pop('PGOPTIONS',None);schema='n7_a32_short_'+str(261007050262+i);env['N7_SETUP_SCHEMA']=schema
  cmd=['python3',str(r/'run-child.py')];assert subprocess.run(cmd+['setup-'+name,'./node_modules/.bin/tsx',str(r/'schema-setup.mjs'),'short'],cwd=p,env=env).returncode==0
  env['N7_TEST_SCHEMA']=schema;env['PGOPTIONS']='-c search_path='+schema;f.write_text(source)
  try:code=subprocess.run(cmd+['mutant-'+name,'./node_modules/.bin/tsx','--test','--test-name-pattern=F11 preferred HEADER finish','tests/f10-runtime-protocol.test.ts'],cwd=p,env=env).returncode
  finally:f.write_text(original)
  results.append({'name':name,'exit':code,'materialAssertion':code==1 and 'ERR_ASSERTION' in (r/('mutant-'+name+'.log')).read_text(),'restored':f.read_text()==original})
finally:f.write_text(original)
(r/'finish-mutant-results-FINAL.json').write_text(json.dumps(results,indent=2)+'\n');assert all(x['materialAssertion'] and x['restored'] for x in results)
