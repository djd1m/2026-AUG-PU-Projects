import pathlib,subprocess,json,hashlib
root=pathlib.Path.cwd(); out=root/'tests/artifacts/short-link-formats-fix'; source=root/'packages/shared/src/watermark.ts'
original=source.read_text(); before='watermarkGeometry(width, height, origin, widest.repeat(length))'; after='watermarkGeometry(1080, 1920, origin, widest.repeat(length))'
assert original.count(before)==1
results={}
def run(phase):
    command=['npm','test','--','tests/watermark-startup.test.ts','-t','SL-006']
    with (out/f'mutation-{phase}.txt').open('w') as f:
        p=subprocess.run(command,stdout=f,stderr=subprocess.STDOUT,timeout=90)
    results[phase]={'command':command,'exit_code':p.returncode,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
    print(phase,p.returncode,flush=True)
try:
    source.write_text(original.replace(before,after));run('red')
finally:
    source.write_text(original)
run('green')
(out/'mutation-results.json').write_text(json.dumps(results,indent=2)+'\n')
assert results['red']['exit_code']==1 and results['green']['exit_code']==0
