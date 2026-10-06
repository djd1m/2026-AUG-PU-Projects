from pathlib import Path
import json,datetime,hashlib
r=Path('/tmp/n7-f10-physical-admission-observer-a29');f=next(r.glob('fairness-*.json'));d=json.loads(f.read_text());ms=lambda x:datetime.datetime.fromisoformat(x.replace('Z','+00:00')).timestamp()*1000
eid=d['participants'][4]['id'];events=d['events'];comp=sorted({ms(e['body']['completed_at']) for e in events if e['kind']=='poll' and e['mailbox']==eid and e['body'].get('scan_complete') and e['body'].get('completed_at')});gaps=[{'start_ms':a,'end_ms':b,'gap_ms':b-a} for a,b in zip(comp,comp[1:])];gap=next((g for g in gaps if g['gap_ms']>30000),None)
physical=[e for e in events if e['kind'].startswith('physical_')];acquires={e['body']['new']['operation']:e for e in physical if e['kind']=='physical_acquire'};releases={e['body']['old']['operation']:e for e in physical if e['kind']=='physical_release'};operations=[]
for op,a in acquires.items():
 rel=releases.get(op);start=ms(a['at']);end=ms(rel['at']) if rel else None
 if gap and (start>gap['end_ms'] or end is not None and end<gap['start_ms']):continue
 mailbox=a['body']['new']['mailbox'];connections={e['connection'] for e in d['wire'] if e.get('mailbox')==mailbox and start<=ms(e['utc'])<= (end or d['ended'])};phases=[e for e in d['wire'] if e['connection'] in connections and start-100<=ms(e['utc'])<=(end or d['ended'])+100]
 operations.append({'operation':op,'protocol':a['body']['new']['protocol'],'slot':a['body']['new']['slot'],'mailbox':mailbox,'owner_process':a['body']['new']['owner_process'],'acquire':a,'release':rel,'wire':phases})
busy=[e for e in events if e['kind']=='yield' and e['mailbox']==eid and e['body'].get('reason')=='transport_busy' and (not gap or gap['start_ms']<ms(e['at'])<gap['end_ms'])]
attempts=[]
for e in busy:
 t=ms(e['at']);slots=[]
 for s in e['body']['slots']:
  if s['protocol']!='imap':continue
  op=s['operation'];chain=next((v for v in operations if v['operation']==op),None);wire=chain['wire'] if chain else [];fetch=[w for w in wire if w.get('verb')=='FETCH' and ms(w['utc'])<=t];last=fetch[-1] if fetch else None
  slots.append({**s,'phase_at_yield':'active_FETCH' if last and last['phase']=='command_received' else 'post_FETCH_pre_release' if last and last['phase']=='response_written' else 'pre_FETCH_or_cleanup_unknown','last_fetch_phase':last,'lifecycle_present':chain is not None})
 attempts.append({'busy_yield':e,'four_slots':slots,'exact_admission_boundary':False})
out={'raw_path':str(f),'raw_sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'native_failure':d['failure'],'first_failing_completion_interval':gap,'all_completion_gaps':gaps,'every_busy_attempt_in_first_interval':attempts,'four_slot_lifecycle_timeline':operations,'all5_scope':[{k:p[k] for k in ['label','id','selections','fullPollCompletions','ownership']} for p in d['participants']],'joins':d['joins'],'observation_gaps':d['observationGaps'],'counts':{'physical_acquire':len(acquires),'physical_release':len(releases),'busy_in_first_interval':len(busy),'wire':len(d['wire']),'observer_queries':len(d['observerQueries'])}}
(r/'first-interval-analysis.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'failure':d['failure'],'interval':gap,'counts':out['counts'],'joins':d['joins']}))
