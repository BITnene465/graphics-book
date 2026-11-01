import type { RGBImage } from '../../math/image.ts';
import { random } from '../../math/vector.ts';
export const bayerChannel = (x: number, y: number) =>
  y % 2 === 0 ? (x % 2 === 0 ? 0 : 1) : x % 2 === 0 ? 1 : 2;
export function mosaic(image: RGBImage): number[] {
  return Array.from(
    { length: image.width * image.height },
    (_, i) => image.data[3 * i + bayerChannel(i % image.width, Math.floor(i / image.width))],
  );
}
/** RGGB 双线性去马赛克：已观测通道保持，缺失通道取相邻同色位置。 */
export function demosaic(raw: number[], width: number, height: number): RGBImage {
  const data = new Float64Array(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 3; c++) {
        if (bayerChannel(x, y) === c) {
          data[3 * (y * width + x) + c] = raw[y * width + x];
          continue;
        }
        let sum = 0,
          weight = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (xx < 0 || xx >= width || yy < 0 || yy >= height || bayerChannel(xx, yy) !== c)
              continue;
            const w = 1 / Math.max(1, Math.abs(dx) + Math.abs(dy));
            sum += w * raw[yy * width + xx];
            weight += w;
          }
        data[3 * (y * width + x) + c] = weight ? sum / weight : 0;
      }
  return { width, height, data };
}
function normal(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());
}
/** 低计数使用 Poisson，较大计数使用明确的正态近似。 */
export function sensorSamples(
  mean: number,
  readNoise: number,
  count: number,
  seed: number,
): number[] {
  const rng = random(seed);
  return Array.from({ length: count }, () => {
    let photons = 0;
    if (mean < 40) {
      const limit = Math.exp(-mean);
      let product = 1;
      do {
        photons++;
        product *= rng();
      } while (product > limit);
      photons--;
    } else photons = Math.max(0, Math.round(mean + Math.sqrt(mean) * normal(rng)));
    return photons + readNoise * normal(rng);
  });
}
export const toneMap = (linear: number) => Math.max(0, linear) / (1 + Math.max(0, linear));
