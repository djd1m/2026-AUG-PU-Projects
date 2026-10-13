#!/usr/bin/env python3
"""R1 socket-free registry oracle and mutations; preserve all earlier evidence."""
import csv, hashlib, io, ipaddress, json, os, subprocess, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent.parent
evidence=root/'docs/telemetry/features/20261002T201500Z-f02/evidence/r1'
evidence.mkdir(exist_ok=True)
source=root/'src/mailboxes/network.ts'
url='https://www.iana.org/assignments/ipv6-unicast-address-assignments/ipv6-unicast-address-assignments.csv'
raw=urllib.request.urlopen(url,timeout=20).read()
(evidence/'iana-ipv6-allocations.csv').write_bytes(raw)
rows=list(csv.DictReader(io.StringIO(raw.decode())))
allocated=[ipaddress.IPv6Network(r['Prefix']) for r in rows if r['Status']=='ALLOCATED']
assert len(allocated)==36
# The source predicate depends on the first 32 bits. Probe every allocation boundary
# and each intervening partition, plus all /16 first-word boundaries in 2000::/3.
points={0x20000000,0x40000000}
for block in allocated:
    points.update([int(block.network_address)>>96,(int(block.broadcast_address)>>96)+1])
points.update([0x20010000,0x20010200,0x20010db8,0x20010db9,0x20020000,0x20030000,0x3fff0000,0x40000000])
ordered=sorted(points)
probes=set()
for begin,end in zip(ordered,ordered[1:]):
    probes.update([begin,(begin+end-1)//2,end-1])
for first in range(0x2000,0x4000):
    probes.update([first<<16,(first<<16)+0xffff])
addresses=[str(ipaddress.IPv6Address((prefix<<96)+1)) for prefix in sorted(probes)]
script="import {isPublicIp} from './src/mailboxes/network.ts'; let input=''; for await(const part of process.stdin) input+=part; process.stdout.write(JSON.stringify(JSON.parse(input).map(isPublicIp)));"
result=subprocess.run(['node','--import','tsx','--input-type=module','-e',script],cwd=root,input=json.dumps(addresses),capture_output=True,text=True,check=True)
actual=json.loads(result.stdout)
for address,observed in zip(addresses,actual,strict=True):
    ip=ipaddress.IPv6Address(address); a=int(ip)>>112; b=(int(ip)>>96)&0xffff
    expected=any(ip in block for block in allocated) and not (a==0x2001 and (b<=0x1ff or b==0xdb8)) and a not in (0x2002,0x3fff)
    assert observed==expected,address
(evidence/'registry-oracle.json').write_text(json.dumps({'url':url,'registry_sha256':hashlib.sha256(raw).hexdigest(),'allocated_prefixes':[str(p) for p in allocated],'probe_count':len(addresses),'mismatches':0,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'command':['node','--import','tsx','--input-type=module','-e',script],'script_input':'generated IPv6 addresses only; no sockets','exit_code':result.returncode},indent=2)+'\n')
original=source.read_bytes()
command=['taskset','-c',','.join(map(str,sorted(os.sched_getaffinity(0))[:2])),'node','node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','tests/mailboxes-unit.test.ts']
mutants={
    'reserved-predicate':(b'allocatedIpv6Prefixes.some(([base,bits])=>prefix>=base && prefix<base+2**(32-bits))',b'(a>=0x2000 && a<=0x3fff)'),
    'dns-bypass':(b'addresses.some(a=>!isPublicIp(a.address) || isIP(a.address)!==a.family)',b'false'),
}
for name,(needle,replacement) in mutants.items():
    assert original.count(needle)==1
    try:
        source.write_bytes(original.replace(needle,replacement))
        result=subprocess.run(command,cwd=root,capture_output=True,text=True)
        (evidence/(name+'-mutation.txt')).write_text('Mutation: '+name+'\nCommand: '+' '.join(command)+'\nExit: '+str(result.returncode)+'\n'+result.stdout+result.stderr)
        assert result.returncode!=0 and ('Missing expected rejection' in result.stdout if name=='dns-bypass' else "2000::1" in result.stdout),name
    finally:
        source.write_bytes(original)
    assert source.read_bytes()==original
print(f'IANA oracle {len(addresses)} probes matched; both mutants failed; exact source restored. Exit0.')
