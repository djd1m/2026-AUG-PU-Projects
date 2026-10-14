import {it,expect} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ImportMeshAsync} from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import {triangleGlb} from '../space/fixtures';
it('actual glTF loader exposes source primitive pointers in internal metadata',async()=>{const engine=new NullEngine();const scene=new Scene(engine);scene.useRightHandedSystem=true;try{const imported=await ImportMeshAsync(new Uint8Array(triangleGlb()),scene,{pluginExtension:'.glb'});const mesh=imported.meshes.find(m=>m.getTotalVertices()>0)!;expect(mesh._internalMetadata?.gltf?.pointers).toContain('/meshes/0/primitives/0');}finally{scene.dispose();engine.dispose();}});

import {BabylonRoom} from '../../packages/viewer/src/renderer';
import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import type {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
it('production GLB material mapping changes colors and restores original material',async()=>{const engine=new NullEngine(),world=new Scene(engine);world.useRightHandedSystem=true;const room=Object.create(BabylonRoom.prototype) as BabylonRoom;Object.assign(room,{engine,world,camera:new ArcRotateCamera('camera',0,1,3,Vector3.Zero(),world),destroyed:false,ready:false,originals:new Map(),surfaces:new Map(),overlays:[],materials:[],marks:[],semanticMeshes:[],before:false});try{const b=triangleGlb();await room.loadGlbAsset('test',1,async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer);const mesh=world.meshes.find(m=>m.getTotalVertices()>0)!;const original=mesh.material;room.setDesign({materials:[{surfaceId:'mesh:0:primitive:0',color:'#123456'}],objects:[]});room.showBefore(false);expect((mesh.material as StandardMaterial).diffuseColor.toHexString()).toBe('#123456');room.showBefore(true);expect(mesh.material).toBe(original);}finally{world.dispose();engine.dispose();}});
