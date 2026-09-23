import pathlib, subprocess, json, os, hashlib, datetime
root=pathlib.Path.cwd();d=root/'docs/telemetry/p-replicator/20260923T082037Z-trust-fix-codex/evidence'
def mutation(name,file,before,after,test): return (name,file,before,after,test)
cases=[
mutation('RT-001-body','apps/web/src/server/partner.ts',"code: z.string().trim().regex(/^[A-Za-z0-9_-]{6,12}$/).optional()", "source: z.string().optional(), code: z.string().trim().regex(/^[A-Za-z0-9_-]{6,12}$/).optional()",'tests/trust-route.test.ts'),
mutation('RT-001-signature','apps/web/src/lib/partner-referral.ts',"if (!timingSafeEqual(sign(payload, secret), Buffer.from(match[4]!, 'hex'))) return null;", "if (false) return null;",'tests/partner.test.ts'),
mutation('RT-001-context','apps/web/src/app/api/trpc/[trpc]/route.ts',"referralCookie: request.headers.get('cookie') ?? '',", "referralCookie: '',",'tests/trust-route.test.ts'),
mutation('RT-002-rejected-counter','apps/web/src/server/partner.ts',"      const existing =", "      await tx.query(`INSERT INTO growth_event(type,account_id,partner_code_id,ip_prefix,day,created_at) VALUES('code_applied',$1,$2,$3::cidr,$4::date,$5)`, [account, code.id, prefix, moscowDay(now), now]);\n      const existing =",'tests/partner.test.ts'),
mutation('RT-003-self','apps/web/src/server/partner.ts','if (existing && self) {','if (false) {','tests/partner.test.ts'),
mutation('RT-004-isolation','apps/web/src/server/retention.ts','catch (error) { errors++; console.error','catch (error) { throw error; errors++; console.error','tests/retention.test.ts'),
mutation('RT-004-deadline','apps/web/src/server/retention.ts','if (overdue > 0)', 'if (overdue > 1000000)','tests/retention.test.ts'),
mutation('RT-006-expiry','apps/web/src/server/retention.ts','    // Expiry is enforced', "    await pool.query('UPDATE guest_pack SET revoked_at=$1 WHERE revoked_at IS NULL AND expires_at<=$1', [now]);\n    // Expiry is enforced",'tests/retention.test.ts'),
mutation('RT-007-limiter','apps/web/src/server/clip-file.ts','if (!await deps.allowRead(', 'if (false && !await deps.allowRead(','tests/trust-guards.test.ts'),
mutation('I1-case','apps/web/src/server/short-link.ts','    code = code.toUpperCase();','    // normalization removed','tests/short-link.test.ts'),
mutation('I2-flag','packages/db/src/clip-link.ts','{ length }','{ length: 10 }','tests/trust-guards.test.ts'),
mutation('RT-011-acceptance','scripts/test-skip-reporter.ts','process.exitCode = 1;','process.exitCode = 0;','tests/trust-guards.test.ts'),
]
results=[]
for name,file,before,after,test in cases:
 f=root/file;original=f.read_text();assert before in original,name
 try:
  f.write_text(original.replace(before,after,1))
  with (d/(name+'-red.txt')).open('w') as out:
   r=subprocess.run(['node','scripts/test.mjs',test],stdout=out,stderr=subprocess.STDOUT,env={**os.environ,'N5_ACCEPTANCE':'0'},timeout=55)
  results.append({'name':name,'file':file,'test':test,'red_exit_code':r.returncode,'evidence':name+'-red.txt','restored_sha256':hashlib.sha256(original.encode()).hexdigest()})
  print(name,r.returncode,flush=True)
 finally: f.write_text(original)
(d/'mutations.json').write_text(json.dumps(results,indent=2)+'\n')
with (d/'mutations-restored-green.txt').open('w') as out:
 r=subprocess.run(['node','scripts/test.mjs','tests/trust-route.test.ts','tests/partner.test.ts','tests/retention.test.ts','tests/trust-guards.test.ts','tests/short-link.test.ts'],stdout=out,stderr=subprocess.STDOUT,env={**os.environ,'N5_ACCEPTANCE':'0'},timeout=65)
print('restored',r.returncode,flush=True)
