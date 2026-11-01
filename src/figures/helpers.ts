import { Drawing, palette, circle } from './drawing.ts';
import type { Vec2, Vec3 } from '../math/vector.ts';
import { linearToSrgb, encodeRgba } from '../chapters/01-pixels/core.ts';
import type { Texture } from '../chapters/07-textures/core.ts';
import { project } from '../chapters/10-geometry/core.ts';

export const rgb = (linear: number[]): string =>
  `rgb(${linear.map((x) => Math.round(linearToSrgb(x) * 255)).join(' ')})`;
export function plot(
  d: Drawing,
  fn: (x: number) => number,
  range: Vec2,
  color = palette.blue,
  count = 160,
): void {
  d.line(
    Array.from({ length: count + 1 }, (_, i) => {
      const x = range[0] + ((range[1] - range[0]) * i) / count;
      return [x, fn(x)];
    }),
    color,
    2.2,
  );
}
export function rectangle(d: Drawing, at: Vec2, size: Vec2, color: string, opacity = 1): void {
  d.polygon(
    [at, [at[0] + size[0], at[1]], [at[0] + size[0], at[1] + size[1]], [at[0], at[1] + size[1]]],
    color,
    opacity,
  );
}
export function grid(d: Drawing, bounds: [number, number, number, number], step = 1): void {
  const [x0, x1, y0, y1] = bounds;
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step)
    d.line(
      [
        [x, y0],
        [x, y1],
      ],
      palette.muted,
      0.6,
      0.3,
    );
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step)
    d.line(
      [
        [x0, y],
        [x1, y],
      ],
      palette.muted,
      0.6,
      0.3,
    );
  d.axes(x0, x1, y0, y1);
}
export function bitmap(
  d: Drawing,
  texture: Texture,
  at: Vec2,
  size: Vec2,
  pixelated = false,
): void {
  d.raster(at, size, texture.width, texture.height, encodeRgba(texture.data), pixelated);
}
export function wire3(
  d: Drawing,
  vertices: Vec3[],
  edges: Vec2[],
  azimuth = 35,
  elevation = 25,
  color = palette.blue,
): void {
  const xy = project(vertices, azimuth, elevation).xy;
  for (const [a, b] of edges) d.line([xy[a], xy[b]], color, 1.5);
}
export function axes3(d: Drawing, azimuth = 35, elevation = 25, length = 2): void {
  const xy = project(
    [
      [0, 0, 0],
      [length, 0, 0],
      [0, length, 0],
      [0, 0, length],
    ],
    azimuth,
    elevation,
  ).xy;
  [palette.blue, palette.green, palette.red].forEach((color, i) =>
    d.arrow(xy[0], xy[i + 1], color, ['x', 'y', 'z'][i]),
  );
}
export { circle };
