import { Drawing, palette } from './drawing.ts';
import type { PolyMesh } from '../math/mesh.ts';
import type { Vec3 } from '../math/vector.ts';
import { clamp, cross, sub } from '../math/vector.ts';
import { project } from '../chapters/12-geometry/core.ts';
import { linearToSrgb } from '../chapters/01-pixels/core.ts';

/** 数学图的正交投影与面排序，不参与正式成像算法。 */
export function drawMesh(
  d: Drawing,
  mesh: PolyMesh,
  az = 35,
  el = 30,
  color = palette.blue,
  wire = true,
) {
  const p = project(mesh.vertices, az, el);
  const order = mesh.faces
    .map((face, i) => ({ i, z: face.reduce((s, v) => s + p.depth[v], 0) / face.length }))
    .sort((a, b) => a.z - b.z);
  for (const { i } of order) {
    const face = mesh.faces[i],
      xy = face.map((v) => p.xy[v]);
    const n = cross(
      sub(mesh.vertices[face[1]], mesh.vertices[face[0]]),
      sub(mesh.vertices[face[2]], mesh.vertices[face[0]]),
    );
    const shade = Math.abs(n[2]) / Math.max(1e-12, Math.hypot(...n));
    d.polygon(xy, color, 0.12 + 0.25 * shade);
    if (wire) d.line([...xy, xy[0]], color, 0.8, 0.68);
  }
  return p;
}
export function imagePanel(
  d: Drawing,
  title: string,
  width: number,
  height: number,
  rgb: ArrayLike<number>,
  exposure = 1,
  overlay?: () => void,
  pixelated = false,
) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++)
      rgba[4 * i + c] = 255 * linearToSrgb(Math.max(0, rgb[3 * i + c] * exposure));
    rgba[4 * i + 3] = 255;
  }
  const aspect = width / height;
  d.panel(title, [-aspect, aspect, -1, 1], () => {
    d.raster([-aspect, -1], [2 * aspect, 2], width, height, rgba, pixelated);
    overlay?.();
  });
}
export function plot(d: Drawing, values: number[], color = palette.blue, x0 = 0, x1 = 1) {
  d.line(
    values.map((v, i) => [x0 + ((x1 - x0) * i) / Math.max(1, values.length - 1), v]),
    color,
    2,
  );
}
export function heat(t: number): Vec3 {
  return [clamp(1.6 * t), clamp(1.8 - 2 * Math.abs(t - 0.5)), clamp(1.6 * (1 - t))];
}

/** 投影中的竖直拖动只改世界 z；x、y 保持，避免把屏幕轴当成空间轴。 */
export function heightHandle(
  d: Drawing,
  p: Vec3,
  index: number,
  key: string,
  az: number,
  el: number,
  label = '',
) {
  const xy = project([p], az, el).xy[0],
    base = project([[p[0], p[1], 0]], az, el).xy[0];
  d.handle(xy, key, label, {
    index,
    axes: [0, 2],
    limits: [p[0], p[0], -2, 2],
    mapping: { offset: [xy[0] - p[0], base[1]], scale: [1, Math.cos((el * Math.PI) / 180)] },
  });
}
