import { referenceFrame, deskRenderer } from './render.ts';
import { deskState } from './model.ts';

/** 从真实可见对象的 2×2 子像素得到覆盖真值；不声称由单张 RGB 猜出了 alpha。 */
export function deskMatte(object: 'ball' | 'lamp' | 'both') {
  const source = referenceFrame(192),
    width = 96,
    height = 64;
  const foreground = new Float64Array(width * height * 3),
    color = new Float64Array(foreground.length),
    alpha = new Float64Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      for (let sy = 0; sy < 2; sy++)
        for (let sx = 0; sx < 2; sx++) {
          const j = (2 * y + sy) * source.width + 2 * x + sx,
            face = source.owner[j],
            key = source.faceObjects[face];
          const selected =
            face >= 0 &&
            key !== 'table' &&
            (object === 'both' || (object === 'ball' ? key === 'ball' : key !== 'ball'));
          for (let c = 0; c < 3; c++) {
            color[3 * i + c] += source.color[3 * j + c] / 4;
            if (selected) foreground[3 * i + c] += source.color[3 * j + c] / 4;
          }
          if (selected) alpha[i] += 0.25;
        }
      if (alpha[i]) for (let c = 0; c < 3; c++) foreground[3 * i + c] /= alpha[i];
    }
  return { width, height, foreground, color, alpha };
}
/** 对同一几何从有限孔径取样。复用几何与阴影，累积各个偏轴视图的线性颜色。 */
export function lensImage(
  focus: number,
  radius: number,
  samples: number,
  width = 128,
  height = 86,
) {
  const state = deskState(),
    render = deskRenderer(state),
    data = new Float64Array(width * height * 3);
  for (let k = 0; k < samples; k++) {
    const r = samples === 1 ? 0 : radius * Math.sqrt((k + 0.5) / samples),
      angle = k * Math.PI * (3 - Math.sqrt(5));
    const f = render(width, height, { focus, offset: [r * Math.cos(angle), r * Math.sin(angle)] });
    for (let i = 0; i < data.length; i++) data[i] += f.color[i] / samples;
  }
  return { width, height, data };
}
