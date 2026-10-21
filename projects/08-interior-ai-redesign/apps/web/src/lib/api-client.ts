export class ApiError extends Error {constructor(message:string,readonly status:number,readonly code:string){super(message);}}
export async function api<T>(path:string,options:{method?:string;body?:unknown;version?:number;key?:string;signal?:AbortSignal}={}):Promise<T> {
 const headers:Record<string,string>={};if(options.body!==undefined)headers['Content-Type']='application/json';if(options.version!==undefined)headers['If-Match']=String(options.version);if(options.key)headers['Idempotency-Key']=options.key;
 const response=await fetch(path,{method:options.method??'GET',headers,body:options.body===undefined?undefined:JSON.stringify(options.body),credentials:'same-origin',cache:'no-store',signal:options.signal});
 if(response.status===204)return undefined as T;
 const result=await response.json().catch(()=>null) as {data?:T;error?:{message?:string;code?:string}}|null;
 if(!response.ok)throw new ApiError(result?.error?.message??'Не удалось выполнить запрос',response.status,result?.error?.code??'REQUEST_FAILED');
 if(!result||!('data'in result))throw new ApiError('Сервер вернул неполный ответ',502,'INVALID_RESPONSE');return result.data as T;
}

export async function allPages<T>(path:string,signal?:AbortSignal,cursorParam:'after'|'cursor'='after'):Promise<T[]> {
 const items:T[]=[],seen=new Set<string>();let after:string|null=null;
 for(let page=0;page<10;page++) {
  const result:{items:T[];nextCursor:string|null}=await api<{items:T[];nextCursor:string|null}>(path+(after?`${path.includes('?')?'&':'?'}${cursorParam}=${encodeURIComponent(after)}`:''),{signal});
  if(!Array.isArray(result.items)||result.items.length>50)throw new ApiError('Некорректный список',502,'INVALID_RESPONSE');
  items.push(...result.items);if(!result.nextCursor)return items;
  if(seen.has(result.nextCursor))throw new ApiError('Повтор страницы',502,'INVALID_RESPONSE');seen.add(result.nextCursor);after=result.nextCursor;
 }
 throw new ApiError('Список превышает допустимый размер',502,'INVALID_RESPONSE');
}
