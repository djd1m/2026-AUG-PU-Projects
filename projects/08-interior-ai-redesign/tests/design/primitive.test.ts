import {it,expect} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {createObjectMesh} from '../../packages/viewer/src/renderer';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {RoomPlan} from '@n8/viewer';
it('DESIGN-R3 actualcylinder mesh andplan preserve catalog width/height/depth instead of box corners',()=>{
 const engine=new NullEngine(),world=new Scene(engine);try{
 const object={id:'cylinder',primitive:'cylinder' as const,positionM:[3,0,3] as [number,number,number],dimensionsM:['2','1','1'] as [string,string,string],rotationY:0};
 const mesh=createObjectMesh(world,object);mesh.computeWorldMatrix(true);const bounds=mesh.getBoundingInfo().boundingBox;
 expect(mesh.getTotalVertices()).toBeGreaterThan(24);expect(bounds.maximumWorld.x-bounds.minimumWorld.x).toBeCloseTo(2);expect(bounds.maximumWorld.y-bounds.minimumWorld.y).toBeCloseTo(1);expect(bounds.maximumWorld.z-bounds.minimumWorld.z).toBeCloseTo(1);expect(bounds.minimumWorld.y).toBeCloseTo(0);
 const html=renderToStaticMarkup(createElement(RoomPlan,{room:{lengthM:'6',widthM:'5',heightM:'3',openings:[]},scene:{materials:[],objects:[object]}}));expect(html).toContain('<ellipse');
 }finally{world.dispose();engine.dispose();}
});
