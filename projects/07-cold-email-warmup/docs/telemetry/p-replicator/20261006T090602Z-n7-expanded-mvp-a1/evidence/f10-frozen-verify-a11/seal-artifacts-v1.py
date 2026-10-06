import os,json,hashlib,base64,urllib.parse,datetime,glob
r='/tmp/n7-f10-frozen-verify-a11';rows=[]
for p in glob.glob(r+'/guard-*.json'):
 b=open(p,'rb').read()
 try:record=json.loads(b)
 except json.JSONDecodeError:continue
 rows.append({'filename':os.path.basename(p),'sha256':hashlib.sha256(b).hexdigest(),'record':record})
json.dump({'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'count':len(rows),'socketAllowed':sum(x['record'].get('socketAllowed',0) for x in rows),'socketDenied':sum(x['record'].get('socketDenied',0) for x in rows),'dnsDenied':sum(x['record'].get('dnsDenied',0) for x in rows),'ipcValidated':sum(x['record'].get('ipcValidated',0) for x in rows),'records':rows},open(r+'/guard-aggregate-v1.json','w'),indent=2)
values={b'CREDENTIAL_USERNAME_CANARY',b'CREDENTIAL_PASSWORD_CANARY',b'SECRET_PEER_CANARY'}
secretCount=0
for p in glob.glob('/tmp/n7-f06a-runtime/*'):
 if not os.path.isfile(p) or os.path.getsize(p)>8192:continue
 b=open(p,'rb').read().strip()
 if b and b'\n' not in b and len(b)>=12 and b'-----BEGIN' not in b:
  values.add(b);secretCount+=1
patterns=set()
for b in values:
 patterns.update([b,base64.b64encode(b),base64.urlsafe_b64encode(b),base64.urlsafe_b64encode(b).rstrip(b'='),b.hex().encode(),urllib.parse.quote_from_bytes(b,safe='').encode(),json.dumps(b.decode(errors='replace'))[1:-1].encode()])
hits=[];scanned=[]
for p in glob.glob(r+'/*'):
 if not os.path.isfile(p) or not p.endswith(('.log','.json')):continue
 b=open(p,'rb').read();scanned.append({'filename':os.path.basename(p),'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)})
 count=sum(b.count(v) for v in patterns)
 if count:hits.append({'filename':os.path.basename(p),'matchCount':count})
json.dump({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'syntheticCanaries':3,'boundedRuntimeValues':secretCount,'uniqueEncodedPatterns':len(patterns),'artifactCount':len(scanned),'hits':hits,'artifacts':scanned,'scope':'A11 logs/JSON only; no API/DOM replay; bounded runtime file values plus synthetic TLS canaries, no secret values emitted'},open(r+'/canary-inventory-v1.json','w'),indent=2)
print(json.dumps({'guardRecords':len(rows),'canaryArtifactCount':len(scanned),'canaryHits':hits}))
