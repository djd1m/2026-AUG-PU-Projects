import json,hashlib,datetime,collections,subprocess,os
from pathlib import Path
root=Path('/tmp/n7-f10-physical-admission-observer-a29')
raw=root/'fairness-1791322988160.json'; j=json.loads(raw.read_text())
def ms(t):return datetime.datetime.fromisoformat(t.replace('Z','+00:00')).timestamp()*1000
start,end=1791323011284,1791323052067
labels={p['id']:p['label'] for p in j['participants']}; E=next(k for k,v in labels.items() if v=='E')
events=j['events']; acquired={e['body']['new']['operation']:e for e in events if e['kind']=='physical_acquire'}; released={e['body']['old']['operation']:e for e in events if e['kind']=='physical_release'}
connections={}
for w in j['wire']: connections.setdefault(w['connection'],[]).append(w)
def timeline(op):
 a=acquired[op];r=released.get(op); b=a['body']['new']; slot=next(x for x in a['body']['slots'] if x['protocol']==b['protocol'] and x['slot']==b['slot']); begin=ms(a['at']); stop=ms(r['at']) if r else float('inf'); cs=[]
 for c,wire in connections.items():
  opened=next((ms(w['utc']) for w in wire if w['phase']=='socket_open'),None)
  if opened is not None and begin<=opened<=stop and any(w.get('mailbox')==a['mailbox'] for w in wire):cs.extend(wire)
 return {'operation':op,'slot':b['slot'],'protocol':b['protocol'],'mailbox':a['mailbox'],'label':labels.get(a['mailbox']),'owner_process':b['owner_process'],'runtime_owner':slot.get('runtime_owner'),'generation':slot.get('generation'),'acquire':a,'release':r,'duration_ms':stop-begin,'wire':cs}
ops=[timeline(op) for op,a in acquired.items() if ms(a['at'])<=end and ms(released[op]['at'])>=start]
selected=[e for e in events if e['kind']=='selection' and start<=ms(e['at'])<=end]
busy=[e for e in events if e['kind']=='yield' and e['mailbox']==E and e['body']['reason']=='transport_busy' and start<=ms(e['at'])<=end]
classifications=[]
for b in busy:
 for s in b['body']['slots']:
  if s['protocol']!='imap' or s['operation'] is None:continue
  o=next(x for x in ops if x['operation']==s['operation']);wire=[w for w in o['wire'] if ms(w['utc'])<=ms(b['at'])];fetch=[w for w in wire if w.get('verb')=='FETCH'];last=fetch[-1] if fetch else None
  phase='active_FETCH' if last and last['phase']=='command_received' else 'other'
  if not fetch:phase='before_wire' if not wire else wire[-1].get('verb',wire[-1]['phase'])
  classifications.append({'yield_event':b['event_id'],'yield_at':b['at'],'slot':s,'operation':o['operation'],'phase':phase,'last_wire':wire[-1] if wire else None,'acquired':o['acquire']['at'],'released':o['release']['at']})
completion=[e for e in events if e['kind']=='poll' and e['mailbox']==E and e['body'].get('scan_complete')]
summary={'raw_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'interval_ms':{'start':start,'end':end,'gap':end-start},'all_selections_count':len(selected),'E_selections_count':sum(e['mailbox']==E for e in selected),'E_busy_count':len(busy),'physical_total':{'acquire':len(acquired),'release':len(released),'paired':sum(op in released for op in acquired)},'interval_lifetimes':len(ops),'phase_counts':dict(collections.Counter(c['phase'] for c in classifications)),'all5':[{'label':p['label'],'mailbox':p['id'],'selections':len(p['selections']),'pages':len(p['pages']),'full_poll_update_events':len(p['fullPollCompletions']),'incomplete_events':len(p['incomplete'])} for p in j['participants']],'joins':j['joins'],'literal_failure':j['failure'],'exact_failed_admission_boundary':'UNCAPTURED; later same-TX yield snapshots are not that rolled-back transaction','cleanup_limitation':'server socket_close and exact DB release are visible; raw does not directly attest native child exit per operation; source closure proof is required'}
# Pure replay of CURRENT COMPILED acquisition SQL, no DB/network. E remains logically ready while old A wins a newly free slot.
js="""import {acquireTransportSlot} from '/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/dist/mailboxes/transport-slots.js';
const qs=[];let occupied=true;const c={release(){},async query(sql,args){qs.push(sql);if(sql.startsWith('SELECT 1 FROM transport_operation'))return {rowCount:0,rows:[]};if(sql.startsWith('SELECT slot FROM transport_operation'))return {rowCount:occupied?0:1,rows:occupied?[]:[{slot:1}]};return {rowCount:1,rows:[]};}};const pool={async connect(){return c;}};
let first;try{await acquireTransportSlot(pool,'imap','tenant','E');}catch(e){first=e.code;}occupied=false;const winner=await acquireTransportSlot(pool,'imap','tenant','A');process.stdout.write(JSON.stringify({first,winner:winner.mailbox,E:{state:'ready',service_seq:1},A:{state:'claimed',service_seq:100},admissionQueries:qs,limitation:'pure compiled SQL mock, not a native fix proof; fake durable ranks are intentionally invisible to current acquisition SQL'}));"""
result=subprocess.run(['node','--input-type=module','-e',js],capture_output=True,text=True);summary['compiled_counterproof_exit']=result.returncode;summary['compiled_counterproof']=json.loads(result.stdout) if result.returncode==0 else result.stderr
out={'summary':summary,'all_interval_selections':selected,'every_E_busy_yield':busy,'four_slot_owner_generation_lifetimes':ops,'independent_snapshot_phase_observations':classifications}
Path('/tmp/n7-f10-physical-admission-plan-a30/counterproof-output.json').write_text(json.dumps(out,indent=2)+'\n'); print(json.dumps(summary,indent=2));print('OUTPUT_SHA256',hashlib.sha256(Path('/tmp/n7-f10-physical-admission-plan-a30/counterproof-output.json').read_bytes()).hexdigest())
