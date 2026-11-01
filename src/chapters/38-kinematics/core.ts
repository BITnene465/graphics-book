import type { Vec2 } from '../../math/vector.ts';
import { clamp } from '../../math/vector.ts';
export function forward(lengths: Vec2, angles: Vec2): Vec2[] {
  const [a, b] = angles,
    [l0, l1] = lengths,
    j: Vec2 = [l0 * Math.cos(a), l0 * Math.sin(a)];
  return [[0, 0], j, [j[0] + l1 * Math.cos(a + b), j[1] + l1 * Math.sin(a + b)]];
}
export function inverse(target: Vec2, lengths: Vec2, elbow = 1) {
  const [x, y] = target,
    [a, b] = lengths,
    r2 = x * x + y * y,
    cos = clamp((r2 - a * a - b * b) / (2 * a * b), -1, 1),
    q1 = Math.sign(elbow || 1) * Math.acos(cos);
  const q0 = Math.atan2(y, x) - Math.atan2(b * Math.sin(q1), a + b * Math.cos(q1));
  return {
    angles: [q0, q1] as Vec2,
    reachable: r2 <= (a + b) ** 2 + 1e-12 && r2 >= (a - b) ** 2 - 1e-12,
  };
}
/** 两骨骼的列向量 LBS 截面：当前全局变换乘绑定全局逆变换。 */
export function skin2(p: Vec2, weight: number, length0: number, angles: Vec2): Vec2 {
  const [a, b] = angles,
    rotate = (q: Vec2, t: number): Vec2 => [
      Math.cos(t) * q[0] - Math.sin(t) * q[1],
      Math.sin(t) * q[0] + Math.cos(t) * q[1],
    ];
  const first = rotate(p, a),
    joint = rotate([length0, 0], a),
    relative = rotate([p[0] - length0, p[1]], a + b),
    second = [joint[0] + relative[0], joint[1] + relative[1]];
  return first.map((x, i) => (1 - weight) * x + weight * second[i]) as Vec2;
}
