import type { Vec2 } from '../../math/vector.ts';
import { random } from '../../math/vector.ts';
export function rewrite(axiom: string, rules: Record<string, string>, iterations: number): string {
  if (iterations < 0 || iterations > 8 || !Number.isInteger(iterations))
    throw new RangeError('迭代层数无效');
  let text = axiom;
  for (let i = 0; i < iterations; i++) {
    text = [...text].map((c) => rules[c] ?? c).join('');
    if (text.length > 200000) throw new RangeError('符号数超限');
  }
  return text;
}
export function turtle(text: string, angle: number, length: number): Vec2[][] {
  let p: Vec2 = [0, 0],
    heading = Math.PI / 2;
  const stack: { p: Vec2; heading: number }[] = [],
    lines: Vec2[][] = [];
  for (const symbol of text) {
    if (symbol === 'F') {
      const q: Vec2 = [p[0] + length * Math.cos(heading), p[1] + length * Math.sin(heading)];
      lines.push([p, q]);
      p = q;
    } else if (symbol === '+') heading += angle;
    else if (symbol === '-') heading -= angle;
    else if (symbol === '[') stack.push({ p: [...p], heading });
    else if (symbol === ']') {
      const state = stack.pop();
      if (!state) throw new RangeError('括号不匹配');
      p = state.p;
      heading = state.heading;
    }
  }
  if (stack.length) throw new RangeError('括号不匹配');
  return lines;
}
/** 一维中点位移截面；每一级幅值按 2^(−H) 衰减。 */
export function midpointDisplacement(levels: number, roughness: number, seed: number): Vec2[] {
  if (levels < 0 || levels > 10 || roughness <= 0) throw new RangeError('分形参数无效');
  const rng = random(seed);
  let points: Vec2[] = [
    [0, 0],
    [1, 0],
  ];
  for (let k = 0; k < levels; k++) {
    const next: Vec2[] = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1];
      next.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + (rng() - 0.5) * 2 ** (-roughness * k)], b);
    }
    points = next;
  }
  return points;
}
