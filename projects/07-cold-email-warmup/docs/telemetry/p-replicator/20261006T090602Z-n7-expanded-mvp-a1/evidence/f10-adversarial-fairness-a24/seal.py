from pathlib import Path
import json,hashlib,subprocess,datetime,fcntl,os
R=Path('/tmp/n7-f10-adversarial-fairness-a24');P=Path('/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
m=json.loads(Path('/tmp/n7-f10-pair-fixture-fix-a22/final-manifest.json').read_text());allowed=['tests/f10-runtime-protocol.test.ts','tests/f10-runtime-fixture.ts','tests/f10-runtime-process-fixture.ts'];drift=[]
for group in ['source','build','db']:
 for f,h in m[group].items():
  if f not in allowed and sha(P/f)!=h:drift.append((group,f))
assert not drift,drift
for f in allowed:m['source'][f]=sha(P/f)
m['revision']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=P,text=True).strip();m['baseline']='74766159b38c0e346832992c3be7b62851aad577';(R/'final-manifest.json').write_text(json.dumps(m,indent=2)+'\n')
checks=json.loads((R/'mutation-results.json').read_text());assert checks['passed'];typebefore=json.loads((R/'type-before-emission.json').read_text());typeafter=json.loads((R/'type-after-emission.json').read_text());assert typebefore['emitted_js_sha256']==typeafter['emitted_js_sha256']
lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
metrics=[]
for stage in ['oldest-due-restored','reset-yield-sequence-restored']:
 launched=json.loads((R/(stage+'-launched.json')).read_text());terminal=json.loads((R/(stage+'-terminal.json')).read_text());assert terminal['native_returncode']==0 and not terminal['timed_out'] and terminal['PG']['quiescent'] and not terminal['remaining_owned_nodes'];assert terminal['inputs_unchanged']
 receipts=[]
 for f in R.glob('fairness-*.json'):
  d=json.loads(f.read_text())
  if d['begun']>=datetime.datetime.fromisoformat(launched['at']).timestamp()*1000 and d['ended']<=datetime.datetime.fromisoformat(terminal['at']).timestamp()*1000:receipts.append((f,d))
 assert len(receipts)==1,(stage,len(receipts));f,d=receipts[0];rows=[]
 for p in d['participants']:
  selections=[datetime.datetime.fromisoformat(e['at'].replace('Z','+00:00')).timestamp()*1000 for e in p['selections']];completions=sorted(set(datetime.datetime.fromisoformat(e['body']['completed_at'].replace('Z','+00:00')).timestamp()*1000 for e in p['fullPollCompletions'] if e['body'].get('completed_at')));pages=[v for v in d['traffic'] if v.get('completed') and v['mailbox']==p['id']];durations=[v['released']-v['selected'] for v in p['ownershipDurationsMs'] if v['released'] is not None];rows.append({'label':p['label'],'id':p['id'],'selections':selections,'nativeSuccessfulPages':pages,'uniqueFullPollCompletions':completions,'incompleteCount':len(p['incomplete']),'ownershipDurationsMs':durations,'maxSelectionGapMs':max([b-a for a,b in zip(selections,selections[1:])],default=None),'maxFullPollGapMs':max([b-a for a,b in zip(completions,completions[1:])],default=None),'fullPollClassification':'healthy complete' if p['label']=='E' else 'partial rescan; never full complete'})
 assert len(rows)==5;metrics.append({'stage':stage,'receipt':str(f),'receipt_sha256':sha(f),'begun':d['begun'],'ended':d['ended'],'firstECompletionMs':d['firstECompletion']-d['begun'],'maxSockets':d['maxSockets'],'participants':rows})
(R/'canonical-all-five.json').write_text(json.dumps(metrics,indent=2)+'\n')
guards=[json.loads(f.read_text()) for f in R.glob('guard-*.json')];assert all(g['socketDenied']==0 and g['dnsDenied']==0 for g in guards)
(R/'terminal-seal.json').write_text(json.dumps({'at':now(),'status':'specific corrective witness PASS','overall_F10_acceptance':False,'revision':m['revision'],'source120_build73_SQL15_unchanged_except_three_testfiles':not drift,'allowed_delta':{f:{'before':json.loads(Path('/tmp/n7-f10-pair-fixture-fix-a22/final-manifest.json').read_text())['source'][f],'after':sha(P/f)} for f in allowed},'checks':checks,'type_only_source_delta_identical_emitted_js':{'before':typebefore,'after':typeafter},'reuse_dependencies':{'healthy330': '/tmp/n7-f10-frozen-verify-a20/terminal-seal.json','wholePG169': '/tmp/n7-f10-frozen-verify-a20/fullpg-terminal.json','physical2': '/tmp/n7-f10-remaining-verify-a16'},'mutex':'released and independently reacquired','source_DB_ownership':'released to coordinator','remaining_AC':['fresh independent HIGH final reconciliation; no overall F10 acceptance'],'profile':'model-routing-econom','requested_model':'gpt-6.1-sol','requested_effort':'medium','actual_model':None,'actual_usage':None,'actual_cost':None,'measurement_gap':'Host model/effort/token/cost metadata not available','elapsed_seconds':(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat('2026-10-06T20:49:05.366124+00:00')).total_seconds(),'raw_hashes':{str(f.relative_to(R)):sha(f) for f in R.iterdir() if f.is_file() and f.name!='terminal-seal.json'}},indent=2)+'\n')
print(json.dumps({'revision':m['revision'],'metrics':[{ 'stage':v['stage'],'firstECompletionMs':v['firstECompletionMs'],'maxSockets':v['maxSockets'],'participants':len(v['participants'])} for v in metrics],'drift':drift,'guards':len(guards)}))
