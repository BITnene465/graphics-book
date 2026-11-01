import { Drawing, palette } from '../../figures/drawing.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { project } from './core.ts';
import { contains } from './csg.ts';
import type { Solid } from './csg.ts';
import type { Cube } from './octree.ts';

export function cubeWire(
  d: Drawing,
  cube: Cube,
  az: number,
  el: number,
  color = palette.muted,
  opacity = 0.6,
): void {
  const vertices = Array.from(
    { length: 8 },
    (_, i) =>
      cube.center.map((x, axis) => x + ((i >> axis) & 1 ? cube.halfSize : -cube.halfSize)) as Vec3,
  );
  const xy = project(vertices, az, el).xy;
  for (let i = 0; i < 8; i++)
    for (let axis = 0; axis < 3; axis++) {
      const j = i ^ (1 << axis);
      if (i < j) d.line([xy[i], xy[j]], color, 1.2, opacity);
    }
}

/** 显示采样体素的外露面；核心的连续内外查询在 csg.ts。 */
export function voxelSurface(
  d: Drawing,
  cells: Uint8Array,
  n: number,
  half: number,
  az: number,
  el: number,
): void {
  const step = (2 * half) / n,
    forward = project([], az, el).forward;
  const occupied = (q: number[]) =>
    q.every((i) => i >= 0 && i < n) && cells[q[0] + n * (q[1] + n * q[2])];
  const faces: { xy: Vec2[]; depth: number; color: string }[] = [];
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const cell = [x, y, z];
        if (!occupied(cell)) continue;
        for (let axis = 0; axis < 3; axis++)
          for (const sign of [-1, 1]) {
            if (forward[axis] * sign <= 0) continue;
            const neighbor = [...cell];
            neighbor[axis] += sign;
            if (occupied(neighbor)) continue;
            const a = (axis + 1) % 3,
              b = (axis + 2) % 3;
            const vertices = [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ].map(([u, v]) => {
              const p = cell.map((i) => -half + (i + 0.5) * step);
              p[axis] += (sign * step) / 2;
              p[a] += (u * step) / 2;
              p[b] += (v * step) / 2;
              return p as Vec3;
            });
            const view = project(vertices, az, el);
            faces.push({
              xy: view.xy,
              depth: view.depth.reduce((s, x) => s + x, 0) / 4,
              color: ['#326779', '#418b9f', '#64b4c8'][axis],
            });
          }
      }
  faces
    .sort((a, b) => a.depth - b.depth)
    .forEach((f) => {
      d.polygon(f.xy, f.color, 1);
      d.line([...f.xy, f.xy[0]], f.color, 0.6);
    });
}

export function solidSlice(d: Drawing, solid: Solid, z: number, half = 2.5, n = 120): void {
  const data = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (
        contains(solid, [-half + ((x + 0.5) * 2 * half) / n, half - ((y + 0.5) * 2 * half) / n, z])
      )
        data.set([88, 196, 221, 185], 4 * (x + y * n));
  d.raster([-half, -half], [2 * half, 2 * half], n, n, data, true);
}
