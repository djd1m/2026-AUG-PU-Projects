import pathlib,subprocess,json,re,hashlib,os
p=pathlib.Path.cwd();d=p/'docs/telemetry/p-replicator/20260923T082037Z-trust-fix-codex/evidence';f=p/'apps/web/src/server/partner.ts';s=f.read_text()
try:
 m=s.replace("    const tx = await this.pool.connect();", "    const earlyNow = this.clock();\n    const tx = await this.pool.connect();",1).replace('const now = this.clock(); // Sample after serialization', 'const now = earlyNow; // Sample after serialization',1)
 assert m!=s;f.write_text(m)
 with (d/'RT-002-clock-red.txt').open('w') as out:r=subprocess.run(['node','scripts/test.mjs','tests/partner.test.ts'],stdout=out,stderr=subprocess.STDOUT,timeout=30)
 print('clock red',r.returncode)
finally:f.write_text(s)
with (d/'RT-002-clock-green.txt').open('w') as out:g=subprocess.run(['node','scripts/test.mjs','tests/partner.test.ts'],stdout=out,stderr=subprocess.STDOUT,timeout=30)
print('clock green',g.returncode)
rows=json.loads((d/'mutations.json').read_text());rows.append({'name':'RT-002-clock','file':'apps/web/src/server/partner.ts','test':'tests/partner.test.ts','red_exit_code':r.returncode,'green_exit_code':g.returncode,'evidence':'RT-002-clock-red.txt','green_evidence':'RT-002-clock-green.txt','restored_sha256':hashlib.sha256(s.encode()).hexdigest()});(d/'mutations.json').write_text(json.dumps(rows,indent=2)+'\n')
