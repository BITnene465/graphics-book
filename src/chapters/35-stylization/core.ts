import type { RGBImage } from '../../math/image.ts';
import { luminance } from '../../math/image.ts';
import { clamp, random } from '../../math/vector.ts';
export function bilateral(image: RGBImage, radius: number, range: number): RGBImage {
  const { width: w, height: h, data } = image,
    out = new Float64Array(data.length),
    sigma = Math.max(0.5, radius / 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        sum = [0, 0, 0];
      let total = 0;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = clamp(x + dx, 0, w - 1),
            yy = clamp(y + dy, 0, h - 1),
            j = yy * w + xx,
            delta = [0, 1, 2].reduce((s, c) => s + (data[3 * i + c] - data[3 * j + c]) ** 2, 0),
            weight = Math.exp(
              -(dx * dx + dy * dy) / (2 * sigma * sigma) - delta / (2 * range * range),
            );
          total += weight;
          for (let c = 0; c < 3; c++) sum[c] += weight * data[3 * j + c];
        }
      for (let c = 0; c < 3; c++) out[3 * i + c] = sum[c] / total;
    }
  return { width: w, height: h, data: out };
}
export function gradient(gray: number[], w: number, h: number, x: number, y: number): number[] {
  const at = (i: number, j: number) => gray[clamp(j, 0, h - 1) * w + clamp(i, 0, w - 1)];
  return [(at(x + 1, y) - at(x - 1, y)) / 2, (at(x, y + 1) - at(x, y - 1)) / 2];
}
export function toon(image: RGBImage, levels: number, threshold: number): RGBImage {
  const gray = luminance(image),
    out = new Float64Array(image.data.length);
  gray.forEach((v, i) => {
    const g = gradient(
        gray,
        image.width,
        image.height,
        i % image.width,
        Math.floor(i / image.width),
      ),
      q = Math.round(v * (levels - 1)) / (levels - 1),
      s = Math.hypot(...g) > threshold ? 0.08 : q / Math.max(0.001, v);
    for (let c = 0; c < 3; c++) out[3 * i + c] = image.data[3 * i + c] * s;
  });
  return { ...image, data: out };
}
export function strokes(image: RGBImage, count: number, length: number, seed: number) {
  const rng = random(seed),
    gray = luminance(image);
  return Array.from({ length: count }, () => {
    const x = Math.floor(rng() * image.width),
      y = Math.floor(rng() * image.height),
      g = gradient(gray, image.width, image.height, x, y),
      angle = Math.atan2(g[1], g[0]) + Math.PI / 2;
    return {
      x,
      y,
      dx: Math.cos(angle) * length,
      dy: Math.sin(angle) * length,
      color: Array.from(image.data.slice(3 * (y * image.width + x), 3 * (y * image.width + x) + 3)),
    };
  });
}
