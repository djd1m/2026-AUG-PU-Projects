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
