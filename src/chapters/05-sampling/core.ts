import { finite, clamp, random, radians, mix } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { linearToSrgb, srgbToLinear } from '../01-pixels/core.ts';

export function sampleOffsets(
  count: number,
  strategy: 'grid' | 'jitter' = 'grid',
  seed = 7,
): Vec2[] {
  const n = Math.sqrt(count),
    rng = random(seed);
  if (!Number.isInteger(n) || n < 1 || n > 16) throw new RangeError('样本数须为平方数，最多 256');
  return Array.from({ length: count }, (_, i) => [
    ((i % n) + (strategy === 'grid' ? 0.5 : rng())) / n,
    (Math.floor(i / n) + (strategy === 'grid' ? 0.5 : rng())) / n,
  ]);
}
export type SampleScene = {
  scene?: 'line' | 'edge' | 'checker';
  phase?: number;
  angle?: number;
  width?: number;
  cell?: number;
};
export function sceneValue(
  xy: Vec2,
  { scene = 'line', phase = 0, angle = 35, width = 0.6, cell = 1.4 }: SampleScene = {},
): number {
  finite([...xy, phase, angle, width, cell]);
  if (width <= 0 || cell <= 0) throw new RangeError('线宽与格宽须为正');
  const a = radians(angle),
    u = Math.cos(a) * xy[0] + Math.sin(a) * xy[1] - phase,
    v = -Math.sin(a) * xy[0] + Math.cos(a) * xy[1] - 0.7 * phase;
  if (scene === 'edge') return Number(u <= 0);
  if (scene === 'line') return Number(Math.abs(u) <= width / 2);
  return (((Math.floor(u / cell) + Math.floor(v / cell)) % 2) + 2) % 2;
}
export function sampleCoverage(
  size = 40,
  count = 16,
  strategy: 'grid' | 'jitter' = 'grid',
  scene: SampleScene = {},
): Float64Array {
  if (!Number.isInteger(size) || size < 1 || size > 2048) throw new RangeError('非法图像尺寸');
  const offsets = sampleOffsets(count, strategy);
  return Float64Array.from(
    { length: size * size },
    (_, i) =>
      offsets.reduce(
        (s, [x, y]) =>
          s +
          sceneValue(
            [(i % size) - size / 2 + x, size - 1 - Math.floor(i / size) - size / 2 + y],
            scene,
          ),
        0,
      ) / count,
  );
}
/** 单位像素盒中 n·p ≤ threshold 的精确面积，不依赖采样数。 */
export function halfplaneCoverage(center: Vec2, normal: Vec2, threshold: number): number {
  finite([...center, ...normal, threshold]);
  const [a, b] = normal.map(Math.abs).sort((a, b) => a - b);
  if (b === 0) throw new RangeError('半平面需要非零法向量');
  const s = threshold - center[0] * normal[0] - center[1] * normal[1] + (a + b) / 2;
  if (a === 0) return clamp(s / b);
  const z = clamp(s, 0, a + b),
    tail = Math.min(z, a + b - z, a),
    cap = 0.5 * (tail / a) * (tail / b);
  return clamp(z < a ? cap : z > b ? 1 - cap : (z - a / 2) / b);
}
export function exactCoverage(
  size = 40,
  { scene = 'line', phase = 0, angle = 35, width = 0.6 }: SampleScene = {},
): Float64Array {
  if (scene === 'checker') throw new RangeError('棋盘没有在此实现解析参考');
  const theta = radians(angle),
    n: Vec2 = [Math.cos(theta), Math.sin(theta)];
  return Float64Array.from({ length: size * size }, (_, i) => {
    const center: Vec2 = [(i % size) + 0.5 - size / 2, size / 2 - Math.floor(i / size) - 0.5];
    return scene === 'edge'
      ? halfplaneCoverage(center, n, phase)
      : clamp(
          halfplaneCoverage(center, n, phase + width / 2) -
            halfplaneCoverage(center, n, phase - width / 2),
        );
  });
}
export function averageColor(
  coverage: number,
  foreground: Vec3 = [0.03, 0.32, 0.14],
  background: Vec3 = [0.9, 0.9, 0.9],
  wrongSpace = false,
): Vec3 {
  if (wrongSpace)
    return mix(background.map(linearToSrgb), foreground.map(linearToSrgb), coverage).map(
      srgbToLinear,
    ) as Vec3;
  return mix(background, foreground, coverage) as Vec3;
}
export function aliasFrequency(frequency: number, sampleRate: number): number {
  finite([frequency, sampleRate]);
  if (sampleRate <= 0) throw new RangeError('采样率须为正');
  return ((((frequency + sampleRate / 2) % sampleRate) + sampleRate) % sampleRate) - sampleRate / 2;
}
export function sinc(x: number): number {
  return Math.abs(x) < 1e-8 ? 1 - (Math.PI * x) ** 2 / 6 : Math.sin(Math.PI * x) / (Math.PI * x);
}
export function boxResponse(frequency: number, halfWidth: number): number {
  finite([frequency, halfWidth]);
  if (halfWidth < 0) throw new RangeError('盒核半宽不能为负');
  return sinc(2 * halfWidth * frequency);
}
export function prefilteredCosine(
  x: number,
  frequency: number,
  halfWidth: number,
  phase = 0,
  mean = 0.5,
  amplitude = 0.45,
): number {
  return (
    mean +
    amplitude * boxResponse(frequency, halfWidth) * Math.cos(2 * Math.PI * frequency * x + phase)
  );
}
export function cosineWindowIntegral(
  center: number,
  halfWidth: number,
  frequency: number,
  phase = 0,
  progress = 1,
  mean = 0.5,
  amplitude = 0.45,
): number {
  if (halfWidth <= 0 || progress < 0 || progress > 1) throw new RangeError('积分窗及进度非法');
  const width = 2 * halfWidth * progress;
  return (
    width *
    prefilteredCosine(center - halfWidth + width / 2, frequency, width / 2, phase, mean, amplitude)
  );
}
/** 解析 δ 谱线；复系数先相加，再计算幅度，才能处理 Nyquist 重叠。 */
export function cosineSpectralLines(
  frequency: number,
  phase = 0,
  sampleRate: number | null = null,
  extent = 16,
) {
  finite([frequency, phase, extent]);
  if (frequency < 0 || extent <= 0 || (sampleRate !== null && sampleRate <= 0))
    throw new RangeError('频谱参数非法');
  const entries: { position: number; real: number; imaginary: number }[] = [];
  for (const sign of [-1, 1]) {
    const p = sign * frequency,
      first = sampleRate === null ? 0 : Math.ceil((-extent - p) / sampleRate),
      last = sampleRate === null ? 0 : Math.floor((extent - p) / sampleRate);
    for (let k = first; k <= last; k++)
      entries.push({
        position: p + k * (sampleRate ?? 0),
        real: 0.5 * Math.cos(phase),
        imaginary: sign * 0.5 * Math.sin(phase),
      });
  }
  const merged: typeof entries = [];
  for (const item of entries.sort((a, b) => a.position - b.position)) {
    const previous = merged.at(-1);
    if (previous && Math.abs(previous.position - item.position) < 1e-10) {
      previous.real += item.real;
      previous.imaginary += item.imaginary;
    } else merged.push({ ...item });
  }
  return merged.map((p) => ({ ...p, magnitude: Math.hypot(p.real, p.imaginary) }));
}
