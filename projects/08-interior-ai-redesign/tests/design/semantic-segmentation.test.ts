import { expect, it } from 'vitest';
import type { MultiMaterial as BabylonMultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
import { segmentTriangles } from '../../packages/viewer/src/semantic-segmentation';

function fixture() {
  const positions: number[] = [], indices: number[] = [];
  const triangle = (...vertices: number[]) => {
    const first = positions.length / 3;
    positions.push(...vertices); indices.push(first, first + 1, first + 2);
  };
  // Floor area 4m²; larger bed top must not become the floor.
  triangle(0, 2, 0, 4, 2, 0, 0, 2, 2);
  triangle(0, 2.6, 0, 4, 2.6, 0, 0, 2.6, 4);
  // Same wall plane split into low and high triangles, opposite winding.
  triangle(0, 2, 0, 0, 2, 4, 0, 2.6, 0);
  triangle(0, 2.6, 0, 0, 5, 0, 0, 2.6, 4);
  triangle(0, 5, 0, 4, 5, 0, 0, 5, 4);
  // Slanted surface and degenerate triangle remain unknown.
  triangle(1, 3.6, 1, 2, 4, 1, 1, 4, 2);
  triangle(1, 2, 1, 1, 2, 1, 1, 2, 1);
  // Tiny low scan outlier cannot move the floor.
  triangle(0, -50, 0, 0.01, -50, 0, 0, -50, 0.01);
  return { positions, indices };
}

it('partitions a fused mesh, preserves low walls, and chooses floor below a larger bed top', () => {
  const { positions, indices } = fixture();
  const result = segmentTriangles(positions, indices);
  expect(result.floorY).toBe(2);
  expect(result.counts).toEqual({ floor: 1, furniture: 1, walls: 2, ceiling: 1, unknown: 3 });
  expect(result.groups.floor).toEqual(indices.slice(0, 3));
  expect(result.groups.furniture).toEqual(indices.slice(3, 6));
  expect(result.groups.walls).toEqual(indices.slice(6, 12));
});

it('preserves every original triangle and leaves all source arrays untouched', () => {
  const input = fixture();
  const positions = new Float64Array(input.positions), indices = new Uint32Array(input.indices);
  const result = segmentTriangles(positions, indices);
  const triplets = (array: ArrayLike<number>) => Array.from({ length: array.length / 3 }, (_, i) =>
    [array[i * 3], array[i * 3 + 1], array[i * 3 + 2]].join(','));
  expect(Object.values(result.groups).flatMap(triplets).sort()).toEqual(triplets(indices).sort());
  expect(Array.from(positions)).toEqual(input.positions);
  expect(Array.from(indices)).toEqual(input.indices);
});

it('handles empty, unsupported and degenerate geometry conservatively', () => {
  expect(segmentTriangles([], []).floorY).toBe(0);
  expect(segmentTriangles([0, 0, 0], [0, 0, 0]).counts.unknown).toBe(1);
  expect(segmentTriangles([0, 0, 0, 0.1, 0, 0, 0, 0, 0.1], [0, 1, 2]).counts.unknown).toBe(1);
});

it('rejects malformed, nonfinite, out-of-bounds and oversized geometry before unsafe work', () => {
  expect(() => segmentTriangles([0, 0], [])).toThrow();
  expect(() => segmentTriangles([0, 0, 0], [0])).toThrow();
  for (const index of [-1, 1, 0.5, NaN]) expect(() => segmentTriangles([0, 0, 0], [0, 0, index])).toThrow();
  expect(() => segmentTriangles([NaN, 0, 0], [0, 0, 0])).toThrow();
  expect(() => segmentTriangles([], { length: 3_000_003 })).toThrow();
});

it('Babylon fused overlay restores original indices, submeshes, material and vertex attributes', async () => {
  const [{ NullEngine }, { Scene }, { Mesh }, { StandardMaterial }, { MultiMaterial }, { SubMesh }, { VertexBuffer }, { SemanticMeshAppearance }] = await Promise.all([
    import('@babylonjs/core/Engines/nullEngine'), import('@babylonjs/core/scene'),
    import('@babylonjs/core/Meshes/mesh'), import('@babylonjs/core/Materials/standardMaterial'),
    import('@babylonjs/core/Materials/multiMaterial'), import('@babylonjs/core/Meshes/subMesh'),
    import('@babylonjs/core/Buffers/buffer'), import('../../packages/viewer/src/renderer'),
  ]);
  const engine = new NullEngine(), world = new Scene(engine);
  try {
    const input = fixture(), mesh = new Mesh('fused', world);
    mesh.setVerticesData(VertexBuffer.PositionKind, input.positions);
    const uvs = input.positions.filter((_, i) => i % 3 !== 1);
    mesh.setVerticesData(VertexBuffer.UVKind, uvs);
    mesh.setIndices(input.indices);
    mesh.releaseSubMeshes();
    new SubMesh(0, 0, 12, 0, 12, mesh);
    new SubMesh(0, 12, 12, 12, 12, mesh);
    const original = new StandardMaterial('imported', world); mesh.material = original;
    const snapshot = () => mesh.subMeshes.map(s => [s.materialIndex, s.verticesStart, s.verticesCount, s.indexStart, s.indexCount]);
    const submeshes = snapshot(), positionsBefore = Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!);
    const overlay = SemanticMeshAppearance.create(mesh)!;
    expect(overlay).not.toBeNull();
    overlay.configure({ floor:{color:'#ff0000',description:''}, walls:{color:'#00ff00',description:''}, furniture:{color:'#0000ff',description:''}, ceiling:{color:null,description:''} });
    overlay.showBefore(false);
    const multi = mesh.material as BabylonMultiMaterial;
    expect(multi).toBeInstanceOf(MultiMaterial);
    expect((multi.subMaterials[0] as unknown as {diffuseColor:{toHexString():string}}).diffuseColor.toHexString()).toBe('#FF0000');
    expect((multi.subMaterials[1] as unknown as {diffuseColor:{toHexString():string}}).diffuseColor.toHexString()).toBe('#00FF00');
    expect((multi.subMaterials[3] as unknown as {diffuseColor:{toHexString():string}}).diffuseColor.toHexString()).toBe('#0000FF');
    expect(multi.subMaterials[2]).toBe(original); // ceiling null retains imported material
    expect(multi.subMaterials[4]).toBe(original); // unknown retains imported material
    expect(mesh.subMeshes).toHaveLength(5);
    expect(Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!)).toEqual(positionsBefore);
    expect(Array.from(mesh.getVerticesData(VertexBuffer.UVKind)!)).toEqual(uvs);
    const after = Array.from(mesh.getIndices()!);
    overlay.showBefore(true);
    expect(mesh.material).toBe(original);
    expect(Array.from(mesh.getIndices()!)).toEqual(input.indices);
    expect(snapshot()).toEqual(submeshes);
    overlay.showBefore(false);
    expect(Array.from(mesh.getIndices()!)).toEqual(after);
    overlay.configure(undefined);
    expect(world.multiMaterials).not.toContain(multi);
    expect(world.materials).not.toContain(multi.subMaterials[0]);
    expect(mesh.material).toBe(original);
    expect(Array.from(mesh.getIndices()!)).toEqual(input.indices);
    expect(world.materials).toContain(original);
    overlay.dispose();
    expect(world.materials).toContain(original);
    mesh.material = new MultiMaterial('existing-multi', world);
    expect(SemanticMeshAppearance.create(mesh)).toBeNull();
  } finally { world.dispose(); engine.dispose(); }
});

function wrinkledFixture(corner=false) {
  const positions:number[]=[], indices:number[]=[], spans:{role:string;start:number;end:number}[]=[];
  function grid(role:string,n:number,m:number,point:(u:number,v:number,noise:number)=>number[]) {
    const start=indices.length,first=positions.length/3;
    for(let v=0;v<=m;v++)for(let u=0;u<=n;u++)positions.push(...point(u/n,v/m,((u+v)%2?1:-1)*0.04));
    for(let v=0;v<m;v++)for(let u=0;u<n;u++){
      const a=first+v*(n+1)+u,b=a+1,c=a+n+1,d=c+1;
      indices.push(a,b,c,b,d,c);
    }
    spans.push({role,start,end:indices.length});
  }
  grid('floor',40,40,(u,v,noise)=>[0.3+4*u,noise,0.3+4*v]);
  grid('walls',40,30,(u,v,noise)=>[noise,0.2+3*v,0.3+4*u]);
  if(corner)grid('walls',40,30,(u,v,noise)=>[0.3+4*u,0.2+3*v,noise]);
  grid('furniture',20,20,(u,v,noise)=>[1+2*u,0.65+noise,1+2*v]);
  const unknownStart=indices.length;
  for(const vertices of [
    [10,0,10,10.05,0,10,10,0,10.05], // disconnected floor speck
    [0,1,10,0,1.05,10,0,1,10.05], // disconnected wall speck
    [10,0.6,10,10.05,0.6,10,10,0.6,10.05], // disconnected furniture speck
    [8,2,8,9,3,8,8,3,9], // uncertain high slanted surface
  ]) {const first=positions.length/3;positions.push(...vertices);indices.push(first,first+1,first+2);}
  return {positions,indices,spans,unknownStart};
}

it('fills coherent wrinkled planes despite noisy normals and rejects disconnected colored specks',()=>{
  const input=wrinkledFixture(), before=JSON.stringify(input);
  const result=segmentTriangles(input.positions,input.indices);
  for(const span of input.spans){
    const role=span.role as 'floor'|'walls'|'furniture';
    expect(result.groups[role],role).toEqual(input.indices.slice(span.start,span.end));
  }
  expect(result.groups.unknown).toEqual(input.indices.slice(input.unknownStart));
  expect(result.eligibility.eligible).toBe(true);
  expect(result.eligibility.coverage).toBeGreaterThan(0.9);
  expect(result.eligibility.regions).toBe(3);
  expect(JSON.stringify(input)).toBe(before);
  expect(Object.values(result.counts).reduce((a,b)=>a+b,0)).toBe(input.indices.length/3);
});

it('marks sparse or fragmented segmentation ineligible instead of claiming a usable overlay',()=>{
  const input=fixture();
  for(let i=0;i<30;i++){
    const first=input.positions.length/3;
    input.positions.push(10+i*2,2,10,11+i*2,2,10,10+i*2,2,11);
    input.indices.push(first,first+1,first+2);
  }
  const fragmented=segmentTriangles(input.positions,input.indices);
  expect(fragmented.eligibility.eligible).toBe(false);
  expect(fragmented.eligibility.reason).toBe('fragmented_regions');
  expect(segmentTriangles([0,0,0],[0,0,0]).eligibility.reason).toBe('no_supported_floor');
});


it('intersecting noisy room walls do not create planes through a finely tessellated interior bed',()=>{
  const input=wrinkledFixture(true),result=segmentTriangles(input.positions,input.indices);
  const bed=input.spans.find(s=>s.role==='furniture')!;
  expect(result.groups.furniture).toEqual(input.indices.slice(bed.start,bed.end));
  expect(result.counts.walls).toBe(4800);
  expect(result.counts.furniture).toBe(800);
  expect(result.counts.unknown).toBe(4);
  expect(result.eligibility.eligible).toBe(true);
});

it('renderer refuses a low-coverage overlay instead of painting coloured fragments',async()=>{
 const [{NullEngine},{Scene},{Mesh},{StandardMaterial},{VertexBuffer},{SemanticMeshAppearance}]=await Promise.all([import('@babylonjs/core/Engines/nullEngine'),import('@babylonjs/core/scene'),import('@babylonjs/core/Meshes/mesh'),import('@babylonjs/core/Materials/standardMaterial'),import('@babylonjs/core/Buffers/buffer'),import('../../packages/viewer/src/renderer')]);
 const engine=new NullEngine(),world=new Scene(engine);try{const input=fixture(),first=input.positions.length/3;input.positions.push(0,10,0,100,15,0,0,20,100);input.indices.push(first,first+1,first+2);const mesh=new Mesh('unsupported-scan',world);mesh.setVerticesData(VertexBuffer.PositionKind,input.positions);mesh.setIndices(input.indices);const original=new StandardMaterial('original',world);mesh.material=original;const overlay=SemanticMeshAppearance.create(mesh)!;expect(overlay.eligibility.eligible).toBe(false);overlay.configure({floor:{color:'#ff0000',description:''},walls:{color:'#00ff00',description:''},furniture:{color:'#0000ff',description:''},ceiling:{color:null,description:''}});overlay.showBefore(false);expect(mesh.material).toBe(original);expect(Array.from(mesh.getIndices()!)).toEqual(input.indices);expect(world.multiMaterials).toHaveLength(0);overlay.dispose();}finally{world.dispose();engine.dispose();}
});

it('mixed eligible and unsupported meshes fail the entire scan appearance gate',async()=>{const{BabylonRoom}=await import('../../packages/viewer/src/renderer');const room=Object.create(BabylonRoom.prototype) as import('../../packages/viewer/src/renderer').BabylonRoom;Object.assign(room,{scanLoaded:true,semanticMeshes:[{eligibility:{eligible:true,coverage:1,reason:'supported_regions'}}],unsupportedSemanticMeshes:1});expect(room.appearanceStatus()).toMatchObject({eligible:false,reason:'unsupported_mesh'});Object.assign(room,{unsupportedSemanticMeshes:0});expect(room.appearanceStatus()).toMatchObject({eligible:true});});
