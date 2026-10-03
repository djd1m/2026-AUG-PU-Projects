// Only non-secret intent metadata is persisted. Never photos, passwords or session tokens.
export function createIntent(storage, name, uuid = () => crypto.randomUUID()) {
  let current;
  try { current = JSON.parse(storage.getItem(name)); } catch { current = null; }
  function save() { try { storage.setItem(name,JSON.stringify(current)); } catch { /* In-memory retry still works. */ } }
  return {
    get: () => current,
    select(body) {
      if (!current || JSON.stringify(current.body) !== JSON.stringify(body)) {
        current = {body,key:uuid(),id:null}; save();
      }
      return {...current.body,idempotency_key:current.key};
    },
    resolved(id) { if(current) {current.id=id;save();} },
    clear() {current=null;try {storage.removeItem(name);} catch { /* unavailable storage */ } }
  };
}
export function createScope() {
  let generation=0; const controllers=new Set();
  return {
    current: () => generation,
    valid: token => token===generation,
    reset() {generation++;for(const c of controllers)c.abort();controllers.clear();},
    async run(work) {
      const token=generation, controller=new AbortController();controllers.add(controller);
      try {const value=await work(controller.signal);if(token!==generation)throw new Error('stale_account');return value;}
      finally {controllers.delete(controller);}
    }
  };
}
export async function nativeOutcome(file, navigatorApi) {
  try {
    if (!navigatorApi.share || !navigatorApi.canShare?.({files:[file]})) return 'unavailable';
    await navigatorApi.share({files:[file],title:'RoomKind · AI redesign'});return 'resolved';}
  catch(error) {return error.name==='AbortError'?'abort':'error';}
}
export function safeConfirmation(value, mode, origin) {
  try {
    const url=new URL(value);
    if(url.username || url.password)return null;
    if(mode==='fixture' && url.origin===origin && url.pathname==='/')return url.href;
    if(mode==='live' && url.protocol==='https:' && !url.port)return url.href;
  } catch { /* no usable server confirmation */ }
  return null;
}
