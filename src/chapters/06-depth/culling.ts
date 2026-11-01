import { dot, finite } from '../../math/vector.ts';
import type { Vec3 } from '../../math/vector.ts';

export type Plane = { name: string; normal: Vec3; offset: number };
export type Box = { center: Vec3; halfSize: Vec3 };

/** 相机位于原点、朝 -Z；内部满足 n·p+d >= 0。不要求平面法线归一化。 */
export function frustumPlanes(fov: number, aspect: number, near: number, far: number): Plane[] {
  finite([fov, aspect, near, far]);
  if (fov <= 0 || fov >= 180 || aspect <= 0 || near <= 0 || far <= near)
    throw new RangeError('视锥参数不合法');
  const y = Math.tan((fov * Math.PI) / 360),
    x = aspect * y;
  return [
    { name: '左', normal: [1, 0, -x], offset: 0 },
    { name: '右', normal: [-1, 0, -x], offset: 0 },
    { name: '下', normal: [0, 1, -y], offset: 0 },
    { name: '上', normal: [0, -1, -y], offset: 0 },
    { name: '近', normal: [0, 0, -1], offset: -near },
    { name: '远', normal: [0, 0, 1], offset: far },
  ];
}

export function boxPlane(box: Box, plane: Plane): { min: number; max: number } {
  finite([...box.center, ...box.halfSize, ...plane.normal, plane.offset]);
  if (box.halfSize.some((x) => x < 0)) throw new RangeError('包围盒半长不能为负');
  const center = dot(plane.normal, box.center) + plane.offset;
  const radius = plane.normal.reduce((sum, n, i) => sum + Math.abs(n) * box.halfSize[i], 0);
  return { min: center - radius, max: center + radius };
}

/** outside 可安全剔除；candidate 只表示未被六面测试排除，不保证相交或可见。 */
export function classifyBox(box: Box, planes: Plane[]) {
  const ranges = planes.map((plane) => ({ ...boxPlane(box, plane), name: plane.name }));
  const rejecting = ranges.find((range) => range.max < 0);
  const state = rejecting
    ? 'outside'
    : ranges.every((range) => range.min >= 0)
      ? 'inside'
      : 'candidate';
  return { state, rejecting: rejecting?.name ?? null, ranges };
}
