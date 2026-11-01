import { finite, cross, sub, scale, radians } from '../../math/vector.ts';
import type { Vec2, Vec3, Vec4 } from '../../math/vector.ts';
import { identity, multiply, matVec, compose } from '../../math/matrix.ts';
import type { Matrix } from '../../math/matrix.ts';
import { rotationMatrix } from '../02-transforms/spatial.ts';
import {
  clipTriangle,
  clipToScreen,
  rasterizeTriangle,
  edgeFunction,
} from '../04-barycentric/raster.ts';
import type { Triangle2 } from '../04-barycentric/core.ts';
import { interpolateDepth, quantizeDepth } from '../05-depth/core.ts';
import { transformNormals, normalize, shade, lightAt } from '../06-lighting/core.ts';
import { perspectiveInterpolate } from '../07-textures/core.ts';

export type Scene = {
  vertices: Vec3[];
  faces: Vec3[];
  normals: Vec3[];
  uv: Vec2[];
  colors: Vec3[];
};
export type Vertex = { clip: Vec4; world: Vec3; normal: Vec3; uv: Vec2; color: Vec3 };
export type Fragment = {
  world: Vec3;
  normal: Vec3;
  uv: Vec2;
  color: Vec3;
  weights: Vec3;
  face: number;
  row: number;
  col: number;
  depth: number;
};
export type RenderOptions = {
  width: number;
  height?: number;
  model?: Matrix;
  view: Matrix;
  projection: Matrix;
  wave?: number;
  depthTest?: boolean;
  earlyDepth?: boolean;
  depthBits?: number | null;
  cull?: boolean;
  reverse?: boolean;
  perspectiveCorrect?: boolean;
  background?: Vec3;
  fragment?: (f: Fragment) => Vec3;
};

export function modelMatrix(
  position: Vec3 = [0, 0, 0],
  rotation: Vec3 = [0, 0, 0],
  size: Vec3 = [1, 1, 1],
): Matrix {
  finite([...position, ...rotation, ...size]);
  const t = identity(4),
    s = identity(4);
  for (let i = 0; i < 3; i++) {
    t[i][3] = position[i];
    s[i][i] = size[i];
  }
  const rotations = (
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as Vec3[]
  ).map((axis, i) => {
    const r = identity(4),
      a = rotationMatrix(axis, radians(rotation[i]));
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) r[y][x] = a[y][x];
    return r;
  });
  return compose(t, rotations[2], rotations[1], rotations[0], s);
}
export function gridScene(divisions = 8): Scene {
  if (!Number.isInteger(divisions) || divisions < 1 || divisions > 128)
    throw new RangeError('网格分段须为 1 至 128');
  const vertices: Vec3[] = [],
    normals: Vec3[] = [],
    uv: Vec2[] = [],
    colors: Vec3[] = [],
    faces: Vec3[] = [];
  for (let layer = 0; layer < 2; layer++) {
    const offset = vertices.length;
    for (let y = 0; y <= divisions; y++)
      for (let x = 0; x <= divisions; x++) {
        vertices.push([
          (x / divisions - 0.5) * 3 + (layer ? 0.2 : 0),
          (y / divisions - 0.5) * 2,
          layer ? -0.6 : 0,
        ]);
        normals.push([0, 0, 1]);
        uv.push([x / divisions, y / divisions]);
        colors.push(layer ? [0.63, 0.25, 0.1] : [0.12, 0.46, 0.27]);
        if (x < divisions && y < divisions) {
          const i = offset + y * (divisions + 1) + x;
          faces.push([i, i + 1, i + divisions + 2], [i, i + divisions + 2, i + divisions + 1]);
        }
      }
  }
  return { vertices, normals, uv, colors, faces };
}
export function vertexStage(
  scene: Scene,
  model: Matrix,
  view: Matrix,
  projection: Matrix,
  wave = 0,
): Vertex[] {
  const vp = multiply(projection, view),
    linear = model.slice(0, 3).map((row) => row.slice(0, 3));
  const normals = scene.normals.map((n, i) => {
    if (!wave) return n;
    const [x, y] = scene.vertices[i];
    return normalize([
      -wave * 2 * Math.cos(2 * x) * Math.sin(2 * y),
      -wave * 2 * Math.sin(2 * x) * Math.cos(2 * y),
      1,
    ]);
  });
  const transformedNormals = transformNormals(normals, linear);
  return scene.vertices.map((p, i) => {
    const local = [p[0], p[1], p[2] + wave * Math.sin(2 * p[0]) * Math.sin(2 * p[1]), 1],
      world = matVec(model, local).slice(0, 3) as Vec3;
    return {
      world,
      clip: matVec(vp, [...world, 1]) as Vec4,
      normal: transformedNormals[i],
      uv: scene.uv[i],
      color: scene.colors[i],
    };
  });
}
export function fragmentStage(
  f: Fragment,
  eye: Vec3,
  light: Vec3,
  mode: 'lit' | 'checker' | 'uv' | 'normal' = 'lit',
): Vec3 {
  if (mode === 'uv') return [f.uv[0], f.uv[1], 0.15];
  if (mode === 'normal') return f.normal.map((x) => (x + 1) / 2) as Vec3;
  const check = (Math.floor(f.uv[0] * 8) + Math.floor(f.uv[1] * 8)) % 2 === 0,
    tint = mode === 'checker' && check ? (scale(f.color, 0.45) as Vec3) : f.color;
  const lighting = lightAt(f.world, light, true, 35);
  return shade(f.normal, lighting.direction, sub(eye, f.world) as Vec3, {
    kd: tint,
    irradiance: lighting.irradiance,
    ks: 0.25,
    ambient: 0.1,
  }).total;
}
/** 一条可追溯的软件光栅管线；显示只读取它产生的线性 RGB 缓冲。 */
export function renderFrame(scene: Scene, options: RenderOptions) {
  const {
    width,
    height = width,
    model = identity(4),
    view,
    projection,
    wave = 0,
    depthTest = true,
    earlyDepth = true,
    cull = false,
    reverse = false,
    perspectiveCorrect = true,
    background = [0.93, 0.92, 0.88],
    fragment = (f) => f.color,
  } = options;
  if (![width, height].every((n) => Number.isInteger(n) && n >= 1 && n <= 4096))
    throw new RangeError('图像尺寸须为 1 至 4096');
  const vertices = vertexStage(scene, model, view, projection, wave),
    n = width * height;
  const color = new Float64Array(n * 3),
    depth = new Float64Array(n).fill(Infinity),
    owner = new Int32Array(n).fill(-1),
    world = new Float64Array(n * 3),
    normal = new Float64Array(n * 3),
    uv = new Float64Array(n * 2),
    weights = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) color.set(background, i * 3);
  const counts = {
    submitted: scene.faces.length,
    clipped: 0,
    culled: 0,
    covered: 0,
    shaded: 0,
    passed: 0,
  };
  const order = scene.faces.map((_, i) => i);
  if (reverse) order.reverse();
  for (const id of order) {
    const face = scene.faces[id],
      v = face.map((i) => vertices[i]);
    const attrs = v.map((p, i) => [
      ...p.world,
      ...p.normal,
      ...p.uv,
      ...p.color,
      ...[0, 1, 2].map((j) => Number(i === j)),
    ]);
    for (const piece of clipTriangle(v.map((p) => p.clip) as [Vec4, Vec4, Vec4], attrs)) {
      counts.clipped++;
      const screen = clipToScreen(piece.vertices, width, height),
        xy = screen.xy as Triangle2;
      if (cull && edgeFunction(xy[0], xy[1], xy[2]) <= 0) {
        counts.culled++;
        continue;
      }
      rasterizeTriangle(xy, width, height, ({ row, col, weights: lambda }) => {
        counts.covered++;
        const i = row * width + col,
          z = quantizeDepth(interpolateDepth(lambda, screen.depth), options.depthBits ?? null),
          passes = !depthTest || z < depth[i];
        if (earlyDepth && !passes) return;
        const a = perspectiveCorrect
          ? perspectiveInterpolate(lambda, piece.attributes, screen.inverseW)
          : piece.attributes[0].map((_, c) =>
              lambda.reduce((s, w, k) => s + w * piece.attributes[k][c], 0),
            );
        const f: Fragment = {
          world: a.slice(0, 3) as Vec3,
          normal: normalize(a.slice(3, 6) as Vec3),
          uv: a.slice(6, 8) as Vec2,
          color: a.slice(8, 11) as Vec3,
          weights: a.slice(11, 14) as Vec3,
          face: id,
          row,
          col,
          depth: z,
        };
        counts.shaded++;
        const value = fragment(f);
        if (!passes) return;
        counts.passed++;
        color.set(value, i * 3);
        depth[i] = z;
        owner[i] = id;
        world.set(f.world, i * 3);
        normal.set(f.normal, i * 3);
        uv.set(f.uv, i * 2);
        weights.set(f.weights, i * 3);
      });
    }
  }
  return { width, height, color, depth, owner, world, normal, uv, weights, vertices, counts };
}
export function inspectPixel(frame: ReturnType<typeof renderFrame>, row: number, col: number) {
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    row < 0 ||
    col < 0 ||
    row >= frame.height ||
    col >= frame.width
  )
    throw new RangeError('像素超出画幅');
  const i = row * frame.width + col;
  return {
    row,
    col,
    face: frame.owner[i],
    depth: frame.depth[i],
    color: [...frame.color.slice(3 * i, 3 * i + 3)],
    world: [...frame.world.slice(3 * i, 3 * i + 3)],
    normal: [...frame.normal.slice(3 * i, 3 * i + 3)],
    uv: [...frame.uv.slice(2 * i, 2 * i + 2)],
    weights: [...frame.weights.slice(3 * i, 3 * i + 3)],
  };
}
export function sourceOver(source: Vec3, destination: Vec3, alpha: number): Vec3 {
  finite([...source, ...destination, alpha]);
  if (alpha < 0 || alpha > 1) throw new RangeError('不透明度须在 [0,1]');
  return source.map((x, i) => alpha * x + (1 - alpha) * destination[i]) as Vec3;
}
export function flatScene(triangles: Vec3[][], colors: Vec3[]): Scene {
  const vertices = triangles.flat(),
    normals = triangles.flatMap((t) =>
      Array.from({ length: 3 }, () => normalize(cross(sub(t[1], t[0]), sub(t[2], t[0])))),
    );
  return {
    vertices,
    normals,
    uv: vertices.map(() => [0, 0]),
    colors: colors.flatMap((c) => [c, c, c]),
    faces: triangles.map((_, i) => [3 * i, 3 * i + 1, 3 * i + 2]),
  };
}
