import { clamp } from './vector.ts';
export type RGBImage = { width: number; height: number; data: Float64Array };
/** 行号向下，RGB 始终线性；函数接收归一化像素中心。 */
export function makeImage(
  width: number,
  height: number,
  f: (u: number, v: number) => number[],
): RGBImage {
  const data = new Float64Array(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const c = f((x + 0.5) / width, (y + 0.5) / height);
      for (let k = 0; k < 3; k++) data[3 * (y * width + x) + k] = c[k];
    }
  return { width, height, data };
}
export function sample(image: RGBImage, x: number, y: number): number[] {
  x = clamp(x, 0, image.width - 1);
  y = clamp(y, 0, image.height - 1);
  const a = Math.floor(x),
    b = Math.floor(y),
    u = x - a,
    v = y - b;
  return [0, 1, 2].map((c) => {
    const get = (i: number, j: number) =>
      image.data[
        3 * (Math.min(image.height - 1, j) * image.width + Math.min(image.width - 1, i)) + c
      ];
    return (
      (1 - v) * ((1 - u) * get(a, b) + u * get(a + 1, b)) +
      v * ((1 - u) * get(a, b + 1) + u * get(a + 1, b + 1))
    );
  });
}
export function luminance(image: RGBImage): number[] {
  return Array.from(
    { length: image.width * image.height },
    (_, i) =>
      0.2126 * image.data[3 * i] + 0.7152 * image.data[3 * i + 1] + 0.0722 * image.data[3 * i + 2],
  );
}
/** 自绘的解析图案，所有输入可重复生成，不依赖外部图片。 */
export function illustration(width = 80, height = 56): RGBImage {
  return makeImage(width, height, (u, v) => {
    if (Math.hypot((u - 0.72) * 1.4, v - 0.25) < 0.12) return [0.95, 0.48, 0.12];
    if (Math.abs(u - 0.35) < 0.035 && v > 0.33 && v < 0.85) return [0.12, 0.18, 0.23];
    if (Math.hypot((u - 0.35) * 1.1, v - 0.4) < 0.18) return [0.08, 0.38, 0.24];
    const ridge = 0.67 + 0.09 * Math.sin(9 * u) + 0.03 * Math.cos(23 * u);
    if (v > ridge) return [0.13 + 0.1 * u, 0.28 + 0.12 * u, 0.18];
    return [0.3 + 0.18 * v, 0.5 + 0.18 * v, 0.7 + 0.13 * v];
  });
}
