import { finite } from '../../math/vector.ts';

export type DepthLevel = { width: number; height: number; data: Float64Array };
/** 屏幕坐标 y 向下；矩形为 [x0,x1) × [y0,y1)。 */
export type ScreenRect = [number, number, number, number];

/** 近小远大的深度采用 max 归约；未覆盖的 Infinity 必须保留。 */
export function depthPyramid(base: DepthLevel): DepthLevel[] {
  const { width, height, data } = base;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    data.length !== width * height ||
    data.some((d) => !(d >= 0 && d <= 1) && d !== Infinity)
  )
    throw new RangeError('需要有效尺寸，以及 [0,1] 深度或 Infinity 背景');
  const levels = [{ width, height, data: data.slice() }];
  while (levels.at(-1)!.width > 1 || levels.at(-1)!.height > 1) {
    const previous = levels.at(-1)!,
      w = Math.ceil(previous.width / 2),
      h = Math.ceil(previous.height / 2),
      next = new Float64Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let farthest = -Infinity;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const px = 2 * x + dx,
              py = 2 * y + dy;
            if (px < previous.width && py < previous.height)
              farthest = Math.max(farthest, previous.data[py * previous.width + px]);
          }
        next[y * w + x] = farthest;
      }
    levels.push({ width: w, height: h, data: next });
  }
  return levels;
}

/** nearest 是候选整个物体的深度下界；矩形需包住它的全部屏幕覆盖。 */
export function occlusionQuery(
  levels: DepthLevel[],
  rect: ScreenRect,
  nearest: number,
  level: number,
) {
  finite([...rect, nearest]);
  if (
    !levels.length ||
    !Number.isInteger(level) ||
    level < 0 ||
    level >= levels.length ||
    nearest < 0 ||
    nearest > 1 ||
    rect[0] > rect[2] ||
    rect[1] > rect[3]
  )
    throw new RangeError('查询范围、深度或层级无效');
  const base = levels[0],
    image = levels[level],
    scale = 2 ** level;
  // 向外取整；粗格还可能覆盖矩形外部，只会降低剔除率。
  const x0 = Math.floor(Math.max(0, rect[0]) / scale),
    y0 = Math.floor(Math.max(0, rect[1]) / scale),
    x1 = Math.ceil(Math.min(base.width, rect[2]) / scale),
    y1 = Math.ceil(Math.min(base.height, rect[3]) / scale);
  const cells: number[] = [];
  let farthest = -Infinity;
  if (rect[0] < rect[2] && rect[1] < rect[3])
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        cells.push(y * image.width + x);
        farthest = Math.max(farthest, image.data[y * image.width + x]);
      }
  return { occluded: cells.length > 0 && nearest > farthest, farthest, cells, level };
}

/** 正对相机的方形，距相机轴向距离 d；不是任意球体的轮廓公式。 */
export function projectedSize(
  side: number,
  distance: number,
  fov: number,
  imageHeight: number,
): number {
  finite([side, distance, fov, imageHeight]);
  if (side < 0 || distance <= 0 || fov <= 0 || fov >= 180 || imageHeight <= 0)
    throw new RangeError('投影尺寸参数无效');
  return (side * imageHeight) / (2 * distance * Math.tan((fov * Math.PI) / 360));
}

/** 固定中心采样的矩形参考；小于一像素仍可能覆盖某个样本。 */
export function rectangleSamples(rect: ScreenRect, width: number, height: number): number[] {
  finite(rect);
  if (![width, height].every((n) => Number.isInteger(n) && n > 0))
    throw new RangeError('图像尺寸无效');
  const result: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (x + 0.5 >= rect[0] && x + 0.5 < rect[2] && y + 0.5 >= rect[1] && y + 0.5 < rect[3])
        result.push(y * width + x);
  return result;
}
