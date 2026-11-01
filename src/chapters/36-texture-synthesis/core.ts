import type { RGBImage } from '../../math/image.ts';
import type { Vec2 } from '../../math/vector.ts';
import { random } from '../../math/vector.ts';
import { verticalSeam } from '../30-retargeting/core.ts';
/** 横向纹理条带：候选块匹配与重叠区最小误差缝，保留完整的局部过程。 */
export function quiltStrip(
  sample: RGBImage,
  patch: number,
  overlap: number,
  blocks: number,
  seed: number,
  cut = true,
): RGBImage {
  if (overlap < 1 || overlap >= patch || patch > Math.min(sample.width, sample.height))
    throw new RangeError('纹理块尺寸无效');
  const width = patch + (blocks - 1) * (patch - overlap),
    height = patch,
    data = new Float64Array(width * height * 3),
    rng = random(seed);
  for (let block = 0; block < blocks; block++) {
    const offset = block * (patch - overlap);
    let best = { x: 0, y: 0, error: Infinity };
    for (let candidate = 0; candidate < 30; candidate++) {
      const x = Math.floor(rng() * (sample.width - patch + 1)),
        y = Math.floor(rng() * (sample.height - patch + 1));
      let error = 0;
      if (block)
        for (let row = 0; row < patch; row++)
          for (let col = 0; col < overlap; col++)
            for (let c = 0; c < 3; c++)
              error +=
                (data[3 * (row * width + offset + col) + c] -
                  sample.data[3 * ((y + row) * sample.width + x + col) + c]) **
                2;
      if (error < best.error) best = { x, y, error };
    }
    const cost = Array.from({ length: patch * overlap }, (_, i) => {
      const row = Math.floor(i / overlap),
        col = i % overlap;
      return [0, 1, 2].reduce(
        (s, c) =>
          s +
          (data[3 * (row * width + offset + col) + c] -
            sample.data[3 * ((best.y + row) * sample.width + best.x + col) + c]) **
            2,
        0,
      );
    });
    const seam =
      block && cut
        ? verticalSeam(cost, overlap, patch).path
        : Array(patch).fill(Math.floor(overlap / 2));
    for (let y = 0; y < patch; y++)
      for (let x = 0; x < patch; x++)
        if (!block || x >= overlap || x >= seam[y])
          for (let c = 0; c < 3; c++)
            data[3 * (y * width + offset + x) + c] =
              sample.data[3 * ((best.y + y) * sample.width + best.x + x) + c];
  }
  return { width, height, data };
}
export function movingStrokes(count: number, time: number, coherent: boolean, seed = 7): Vec2[] {
  const rng = random(seed + (coherent ? 0 : Math.floor(time * 15))),
    angle = time * 0.6;
  return Array.from({ length: count }, () => {
    const r = Math.sqrt(rng()),
      a = 2 * Math.PI * rng(),
      x = r * Math.cos(a),
      y = 0.65 * r * Math.sin(a);
    return [Math.cos(angle) * x - Math.sin(angle) * y, Math.sin(angle) * x + Math.cos(angle) * y];
  });
}
