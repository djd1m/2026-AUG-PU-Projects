/** Adapted N6 independent watchdog steps; no overlap and one failed step cannot suppress the next. */
export async function runMaintenance(steps:ReadonlyArray<{name:string;run:()=>Promise<unknown>}>,onError:(name:string)=>void):Promise<boolean>{
 let ok=true;
 for(const step of steps){try{await step.run();}catch{ok=false;onError(step.name);}}
 return ok;
}
export function heartbeatFresh(value:unknown,now=Date.now()):boolean{
 if(!value||typeof value!=='object')return false;
 const row=value as Record<string,unknown>;
 return row.state==='ready'&&typeof row.at==='number'&&Number.isSafeInteger(row.at)&&now-row.at>=0&&now-row.at<=60_000;
}
