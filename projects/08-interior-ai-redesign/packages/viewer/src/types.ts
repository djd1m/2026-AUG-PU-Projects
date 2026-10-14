import type { ShellRevision } from '@n8/domain/space';
export interface ViewerMaterial { surfaceId:string; materialCode?:string; color?:string }
export interface ViewerObject { primitive?:'box'|'cylinder'; id:string; catalogId?:string; positionM:[number,number,number]; dimensionsM:[string,string,string]; rotationY:number; materialCode?:string; color?:string }
export interface ViewerScene {materials:ViewerMaterial[];objects:ViewerObject[]}
export interface CameraPose {alpha:number;beta:number;radius:number;target:[number,number,number]}
export interface SceneViewerHandle { capturePair():Promise<{before:string;after:string;camera:CameraPose}> }
export interface SceneViewerProps { shell:ShellRevision; scene?:ViewerScene; before?:boolean; resolveAsset:(assetId:string)=>Promise<ArrayBuffer>; className?:string; onError?:(message:string)=>void; onCamera?:(pose:CameraPose)=>void }
