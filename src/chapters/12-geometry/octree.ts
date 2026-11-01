import { finite } from '../../math/vector.ts';
import type { Vec3 } from '../../math/vector.ts';
import type { Sphere } from './csg.ts';

export type Cube = { center: Vec3; halfSize: number };
export type Octant = Cube & { state: 'inside' | 'outside' | 'boundary'; children?: Octant[] };

/** 对整个立方体求球心距离的上下界；只查八个角点会漏掉小球。 */
export function classifyCube(cube: Cube, ball: Sphere): Octant['state'] {
  finite([...cube.center, cube.halfSize, ...ball.center, ball.radius]);
  if (cube.halfSize <= 0 || ball.radius <= 0) throw new RangeError('尺寸须为正数');
  const offsets = cube.center.map((x, i) => Math.abs(x - ball.center[i]));
  const nearest = Math.hypot(...offsets.map((x) => Math.max(0, x - cube.halfSize)));
  const farthest = Math.hypot(...offsets.map((x) => x + cube.halfSize));
  return nearest > ball.radius ? 'outside' : farthest <= ball.radius ? 'inside' : 'boundary';
}

/** 子编号 x + 2y + 4z；每一位 0/1 表示该轴的低/高半区。 */
export function childCube(cube: Cube, index: number): Cube {
  if (!Number.isInteger(index) || index < 0 || index > 7) throw new RangeError('子编号须为 0–7');
  const halfSize = cube.halfSize / 2;
  return {
    halfSize,
    center: cube.center.map((x, axis) => x + ((index >> axis) & 1 ? halfSize : -halfSize)) as Vec3,
  };
}

export function buildOctree(ball: Sphere, cube: Cube, depth: number): Octant {
  if (!Number.isInteger(depth) || depth < 0 || depth > 6) throw new RangeError('教学深度须为 0–6');
  const state = classifyCube(cube, ball),
    node: Octant = { center: [...cube.center], halfSize: cube.halfSize, state };
  if (state === 'boundary' && depth > 0)
    node.children = Array.from({ length: 8 }, (_, i) =>
      buildOctree(ball, childCube(cube, i), depth - 1),
    );
  return node;
}

/** 分割面恰好命中时进入高半区；根盒最外侧表面仍接收查询。 */
export function queryOctree(root: Octant, point: Vec3) {
  finite(point);
  if (point.some((x, i) => Math.abs(x - root.center[i]) > root.halfSize))
    return { path: [] as Octant[], indices: [] as number[] };
  const path = [root],
    indices: number[] = [];
  while (path.at(-1)!.children) {
    const node = path.at(-1)!,
      index = point.reduce((code, x, axis) => code + (x >= node.center[axis] ? 1 << axis : 0), 0);
    indices.push(index);
    path.push(node.children![index]);
  }
  return { path, indices };
}

export function octreeLeaves(root: Octant): Octant[] {
  return root.children ? root.children.flatMap(octreeLeaves) : [root];
}
export function volumeBounds(root: Octant) {
  const leaves = octreeLeaves(root);
  const volume = (state: Octant['state']) =>
    leaves.filter((n) => n.state === state).reduce((sum, n) => sum + (2 * n.halfSize) ** 3, 0);
  const lower = volume('inside');
  return { lower, upper: lower + volume('boundary'), leaves: leaves.length };
}
