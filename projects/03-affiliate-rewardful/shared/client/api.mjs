const READS = new Set(['dashboard','program.read','share.read','partner.read','credit.read','registry.read','task.read']);

export class ApiError extends Error {
  constructor(error, status) { super(error.message || 'Запрос не выполнен'); this.code=error.code; this.status=status; }
}
async function request(path, payload, token) {
  const response = await fetch(path, { method:'POST', headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000) });
  const result=await response.json();
  if (!response.ok) throw new ApiError(result.error||{},response.status);
  return result.data;
}
export async function connect(variant, role) {
  const storageKey=`n3.fixture.${variant}`;
  let session;
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has('handoff')) {
    try {
      const handoff=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(hash.get('handoff')),c=>c.charCodeAt(0))));
      if (!handoff.session?.token || !handoff.artifactId) throw new Error();
      session=handoff.session;session.handoffArtifactId=handoff.artifactId;
      sessionStorage.setItem(storageKey,JSON.stringify(session));
      history.replaceState(null,'',location.pathname);
    } catch { throw new Error('Ссылка продолжения повреждена. Откройте реестр из исходной задачи.'); }
  }
  if (!session) {
    try { session=JSON.parse(sessionStorage.getItem(storageKey)); } catch { /* corrupt local session must not grant access */ }
  }
  if (!session?.token) {
    session=await request('/api/demo',{variant,role});
    sessionStorage.setItem(storageKey,JSON.stringify(session));
  }
  const actors=Array.isArray(session.actors)?session.actors:Object.values(session.actors||{});
  const actor=(wanted=role)=>actors.find(a=>a.role===wanted);
  return {
    session,actor,variant,
    async command(action,input={},options={}) {
      const actorId=options.actorId||actor()?.id||session.actorId;
      const signature=JSON.stringify([actorId,options.grantId||null,action,input]);
      const pendingKey=`${storageKey}.pending`;
      let pending;try{pending=JSON.parse(sessionStorage.getItem(pendingKey));}catch{}
      const key=options.key||(!READS.has(action)?(pending?.signature===signature?pending.key:crypto.randomUUID()):undefined);
      const payload={action,input,actorId,grantId:options.grantId,idempotencyKey:key};
      if(key)sessionStorage.setItem(pendingKey,JSON.stringify({signature,key}));
      try {
        const data=await request('/api/command',payload,session.token);
        if(key)sessionStorage.removeItem(pendingKey);
        return data;
      } catch(error) {
        if(error instanceof ApiError && error.status<500 && key)sessionStorage.removeItem(pendingKey);
        throw error;
      }
    },
    handoff(artifactId) {
      const url=new URL(location.href);url.port='13031';url.pathname='/';url.search='';
      const bytes=new TextEncoder().encode(JSON.stringify({session,artifactId}));
      url.hash=new URLSearchParams({handoff:btoa(String.fromCharCode(...bytes))}).toString();
      return url.href;
    },
    restart() { sessionStorage.removeItem(storageKey);sessionStorage.removeItem(`${storageKey}.pending`);location.replace(location.pathname); },
  };
}
