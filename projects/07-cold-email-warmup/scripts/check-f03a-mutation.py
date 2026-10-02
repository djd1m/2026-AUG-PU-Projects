#!/usr/bin/env python3
"""Bounded safety mutations; each restored locally and in the own test container."""
import subprocess,os
from pathlib import Path
root=Path(__file__).resolve().parent.parent
env={**os.environ,'COMPOSE_PROJECT_NAME':'n7f03a','N7_RUNTIME_DIR':'/tmp/n7-f03a-runtime','MAIL_PROVIDER_ALLOWLIST':'{"smtp.gmail.com":30,"imap.gmail.com":30}'}
cases=[
 ('freshness','src/dispatch/eligibility.ts',"p.completed_at>$1::timestamptz-interval '60 seconds'",'TRUE','fresh complete current opt-in'),
 ('quota','src/dispatch/store.ts','<LEAST(m.daily_limit,m.provider_limit,30)','<30','shared pool/campaign quota'),
 ('consent','src/campaigns/store.ts','if(!consent.rowCount)','if(false)','owned API'),
 ('tenant','src/campaigns/store.ts','tenant_id=$1 AND id=$2','id=$2 AND $1::uuid IS NOT NULL','owned API'),
]
for name,path,before,after,assertion in cases:
 source=root/path;original=source.read_text();mutant=original.replace(before,after,1);assert mutant!=original
 def copy():
  subprocess.run(['docker','compose','-p','n7f03a','cp',str(source),'web:/app/'+path],cwd=root,env=env,check=True,capture_output=True)
 try:
  source.write_text(mutant);copy()
  result=subprocess.run(['docker','compose','-p','n7f03a','exec','-T','web','./node_modules/.bin/tsx','--test','tests/dispatch-integration.test.ts'],env=env,cwd=root,capture_output=True,text=True)
  (root/f'docs/telemetry/features/20261002T211800Z-f03/sol-a-mutation-{name}.txt').write_text(result.stdout+result.stderr+f'\nMutant exit: {result.returncode}\n')
  assert result.returncode!=0 and assertion in result.stdout and 'ERR_ASSERTION' in result.stdout
  print(name+' guard mutant rejected; source restored.')
 finally:
  source.write_text(original);copy()
