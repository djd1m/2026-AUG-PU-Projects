import type { ShellRevision } from '@n8/domain/space';
export interface ViewerMaterial { surfaceId:string; materialCode?:string; color?:string }
export interface ViewerObject { primitive?:'box'|'cylinder'; id:string; catalogId?:string; positionM:[number,number,number]; dimensionsM:[string,string,string]; rotationY:number; materialCode?:string; color?:string }
export interface ViewerAppearance { walls:{color:string|null;description:string}; floor:{color:string|null;description:string}; furniture:{color:string|null;description:string}; ceiling:{color:string|null;description:string} }
export interface ViewerScene {materials:ViewerMaterial[];objects:ViewerObject[];appearance?:ViewerAppearance}
export interface CameraPose {alpha:number;beta:number;radius:number;target:[number,number,number]}
export interface SceneViewerHandle { capturePair():Promise<{before:string;after:string;camera:CameraPose}> }
export interface SceneViewerProps { shell?:ShellRevision; previewAssetId?:string; picking?:boolean; pickedPoints?:[number,number,number][]; onPick?:(point:[number,number,number])=>void; onReady?:()=>void; scene?:ViewerScene; before?:boolean; resolveAsset:(assetId:string)=>Promise<ArrayBuffer>; className?:string; onError?:(message:string)=>void; onCamera?:(pose:CameraPose)=>void }
