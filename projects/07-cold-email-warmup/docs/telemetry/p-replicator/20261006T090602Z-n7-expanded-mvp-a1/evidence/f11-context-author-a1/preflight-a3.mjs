import {loadConfig} from '/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup/src/config.ts';
import {createPool} from '/tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup/src/db.ts';
const p=createPool(loadConfig().databaseUrl);
try {const d=(await p.query('SELECT current_database() AS db')).rows[0].db;if(d!=='n7f10_a2')throw Error('fixture_database_denied');
 const n=(await p.query('SELECT count(*)::integer AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n;
 const occupied=Number((await p.query('SELECT count(*) AS n FROM transport_operation WHERE operation IS NOT NULL')).rows[0].n),claims=Number((await p.query("SELECT count(*) AS n FROM runtime_due WHERE state='claimed'")).rows[0].n);
 console.log(JSON.stringify({db:d,otherSessions:n,occupied,claims}));if(n||occupied||claims)throw Error('fixture_not_quiescent');
}finally{await p.end();}
