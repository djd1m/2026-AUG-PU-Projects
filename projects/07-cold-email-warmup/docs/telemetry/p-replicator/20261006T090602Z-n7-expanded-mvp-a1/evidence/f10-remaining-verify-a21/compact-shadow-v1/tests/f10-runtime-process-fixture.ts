import type { ChildRequest } from '../src/mailboxes/transport-lifetime.js';
// Only this trusted test entrypoint accepts IPC fixtures; production CLI cannot.
process.once('message',(value:unknown)=>{const fixture=value as ChildRequest['fixture'];void (async()=>{
 const {loadConfig}=await import(new URL('../dist/config.js',import.meta.url).href),{createPool}=await import(new URL('../dist/db.js',import.meta.url).href);
 const config={...loadConfig(),dispatchMode:'live_provider' as const,pollMode:'live_provider' as const},pool=createPool(config.databaseUrl),abort=new AbortController();
 process.once('SIGTERM',()=>abort.abort());process.once('SIGINT',()=>abort.abort());
 try{const built=await import(new URL('../dist/runtime/worker.js',import.meta.url).href);process.send?.({started:true,execArgv:process.execArgv});await built.runWorker(pool,config,abort.signal,false,fixture);const {readFile}=await import('node:fs/promises');process.send?.({drained:true,stat:await readFile('/proc/self/stat','utf8')});}
 catch{process.send?.({failed:true});process.exitCode=1;}finally{await pool.end();process.disconnect?.();}
 })();});
