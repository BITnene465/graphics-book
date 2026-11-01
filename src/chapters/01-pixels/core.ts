/** 数组首行在顶部；几何 y 向上。颜色混合在线性 RGB 中计算。 */
import { clamp, finite } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';

export function srgbToLinear(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new RangeError('sRGB 值必须在 [0,1] 内');
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(value: number): number {
  finite([value]);
  const c = clamp(value);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function mixColors(a: Vec3, b: Vec3, t: number, linear = true): Vec3 {
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new RangeError('混合比例必须在 [0,1] 内');
  const aLinear = a.map(srgbToLinear),
    bLinear = b.map(srgbToLinear);
  return a.map((x, i) =>
    linear ? linearToSrgb((1 - t) * aLinear[i] + t * bLinear[i]) : (1 - t) * x + t * b[i],
  ) as Vec3;
}

export function sampleOffsets(samples: number): Vec2[] {
  if (!Number.isInteger(samples) || samples < 1 || samples > 16)
    throw new RangeError('每轴样本数须为 1 至 16 的整数');
  return Array.from({ length: samples * samples }, (_, i) => [
    ((i % samples) + 0.5) / samples,
    (Math.floor(i / samples) + 0.5) / samples,
  ]);
}

export function pixelCenters(width: number, height: number): Vec2[] {
  if (![width, height].every((n) => Number.isInteger(n) && n > 0))
    throw new RangeError('分辨率须为正整数');
  return Array.from({ length: width * height }, (_, i) => [
    ((i % width) + 0.5) / width,
    1 - (Math.floor(i / width) + 0.5) / height,
  ]);
}

export function sceneColor(
  u: number,
  v: number,
  pattern: 'disk' | 'gradient' | 'corners' = 'disk',
): Vec3 {
  if (pattern === 'gradient') return [u, u, u];
  if (pattern === 'corners')
    return [Number(v >= 0.5 ? u < 0.5 : u >= 0.5), Number(u >= 0.5), Number(v < 0.5)];
  return (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.32 ** 2 ? [1, 0.22, 0.055] : [0.025, 0.065, 0.055];
}

export function renderImage(
  width: number,
  height: number,
  samples = 1,
  pattern: 'disk' | 'gradient' | 'corners' = 'disk',
): Float64Array {
  const centers = pixelCenters(width, height),
    offsets = sampleOffsets(samples);
  const image = new Float64Array(width * height * 3);
  centers.forEach(([u, v], i) => {
    for (const [dx, dy] of offsets) {
      const color = sceneColor(u + (dx - 0.5) / width, v + (dy - 0.5) / height, pattern);
      for (let c = 0; c < 3; c++) image[i * 3 + c] += color[c] / offsets.length;
    }
  });
  return image;
}

export function probePixel(x: number, y: number, width: number, height: number): Vec2 {
  finite([x, y]);
  if (x < 0 || y < 0 || x >= width || y >= height) throw new RangeError('探针不在图像内');
  return [height - 1 - Math.floor(y), Math.floor(x)];
}

/** Canvas 的像素缓冲同样首行在顶部，显示前不再翻转 y。 */
export function encodeRgba(linear: ArrayLike<number>): Uint8ClampedArray {
  if (linear.length % 3) throw new RangeError('需要完整的 RGB 三元组');
  const rgba = new Uint8ClampedArray((linear.length / 3) * 4);
  for (let i = 0; i < linear.length / 3; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(255 * linearToSrgb(linear[i * 3 + c]));
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
