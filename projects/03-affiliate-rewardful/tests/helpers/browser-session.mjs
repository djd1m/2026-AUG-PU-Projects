import { js, open, until, wd } from './browser.mjs';

export async function freshBrowserSession(base,variant,ready) {
  await open(base);await until('return !!document.querySelector("#feedback, .fatal")');
  await js('for(const k of Object.keys(sessionStorage))if(k.startsWith(arguments[0]))sessionStorage.removeItem(k)',`n3.fixture.${variant}`);
  await wd('/refresh',{});await until(`return !!document.querySelector(${JSON.stringify(ready)})`);
}

// Tokens stay inside the browser. Tests see only the application's response.
export function browserCommand(variant,role,action,input={},options={}) {
  return js(`const [variant,role,action,input,options]=arguments,s=JSON.parse(sessionStorage.getItem('n3.fixture.'+variant));
    return fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.token},
      body:JSON.stringify({action,input,actorId:options.actorId||s.actors.find(a=>a.role===role).id,
      grantId:options.grantId,idempotencyKey:options.key||crypto.randomUUID()})}).then(async r=>({status:r.status,...await r.json()}));`,variant,role,action,input,options);
}

export function limitedBrowserSession(variant,role) {
  return js(`return fetch('/api/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({variant:arguments[0],role:arguments[1],limited:true})})
    .then(async r=>{const b=await r.json();if(r.ok)sessionStorage.setItem('n3.fixture.'+arguments[0],JSON.stringify(b.data));return {status:r.status,actors:b.data?.actors.length};});`,variant,role);
}
