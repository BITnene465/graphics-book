import { cross, dot, finite, scale } from '../../math/vector.ts';
import type { Vec3 } from '../../math/vector.ts';
import { controlPoints, evaluate } from './core.ts';

export function bezierJet(control: number[][], t: number) {
  controlPoints(control);
  let points = control;
  const jet: number[][] = [];
  for (let order = 0; order <= 3; order++) {
    jet.push(evaluate(points, t));
    const degree = points.length - 1;
    points = degree
      ? points.slice(0, -1).map((p, i) => p.map((x, axis) => degree * (points[i + 1][axis] - x)))
      : [points[0].map(() => 0)];
  }
  return { position: jet[0], velocity: jet[1], acceleration: jet[2], jerk: jet[3] };
}

/** 对任意正则参数求 Frenet 标架。零曲率处不伪造主法线或挠率。 */
export function curveFrame(velocity: Vec3, acceleration: Vec3, jerk: Vec3) {
  finite([...velocity, ...acceleration, ...jerk]);
  const speed = Math.hypot(...velocity);
  if (speed === 0)
    return {
      regular: false,
      speed,
      curvature: null,
      torsion: null,
      tangent: null,
      normal: null,
      binormal: null,
    };
  const tangent = scale(velocity, 1 / speed) as Vec3;
  const bend = cross(tangent, acceleration),
    bendLength = Math.hypot(...bend);
  const curvature = bendLength / speed / speed;
  if (bendLength <= 1e-12 * Math.hypot(...acceleration))
    return {
      regular: true,
      speed,
      curvature,
      torsion: null,
      tangent,
      normal: null,
      binormal: null,
    };
  const binormal = scale(bend, 1 / bendLength) as Vec3,
    normal = cross(binormal, tangent);
  const torsion = dot(binormal, jerk) / speed / bendLength;
  finite([curvature, torsion]);
  return { regular: true, speed, curvature, torsion, tangent, normal, binormal };
}

/** 圆柱螺线：pitch 是参数每增加 1 弧度时的高度增量。 */
export function helixJet(radius: number, pitch: number, t: number) {
  finite([radius, pitch, t]);
  if (radius < 0) throw new RangeError('半径不能为负');
  return {
    position: [radius * Math.cos(t), radius * Math.sin(t), pitch * t] as Vec3,
    velocity: [-radius * Math.sin(t), radius * Math.cos(t), pitch] as Vec3,
    acceleration: [-radius * Math.cos(t), -radius * Math.sin(t), 0] as Vec3,
    jerk: [radius * Math.sin(t), -radius * Math.cos(t), 0] as Vec3,
  };
}
