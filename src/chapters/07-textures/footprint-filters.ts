import { clamp, finite, radians } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { areaReduceAxis, bilinearTaps, sampleTexture } from './core.ts';
import type { Texture } from './core.ts';

export function buildRipmap(image: Texture): Texture[][] {
  const horizontal = [image];
  while (image.width > 1) {
    image = areaReduceAxis(image, Math.max(1, Math.floor(image.width / 2)), 0);
    horizontal.push(image);
  }
  const grid = [horizontal];
  while (grid.at(-1)![0].height > 1) {
    const previous = grid.at(-1)!;
    grid.push(previous.map((t) => areaReduceAxis(t, Math.max(1, Math.floor(t.height / 2)), 1)));
  }
  return grid;
}
export function ripmapProbe(grid: Texture[][], uv: Vec2, lodXY: Vec2) {
  finite([...uv, ...lodXY]);
  const maximum = [grid[0].length - 1, grid.length - 1],
    lod = lodXY.map((v, i) => clamp(v, 0, maximum[i])),
    low = lod.map(Math.floor),
    fraction = lod.map((x, i) => x - low[i]);
  const color = [0, 0, 0] as Vec3,
    queries = [];
  for (const dy of [0, 1])
    for (const dx of [0, 1]) {
      const lx = Math.min(low[0] + dx, maximum[0]),
        ly = Math.min(low[1] + dy, maximum[1]),
        weight = (dx ? fraction[0] : 1 - fraction[0]) * (dy ? fraction[1] : 1 - fraction[1]);
      const image = grid[ly][lx],
        value = sampleTexture(image, uv);
      value.forEach((v, i) => (color[i] += v * weight));
      queries.push({
        level: [lx, ly],
        weight,
        color: value,
        ...bilinearTaps(uv, image.width, image.height),
      });
    }
  return { color, lod, queries };
}
export const sampleRipmap = (grid: Texture[][], uv: Vec2, lod: Vec2): Vec3 =>
  ripmapProbe(grid, uv, lod).color;

function axisWeights(count: number, coordinate: number, lod: number): number[] {
  const levels = [
    Array.from({ length: count }, (_, i) =>
      Array.from({ length: count }, (_, j) => Number(i === j)),
    ),
  ];
  while (levels.at(-1)!.length > 1) {
    const previous = levels.at(-1)!,
      size = Math.max(1, Math.floor(previous.length / 2)),
      scale = previous.length / size;
    levels.push(
      Array.from({ length: size }, (_, r) =>
        Array.from({ length: count }, (_, c) => {
          let sum = 0;
          for (let i = Math.floor(r * scale); i < Math.ceil((r + 1) * scale); i++)
            sum +=
              ((previous[i]?.[c] ?? 0) *
                Math.max(0, Math.min((r + 1) * scale, i + 1) - Math.max(r * scale, i))) /
              scale;
          return sum;
        }),
      ),
    );
  }
  const level = clamp(lod, 0, levels.length - 1),
    low = Math.floor(level),
    result = Array(count).fill(0);
  for (const [l, weight] of [
    [low, 1 - (level - low)],
    [Math.min(low + 1, levels.length - 1), level - low],
  ]) {
    const x = coordinate * levels[l].length - 0.5,
      left = Math.floor(x),
      t = x - left;
    for (const [index, w] of [
      [left, 1 - t],
      [left + 1, t],
    ])
      levels[l][clamp(index, 0, levels[l].length - 1)].forEach(
        (v, i) => (result[i] += weight * w * v),
      );
  }
  return result;
}
export function ripmapWeights(width: number, height: number, uv: Vec2, lod: Vec2): Float64Array {
  const wx = axisWeights(width, uv[0], lod[0]),
    wy = axisWeights(height, 1 - uv[1], lod[1]);
  return Float64Array.from(
    { length: width * height },
    (_, i) => wx[i % width] * wy[Math.floor(i / width)],
  );
}
export function ellipseAxes(axisA: number, axisB: number, angle: number) {
  finite([axisA, axisB, angle]);
  if (Math.min(axisA, axisB) < 0 || Math.max(axisA, axisB) > 256)
    throw new RangeError('两轴跨度须为 0 至 256');
  const theta = radians(angle),
    c = Math.cos(theta),
    s = Math.sin(theta),
    a = (axisA / 2) ** 2,
    b = (axisB / 2) ** 2;
  const shape = [
      [c * c * a + s * s * b, c * s * (a - b)],
      [c * s * (a - b), s * s * a + c * c * b],
    ],
    spans = [2 * Math.sqrt(shape[0][0]), 2 * Math.sqrt(shape[1][1])];
  return {
    rotation: [
      [c, -s],
      [s, c],
    ],
    shape,
    spans,
    lodXY: spans.map((x) => Math.log2(Math.max(x, 1))) as Vec2,
  };
}
/** 截断 Gaussian 的离散参考求和；不是完整 GPU EWA 实现。 */
export function ellipseFilter(image: Texture, uv: Vec2, axisA: number, axisB: number, angle = 0) {
  const axes = ellipseAxes(axisA, axisB, angle),
    weights = new Float64Array(image.width * image.height),
    center = [uv[0] * image.width - 0.5, uv[1] * image.height - 0.5];
  const [[c, minusS], [s]] = axes.rotation;
  let count = 0,
    mass = 0;
  if (Math.min(axisA, axisB) > 0)
    for (
      let y = Math.ceil(center[1] - axes.spans[1] / 2);
      y <= Math.floor(center[1] + axes.spans[1] / 2);
      y++
    )
      for (
        let x = Math.ceil(center[0] - axes.spans[0] / 2);
        x <= Math.floor(center[0] + axes.spans[0] / 2);
        x++
      ) {
        const dx = x - center[0],
          dy = y - center[1],
          r2 = ((c * dx + s * dy) / (axisA / 2)) ** 2 + ((minusS * dx + c * dy) / (axisB / 2)) ** 2;
        if (r2 >= 1) continue;
        const w = Math.exp(-2 * r2) - Math.exp(-2);
        count++;
        mass += w;
        weights[
          (image.height - 1 - clamp(y, 0, image.height - 1)) * image.width +
            clamp(x, 0, image.width - 1)
        ] += w;
      }
  const fallback = mass <= 0;
  if (fallback) {
    const taps = bilinearTaps(uv, image.width, image.height);
    taps.weights.forEach((w, i) => (weights[taps.rows[i] * image.width + taps.cols[i]] += w));
  } else for (let i = 0; i < weights.length; i++) weights[i] /= mass;
  const color = [0, 0, 0] as Vec3;
  weights.forEach((w, i) => {
    for (let j = 0; j < 3; j++) color[j] += w * image.data[3 * i + j];
  });
  return {
    ...axes,
    color,
    weights,
    sampledCenters: count,
    uniqueTexels: weights.filter((x) => x > 0).length,
    fallback,
  };
}
