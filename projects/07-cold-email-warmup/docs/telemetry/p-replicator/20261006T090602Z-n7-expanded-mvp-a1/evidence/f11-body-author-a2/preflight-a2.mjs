import {loadConfig} from '/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup/src/config.ts';
import {createPool} from '/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup/src/db.ts';
const p=createPool(loadConfig().databaseUrl);
try{const db=(await p.query('SELECT current_database() AS db')).rows[0].db;if(db!=='n7f10_a2')throw Error('fixture_database_denied');
 const otherSessions=Number((await p.query('SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n),occupied=Number((await p.query('SELECT count(*) AS n FROM transport_operation WHERE operation IS NOT NULL')).rows[0].n),claims=Number((await p.query("SELECT count(*) AS n FROM runtime_due WHERE state='claimed'")).rows[0].n);
 console.log(JSON.stringify({db,otherSessions,occupied,claims,choice:'add unpublished v16 sender binding column; preserve existing rows; full SQL fresh+rollback tested separately'}));if(otherSessions||occupied||claims)throw Error('fixture_not_quiescent');await p.query('ALTER TABLE incoming_ai_event ADD COLUMN IF NOT EXISTS sender_binding char(64)');
}finally{await p.end();}
