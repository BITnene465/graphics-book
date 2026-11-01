/** 普通数组表示向量；计算使用 JavaScript 的双精度 Number。 */
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

export function finite(values: readonly number[], message = '数值必须有限'): void {
  if (!values.every(Number.isFinite)) throw new RangeError(message);
}

export function clamp(x: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, x));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function add(a: readonly number[], b: readonly number[]): number[] {
  if (a.length !== b.length) throw new RangeError('向量维数必须相同');
  return a.map((x, i) => x + b[i]);
}

export function sub(a: readonly number[], b: readonly number[]): number[] {
  if (a.length !== b.length) throw new RangeError('向量维数必须相同');
  return a.map((x, i) => x - b[i]);
}

export function scale(a: readonly number[], factor: number): number[] {
  return a.map((x) => x * factor);
}

export function dot(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new RangeError('向量维数必须相同');
  return a.reduce((sum, x, i) => sum + x * b[i], 0);
}

export function cross(a: readonly number[], b: readonly number[]): Vec3 {
  if (a.length !== 3 || b.length !== 3) throw new RangeError('叉积需要两个三维向量');
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function length(a: readonly number[]): number {
  return Math.hypot(...a);
}

export function normalize(a: readonly number[]): number[] {
  finite(a);
  const norm = length(a);
  if (norm <= 1e-12) throw new RangeError('零向量或过小的向量不能定义方向');
  return scale(a, 1 / norm);
}

export function mix(a: readonly number[], b: readonly number[], t: number): number[] {
  if (a.length !== b.length) throw new RangeError('插值向量维数必须相同');
  return a.map((x, i) => lerp(x, b[i], t));
}

export const radians = (degrees: number): number => (degrees * Math.PI) / 180;
export const degrees = (radians: number): number => (radians * 180) / Math.PI;

/** 可复现的随机数：让抖动采样、噪声与测试使用同一随机序列。 */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
