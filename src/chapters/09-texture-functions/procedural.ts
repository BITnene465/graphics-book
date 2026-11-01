import { finite, clamp } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';

function point(p: Vec2 | Vec3, bound = 2 ** 20): void {
  finite(p);
  if (p.some((x) => Math.abs(x) > bound)) throw new RangeError('坐标超出可重复格点范围');
}
/** Math.imul 显式执行 32 位乘法，与浮点乘法截断不同。 */
export function latticeHash(corner: Vec2 | Vec3, seed = 0): number {
  point(corner, 2 ** 20 + 1);
  if (
    corner.some((x) => !Number.isInteger(x)) ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed >= 2 ** 32
  )
    throw new RangeError('格点与种子须为整数');
  let hash = seed | 0;
  const salts = [0x9e3779b9, 0x85ebca77, 0xc2b2ae3d];
  corner.forEach((x, i) => (hash ^= Math.imul(x, salts[i])));
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 2 ** 32;
}
export function fade(s: number): number {
  finite([s]);
  if (s < 0 || s > 1) throw new RangeError('格内坐标须在 [0,1]');
  return clamp(s * s * s * (s * (6 * s - 15) + 10));
}
export function noiseProbe(p: Vec2 | Vec3, seed = 0) {
  point(p);
  const cell = p.map(Math.floor),
    fraction = p.map((x, i) => x - cell[i]),
    eased = fraction.map(fade),
    corners: number[][] = [],
    weights: number[] = [],
    cornerValues: number[] = [];
  for (let mask = 0; mask < 2 ** p.length; mask++) {
    const bits = p.map((_, i) => (mask >> (p.length - i - 1)) & 1),
      corner = bits.map((b, i) => cell[i] + b);
    corners.push(corner);
    cornerValues.push(latticeHash(corner as Vec2 | Vec3, seed));
    weights.push(bits.reduce((w, b, i) => w * (b ? eased[i] : 1 - eased[i]), 1));
  }
  return {
    cell,
    fraction,
    eased,
    corners,
    weights,
    cornerValues,
    value: weights.reduce((s, w, i) => s + w * cornerValues[i], 0),
  };
}
export const valueNoise = (p: Vec2 | Vec3, seed = 0): number => noiseProbe(p, seed).value;
export function fbmParts(p: Vec2 | Vec3, octaves = 4, gain = 0.5, lacunarity = 2, seed = 0) {
  point(p);
  finite([gain, lacunarity]);
  if (
    !Number.isInteger(octaves) ||
    octaves < 1 ||
    octaves > 8 ||
    gain < 0 ||
    gain > 1 ||
    lacunarity < 1 ||
    lacunarity > 4
  )
    throw new RangeError('fBm 参数非法');
  const frequencies = Array.from({ length: octaves }, (_, i) => lacunarity ** i),
    amplitudes = frequencies.map((_, i) => gain ** i),
    total = amplitudes.reduce((a, b) => a + b, 0),
    weights = amplitudes.map((x) => x / total),
    layers = frequencies.map((f) => valueNoise(p.map((x) => x * f) as Vec2 | Vec3, seed));
  return {
    frequencies,
    amplitudes,
    weights,
    layers,
    value: layers.reduce((s, x, i) => s + x * weights[i], 0),
  };
}
export const fbm = (p: Vec2 | Vec3, octaves = 4, gain = 0.5, lacunarity = 2, seed = 0): number =>
  fbmParts(p, octaves, gain, lacunarity, seed).value;
