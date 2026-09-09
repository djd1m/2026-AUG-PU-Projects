import assert from 'node:assert/strict';

export async function fixtureSession(base,variant='A',role='merchant',limited=false) {
  const origin=new URL(base).origin;
  async function request(path,input,token) {
    const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,
      ...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(input),signal:AbortSignal.timeout(15000)});
    const body=await response.json();
    return {status:response.status,...body};
  }
  const bootstrap=await request('/api/demo',{variant,role,limited});
  assert.equal(bootstrap.status,201,bootstrap.error?.message);
  const session=bootstrap.data;
  const command=(action,input={},options={})=>request('/api/command',{
    action,input,actorId:options.actorId || session.actorId,idempotencyKey:options.key || crypto.randomUUID(),grantId:options.grantId,
  },session.token);
  return {session,command};
}
