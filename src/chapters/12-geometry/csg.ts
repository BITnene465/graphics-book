import { finite } from '../../math/vector.ts';
import type { Vec3 } from '../../math/vector.ts';

export type Sphere = { kind: 'sphere'; center: Vec3; radius: number };
export type Block = { kind: 'box'; center: Vec3; halfSize: Vec3 };
export type BooleanOperation = 'union' | 'intersection' | 'difference';
export type Solid = Sphere | Block | { kind: BooleanOperation; left: Solid; right: Solid };

export function sphere(center: Vec3, radius: number): Sphere {
  finite([...center, radius]);
  if (radius <= 0) throw new RangeError('半径须为正数');
  return { kind: 'sphere', center: [...center], radius };
}
export function block(center: Vec3, halfSize: Vec3): Block {
  finite([...center, ...halfSize]);
  if (halfSize.some((h) => h <= 0)) throw new RangeError('半长须为正数');
  return { kind: 'box', center: [...center], halfSize: [...halfSize] };
}

/** 普通集合的成员判定；原始体含边界，A\B 排除 B 的边界。 */
export function contains(solid: Solid, point: Vec3): boolean {
  finite(point);
  if (solid.kind === 'sphere')
    return Math.hypot(...point.map((x, i) => x - solid.center[i])) <= solid.radius;
  if (solid.kind === 'box')
    return point.every((x, i) => Math.abs(x - solid.center[i]) <= solid.halfSize[i]);
  const a = contains(solid.left, point),
    b = contains(solid.right, point);
  if (solid.kind === 'union') return a || b;
  if (solid.kind === 'intersection') return a && b;
  return a && !b;
}

/** 中心采样仅用于显示；没有改变 CSG 树，也不提供保守体积界。 */
export function sampleSolid(solid: Solid, halfSize = 2.5, resolution = 24): Uint8Array {
  if (
    !(halfSize > 0 && Number.isFinite(halfSize)) ||
    !Number.isInteger(resolution) ||
    resolution < 1 ||
    resolution > 64
  )
    throw new RangeError('需要正采样范围与 1–64 的分辨率');
  const cells = new Uint8Array(resolution ** 3),
    step = (2 * halfSize) / resolution;
  for (let z = 0; z < resolution; z++)
    for (let y = 0; y < resolution; y++)
      for (let x = 0; x < resolution; x++)
        cells[x + resolution * (y + resolution * z)] = Number(
          contains(solid, [x, y, z].map((i) => -halfSize + (i + 0.5) * step) as Vec3),
        );
  return cells;
}
