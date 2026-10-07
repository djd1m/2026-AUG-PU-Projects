from pathlib import Path
import json,hashlib,datetime
root=Path('/tmp/n7-f11-pg-fixture-author-a22'); project=Path.cwd()
(root/'route.json').write_text(json.dumps({'ack':'2026-10-07T03:20:55Z','baseline':'5c707737fdcb2be4c579eac4cbd71a9a026b8820','profile':'model-routing-econom','requested_model':'gpt-6.1-sol','requested_effort':'medium','actual_model':None,'usage':None,'gap':'Host counters unavailable','risk':'inherited XL; exact test fixture-only correction','pre_edit_route':(root/'route.txt').read_text(),'scope':['tests/capacity-integration.test.ts','tests/f10-runtime-protocol.test.ts']}))
inv=json.loads(Path('/tmp/n7-f11-admission-repair-author-a21/source-build-inventory.json').read_text())
for f in inv['files']: assert hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()==f['sha256'],f['path']
(root/'source-build-before.json').write_text(json.dumps(inv))
p=project/'tests/capacity-integration.test.ts';s=p.read_text();old="""   const database='n7_f07_migration_'+randomUUID().replaceAll('-','');await pool.query('CREATE DATABASE '+database);
   const url=new URL(config.databaseUrl);url.pathname='/'+database;const upgrade=createPool(url.toString());"""
new="""   const schema='n7_f07_upgrade_'+randomUUID().replaceAll('-','');
   const lease=JSON.parse(await readFile(process.env.N7_DB_OWNERSHIP_LEASE!,'utf8'));
   const parent=process.env.N7_TEST_SCHEMA!;assert.match(parent,/^n7_a22_checks_[0-9]{12}$/);
   const digest=async()=>{const snapshot:Record<string,unknown>={};for(const namespace of ['public',parent])for(const {tablename}of(await pool.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[namespace])).rows){assert.match(tablename,/^[a-z_][a-z0-9_]*$/);snapshot[namespace+'.'+tablename]=(await pool.query(`SELECT count(*)::int n,md5(COALESCE(string_agg(to_jsonb(e)::text,E'\\\\n' ORDER BY to_jsonb(e)::text),'')) digest FROM "${namespace}"."${tablename}" e`)).rows[0];}return snapshot;};
   const before=await digest(),owner=await pool.connect();
   try{await owner.query('BEGIN');await owner.query('SELECT pg_advisory_xact_lock(7,1)');
    const identity=(await owner.query("SELECT current_database() db,current_user role,current_schema() schema,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) owner")).rows[0];
    assert.equal(identity.db,'n7f11_a8');assert.equal(identity.db,lease.database);assert.equal(identity.role,'n7');assert.equal(identity.role,lease.owner_role);assert.equal(identity.owner,'n7');assert.equal(identity.schema,parent);
    assert.equal((await owner.query('SELECT count(*)::int n FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].n,0);
    await owner.query(`CREATE SCHEMA "${schema}" AUTHORIZATION n7`);await owner.query('COMMIT');
   }catch(error){await owner.query('ROLLBACK');throw error;}finally{owner.release();}
   const url=new URL(config.databaseUrl);url.searchParams.set('options','-c search_path='+schema);const upgrade=createPool(url.toString());"""
assert old in s;s=s.replace(old,new);s=s.replace("   try {\n    const files=['001-init'", "   try {\n    const identity=(await upgrade.query(\"SELECT current_database() db,current_user role,current_schema() schema,current_setting('search_path') path\")).rows[0];assert.equal(identity.db,'n7f11_a8');assert.equal(identity.role,'n7');assert.equal(identity.schema,schema);assert.equal(identity.path,schema);\n    const files=['001-init'")
s=s.replace("await migrate(upgrade);await migrate(upgrade);assert.equal(await ready(upgrade),true);", "await migrate(upgrade);assert.equal(await ready(upgrade),true);await migrate(upgrade);assert.equal(await ready(upgrade),true);")
s=s.replace("   }finally{await upgrade.end();await pool.query('DROP DATABASE '+database);}", "    assert.equal((await upgrade.query(\"SELECT count(*)::int n FROM pg_constraint k JOIN pg_class a ON a.oid=k.conrelid JOIN pg_namespace an ON an.oid=a.relnamespace JOIN pg_class b ON b.oid=k.confrelid JOIN pg_namespace bn ON bn.oid=b.relnamespace WHERE k.contype='f' AND an.nspname=$1 AND bn.nspname<>$1\",[schema])).rows[0].n,0);\n   }finally{await upgrade.end();assert.deepEqual(await digest(),before);}")
p.write_text(s)
p=project/'tests/f10-runtime-protocol.test.ts';s=p.read_text();lines=s.splitlines(True);hits=0
for i,line in enumerate(lines):
 if '/all30-body-${begun}.json' in line: assert '},null,2)' in line;lines[i]=line.replace('},null,2)','})');hits+=1
assert hits==1;p.write_text(''.join(lines))
g=Path('/tmp/n7-f11-admission-repair-author-a21/guard-a21.mjs').read_text().replace('/tmp/n7-f11-admission-repair-author-a21',str(root))
g=g.replace("const schema=process.env.N7_TEST_SCHEMA;if(!schema)return;", "const parent=process.env.N7_TEST_SCHEMA;if(!parent)return;const options=client.connectionParameters.options;const schema=options?.startsWith('-c search_path=')?options.slice(15):parent;")
g=g.replace("!/^n7_a21_(short|fault|checks)_[0-9]{12}$/.test(schema)||process.env.PGOPTIONS!==`-c search_path=${schema}`", "!(/^n7_a22_checks_[0-9]{12}$/.test(schema)||/^n7_f07_upgrade_[a-f0-9]{32}$/.test(schema))||process.env.PGOPTIONS!==`-c search_path=${parent}`")
(root/'guard-a22.mjs').write_text(g)
