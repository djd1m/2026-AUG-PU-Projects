import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3,Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/core/Culling/ray';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Material } from '@babylonjs/core/Materials/material';
import type { ManualRoom, ShellRevision, GLBDescriptor, WallId } from '@n8/domain/space';
import type { CameraPose, ViewerScene, ViewerObject } from './types';
const palette:Record<string,string>={white:'#f7f3e9',warm_white:'#f7f3e9',oak:'#b89163',wood_oak:'#b89163',sage:'#a3ad96',terracotta:'#bf8169',graphite:'#50545a',concrete:'#aaa8a0'};
function color(code?:string,explicit?:string){return explicit&&/^#[0-9a-f]{6}$/i.test(explicit)?explicit:palette[code??'']??'#d1c5b4';}
export interface WallPanel {wallId:WallId;offset:number;width:number;bottom:number;height:number}
/** Cut rectangular openings into wall cells: no CSG, no dimensions fabricated from GLB bounds. */
export function wallPanels(room:ManualRoom):WallPanel[]{const out:WallPanel[]=[];for(const wallId of ['north','east','south','west'] as WallId[]){const length=Number(wallId==='north'||wallId==='south'?room.lengthM:room.widthM),height=Number(room.heightM);const holes=room.openings.filter(o=>o.wallId===wallId);const xs=[...new Set([0,length,...holes.flatMap(o=>[Number(o.offsetM),Number(o.offsetM)+Number(o.widthM)])])].sort((a,b)=>a-b);const ys=[...new Set([0,height,...holes.flatMap(o=>[Number(o.sillM),Number(o.sillM)+Number(o.heightM)])])].sort((a,b)=>a-b);for(let x=0;x<xs.length-1;x++)for(let y=0;y<ys.length-1;y++){const midX=(xs[x]!+xs[x+1]!)/2,midY=(ys[y]!+ys[y+1]!)/2;if(!holes.some(o=>midX>Number(o.offsetM)&&midX<Number(o.offsetM)+Number(o.widthM)&&midY>Number(o.sillM)&&midY<Number(o.sillM)+Number(o.heightM)))out.push({wallId,offset:xs[x]!,width:xs[x+1]!-xs[x]!,bottom:ys[y]!,height:ys[y+1]!-ys[y]!});}}return out;}
/** Primitive is resolved from immutable catalog by the caller, never added to persisted scene schema. */
export function createObjectMesh(world:Scene,entry:ViewerObject):Mesh {
 const [w,h,d]=entry.dimensionsM.map(Number) as [number,number,number];
 const mesh=entry.primitive==='cylinder'?MeshBuilder.CreateCylinder(`object-${entry.id}`,{diameter:1,height:h,tessellation:32},world):MeshBuilder.CreateBox(`object-${entry.id}`,{width:w,height:h,depth:d},world);
 if(entry.primitive==='cylinder')mesh.scaling.set(w,1,d);
 mesh.position.set(entry.positionM[0],entry.positionM[1]+h/2,entry.positionM[2]);mesh.rotation.y=entry.rotationY;return mesh;
}
export class BabylonRoom {
 readonly engine:Engine;readonly world:Scene;readonly camera:ArcRotateCamera;
 private pickMeshes=new Set<AbstractMesh>();private marks:Mesh[]=[];
 private originals=new Map<AbstractMesh,Material|null>();private surfaces=new Map<string,AbstractMesh[]>();private overlays:Mesh[]=[];private materials:StandardMaterial[]=[];private before=true;private destroyed=false;private ready=false;
 constructor(readonly canvas:HTMLCanvasElement,shell:ShellRevision|null){
  this.engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true});this.world=new Scene(this.engine);this.world.useRightHandedSystem=true;this.world.clearColor=new Color4(.96,.95,.92,1);
  const room=shell?.mode==='manual'?shell.geometry as ManualRoom:null;const size=room?Math.max(Number(room.lengthM),Number(room.widthM)):5;const target=room?new Vector3(Number(room.lengthM)/2,Number(room.heightM)/3,Number(room.widthM)/2):Vector3.Zero();
  this.camera=new ArcRotateCamera('room-camera',-Math.PI/2.8,Math.PI/3,size*1.7,target,this.world);this.camera.lowerRadiusLimit=.2;this.camera.upperRadiusLimit=10000;this.camera.minZ=.01;this.camera.wheelPrecision=35;this.camera.attachControl(canvas,true);
  new HemisphericLight('ambient',new Vector3(.2,1,.3),this.world).intensity=1.2;
  this.engine.runRenderLoop(()=>{if(!this.destroyed)this.world.render();});
  if(room){this.manual(room);this.ready=true;}
 }
 private material(name:string,hex:string){const m=new StandardMaterial(name,this.world);m.diffuseColor=Color3.FromHexString(hex);m.specularColor=Color3.Black();m.backFaceCulling=false;return m;}
 private surface(id:string,mesh:AbstractMesh,material:Material|null){mesh.material=material;this.originals.set(mesh,material);const entries=this.surfaces.get(id)??[];entries.push(mesh);this.surfaces.set(id,entries);}
 private manual(room:ManualRoom){const length=Number(room.lengthM),width=Number(room.widthM);const floor=MeshBuilder.CreateGround('floor',{width:length,height:width},this.world);floor.position.set(length/2,0,width/2);this.surface('floor',floor,this.material('floor-base','#d8c7ae'));
  // Ceiling is a surface users may decorate, hidden from the orbit cutaway to keep the room legible.
  const ceiling=MeshBuilder.CreateGround('ceiling',{width:length,height:width},this.world);ceiling.position.set(length/2,Number(room.heightM),width/2);ceiling.isVisible=false;this.surface('ceiling',ceiling,this.material('ceiling-base','#f5f1e8'));
  const wallMaterial=this.material('wall-base','#e8e3d7');for(const [i,p] of wallPanels(room).entries()){const mesh=MeshBuilder.CreatePlane(`wall-${i}`,{width:p.width,height:p.height,sideOrientation:Mesh.DOUBLESIDE},this.world);const center=p.offset+p.width/2,y=p.bottom+p.height/2;if(p.wallId==='north'||p.wallId==='south')mesh.position.set(center,y,p.wallId==='north'?0:width);else{mesh.rotation.y=Math.PI/2;mesh.position.set(p.wallId==='west'?0:length,y,center);}this.surface(`wall:${p.wallId}`,mesh,wallMaterial);}
 }
 async loadGlb(shell:ShellRevision,resolve:(id:string)=>Promise<ArrayBuffer>){const descriptor=shell.geometry as GLBDescriptor;return this.loadGlbAsset(descriptor.assetId,Number(shell.calibration.scale),resolve);}
 async loadGlbAsset(assetId:string,s:number,resolve:(id:string)=>Promise<ArrayBuffer>){const bytes=await resolve(assetId);if(this.destroyed)return;const imported=await ImportMeshAsync(new Uint8Array(bytes),this.world,{pluginExtension:'.glb'});if(this.destroyed)return;
  const normalization=new TransformNode('measured-normalization',this.world);normalization.scaling.set(s,s,s);for(const node of imported.transformNodes)if(!node.parent)node.parent=normalization;for(const mesh of imported.meshes)if(!mesh.parent)mesh.parent=normalization;
  this.pickMeshes=new Set(imported.meshes);
  for(const mesh of imported.meshes){this.originals.set(mesh,mesh.material);const pointers=mesh.metadata?.gltf?.pointers as unknown;const match=Array.isArray(pointers)?pointers.map(x=>typeof x==='string'?/\/meshes\/(\d+)\/primitives\/(\d+)/.exec(x):null).find(Boolean):null;if(match)this.surface(`mesh:${match[1]}:primitive:${match[2]}`,mesh,mesh.material);}
  const bounds=this.world.getWorldExtends(m=>imported.meshes.includes(m));const center=bounds.min.add(bounds.max).scale(.5);const extent=bounds.max.subtract(bounds.min).length();if(Number.isFinite(extent)&&extent>0){this.camera.setTarget(center);this.camera.radius=extent*1.4;}this.ready=true;
 }
 pickPoint(x:number,y:number):[number,number,number]|null {if(!this.ready||this.destroyed)return null;const hit=this.world.pick(x,y,m=>this.pickMeshes.has(m)&&m.getTotalVertices()>0);return hit?.hit&&hit.pickedPoint?hit.pickedPoint.asArray() as [number,number,number]:null;}
 setPickedPoints(points:[number,number,number][]){for(const m of this.marks){m.material?.dispose();m.dispose();}this.marks=[];const size=Math.max(.005,this.camera.radius*.008);for(const [i,p] of points.entries()){const mark=MeshBuilder.CreateSphere(`point-${i}`,{diameter:size},this.world);mark.position.copyFromFloats(...p);mark.isPickable=false;const mat=this.material(`point-material-${i}`,i===0?'#c54e31':'#276e9c');mat.disableLighting=true;mat.emissiveColor=mat.diffuseColor;mark.material=mat;this.marks.push(mark);}if(points.length===2){const line=MeshBuilder.CreateLines('measurement-line',{points:points.map(p=>Vector3.FromArray(p))},this.world);line.color=Color3.FromHexString('#c54e31');line.isPickable=false;this.marks.push(line);}}
 setDesign(scene?:ViewerScene){for(const m of this.overlays)m.dispose();for(const m of this.materials)m.dispose();this.overlays=[];this.materials=[];for(const [mesh,material] of this.originals){mesh.material=material;if(mesh.metadata)delete mesh.metadata.n8DesignMaterial;}
  for(const entry of scene?.materials??[]){const material=this.material(`design-${entry.surfaceId}`,color(entry.materialCode,entry.color));this.materials.push(material);for(const mesh of this.surfaces.get(entry.surfaceId)??[]){mesh.metadata={...mesh.metadata,n8DesignMaterial:material};}}
  for(const entry of scene?.objects??[]){const mesh=createObjectMesh(this.world,entry);const material=this.material(`object-material-${entry.id}`,color(entry.materialCode,entry.color));mesh.material=material;this.materials.push(material);this.overlays.push(mesh);}this.showBefore(this.before);
 }
 showBefore(before:boolean){this.before=before;for(const mesh of this.overlays)mesh.setEnabled(!before);for(const [mesh,material] of this.originals)mesh.material=before?material:(mesh.metadata?.n8DesignMaterial as Material|undefined)??material;}
 pose():CameraPose {return {alpha:this.camera.alpha,beta:this.camera.beta,radius:this.camera.radius,target:this.camera.target.asArray() as [number,number,number]};}
 async capturePair(){if(!this.ready||this.destroyed)throw new Error('Дождитесь загрузки 3D');await this.world.whenReadyAsync();const camera=this.pose(),previous=this.before;this.camera.detachControl();this.camera.inertialAlphaOffset=0;this.camera.inertialBetaOffset=0;this.camera.inertialRadiusOffset=0;this.camera.inertialPanningX=0;this.camera.inertialPanningY=0;
  try{this.showBefore(true);this.world.render();const before=this.canvas.toDataURL('image/png');this.showBefore(false);this.world.render();const after=this.canvas.toDataURL('image/png');return {before,after,camera};}finally{this.showBefore(previous);this.camera.attachControl(this.canvas,true);}}
 resize(){this.engine.resize();}
 dispose(){if(this.destroyed)return;this.destroyed=true;this.engine.stopRenderLoop();this.world.dispose();this.engine.dispose();}
}
