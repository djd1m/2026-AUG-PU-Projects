"""SYNTHETIC SOFTWARE TEST ONLY. No diffusion, GPU or quality measurement."""
import base64
import hashlib
import json
import os
from pathlib import Path
import sys
import time

root = Path(os.environ['STORAGE_DIR'])
case = os.environ.get('TEST_ENGINE_CASE', 'success')
count = 0
for line in sys.stdin:
    request = json.loads(line)
    if case == 'flood':
        print('x' * 20000, flush=True)
        continue
    if case == 'invalid':
        print('{invalid}', flush=True)
        continue
    key = request.get('output_key')
    if key:
        image = base64.b64decode(os.environ['TEST_PNG'])
        config = json.dumps(request['config'], sort_keys=True, separators=(',', ':')).encode()
        for folder, data in [('outputs', image), ('depths', image), ('configs', config)]:
            (root / folder / key).write_bytes(data)
    if case == 'hang':
        time.sleep(60)
    if not key:
        result = {}
    else:
        result = {'hashes': {name + '_sha': hashlib.sha256(data).hexdigest() for name, data in
                  [('input', (root / request['input_key']).read_bytes()), ('output', image), ('depth', image), ('config', config)]},
                  'inference_ms': 1, 'warm': count > 0, 'hardware': 'SYNTHETIC SOFTWARE TEST ONLY'}
        if case == 'mismatch':
            result['hashes']['output_sha'] = '0' * 64
    print(json.dumps({'version': 1, 'id': request['id'], 'ok': True, **result}), flush=True)
    count += 1
