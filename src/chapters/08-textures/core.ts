import { finite, clamp, mix } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { inverse } from '../../math/matrix.ts';
import type { Matrix } from '../../math/matrix.ts';
import { barycentric } from '../04-barycentric/core.ts';
import type { Triangle2 } from '../04-barycentric/core.ts';

/** 线性 RGB；第 0 行在顶部。材质 UV 的 v 则向上。 */
export type Texture = { width: number; height: number; data: Float64Array };
export function texture(
  width: number,
  height: number,
  pixel: (col: number, row: number) => Vec3,
): Texture {
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 4096))
    throw new RangeError('纹理尺寸须为 1 至 4096');
  const data = new Float64Array(width * height * 3);
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) data.set(pixel(col, row), 3 * (row * width + col));
  return { width, height, data };
}
export function texel(image: Texture, col: number, row: number): Vec3 {
  const i = 3 * (clamp(row, 0, image.height - 1) * image.width + clamp(col, 0, image.width - 1));
  return [image.data[i], image.data[i + 1], image.data[i + 2]];
}
export function perspectiveInterpolate(
  weights: number[],
  attributes: number[][],
  inverseW: number[],
): number[] {
  if (
    !attributes.length ||
    weights.length !== attributes.length ||
    inverseW.length !== weights.length ||
    attributes.some((a) => a.length !== attributes[0].length)
  )
    throw new RangeError('权重与属性维数不匹配');
  finite([...weights, ...attributes.flat(), ...inverseW]);
  if (inverseW.some((w) => w <= 0)) throw new RangeError('必须先裁剪到正 w');
  const denominator = weights.reduce((s, w, i) => s + w * inverseW[i], 0);
  if (denominator <= 0) throw new RangeError('透视插值分母必须为正');
  return attributes[0].map(
    (_, c) => weights.reduce((s, w, i) => s + w * inverseW[i] * attributes[i][c], 0) / denominator,
  );
}
export function bilinearTaps(uv: Vec2, width: number, height: number) {
  finite(uv);
  const x = clamp(uv[0]) * width - 0.5,
    y = (1 - clamp(uv[1])) * height - 0.5,
    x0 = Math.floor(x),
    y0 = Math.floor(y),
    s = x - x0,
    t = y - y0;
  return {
    cols: [x0, x0 + 1, x0, x0 + 1].map((x) => clamp(x, 0, width - 1)),
    rows: [y0, y0, y0 + 1, y0 + 1].map((y) => clamp(y, 0, height - 1)),
    weights: [(1 - s) * (1 - t), s * (1 - t), (1 - s) * t, s * t],
  };
}
/** 最近邻的数组地址，返回 [列, 行]；材质 v 向上，数组行号向下。 */
export function nearestTexelIndex(uv: Vec2, width: number, height: number): Vec2 {
  const col = Math.min(width - 1, Math.floor(clamp(uv[0]) * width));
  const row = Math.min(height - 1, Math.floor((1 - clamp(uv[1])) * height));
  return [col, row];
}
export function sampleTexture(
  image: Texture,
  uv: Vec2,
  filtering: 'nearest' | 'bilinear' = 'bilinear',
): Vec3 {
  if (filtering === 'nearest')
    return texel(image, ...nearestTexelIndex(uv, image.width, image.height));
  const { cols, rows, weights } = bilinearTaps(uv, image.width, image.height),
    result = [0, 0, 0] as Vec3;
  weights.forEach((w, i) => texel(image, cols[i], rows[i]).forEach((c, j) => (result[j] += c * w)));
  return result;
}
export function checkerTexture(size = 64, frequency = 8): Texture {
  if (!Number.isInteger(frequency) || frequency < 1) throw new RangeError('格子数须为正整数');
  return texture(size, size, (x, y) =>
    (Math.floor(((x + 0.5) / size) * frequency) + Math.floor(((y + 0.5) / size) * frequency)) %
      2 ===
    0
      ? [0.92, 0.88, 0.73]
      : [0.022, 0.09, 0.065],
  );
}
/** 等面积区域平均：奇数尺寸的边缘也参与计算，保留全图均值。 */
export function areaReduceAxis(image: Texture, count: number, axis: 0 | 1): Texture {
  const original = axis === 0 ? image.width : image.height;
  if (!Number.isInteger(count) || count < 1 || count > original)
    throw new RangeError('缩减尺寸非法');
  const factor = original / count;
  return texture(axis === 0 ? count : image.width, axis === 1 ? count : image.height, (x, y) => {
    const low = (axis === 0 ? x : y) * factor,
      high = low + factor,
      result = [0, 0, 0] as Vec3;
    for (let i = Math.floor(low); i < Math.ceil(high); i++) {
      const weight = Math.max(0, Math.min(high, i + 1) - Math.max(low, i)) / factor;
      texel(image, axis === 0 ? i : x, axis === 1 ? i : y).forEach(
        (c, j) => (result[j] += weight * c),
      );
    }
    return result;
  });
}
export function buildMipmaps(image: Texture): Texture[] {
  const levels = [image];
  while (Math.max(image.width, image.height) > 1) {
    image = areaReduceAxis(
      areaReduceAxis(image, Math.max(1, Math.floor(image.width / 2)), 0),
      Math.max(1, Math.floor(image.height / 2)),
      1,
    );
    levels.push(image);
  }
  return levels;
}
export function barycentricGradients(screen: Triangle2): Vec2[] {
  const inv = inverse(screen.map((p) => [...p, 1]));
  return [0, 1, 2].map((i) => [inv[0][i], inv[1][i]]);
}
export function perspectiveJacobian(
  weights: Vec3,
  screen: Triangle2,
  uv: Vec2[],
  inverseW: Vec3,
): Matrix {
  const value = perspectiveInterpolate(weights, uv, inverseW),
    grad = barycentricGradients(screen),
    q = weights.reduce((s, w, i) => s + w * inverseW[i], 0);
  return [0, 1].map((c) =>
    [0, 1].map((axis) => {
      const dq = inverseW.reduce((s, w, i) => s + w * grad[i][axis], 0),
        dn = inverseW.reduce((s, w, i) => s + w * uv[i][c] * grad[i][axis], 0);
      return (dn - value[c] * dq) / q;
    }),
  );
}
export function footprintMetrics(
  jacobian: Matrix,
  width: number,
  height: number,
  lodBias = 0,
  maxAnisotropy = 8,
) {
  if (jacobian.length !== 2 || jacobian.some((r) => r.length !== 2))
    throw new RangeError('需要 2×2 Jacobian');
  finite([...jacobian.flat(), width, height, lodBias]);
  if (
    width < 1 ||
    height < 1 ||
    !Number.isInteger(maxAnisotropy) ||
    maxAnisotropy < 1 ||
    maxAnisotropy > 32
  )
    throw new RangeError('足迹参数非法');
  const [[a, b], [c, d]] = jacobian.map((r, i) => r.map((x) => x * (i === 0 ? width : height)));
  const aa = a * a + b * b,
    bb = c * c + d * d,
    ab = a * c + b * d,
    delta = Math.hypot(aa - bb, 2 * ab);
  const major = Math.sqrt(Math.max(0, (aa + bb + delta) / 2));
  // 用行列式恢复短轴，避免两个接近数相减造成消去误差。
  const minor = major ? Math.abs(a * d - b * c) / major : 0,
    angle = 0.5 * Math.atan2(2 * ab, aa - bb),
    effectiveMinor = Math.max(minor, major / maxAnisotropy);
  return {
    major,
    minor,
    majorAxis: [Math.cos(angle), Math.sin(angle)] as Vec2,
    anisotropy: major / Math.max(minor, 1e-12),
    lodIsotropic: Math.max(0, Math.log2(Math.max(major, 1e-12)) + lodBias),
    lodAnisotropic: Math.max(0, Math.log2(Math.max(effectiveMinor, 1e-12)) + lodBias),
    tapCount: clamp(Math.ceil(major / Math.max(effectiveMinor, 1)), 1, maxAnisotropy),
  };
}
export function sampleTrilinear(levels: Texture[], uv: Vec2, lod: number): Vec3 {
  finite([lod]);
  if (!levels.length) throw new RangeError('Mip 链不能为空');
  const level = clamp(lod, 0, levels.length - 1),
    low = Math.floor(level);
  return mix(
    sampleTexture(levels[low], uv),
    sampleTexture(levels[Math.min(low + 1, levels.length - 1)], uv),
    level - low,
  ) as Vec3;
}
export function sampleAnisotropic(
  levels: Texture[],
  uv: Vec2,
  jacobian: Matrix,
  lodBias = 0,
  maxAnisotropy = 8,
): Vec3 {
  const m = footprintMetrics(jacobian, levels[0].width, levels[0].height, lodBias, maxAnisotropy),
    result = [0, 0, 0] as Vec3;
  for (let i = 0; i < m.tapCount; i++) {
    const t = (i + 0.5) / m.tapCount - 0.5,
      at = uv.map(
        (x, j) =>
          x + (t * m.major * m.majorAxis[j]) / (j === 0 ? levels[0].width : levels[0].height),
      ) as Vec2;
    sampleTrilinear(levels, at, m.lodAnisotropic).forEach((x, j) => (result[j] += x / m.tapCount));
  }
  return result;
}

/** 像素四角在同一平面延拓上的 UV。跨越 q=0 时不存在有界足迹。 */
export function pixelFootprint(
  screen: Triangle2,
  uv: Vec2[],
  inverseW: Vec3,
  x: number,
  y: number,
): Vec2[] {
  const corners: Vec2[] = [
    [x - 0.5, y - 0.5],
    [x + 0.5, y - 0.5],
    [x + 0.5, y + 0.5],
    [x - 0.5, y + 0.5],
  ];
  return corners.map((p) => perspectiveInterpolate(barycentric(p, screen), uv, inverseW) as Vec2);
}
