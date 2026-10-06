# Exact five authorized inputs, bounded encoded-runtime scan; no broad secret discovery.
from pathlib import Path
import os,json,hashlib,base64,urllib.parse,datetime,re
R=Path('/tmp/n7-f10-atomic-admission-negatives-a33');keys=['DATABASE_PASSWORD_FILE','SESSION_HMAC_KEY_FILE','CREDENTIAL_KEYRING_FILE','RECIPIENT_HASH_KEY_FILE','OPERATOR_TOKEN_FILE'];raws=[];reads=0
for key in keys:
 b=Path(os.environ[key]).read_bytes().strip();assert b;reads+=1;raws.append(b)
 try:x=json.loads(b)
 except (json.JSONDecodeError,UnicodeDecodeError):continue
 stack=[x];visited=0
 while stack:
  value=stack.pop();visited+=1;assert visited<=100
  if isinstance(value,dict):stack.extend(value.values())
  elif isinstance(value,list):stack.extend(value)
  elif isinstance(value,str) and len(value)>=12:raws.append(value.encode())
raws=list(set(raws));variants=[]
for b in raws:
 variants.extend([b,base64.b64encode(b),base64.urlsafe_b64encode(b),b.hex().encode(),urllib.parse.quote_from_bytes(b).encode(),json.dumps(b.decode('utf8'))[1:-1].encode()])
variants=list(set(x for x in variants if len(x)>=8));markers=[b'SECRET_PEER_CANARY',b'PWD_CANARY',b'SECRET_CANARY',b'fixture-credential-canary'];files=[];total=0;marker_output=[0]*4;marker_code=[0]*4;private_output=0;private_code=0
for p in R.rglob('*'):
 if p.is_symlink() or not p.is_file():continue
 assert p.stat().st_size<=30*1024**2,'own regular artifact exceeds bounded perfile scan'
 b=p.read_bytes();hits=sum(b.count(v) for v in variants);total+=hits;code=p.suffix in ['.py','.mjs','.ts','.js'];destination=marker_code if code else marker_output
 for i,m in enumerate(markers):destination[i]+=b.count(m)
 private=len(re.findall(rb'-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----',b))
 if code:private_code+=private
 else:private_output+=private
 files.append({'path':str(p.relative_to(R)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'secret_variant_hits':hits,'private_PEM_count':private,'kind':'code_or_fixture' if code else 'runtime_artifact'})
out={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'authorized_secret_files_read_exact':reads,'raw_or_nested_long_string_count':len(raws),'bounded_variant_count':len(variants),'JSON_nested_minimum_length':12,'file_count':len(files),'bytes_scanned':sum(f['bytes'] for f in files),'runtime_secret_variant_hits':total,'literal_marker_numeric_counts_outputs':marker_output,'literal_marker_numeric_counts_code_or_fixture':marker_code,'private_PEM_numeric_counts_outputs':private_output,'private_PEM_numeric_counts_code':private_code,'runtime_canary_pass':total==0 and marker_output==[0]*4,'generic_private_scan_pass':private_output==0 and private_code==0,'scope':'all own regular A33 scratch/shadow/runtime artifacts; exact5 authorizedenvsecretfiles only; source/protecteddeps/foreignfiles/symlinks excluded','scope_gaps':['postscan receipt/context/artifactmanifest metadata unscanned','terminal tool transcripts outside ownregularartifacts are not a genericsecret/private scanner','runtime canary and generic privatePEM check are separate claims'],'files':files};(R/'canary-result-a33.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k not in ['files','scope','scope_gaps']}))
