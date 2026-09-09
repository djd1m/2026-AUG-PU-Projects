import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('public HTTPS official MCP Client and A2A share durable authorized state',async()=>{
 const origin='https://n3-d.212.192.0.33.sslip.io';let cookie;
 const api=async(path,data)=>{
  const r=await fetch(origin+'/api/account/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const body=await r.json();assert.equal(r.status,200,body.error?.code);if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return body.data;
 };
 await api('register',{email:`protocol-${randomUUID()}@example.test`,password:`Secure-${randomUUID()}-!`,name:'Protocol interoperability acceptance'});
 const membershipId=(await api('me')).memberships[0].membershipId;
 const issued=await api('agent-token',{membershipId,input:{actions:['dashboard','registry.prepare','registry.read'],expiresInSeconds:300}});
 const client=new Client({name:'n3-public-acceptance',version:'1.0.0'});
 try {
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${issued.token}`}}}));
  const listed=await client.listTools();assert.ok(listed.tools.some(t=>t.name==='registry_prepare'));
  const prepared=await client.callTool({name:'registry_prepare',arguments:{input:{period:'2026-08'},idempotencyKey:randomUUID()}});assert.ok(!prepared.isError);assert.ok(prepared.structuredContent.artifactId);
  const messageId=randomUUID(),body={jsonrpc:'2.0',id:1,method:'message/send',params:{message:{kind:'message',role:'user',messageId,parts:[{kind:'data',data:{kind:'registry',input:{period:'2026-08',artifactId:prepared.structuredContent.artifactId}}}]}}};
  const send=()=>fetch(origin+'/a2a',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${issued.token}`},body:JSON.stringify(body)}).then(r=>r.json());
  const [first,second]=await Promise.all([send(),send()]);assert.equal(first.result.id,second.result.id);assert.equal(first.result.status.state,'completed');
  const dashboard=await api('command',{membershipId,action:'dashboard'});assert.equal(dashboard.registries.length,1);assert.equal(dashboard.tasks.length,1);
  assert.equal(dashboard.registries[0].artifactId,prepared.structuredContent.artifactId);
  await api('command',{membershipId,action:'grant.revoke',input:{grantId:issued.grantId},idempotencyKey:randomUUID()});
  const revoked=await fetch(origin+'/a2a',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${issued.token}`},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tasks/get',params:{id:first.result.id}})});assert.equal(revoked.status,403);
  const dir=new URL('../../.runtime/f2-browser/',import.meta.url);await mkdir(dir,{recursive:true});
  await writeFile(new URL('public-protocol.json',dir),JSON.stringify({at:new Date().toISOString(),origin,tlsVerification:true,mcpClient:'@modelcontextprotocol/sdk 1.30.0',tools:listed.tools.map(t=>t.name),oneSharedRegistry:true,oneDurableTask:true,concurrentA2aReplay:true,revokedStatus:revoked.status,externalLlm:false},null,2));
 } finally {await client.close();await api('logout',{});}
});
