from pathlib import Path
import os,json,hashlib,base64,urllib.parse,datetime
R=Path('/tmp/n7-f10-atomic-admission-verify-a32');keys=['DATABASE_PASSWORD_FILE','SESSION_HMAC_KEY_FILE','CREDENTIAL_KEYRING_FILE','RECIPIENT_HASH_KEY_FILE','OPERATOR_TOKEN_FILE'];variants=[];readcount=0
for k in keys:
 p=Path(os.environ[k]);b=p.read_bytes().strip();readcount+=1;assert b
 raw=[b]
 # Keyring is JSON; inspect its bounded local scalar values without output.
 if k=='CREDENTIAL_KEYRING_FILE':
  x=json.loads(b);stack=[x];n=0
  while stack:
   v=stack.pop();n+=1;assert n<=100
   if isinstance(v,dict):stack.extend(v.values())
   elif isinstance(v,list):stack.extend(v)
   elif isinstance(v,str) and len(v)>=16:raw.append(v.encode())
 for value in raw:
  variants.extend([value,base64.b64encode(value),value.hex().encode(),urllib.parse.quote_from_bytes(value).encode(),json.dumps(value.decode(errors='strict'))[1:-1].encode()])
variants=list(set(v for v in variants if len(v)>=8));markers=[b'SECRET_PEER_CANARY',b'PWD_CANARY',b'SECRET_CANARY',b'fixture-credential-canary'];files=[];matches=0;marker_counts={str(i):0 for i in range(len(markers))};limit=30*1024**2
for p in R.rglob('*'):
 if not p.is_file() or p.is_symlink():continue
 assert p.stat().st_size<=limit,(str(p),'oversize scope gap')
 b=p.read_bytes();count=sum(b.count(v) for v in variants);matches+=count
 for i,m in enumerate(markers):marker_counts[str(i)]+=b.count(m)
 files.append({'path':str(p.relative_to(R)),'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'secret_variant_hits':count})
out={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'authorized_secret_files_read_count':readcount,'variant_count':len(variants),'files_scanned':len(files),'bytes_scanned':sum(f['bytes'] for f in files),'secret_variant_hits':matches,'literal_marker_numeric_counts':marker_counts,'files':files,'scope':'own A32 scratch regularfiles; specific5 authorizedenv files read only, no broadsecretsearch','gaps':['postscan canary receipt and final metadata not included; source/protecteddependencies/globalartifacts/legacy originals outside scan scope'],'pass_secrets':matches==0};(R/'canary-result.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k not in ['files','gaps','scope']}))
