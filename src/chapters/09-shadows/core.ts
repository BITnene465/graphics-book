import { finite, clamp, dot, sub } from '../../math/vector.ts';
import type { Vec3 } from '../../math/vector.ts';
import { compose, identity, matVec } from '../../math/matrix.ts';
import type { Matrix } from '../../math/matrix.ts';
import { lookAt, perspective, orthographic } from '../03-camera/core.ts';
import { normalize } from '../06-lighting/core.ts';
import { flatScene, renderFrame } from '../13-pipeline/core.ts';

export function sceneGeometry() {
  const ground: Vec3[] = [
      [-3, 0, -3],
      [3, 0, -3],
      [3, 0, 3],
      [-3, 0, 3],
    ],
    h = 0.55;
  const box: Vec3[] = [
    [-h, 0, -h],
    [h, 0, -h],
    [h, 1.6, -h],
    [-h, 1.6, -h],
    [-h, 0, h],
    [h, 0, h],
    [h, 1.6, h],
    [-h, 1.6, h],
  ];
  const faces = [
    [0, 3, 2],
    [0, 2, 1],
    [4, 5, 6],
    [4, 6, 7],
    [0, 4, 7],
    [0, 7, 3],
    [1, 2, 6],
    [1, 6, 5],
    [3, 7, 6],
    [3, 6, 2],
    [0, 1, 5],
    [0, 5, 4],
  ];
  return {
    triangles: [
      [ground[0], ground[2], ground[1]],
      [ground[0], ground[3], ground[2]],
      ...faces.map((f) => f.map((i) => box[i])),
    ],
    colors: [
      [0.53, 0.58, 0.45],
      [0.53, 0.58, 0.45],
      ...faces.map(() => [0.63, 0.25, 0.1]),
    ] as Vec3[],
  };
}
export function sceneMatrices(lightEye: Vec3 = [-3, 6, -2], extent = 8, target: Vec3 = [0, 0, 0]) {
  finite([...lightEye, extent]);
  if (lightEye[1] <= 0 || extent <= 0) throw new RangeError('光源须在地面上方，窗口高度须为正');
  return {
    cameraVP: compose(perspective(48, 1, 0.3, 25), lookAt([6, 5, 7], [0, 0.55, 0])),
    lightVP: compose(orthographic(extent, 1, 0.1, 20), lookAt(lightEye, target, [0, 0, -1])),
  };
}
export function rasterizeWorld(triangles: Vec3[][], viewProjection: Matrix, size: number) {
  return renderFrame(
    flatScene(
      triangles,
      triangles.map(() => [1, 1, 1]),
    ),
    { width: size, view: identity(4), projection: viewProjection },
  );
}
export function pcfVisibility(current: number, stored: number[], bias = 0): number {
  finite([current, bias]);
  if (bias < 0 || !stored.length || stored.some((x) => Number.isNaN(x) || x === -Infinity))
    throw new RangeError('阴影比较参数非法');
  return stored.reduce((s, z) => s + Number(current - bias <= z), 0) / stored.length;
}
/** 阴影 UV 原点在左上，与材质 UV 明确区分。越界 tap 视为可见。 */
export function shadowQuery(
  point: Vec3,
  lightVP: Matrix,
  depth: Float64Array,
  width: number,
  height = width,
  bias = 0.004,
  radius = 0,
) {
  finite([bias]);
  if (
    !Number.isInteger(radius) ||
    radius < 0 ||
    radius > 8 ||
    bias < 0 ||
    depth.length !== width * height
  )
    throw new RangeError('阴影贴图或 PCF 参数非法');
  const clip = matVec(lightVP, [...point, 1]),
    ndc = clip.slice(0, 3).map((x) => x / clip[3]),
    inside = clip[3] > 0 && ndc.every((x) => Math.abs(x) <= 1);
  const uv = [(ndc[0] + 1) / 2, (1 - ndc[1]) / 2],
    current = (ndc[2] + 1) / 2,
    row = inside ? clamp(Math.floor(uv[1] * height), 0, height - 1) : -1,
    col = inside ? clamp(Math.floor(uv[0] * width), 0, width - 1) : -1,
    samples: number[] = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const x = col + dx,
        y = row + dy;
      samples.push(
        inside && x >= 0 && y >= 0 && x < width && y < height ? depth[y * width + x] : Infinity,
      );
    }
  return {
    clip,
    uv,
    current,
    inside,
    row,
    col,
    samples,
    visibility: inside ? pcfVisibility(current, samples, bias) : 1,
    stored: samples[Math.floor(samples.length / 2)],
  };
}
export function renderScene(
  size = 128,
  shadowSize = 256,
  lightEye: Vec3 = [-3, 6, -2],
  bias = 0.004,
  radius = 1,
  geometry = sceneGeometry(),
) {
  const { cameraVP, lightVP } = sceneMatrices(lightEye),
    light = rasterizeWorld(geometry.triangles, lightVP, shadowSize),
    direction = normalize(sub(lightEye, [0, 0, 0]) as Vec3);
  const visibility = new Float64Array(size * size).fill(NaN),
    hardVisibility = new Float64Array(size * size).fill(NaN),
    hardColor = new Float64Array(size * size * 3).fill(0.9);
  const camera = renderFrame(flatScene(geometry.triangles, geometry.colors), {
    width: size,
    view: identity(4),
    projection: cameraVP,
    fragment: (f) => {
      const at = f.row * size + f.col,
        q = shadowQuery(f.world, lightVP, light.depth, shadowSize, shadowSize, bias, radius),
        hard = shadowQuery(
          f.world,
          lightVP,
          light.depth,
          shadowSize,
          shadowSize,
          bias,
          0,
        ).visibility;
      const checker =
          f.face < 2 && (Math.floor(f.world[0]) + Math.floor(f.world[2])) % 2 === 0 ? 0.78 : 1,
        diffuse = Math.max(0, dot(f.normal, direction));
      visibility[at] = q.visibility;
      hardVisibility[at] = hard;
      hardColor.set(
        f.color.map((c) => c * checker * (0.16 + 0.84 * diffuse * hard)),
        at * 3,
      );
      return f.color.map((c) => c * checker * (0.16 + 0.84 * diffuse * q.visibility)) as Vec3;
    },
  });
  return {
    color: camera.color,
    hardColor,
    camera,
    light,
    lightVP,
    shadowDepth: light.depth,
    visibility,
    hardVisibility,
  };
}
