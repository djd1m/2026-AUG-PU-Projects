import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { embedding } from '../variants/b-customer/app/embed.mjs';
import { ApiError } from '../shared/client/api.mjs';

test('B embedding rejects wrong source origin and extra fields before showing offer',()=>{
  const saved={window:globalThis.window,location:globalThis.location};
  const sent=[],parent={postMessage:(...args)=>sent.push(args)},listeners=[];let shown=0;
  try {
    globalThis.location={search:'?embed=1&parentOrigin=http://127.0.0.1:13031'};
    globalThis.window={parent,addEventListener:(name,fn)=>listeners.push(fn)};
    const e=embedding(()=>shown++),data={type:'n3.value-moment',version:1,event:'widget_published'};
    const deliver=overrides=>listeners[0]({source:parent,origin:'http://127.0.0.1:13031',data,...overrides});
    deliver({source:{}});deliver({origin:'https://attacker.example'});deliver({data:{...data,token:'forbidden'}});
    deliver({data:{...data,version:2}});assert.equal(shown,0);
    deliver({});assert.equal(shown,1);
    e.ready();e.dismissed();assert.deepEqual(sent,[[{type:'n3.ready',version:1},'http://127.0.0.1:13031'],[{type:'n3.dismissed',version:1},'http://127.0.0.1:13031']]);
  } finally { for(const [key,value] of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value; }
});

test('B conflict refreshes the losing view but transport uncertainty never retries a mutation',async()=>{
  const source=await readFile(new URL('../variants/b-customer/app/app.mjs',import.meta.url),'utf8');
  const handler=source.slice(source.indexOf('async function run('),source.indexOf('\nfunction showOperationError'));
  const events=[];
  const run=Function('ApiError','refreshCustomer','render','showOperationError','feedback',`${handler};return run`)(
    ApiError,async()=>events.push('read'),()=>events.push('render'),e=>events.push(e.message),m=>events.push(m));
  const button={disabled:false,setAttribute(){},removeAttribute(){}};let attempts=0;
  await run(button,async()=>{attempts++;throw new ApiError({message:'conflict'},409)});
  assert.deepEqual(events,['read','render','conflict']);assert.equal(attempts,1);assert.equal(button.disabled,false);
  events.length=0;
  await run(button,async()=>{attempts++;throw new TypeError('unknown')});
  assert.deepEqual(events,['unknown']);assert.equal(attempts,2);
});
