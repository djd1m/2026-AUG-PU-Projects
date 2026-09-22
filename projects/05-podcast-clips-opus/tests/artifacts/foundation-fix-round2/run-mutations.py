from pathlib import Path
import subprocess,json,sys
root=Path.cwd();out=root/'tests/artifacts/foundation-fix-round2'
cases=[
 ('xff','apps/web/src/server/ip.ts','chain.length - 1 - trustedProxyHops','chain.length - 1','tests/proxy-rate.test.ts'),
 ('rate-prefix','apps/web/src/server/rate-limit.ts','.update(ipPrefix(ip))','.update(ip)','tests/proxy-rate.test.ts'),
 ('preflight','apps/web/src/preflight.ts','  loadWebConfig(readEnvironment());','  void readEnvironment;','tests/preflight.test.ts'),
 ('config-wiring','scripts/check-env-wiring.mjs','for (const name of collectWebConfigEnvironment(projectRoot))','for (const name of [])','tests/wiring.test.ts'),
 ('libuv','docker-compose.yml','UV_THREADPOOL_SIZE: "8"','UV_THREADPOOL_SIZE: "4"','tests/bcrypt-load.test.ts'),
 ('test-db','scripts/test-db.mjs','await pool.query(`CREATE DATABASE "${name}"`)','await Promise.resolve()','tests/test-db.test.ts'),
 ('growth-check','packages/db/migrations/002_growth_event_prefix.sql','OR ip_prefix IS NOT NULL','OR TRUE','tests/growth-prefix.test.ts'),
]
results=json.loads((out/'mutations.json').read_text()) if (out/'mutations.json').exists() else []
for name,filename,original,mutant,test in cases:
 if len(sys.argv)>1 and name not in sys.argv[1:]:continue
 suffix='-retry1' if any(r['mutation']==name for r in results) else ''
 p=root/filename;s=p.read_text();assert original in s,name
 cmd=['node','node_modules/vitest/vitest.mjs','run',test]
 try:
  p.write_text(s.replace(original,mutant,1))
  with (out/f'{name}{suffix}-red.txt').open('w') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=60)
 finally:p.write_text(s)
 with (out/f'{name}{suffix}-green.txt').open('w') as f:g=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=60)
 results.append({'mutation':name,'attempt_suffix':suffix,'command':' '.join(cmd),'red_exit':r.returncode,'green_exit':g.returncode})
 (out/'mutations.json').write_text(json.dumps(results,indent=2)+'\n')
 print(name,r.returncode,g.returncode,flush=True)
 if r.returncode!=1 or g.returncode!=0:raise SystemExit(1)
