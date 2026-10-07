import {loadConfig} from '/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup/src/config.ts';
import {createPool} from '/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup/src/db.ts';
const p=createPool(loadConfig().databaseUrl);
try{const db=(await p.query('SELECT current_database() AS db')).rows[0].db;if(db!=='n7f10_a2')throw Error('fixture_database_denied');
const result={db,other_sessions:Number((await p.query('SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n),occupied:Number((await p.query('SELECT count(*) AS n FROM transport_operation WHERE operation IS NOT NULL')).rows[0].n),runtime_claims:Number((await p.query("SELECT count(*) AS n FROM runtime_due WHERE state='claimed'")).rows[0].n),body_claims:Number((await p.query("SELECT count(*) AS n FROM incoming_ai_event WHERE capture_state='claimed'")).rows[0].n)};console.log(JSON.stringify(result));if(result.other_sessions||result.occupied||result.runtime_claims||result.body_claims)throw Error('fixture_not_quiescent');
}finally{await p.end();}
