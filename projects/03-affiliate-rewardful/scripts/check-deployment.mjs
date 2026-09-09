import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const docker=args=>execFileSync('docker',args,{cwd:root,encoding:'utf8'});
const config=JSON.parse(docker(['compose','config','--format','json']));
const db=config.services.postgres;
assert.equal(db.ports,undefined,'Database cannot publish ANY host port, including tests');
assert.equal(db.network_mode,undefined,'Database cannot use host networking');
assert.deepEqual(Object.keys(db.networks),['database']);
assert.equal(config.networks.database.internal,true);
assert.equal(db.environment.POSTGRES_PASSWORD,undefined,'Password value cannot be in Compose');
assert.equal(db.environment.POSTGRES_HOST_AUTH_METHOD,undefined,'Cannot enable trust authentication');
assert.equal(db.environment.POSTGRES_PASSWORD_FILE,'/run/secrets/n3_db_admin_password');
assert.deepEqual(Object.keys(config.services.api.networks).sort(),['database','frontend']);
for(const name of ['db-admin-password','db-app-password']){
 const file=root+'.runtime/'+name;const secret=readFileSync(file,'utf8').trim();
 assert.match(secret,/^[0-9a-f]{64}$/);assert.equal(statSync(file).mode&0o077,0);
}
const ids=docker(['compose','ps','-q','postgres']).trim();assert.ok(ids,'Postgres must be running');
const live=JSON.parse(docker(['inspect',ids]))[0];
assert.deepEqual(live.HostConfig.PortBindings,{});
assert.deepEqual(Object.keys(live.NetworkSettings.Networks),['n3-database']);
const net=JSON.parse(docker(['network','inspect','n3-database']))[0];
assert.equal(net.Internal,true);
for(const container of Object.values(net.Containers||{})) assert.match(container.Name,/^n3-shared-(api|postgres)-1$/,'Only backend and DB may join database network');
assert.equal(live.State.Health.Status,'healthy');
console.log(JSON.stringify({databaseHostPorts:[],databaseNetworkInternal:true,networkMembers:Object.values(net.Containers).map(x=>x.Name),randomSecrets:'64hex/0600 checked; values omitted',health:live.State.Health.Status},null,2));
