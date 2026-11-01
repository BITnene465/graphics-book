import type { Vec2, Vec3 } from '../../math/vector.ts';
import type { Triangle2 } from '../04-barycentric/core.ts';
import { triangleCoverage } from '../04-barycentric/raster.ts';

export function samplePositions(width: number, height: number, grid: number): Vec2[] {
  if (
    ![width, height, grid].every((n) => Number.isInteger(n) && n > 0) ||
    width > 1024 ||
    height > 1024 ||
    grid > 8
  )
    throw new RangeError('非法多重采样尺寸');
  return Array.from({ length: width * height * grid * grid }, (_, i) => {
    const p = Math.floor(i / (grid * grid)),
      s = i % (grid * grid);
    return [
      (p % width) + ((s % grid) + 0.5) / grid,
      height - 1 - Math.floor(p / width) + (Math.floor(s / grid) + 0.5) / grid,
    ];
  });
}
export function visibility(triangles: Triangle2[], depths: Vec3[], positions: Vec2[]) {
  if (triangles.length !== depths.length) throw new RangeError('每个三角形需要三个深度');
  const owner = new Int32Array(positions.length).fill(-1),
    depth = new Float64Array(positions.length).fill(Infinity),
    coverage: boolean[][] = [];
  triangles.forEach((triangle, id) => {
    const { covered, weights } = triangleCoverage(triangle, positions);
    coverage.push(covered);
    covered.forEach((inside, i) => {
      const z = weights[i].reduce((s, w, j) => s + w * depths[id][j], 0);
      if (inside && z < depth[i]) {
        depth[i] = z;
        owner[i] = id;
      }
    });
  });
  return { owner, depth, coverage };
}
export function shade(point: Vec2, color: Vec3, frequency = 0, phase = 0): Vec3 {
  return color.map(
    (c) => c * (0.55 + 0.45 * Math.cos(2 * Math.PI * frequency * point[0] + phase)),
  ) as Vec3;
}
export function resolve(samples: Vec3[]): Vec3 {
  if (!samples.length) throw new RangeError('不能合并空样本');
  return [0, 1, 2].map((c) => samples.reduce((s, v) => s + v[c], 0) / samples.length) as Vec3;
}
export function renderScene(
  triangles: Triangle2[],
  depths: Vec3[],
  colors: Vec3[],
  width = 48,
  height = width,
  grid = 2,
  frequency = 0,
  phase = 0,
  background: Vec3 = [0.013, 0.019, 0.029],
) {
  const positions = samplePositions(width, height, grid),
    centers = samplePositions(width, height, 1),
    multi = visibility(triangles, depths, positions),
    single = visibility(triangles, depths, centers);
  function evaluate(
    visible: ReturnType<typeof visibility>,
    at: Vec2[],
    count: number,
    share: boolean,
  ) {
    const image = new Float64Array(width * height * 3),
      sampleColors: Vec3[] = [],
      shadingPerPixel = new Int32Array(width * height);
    for (let p = 0; p < width * height; p++) {
      const cache = new Map<number, Vec3>(),
        values: Vec3[] = [];
      for (let s = 0; s < count; s++) {
        const i = p * count + s,
          id = visible.owner[i];
        let value = background;
        if (id >= 0) {
          if (share && cache.has(id)) value = cache.get(id)!;
          else {
            value = shade(share ? centers[p] : at[i], colors[id], frequency, phase);
            shadingPerPixel[p]++;
            cache.set(id, value);
          }
        }
        values.push(value);
        sampleColors.push(value);
      }
      image.set(resolve(values), p * 3);
    }
    return {
      ...visible,
      image,
      sampleColors,
      shadingPerPixel,
      shadingCount: shadingPerPixel.reduce((a, b) => a + b, 0),
    };
  }
  return {
    center: evaluate(single, centers, 1, false),
    ssaa: evaluate(multi, positions, grid * grid, false),
    msaa: evaluate(multi, positions, grid * grid, true),
    positions,
    centers,
    grid,
  };
}
