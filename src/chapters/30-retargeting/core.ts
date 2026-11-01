import type { RGBImage } from '../../math/image.ts';
import { luminance } from '../../math/image.ts';
export function energy(image: RGBImage, protect: number[] = []): number[] {
  const { width: w, height: h } = image,
    g = luminance(image),
    at = (x: number, y: number) =>
      g[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  return g.map((_, i) => {
    const x = i % w,
      y = Math.floor(i / w);
    return (
      Math.abs(at(x + 1, y) - at(x - 1, y)) +
      Math.abs(at(x, y + 1) - at(x, y - 1)) +
      (protect[i] ?? 0)
    );
  });
}
export function verticalSeam(
  cost: number[],
  width: number,
  height: number,
): { path: number[]; cost: number } {
  const cumulative = [...cost],
    parent = Array(cost.length).fill(-1);
  for (let y = 1; y < height; y++)
    for (let x = 0; x < width; x++) {
      const candidates = [x - 1, x, x + 1].filter((k) => k >= 0 && k < width);
      let best = candidates[0];
      for (const k of candidates)
        if (cumulative[(y - 1) * width + k] < cumulative[(y - 1) * width + best]) best = k;
      cumulative[y * width + x] += cumulative[(y - 1) * width + best];
      parent[y * width + x] = best;
    }
  let x = 0;
  for (let k = 1; k < width; k++)
    if (cumulative[(height - 1) * width + k] < cumulative[(height - 1) * width + x]) x = k;
  const total = cumulative[(height - 1) * width + x],
    path = Array(height).fill(0);
  for (let y = height - 1; y >= 0; y--) {
    path[y] = x;
    x = parent[y * width + x];
  }
  return { path, cost: total };
}
export function removeSeam(image: RGBImage, path: number[]): RGBImage {
  const { width: w, height: h } = image;
  if (w < 2 || path.length !== h) throw new RangeError('无法删除缝');
  const data = new Float64Array((w - 1) * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w - 1; x++) {
      const old = x + (x >= path[y] ? 1 : 0);
      for (let c = 0; c < 3; c++)
        data[3 * (y * (w - 1) + x) + c] = image.data[3 * (y * w + old) + c];
    }
  return { width: w - 1, height: h, data };
}
