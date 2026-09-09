import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { connect } from 'node:net';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpServer } from '../apps/api/http.mjs';
import { createFrontendServer } from '../apps/frontend/server.mjs';

async function raw(port,target) {
  const socket=connect(port,'127.0.0.1');
  socket.setTimeout(3000,()=>socket.destroy(new Error('Raw request timed out')));
  let data='';socket.setEncoding('utf8');socket.on('data',chunk=>{data+=chunk;});
  await once(socket,'connect');
  socket.write(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
  await once(socket,'end');
  return data;
}
for(const kind of ['api','frontend'])test(`${kind}: malformed raw URL returns400 and server survives`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'n3-http-static-'));
  await writeFile(join(root,'index.html'),'<h1>Enrollment preview</h1>');
  const server=kind==='api'?createHttpServer({}):createFrontendServer({staticRoot:root});
  server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
  try {
    assert.match(await raw(port,'//['),/^HTTP\/1\.1 400 /);
    const healthy=await fetch(`http://127.0.0.1:${port}/${kind==='api'?'health':'join'}`);
    assert.equal(healthy.status,200);
    if(kind==='frontend') {
      assert.match(await healthy.text(),/Enrollment preview/);
      assert.match(healthy.headers.get('Content-Security-Policy'),/default-src 'self'/);
      assert.match(await raw(port,'/%2e%2e%2fsecret.json'),/^HTTP\/1\.1 404 /);
    }
  } finally {
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});
  }
});
