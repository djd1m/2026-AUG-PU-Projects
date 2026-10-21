import json,glob,os,hashlib,datetime
root='/tmp/n7-f10-frozen-verify-a11'
paths=[p for p in glob.glob(root+'/cadence-*.json') if '/cadence-partial-' not in p]
if not paths:raise SystemExit('canonical receipt pending')
p=max(paths,key=os.path.getmtime);c=json.load(open(p));phases={x['phase']:x for x in c['phaseEvents']};windows=[('initial',c['begun'],phases['fault']['at']),('post_restart',phases['restart']['at'],c['ended'])];out={'source':'52cad40204deed91d93c969fe95ed89f3d95a8c7','canonical':os.path.basename(p),'canonicalSha':hashlib.sha256(open(p,'rb').read()).hexdigest(),'phases':c['phaseEvents'],'windows':[],'drain':c['drainOutcomes'],'fixtureMaxConnections':c['fixtureMaxConnections']}
for name,start,end in windows:
 rows=[]
 for row in c['perMailbox']:
  r={'id':row['id']}
  for key,limit in [('completed',30000),('selected',60000)]:
   values=[t for t in row[key] if start<=t<=end];gaps=[b-a for a,b in zip(values,values[1:])];first=(values[0]-start if values else end-start);tail=(end-values[-1] if values else end-start)
   r[key]={'count':len(values),'timestamps':values,'firstDelayMs':first,'firstDeadlineMiss':first>limit,'fullGapsMs':gaps,'maxFullGapMs':max(gaps,default=None),'gapMisses':sum(x>limit for x in gaps),'tailCensoredMs':tail,'tailDeadlineMiss':tail>limit}
  rows.append(r)
 out['windows'].append({'name':name,'start':start,'end':end,'mailboxCount':len(rows),'rows':rows,'completionDeadlineMissMailboxes':sum(r['completed']['firstDeadlineMiss'] or r['completed']['gapMisses']>0 or r['completed']['tailDeadlineMiss'] for r in rows),'selectionDeadlineMissMailboxes':sum(r['selected']['firstDeadlineMiss'] or r['selected']['gapMisses']>0 or r['selected']['tailDeadlineMiss'] for r in rows)})
r=c['resources'];ticks=r[-1]['cpuTicksAggregate']-r[0]['cpuTicksAggregate'];wall=(r[-1]['at']-r[0]['at'])/1000;out['resources']={'wallSeconds':wall,'workerAndDescendantCpuPercentOneCore':ticks/r[-1]['cpuClockTicksPerSecond']/wall*100,'maxRssKb':max(x['rssKbAggregate'] for x in r),'maxFd':max(x['fdsAggregate'] for x in r),'maxSlots':max(x['slots'] for x in r),'operations':r[-1]['operations'],'maxFixturePeerMs':max((x['elapsedMs'] for x in c['peerLatencies']),default=None),'peerCount':len(c['peerLatencies']),'reasonKeys':sorted(set(k for x in r for k in x['reasons']))}
json.dump(out,open(root+'/analysis-v2.json','w'),indent=2);print(json.dumps({'windows':[{'name':w['name'],'completionDeadlineMissMailboxes':w['completionDeadlineMissMailboxes'],'selectionDeadlineMissMailboxes':w['selectionDeadlineMissMailboxes']} for w in out['windows']],'resources':out['resources'],'drain':out['drain']}))
