import { finite } from '../../math/vector.ts';
import type { Vec2 } from '../../math/vector.ts';

function integerPoint(point: Vec2): void {
  finite(point);
  if (point.some((x) => !Number.isSafeInteger(x) || Math.abs(x) > 10000))
    throw new RangeError('教学整数网格坐标须在 ±10000 内');
}

/** Bresenham 的全八象限形式。像素中心在整数格点，包含两端。 */
export function lineSteps(a: Vec2, b: Vec2): { point: Vec2; error: number }[] {
  integerPoint(a);
  integerPoint(b);
  let [x, y] = a;
  const dx = Math.abs(b[0] - x),
    dy = Math.abs(b[1] - y);
  const sx = x < b[0] ? 1 : -1,
    sy = y < b[1] ? 1 : -1;
  let error = dx - dy;
  const steps: { point: Vec2; error: number }[] = [];
  while (true) {
    steps.push({ point: [x, y], error });
    if (x === b[0] && y === b[1]) return steps;
    // 两个判断使用更新之前的同一个误差；一次可同时沿 x、y 前进。
    const twice = 2 * error;
    if (twice >= -dy) {
      error -= dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
}

/** 整数中点圆：只走第一八分圆，再利用八重对称。 */
export function circleSteps(radius: number): { point: Vec2; decision: number }[] {
  if (!Number.isInteger(radius) || radius < 0 || radius > 10000)
    throw new RangeError('圆半径须为 0 至 10000 的整数');
  let x = 0,
    y = radius,
    decision = 1 - radius;
  const steps: { point: Vec2; decision: number }[] = [];
  while (x <= y) {
    steps.push({ point: [x, y], decision });
    x++;
    if (decision < 0) decision += 2 * x + 1;
    else {
      y--;
      decision += 2 * (x - y) + 1;
    }
  }
  return steps;
}

export function symmetricPoints(center: Vec2, point: Vec2): Vec2[] {
  const [x, y] = point;
  const offsets = [
    [x, y],
    [-x, y],
    [x, -y],
    [-x, -y],
    [y, x],
    [-y, x],
    [y, -x],
    [-y, -x],
  ];
  // 轴上与对角线上的重复点只写一次。
  return [
    ...new Map(
      offsets.map(([a, b]) => {
        const p: Vec2 = [center[0] + a, center[1] + b];
        return [p.join(','), p] as const;
      }),
    ).values(),
  ];
}
