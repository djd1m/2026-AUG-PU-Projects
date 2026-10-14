import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {buildRequest,validateScene,type ObjectDefinition,type SceneShell} from '@n8/domain/design';
import {createManualShell} from '@n8/domain/space';
import {live} from './fixtures';
const shell:SceneShell={...createManualShell({lengthM:'6',widthM:'5',heightM:'3',openings:[{id:'door',wallId:'north',offsetM:'0',widthM:'1',heightM:'2',sillM:'0'}]},true),id:randomUUID(),hash:'a'.repeat(64)};
const catalog:ObjectDefinition[]=[{id:randomUUID(),name:'Стол',primitive:'box',source:'manual',dimensionsM:['2','1','1']}];
const scene=()=>({shellId:shell.id,shellHash:shell.hash,materials:[{surfaceId:'floor',color:'#eeeeee',materialCode:'wood'}],objects:[{id:randomUUID(),catalogId:catalog[0]!.id,positionM:[3,0,3],rotationY:0,dimensionsM:['2','1','1']}]});
describe('strict measured scene',()=>{
 it('preserves measured shell and exact catalog dimensions',()=>{const before=JSON.stringify(shell);expect(validateScene(scene(),shell,catalog).fit).toBe('bbox_checked');expect(JSON.stringify(shell)).toBe(before);});
 it('rejects shell edits, URI, changed dimensions and foreign surfaces',()=>{for(const bad of [{...scene(),transform:[]},{...scene(),shellHash:'b'.repeat(64)},{...scene(),objects:[{...scene().objects[0],uri:'https://evil.invalid/a'}]},{...scene(),objects:[{...scene().objects[0],dimensionsM:['1','1','1']}]},{...scene(),materials:[{surfaceId:'foreign',color:'#ffffff',materialCode:'x'}]}])expect(()=>validateScene(bad,shell,catalog)).toThrow();});
 it('rotated AABB room bounds, opening clearance, object collisions',()=>{for(const objects of [[{...scene().objects[0],positionM:[0.6,0,3],rotationY:Math.PI/4}],[{...scene().objects[0],positionM:[1,0,0.5]}],[scene().objects[0],scene().objects[0]]])expect(()=>validateScene({...scene(),objects},shell,catalog)).toThrow();});
 it('GLB fit stays unconfirmed and never invents floor semantics',()=>{const glb:SceneShell={...shell,mode:'glb',geometry:{assetId:randomUUID(),originalHash:'x',normalizationMatrix:[],vertexCount:1,triangleCount:1,nodeCount:1,surfaceIds:['scan']}};expect(validateScene({...scene(),materials:[]},glb,catalog).fit).toBe('unconfirmed');expect(()=>validateScene(scene(),glb,catalog)).toThrow();});
});

it('DESIGN-R1 GLB provider advertises immutable mesh IDs that its response validator accepts',()=>{
 const glb:SceneShell={...shell,mode:'glb',sourceAssetId:randomUUID(),floorAreaM2:null,floorAreaSource:'unknown',geometry:{assetId:randomUUID(),originalHash:'b'.repeat(64),normalizationMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],vertexCount:3,triangleCount:1,nodeCount:1,surfaceIds:['mesh:0:primitive:0']}};
 const body=JSON.parse(buildRequest({shellId:glb.id,style:'Тёплый',referenceIds:[],inputText:''},glb,[],[],live));
 const payload=JSON.parse(body.messages[1].content);
 expect(payload.geometry.surfaceIds).toEqual(['mesh:0:primitive:0']);
 const proposed={shellId:glb.id,shellHash:glb.hash,materials:[{surfaceId:payload.geometry.surfaceIds[0],color:'#eeeeee',materialCode:'paint'}],objects:[]};
 expect(validateScene(proposed,glb,[]).fit).toBe('unconfirmed');expect(()=>validateScene({...proposed,materials:[{...proposed.materials[0],surfaceId:'floor'}]},glb,[])).toThrow();
});
