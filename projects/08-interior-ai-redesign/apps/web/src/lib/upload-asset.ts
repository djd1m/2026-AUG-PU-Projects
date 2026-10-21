export type UploadKind = 'reference'|'room_photo'|'glb';
/** Filename/MIME routing is a UX hint; the server validates the actual bytes. */
export function resolveUploadKind(file:Pick<File,'name'|'type'>,selected:UploadKind):UploadKind {
 return /\.glb$/i.test(file.name)||file.type==='model/gltf-binary'?'glb':selected;
}
/** Shared private upload transport; server remains authoritative for type/size/rights/ownership. */
export async function uploadPrivateAsset<T extends {id:string}>(file:File,kind:'reference'|'room_photo'|'glb',projectId:string,version:number,rights:boolean):Promise<{asset:T;version:number}>{
 if(!file.size)throw Error('Выберите файл');
 const response=await fetch(`/api/projects/${projectId}/assets`,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','If-Match':String(version),'x-asset-kind':kind,'x-rights-confirmed':String(rights)},body:file});
 const result=await response.json() as {data?:T;meta?:{version?:number};error?:{message?:string}};
 if(!response.ok)throw Error(result.error?.message??'Загрузка не выполнена');
 if(!result.data?.id||!Number.isSafeInteger(result.meta?.version))throw Error('Сервер вернул неполный ответ');
 return{asset:result.data,version:result.meta!.version!};
}
