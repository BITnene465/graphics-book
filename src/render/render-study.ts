import type { StudyState } from './scenes.ts';
import { buildScene } from './scenes.ts';
import { identity } from '../math/matrix.ts';
import { sub, dot, scale, add } from '../math/vector.ts';
import type { Vec3 } from '../math/vector.ts';
import { lookAt, perspective, orthographic } from '../chapters/03-camera/core.ts';
import { clipToScreen } from '../chapters/04-barycentric/raster.ts';
import { barycentric } from '../chapters/04-barycentric/core.ts';
import type { Triangle2 } from '../chapters/04-barycentric/core.ts';
import { shade, lightAt } from '../chapters/07-lighting/core.ts';
import {
  checkerTexture,
  buildMipmaps,
  sampleTexture,
  sampleTrilinear,
  sampleAnisotropic,
  perspectiveJacobian,
  footprintMetrics,
} from '../chapters/08-textures/core.ts';
import { rasterizeWorld, sceneMatrices, shadowQuery } from '../chapters/10-shadows/core.ts';
import { cameraRay, trace, reflect } from '../chapters/15-rays/core.ts';
import type { RayScene } from '../chapters/15-rays/core.ts';
import { renderFrame, vertexStage, fragmentStage } from '../chapters/11-pipeline/core.ts';
import {
  analyticEnvironment,
  buildLatlong,
  buildCubemap,
  sampleLatlong,
  sampleCubemap,
  directionToLatlong,
  environmentLocalDirection,
} from '../chapters/09-texture-functions/core.ts';
import { encodeRgba } from '../chapters/01-pixels/core.ts';
import { unit } from '../chapters/02-transforms/spatial.ts';

export type StudyOutput = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  linear: Float64Array;
  depth: Float64Array;
  owner: Int32Array;
  world: Float64Array;
  normal: Float64Array;
  uv: Float64Array;
  stats: Record<string, number>;
};
export function studyRay(state: StudyState, col: number, row: number, size: number) {
  const { eye, target, fov, projection } = state.camera;
  if (projection === 'perspective') return cameraRay(col, row, size, size, eye, target, fov);
  const view = lookAt(eye, target),
    h =
      (Math.hypot(...sub(eye, target)) * Math.tan((fov * Math.PI) / 360)) /
      (state.camera.zoom ?? 1),
    x = ((2 * (col + 0.5)) / size - 1) * h,
    y = (1 - (2 * (row + 0.5)) / size) * h;
  return {
    origin: add(eye, add(scale(view[0].slice(0, 3), x), scale(view[1].slice(0, 3), y))) as Vec3,
    direction: unit(sub(target, eye) as Vec3),
  };
}
export function rayScene(state: StudyState): RayScene {
  return {
    spheres: state.objects
      .filter((o) => o.kind === 'sphere')
      .map((o) => ({
        center: o.position,
        radius: o.scale[0],
        color: o.color,
        mirror: Number(state.params[o.key === 'a' ? 'mirrorA' : 'mirrorB'] ?? o.mirror ?? 0.3),
      })),
    groundColor: state.objects.find((o) => o.kind === 'ground')?.color ?? [0.57, 0.58, 0.44],
    groundMirror: 0.2,
    groundExtent: 5,
  };
}
export function renderStudy(
  state: StudyState,
  size = Number(state.params.resolution),
): StudyOutput {
  if (!Number.isInteger(size) || size < 32 || size > 2048)
    throw new RangeError('渲染分辨率须为 32 至 2048');
  const { chapter, params, camera } = state,
    eye = camera.eye,
    light =
      state.objects.find((o) => o.kind === 'light')?.position ??
      ([Number(params.lightX), Number(params.lightY), Number(params.lightZ)] as Vec3);
  if (chapter === '15' && params.visibility !== 'raster') {
    const scene = rayScene(state),
      color = new Float64Array(size * size * 3),
      depth = new Float64Array(size * size).fill(Infinity),
      owner = new Int32Array(size * size).fill(-1),
      world = new Float64Array(size * size * 3),
      normal = new Float64Array(size * size * 3);
    let segments = 0;
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) {
        const i = row * size + col,
          ray = studyRay(state, col, row, size),
          result = trace(ray.origin, ray.direction, {
            scene,
            light,
            bounces: Number(params.bounces),
            epsilon: Number(params.epsilon),
            specular: Number(params.specular),
            shininess: Number(params.shininess),
          }),
          hit = result.segments[0].hit;
        color.set(result.color, i * 3);
        segments += result.segments.length;
        owner[i] = hit.owner;
        depth[i] = hit.t;
        world.set(hit.point, i * 3);
        normal.set(hit.normal, i * 3);
      }
    return {
      width: size,
      height: size,
      pixels: encodeRgba(color),
      linear: color,
      depth,
      owner,
      world,
      normal,
      uv: new Float64Array(size * size * 2),
      stats: { 主射线: size * size, 追踪路径段: segments },
    };
  }
  const scene = buildScene(state),
    view = lookAt(eye, camera.target),
    near = Number(params.near ?? 0.1),
    far = Number(params.far ?? 50),
    height =
      (2 * Math.hypot(...sub(eye, camera.target)) * Math.tan((camera.fov * Math.PI) / 360)) /
      (camera.zoom ?? 1);
  const projection =
    camera.projection === 'perspective'
      ? perspective(camera.fov, 1, near, far)
      : orthographic(height, 1, near, far);
  const tex =
      chapter === '08'
        ? checkerTexture(Number(params.textureSize), Number(params.frequency))
        : null,
    mips = tex ? buildMipmaps(tex) : null;
  const stages = chapter === '08' ? vertexStage(scene, identity(4), view, projection) : null;
  const textureTriangles = stages
    ? scene.faces.map((face) => {
        const vertices = face.map((i) => stages[i]);
        if (vertices.some((v) => v.clip[3] <= 0)) return null;
        const screen = clipToScreen(
          vertices.map((v) => v.clip),
          size,
          size,
        );
        return {
          xy: screen.xy as Triangle2,
          inverseW: screen.inverseW as Vec3,
          uv: vertices.map((v) => v.uv),
        };
      })
    : null;
  let shadow: ReturnType<typeof rasterizeWorld> | null = null,
    lightVP: number[][] | null = null;
  if (chapter === '10') {
    lightVP = sceneMatrices(light).lightVP;
    shadow = rasterizeWorld(
      scene.faces.map((face) => face.map((i) => scene.vertices[i])),
      lightVP,
      Number(params.shadowSize),
    );
  }
  const env =
    chapter === '09' && params.mapping === 'latlong'
      ? buildLatlong(
          Number(params.mapSize) * 2,
          Number(params.mapSize),
          0,
          params.environment as 'studio' | 'direction',
        )
      : null;
  const cube =
    chapter === '09' && params.mapping === 'cube'
      ? buildCubemap(Number(params.mapSize), 0, params.environment as 'studio' | 'direction')
      : null;
  const environment = (worldDirection: Vec3): Vec3 => {
    const direction = environmentLocalDirection(
      worldDirection,
      (Number(params.envAngle) * Math.PI) / 180,
    );
    return env
      ? sampleLatlong(env, directionToLatlong(direction))
      : cube
        ? sampleCubemap(cube, direction)
        : analyticEnvironment(direction, 0, params.environment as 'studio' | 'direction');
  };
  const frame = renderFrame(scene, {
    width: size,
    view,
    projection,
    depthTest: params.depthTest !== false,
    earlyDepth: params.earlyDepth !== false,
    cull: params.cull === true,
    reverse: params.reverse === true,
    perspectiveCorrect: params.correct !== false,
    depthBits: Number(params.bits) > 0 ? Number(params.bits) : null,
    fragment: (f) => {
      if (chapter === '06') return f.color;
      if (chapter === '08' && tex && mips) {
        if (params.filter === 'nearest' || params.filter === 'bilinear')
          return sampleTexture(tex, f.uv, params.filter);
        const tri = textureTriangles?.[f.face];
        if (!tri) return sampleTexture(tex, f.uv);
        const weights = barycentric([f.col + 0.5, size - f.row - 0.5], tri.xy),
          j = perspectiveJacobian(weights, tri.xy, tri.uv, tri.inverseW),
          metrics = footprintMetrics(
            j,
            tex.width,
            tex.height,
            Number(params.lodBias),
            Number(params.anisotropy),
          );
        return params.filter === 'trilinear'
          ? sampleTrilinear(mips, f.uv, metrics.lodIsotropic)
          : sampleAnisotropic(mips, f.uv, j, Number(params.lodBias), Number(params.anisotropy));
      }
      if (chapter === '10' && shadow && lightVP) {
        const q = shadowQuery(
            f.world,
            lightVP,
            shadow.depth,
            shadow.width,
            shadow.height,
            Number(params.bias),
            Number(params.pcf),
          ),
          diffuse = Math.max(0, dot(f.normal, unit(light))),
          checker =
            Math.abs(f.world[1]) < 1e-9 &&
            (Math.floor(f.world[0]) + Math.floor(f.world[2])) % 2 === 0
              ? 0.78
              : 1;
        return f.color.map((c) => c * checker * (0.16 + 0.84 * diffuse * q.visibility)) as Vec3;
      }
      if (chapter === '09') {
        return environment(reflect(unit(sub(f.world, eye) as Vec3), f.normal));
      }
      if (chapter === '11')
        return fragmentStage(f, eye, light, params.mode as 'lit' | 'checker' | 'uv' | 'normal');
      const l = lightAt(f.world, light, true, 40);
      return shade(f.normal, l.direction, sub(eye, f.world) as Vec3, {
        kd: f.color,
        ks: Number(params.ks ?? 0.3),
        exponent: Number(params.exponent ?? 48),
        ambient: 0.08,
        irradiance: l.irradiance,
      }).total;
    },
  });
  if (chapter === '09') {
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) {
        const i = row * size + col;
        if (frame.owner[i] < 0)
          frame.color.set(environment(studyRay(state, col, row, size).direction), i * 3);
      }
  }
  return {
    width: size,
    height: size,
    pixels: encodeRgba(frame.color),
    linear: frame.color,
    depth: frame.depth,
    owner: frame.owner,
    world: frame.world,
    normal: frame.normal,
    uv: frame.uv,
    stats: {
      顶点: scene.vertices.length,
      提交三角形: frame.counts.submitted,
      裁剪后: frame.counts.clipped,
      着色片元: frame.counts.shaded,
      通过深度: frame.counts.passed,
    },
  };
}
