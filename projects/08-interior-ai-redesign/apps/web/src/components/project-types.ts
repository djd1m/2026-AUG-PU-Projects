import type {ProjectDto} from '@n8/domain/identity';
import type {ShellRevision,Reference} from '@n8/domain/space';
export interface AssetDto{id:string;projectId:string;kind:'reference'|'room_photo'|'glb'|'share_image';mime:string;bytes:number;rightsConfirmed:boolean;createdAt:string;metadata:Record<string,unknown>}
export interface ProjectContext {project:ProjectDto;shell:ShellRevision|null;shells:ShellRevision[];assets:AssetDto[];references:Reference[];refresh:()=>Promise<void>;notify:(message:string)=>void;goToStep?:(step:string)=>void}
export function textError(cause:unknown){return cause instanceof Error?cause.message:'Не удалось выполнить действие';}
export function decimalInput(value:FormDataEntryValue|null){return String(value??'').trim().replace(',','.');}
