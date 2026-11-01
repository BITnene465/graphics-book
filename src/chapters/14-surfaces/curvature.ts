import { cross, dot, finite, scale } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';

export type SurfaceJet = { du: Vec3; dv: Vec3; duu: Vec3; duv: Vec3; dvv: Vec3 };

/** 把第二基本形式写到正交单位切基，再解一个对称 2×2 特征问题。 */
export function principalCurvatures(d: SurfaceJet) {
  finite([...d.du, ...d.dv, ...d.duu, ...d.duv, ...d.dvv]);
  const a = Math.hypot(...d.du),
    b = Math.hypot(...d.dv);
  if (!a || !b) return null;
  const t1 = scale(d.du, 1 / a) as Vec3,
    v = scale(d.dv, 1 / b);
  const cosine = dot(t1, v),
    crossed = cross(t1, v),
    sine = Math.hypot(...crossed);
  if (sine <= 1e-12) return null;
  const normal = scale(crossed, 1 / sine) as Vec3,
    t2 = cross(normal, t1);
  const e = dot(normal, d.duu) / a / a,
    f = dot(normal, d.duv) / a / b,
    g = dot(normal, d.dvv) / b / b;
  const s11 = e,
    s12 = (f - cosine * e) / sine;
  const s22 = (g - 2 * cosine * f + cosine * cosine * e) / (sine * sine);
  const mean = (s11 + s22) / 2,
    gap = Math.hypot((s11 - s22) / 2, s12);
  const angle = Math.atan2(2 * s12, s11 - s22) / 2;
  const direction1 = t1.map((x, i) => Math.cos(angle) * x + Math.sin(angle) * t2[i]) as Vec3;
  const direction2 = cross(normal, direction1);
  const unique = gap > 1e-12 * Math.max(Math.abs(s11), Math.abs(s12), Math.abs(s22));
  const result = { normal, t1, t2, k1: mean + gap, k2: mean - gap, direction1, direction2, unique };
  finite([result.k1, result.k2, ...direction1, ...direction2]);
  return result;
}

/** direction 是参数增量 (du,dv)，分母消除速度；返回有符号法曲率。 */
export function normalCurvature(d: SurfaceJet, direction: Vec2): number | null {
  finite(direction);
  const frame = principalCurvatures(d);
  if (!frame) return null;
  const [u, v] = direction;
  const tangent = d.du.map((x, i) => u * x + v * d.dv[i]);
  const speedSquared = dot(tangent, tangent);
  if (!speedSquared) return null;
  const second = d.duu.map((x, i) => u * u * x + 2 * u * v * d.duv[i] + v * v * d.dvv[i]);
  return dot(frame.normal, second) / speedSquared;
}
