export type SemanticRole = 'floor' | 'walls' | 'ceiling' | 'furniture' | 'unknown';

type Plane = { area: number; weightedY: number; minY: number; maxY: number };
const roles: SemanticRole[] = ['floor', 'walls', 'ceiling', 'furniture', 'unknown'];
const binSize = 0.05;

/** Geometry-only approximation in world metres. Never edits source attributes or topology. */
export function segmentTriangles(positions: ArrayLike<number>, indices: ArrayLike<number>): {
  groups: Record<SemanticRole, number[]>;
  floorY: number;
  counts: Record<SemanticRole, number>;
} {
  if (!Number.isSafeInteger(positions.length) || positions.length < 0 || positions.length % 3 !== 0 ||
      !Number.isSafeInteger(indices.length) || indices.length < 0 || indices.length % 3 !== 0 ||
      indices.length / 3 > 1_000_000) throw new RangeError('Invalid or oversized triangle geometry');
  const groups: Record<SemanticRole, number[]> = { floor: [], walls: [], ceiling: [], furniture: [], unknown: [] };
  const counts: Record<SemanticRole, number> = { floor: 0, walls: 0, ceiling: 0, furniture: 0, unknown: 0 };
  const horizontal = new Map<number, Plane>();
  const vertical = new Map<string, Plane>();
  const triangles: { minY: number; maxY: number; horizontal?: number; vertical?: string }[] = [];
  let highestY = -Infinity;
  const accumulate = (map: Map<string, Plane>, key: string, area: number, y: number, minY: number, maxY: number) => {
    const plane = map.get(key);
    if (plane) {
      plane.area += area; plane.weightedY += y * area;
      plane.minY = Math.min(plane.minY, minY); plane.maxY = Math.max(plane.maxY, maxY);
    } else map.set(key, { area, weightedY: y * area, minY, maxY });
  };
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    for (const index of [a, b, c]) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= positions.length / 3) throw new RangeError('Triangle index out of bounds');
    }
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    if (![ax, ay, az, bx, by, bz, cx, cy, cz].every(Number.isFinite)) throw new RangeError('Nonfinite triangle position');
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    const minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy);
    const triangle: (typeof triangles)[number] = { minY, maxY };
    triangles.push(triangle);
    if (!Number.isFinite(length) || length <= 1e-10) continue;
    nx /= length; ny /= length; nz /= length;
    highestY = Math.max(highestY, maxY);
    const area = length / 2, y = ay / 3 + by / 3 + cy / 3;
    if (Math.abs(ny) >= 0.98 && maxY - minY <= binSize) {
      const key = Math.round(y / binSize);
      const plane = horizontal.get(key);
      if (plane) {
        plane.area += area; plane.weightedY += y * area;
        plane.minY = Math.min(plane.minY, minY); plane.maxY = Math.max(plane.maxY, maxY);
      } else horizontal.set(key, { area, weightedY: y * area, minY, maxY });
      triangle.horizontal = key;
    } else if (Math.abs(ny) <= 0.15) {
      // Canonical normal makes opposite triangle winding share the same plane.
      if (nx < -1e-8 || (Math.abs(nx) <= 1e-8 && nz < 0)) { nx = -nx; ny = -ny; nz = -nz; }
      const offset = nx * ax + ny * ay + nz * az;
      const key = `${Math.round(nx / 0.1)},${Math.round(ny / 0.1)},${Math.round(nz / 0.1)},${Math.round(offset / binSize)}`;
      triangle.vertical = key;
      accumulate(vertical, key, area, y, minY, maxY);
    }
  }
  let largestHorizontalArea = 0;
  for (const plane of horizontal.values()) largestHorizontalArea = Math.max(largestHorizontalArea, plane.area);
  const support = Math.max(0.5, largestHorizontalArea * 0.03);
  let wallBase = Infinity, wallTop = -Infinity;
  for (const plane of vertical.values()) {
    if (plane.area >= 0.5 && plane.maxY - plane.minY > 1.4) {
      wallBase = Math.min(wallBase, plane.minY); wallTop = Math.max(wallTop, plane.maxY);
    }
  }
  const bottomLimit = Number.isFinite(wallBase) ? wallBase + Math.max(0.25, (wallTop - wallBase) * 0.2) : Infinity;
  let floorKey: number | undefined, floorY = Infinity;
  // Lowest supported plane avoids choosing the largest (often furniture) plane.
  // Tiny scan outliers do not set the lower bound of the room.
  for (const [key, plane] of horizontal) {
    const y = plane.weightedY / plane.area;
    if (plane.area >= support && y <= bottomLimit && y < floorY) { floorY = y; floorKey = key; }
  }
  const hasFloor = floorKey !== undefined;
  if (!hasFloor) floorY = 0;
  for (let t = 0; t < triangles.length; t++) {
    const triangle = triangles[t];
    const wall = triangle.vertical === undefined ? undefined : vertical.get(triangle.vertical);
    let role: SemanticRole = 'unknown';
    if (triangle.horizontal !== undefined && triangle.horizontal === floorKey) role = 'floor';
    else if (wall && wall.area >= 0.5 && wall.maxY - wall.minY > 1.4) role = 'walls';
    else if (hasFloor && triangle.horizontal !== undefined && triangle.minY - floorY >= 1.8 &&
      highestY - triangle.maxY <= 0.15 && horizontal.get(triangle.horizontal)!.area >= support) role = 'ceiling';
    else if (hasFloor && (triangle.horizontal !== undefined || triangle.vertical !== undefined) &&
      triangle.minY - floorY >= 0.12 && triangle.maxY - floorY <= 1.4) role = 'furniture';
    groups[role].push(indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]);
    counts[role]++;
  }
  // Counts are triangles, while groups contain original vertex-index triplets.
  for (const role of roles) if (counts[role] * 3 !== groups[role].length) throw new Error('Triangle partition mismatch');
  return { groups, floorY, counts };
}
