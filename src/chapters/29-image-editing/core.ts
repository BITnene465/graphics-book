import type { RGBImage } from '../../math/image.ts';
import type { Vec2 } from '../../math/vector.ts';
/** 采用正号网格 Laplacian；已知边界直接保留目标颜色。 */
export function poissonBlend(
  source: RGBImage,
  target: RGBImage,
  mask: boolean[],
  steps: number,
  mixed = false,
) {
  const { width: w, height: h } = target,
    output = new Float64Array(target.data),
    rhs = new Float64Array(output.length),
    neighbors = (i: number) => [i - 1, i + 1, i - w, i + w];
  if (source.width !== w || source.height !== h || mask.length !== w * h)
    throw new RangeError('图像与掩膜尺寸不匹配');
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      for (const j of neighbors(i))
        for (let c = 0; c < 3; c++) {
          const s = source.data[3 * i + c] - source.data[3 * j + c],
            t = target.data[3 * i + c] - target.data[3 * j + c];
          rhs[3 * i + c] += mixed && Math.abs(t) > Math.abs(s) ? t : s;
        }
    }
  for (let k = 0; k < steps; k++)
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (mask[i])
          for (let c = 0; c < 3; c++)
            output[3 * i + c] =
              (rhs[3 * i + c] + neighbors(i).reduce((s, j) => s + output[3 * j + c], 0)) / 4;
      }
  let residual = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i])
        for (let c = 0; c < 3; c++)
          residual = Math.max(
            residual,
            Math.abs(
              4 * output[3 * i + c] -
                neighbors(i).reduce((s, j) => s + output[3 * j + c], 0) -
                rhs[3 * i + c],
            ),
          );
    }
  return { image: { width: w, height: h, data: output }, residual };
}
export function matchMoments(values: number[], mean: number, std: number): number[] {
  const oldMean = values.reduce((s, x) => s + x, 0) / values.length,
    oldStd = Math.sqrt(values.reduce((s, x) => s + (x - oldMean) ** 2, 0) / values.length);
  return values.map((x) => (oldStd > 1e-12 ? mean + ((x - oldMean) * std) / oldStd : mean));
}
/** 凸多边形内的均值坐标；边界处单独处理以免 tan(θ/2) 发散。 */
export function meanValueWeights(p: Vec2, polygon: Vec2[]): number[] {
  const r = polygon.map((v) => [v[0] - p[0], v[1] - p[1]]),
    length = r.map((v) => Math.hypot(...v)),
    n = r.length;
  const hit = length.findIndex((x) => x < 1e-10);
  if (hit >= 0) return r.map((_, i) => Number(i === hit));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n,
      cross = r[i][0] * r[j][1] - r[i][1] * r[j][0],
      dot = r[i][0] * r[j][0] + r[i][1] * r[j][1];
    if (Math.abs(cross) < 1e-10 && dot <= 0) {
      const w = Array(n).fill(0);
      w[i] = length[j] / (length[i] + length[j]);
      w[j] = 1 - w[i];
      return w;
    }
  }
  const half = r.map((v, i) => {
    const j = (i + 1) % n,
      cross = v[0] * r[j][1] - v[1] * r[j][0],
      den = length[i] * length[j] + v[0] * r[j][0] + v[1] * r[j][1];
    return cross / Math.max(1e-14, den);
  });
  const w = length.map((v, i) => (half[(i + n - 1) % n] + half[i]) / v),
    sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}
