import { finite, clamp, dot, cross, mix } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { unit } from '../02-transforms/spatial.ts';
import { texture, texel } from '../08-textures/core.ts';
import type { Texture } from '../08-textures/core.ts';
export { reflect } from '../15-rays/core.ts';

export const FACE_FORWARD: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
export const FACE_RIGHT: Vec3[] = [
  [0, 0, -1],
  [0, 0, 1],
  [1, 0, 0],
  [1, 0, 0],
  [1, 0, 0],
  [-1, 0, 0],
];
export const FACE_DOWN: Vec3[] = [
  [0, -1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
  [0, -1, 0],
  [0, -1, 0],
];
export function directionToLatlong(direction: Vec3): Vec2 {
  const [x, y, z] = unit(direction),
    u = x === 0 && z === 0 ? 0 : (((Math.atan2(z, x) / (2 * Math.PI)) % 1) + 1) % 1;
  return [u, Math.acos(clamp(y, -1, 1)) / Math.PI];
}
export function latlongToDirection(uv: Vec2): Vec3 {
  finite(uv);
  if (uv[1] < 0 || uv[1] > 1) throw new RangeError('经纬图 v 须在 [0,1]');
  const phi = uv[0] * 2 * Math.PI,
    theta = uv[1] * Math.PI;
  return [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
}
export function directionToCube(direction: Vec3) {
  const d = unit(direction),
    abs = d.map(Math.abs),
    axis = abs.indexOf(Math.max(...abs)),
    face = 2 * axis + Number(d[axis] < 0),
    m = abs[axis];
  return {
    face,
    uv: [
      clamp((dot(d, FACE_RIGHT[face]) / m) * 0.5 + 0.5),
      clamp((dot(d, FACE_DOWN[face]) / m) * 0.5 + 0.5),
    ] as Vec2,
  };
}
export function cubeToDirection(face: number, uv: Vec2): Vec3 {
  finite(uv);
  if (!Number.isInteger(face) || face < 0 || face > 5 || uv.some((x) => x < 0 || x > 1))
    throw new RangeError('立方体面或 UV 非法');
  return unit(
    FACE_FORWARD[face].map(
      (x, i) => x + (2 * uv[0] - 1) * FACE_RIGHT[face][i] + (2 * uv[1] - 1) * FACE_DOWN[face][i],
    ) as Vec3,
  );
}
export function environmentLocalDirection(direction: Vec3, yaw = 0): Vec3 {
  finite([yaw]);
  const [x, y, z] = unit(direction),
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  return [c * x - s * z, y, s * x + c * z];
}
export function analyticEnvironment(
  direction: Vec3,
  yaw = 0,
  pattern: 'studio' | 'direction' = 'studio',
): Vec3 {
  const d = environmentLocalDirection(direction, yaw);
  if (pattern === 'direction') return d.map((x) => (x + 1) / 2) as Vec3;
  const sky = 0.5 + 0.5 * Math.tanh(3.5 * d[1]),
    horizon = Math.exp(-((d[1] / 0.16) ** 2));
  let color = mix([0.035, 0.045, 0.065], [0.22, 0.29, 0.38], sky).map(
    (x, i) => x + horizon * [0.055, 0.04, 0.025][i],
  );
  const windows: { center: Vec3; width: number; height: number; tint: Vec3 }[] = [
    { center: [0.8, 0.18, 0.6], width: 0.15, height: 0.42, tint: [0.84, 0.94, 1] },
    { center: [-0.8, 0.12, 0.5], width: 0.31, height: 0.18, tint: [1, 0.63, 0.28] },
    { center: [-0.35, -0.3, -0.86], width: 0.28, height: 0.22, tint: [0.08, 0.72, 0.64] },
    { center: [0.9, -0.12, -0.35], width: 0.2, height: 0.31, tint: [0.85, 0.16, 0.27] },
  ];
  for (const w of windows) {
    const center = unit(w.center),
      right = unit(cross([0, 1, 0], center)),
      up = cross(center, right),
      horizontal = dot(d, right) / w.width,
      vertical = dot(d, up) / w.height;
    const weight =
      Math.exp(-(horizontal ** 8 + vertical ** 8)) *
      (0.5 + 0.5 * Math.tanh(16 * (dot(d, center) - 0.35)));
    color = mix(color, w.tint, weight);
  }
  return color.map((x) => clamp(x)) as Vec3;
}
export const buildLatlong = (
  width = 256,
  height = 128,
  yaw = 0,
  pattern: 'studio' | 'direction' = 'studio',
): Texture =>
  texture(width, height, (x, y) =>
    analyticEnvironment(latlongToDirection([(x + 0.5) / width, (y + 0.5) / height]), yaw, pattern),
  );
export const buildCubemap = (
  size = 128,
  yaw = 0,
  pattern: 'studio' | 'direction' = 'studio',
): Texture[] =>
  FACE_FORWARD.map((_, f) =>
    texture(size, size, (x, y) =>
      analyticEnvironment(cubeToDirection(f, [(x + 0.5) / size, (y + 0.5) / size]), yaw, pattern),
    ),
  );
/** 环境图 UV 向下；经纬图横向周期包裹，立方体图按面 clamp。 */
function bilinear(image: Texture, uv: Vec2, wrapU: boolean): Vec3 {
  const x = (wrapU ? ((uv[0] % 1) + 1) % 1 : clamp(uv[0])) * image.width - 0.5,
    y = clamp(uv[1]) * image.height - 0.5,
    x0 = Math.floor(x),
    y0 = Math.floor(y),
    sx = x - x0,
    sy = y - y0,
    result = [0, 0, 0] as Vec3;
  for (const dy of [0, 1])
    for (const dx of [0, 1]) {
      const col = wrapU ? (((x0 + dx) % image.width) + image.width) % image.width : x0 + dx,
        weight = (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy);
      texel(image, col, y0 + dy).forEach((v, i) => (result[i] += v * weight));
    }
  return result;
}
export const sampleLatlong = (image: Texture, uv: Vec2): Vec3 => bilinear(image, uv, true);
export function sampleCubemap(images: Texture[], direction: Vec3): Vec3 {
  const { face, uv } = directionToCube(direction);
  return bilinear(images[face], uv, false);
}
