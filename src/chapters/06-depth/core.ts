import { finite, clamp } from '../../math/vector.ts';
import type { Vec3, Vec4 } from '../../math/vector.ts';
import type { Triangle2 } from '../04-barycentric/core.ts';
import { clipTriangle, clipToScreen, rasterizeTriangle } from '../04-barycentric/raster.ts';

function volume(near: number, far: number): void {
  finite([near, far]);
  if (!(0 < near && near < far)) throw new RangeError('要求 0 < near < far');
}
export function depthFromDistance(distance: number, near: number, far: number): number {
  volume(near, far);
  finite([distance]);
  if (distance <= 0) throw new RangeError('距离必须为正');
  return far / (far - near) - (far * near) / ((far - near) * distance);
}
export function distanceFromDepth(depth: number, near: number, far: number): number {
  volume(near, far);
  finite([depth]);
  if (depth < 0 || depth > 1) throw new RangeError('深度须在 [0,1]');
  return (far * near) / (far - (far - near) * depth);
}
export function clipVertices(
  xy: Triangle2,
  distances: Vec3,
  near: number,
  far: number,
): [Vec4, Vec4, Vec4] {
  return xy.map(([x, y], i) => [
    x * distances[i],
    y * distances[i],
    (2 * depthFromDistance(distances[i], near, far) - 1) * distances[i],
    distances[i],
  ]) as [Vec4, Vec4, Vec4];
}
export function interpolateDepth(weights: number[], zNdc: number[]): number {
  return (weights.reduce((s, w, i) => s + w * zNdc[i], 0) + 1) / 2;
}
export function quantizeDepth(depth: number, bits: number | null = null): number {
  if (bits === null) return depth;
  if (!Number.isInteger(bits) || bits < 1 || bits > 32)
    throw new RangeError('定点深度位数须为 1 至 32');
  const levels = 2 ** bits - 1;
  return Math.round(depth * levels) / levels;
}
export function candidateDepths(
  triangles: [Vec4, Vec4, Vec4][],
  width: number,
  height: number,
): Float64Array[] {
  return triangles.map((triangle) => {
    const candidates = new Float64Array(width * height).fill(Infinity);
    for (const piece of clipTriangle(triangle)) {
      const screen = clipToScreen(piece.vertices, width, height);
      rasterizeTriangle(screen.xy as Triangle2, width, height, ({ row, col, weights }) => {
        const i = row * width + col;
        candidates[i] = Math.min(candidates[i], clamp(interpolateDepth(weights, screen.depth)));
      });
    }
    return candidates;
  });
}
export function render(
  triangles: [Vec4, Vec4, Vec4][],
  colors: Vec3[],
  width: number,
  height: number,
  options: { order?: number[]; method?: 'zbuffer' | 'painter'; bits?: number | null } = {},
) {
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 4096))
    throw new RangeError('非法图像尺寸');
  if (colors.length !== triangles.length) throw new RangeError('每个三角形需要一种颜色');
  let order = options.order ?? triangles.map((_, i) => i);
  if ([...order].sort((a, b) => a - b).some((x, i) => x !== i) || order.length !== triangles.length)
    throw new RangeError('提交顺序必须是索引的一个排列');
  const candidates = candidateDepths(triangles, width, height),
    stored = candidates.map((a) => a.map((x) => quantizeDepth(x, options.bits ?? null)));
  if (options.method === 'painter') {
    if (triangles.some((t) => t.some((p) => p[3] <= 0)))
      throw new RangeError('平均深度画家法要求 w>0');
    const mean = triangles.map((t) => t.reduce((s, p) => s + p[2] / p[3], 0) / 3);
    order = [...order].sort((a, b) => mean[b] - mean[a]);
  }
  const depth = new Float64Array(width * height).fill(Infinity),
    owner = new Int32Array(width * height).fill(-1),
    color = new Float64Array(width * height * 3).fill(0.94);
  for (const index of order)
    for (let i = 0; i < depth.length; i++)
      if (
        Number.isFinite(stored[index][i]) &&
        (options.method === 'painter' || stored[index][i] < depth[i])
      ) {
        depth[i] = stored[index][i];
        owner[i] = index;
        color.set(colors[index], i * 3);
      }
  return { color, depth, owner, candidates, stored, order };
}
