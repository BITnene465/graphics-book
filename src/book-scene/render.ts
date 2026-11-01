import { buildScene } from '../render/scenes.ts';
import type { StudyState } from '../render/scenes.ts';
import type { Vec2, Vec3 } from '../math/vector.ts';
import type { RGBImage } from '../math/image.ts';
import { dot, sub, normalize } from '../math/vector.ts';
import { lookAt, perspective, orthographic } from '../chapters/03-camera/core.ts';
import { renderFrame } from '../chapters/11-pipeline/core.ts';
import { rasterizeWorld, sceneMatrices, shadowQuery } from '../chapters/10-shadows/core.ts';
import { pointIrradiance } from '../chapters/23-radiometry/core.ts';
import { deskState } from './model.ts';
import { inverse, matVec } from '../math/matrix.ts';
import { modelMatrix } from '../chapters/11-pipeline/core.ts';

export function deskAlbedo(
  key: string,
  color: Vec3,
  uv: number[],
  world: number[],
  state: StudyState,
): Vec3 {
  if (key === 'ball') {
    const stripe = Math.cos(
      2 * Math.PI * (Number(state.params.stripes) * uv[0] + 2 * uv[1] + Number(state.params.phase)),
    );
    return stripe > 0.72 ? [0.88, 0.73, 0.45] : color;
  }
  if (key === 'table' && Math.abs(world[1]) < 1e-6) {
    const grid = [world[0], world[2]].some((x) => Math.abs(x * 2 - Math.round(x * 2)) < 0.018);
    return color.map((x) => x * (grid ? 0.66 : 1)) as Vec3;
  }
  return color;
}

/** 复用 03/10/11/23 章；像素、深度和对象身份来自同一次真正的光栅化。 */
export function deskCamera(
  state: StudyState,
  width: number,
  height: number,
  lens?: { offset: Vec2; focus: number },
) {
  const baseView = lookAt(state.camera.eye, state.camera.target);
  const shift = [0, 1, 2].map((i) =>
    lens ? baseView[0][i] * lens.offset[0] + baseView[1][i] * lens.offset[1] : 0,
  );
  const view = lookAt(
    state.camera.eye.map((x, i) => x + shift[i]) as Vec3,
    state.camera.target.map((x, i) => x + shift[i]) as Vec3,
  );
  const projection =
    state.camera.projection === 'orthographic'
      ? orthographic(3.6, width / height, 0.1, 30)
      : perspective(state.camera.fov, width / height, 0.1, 30);
  if (lens) {
    // 平移光圈样本而不旋转光轴；偏轴投影保证对焦平面上的点仍落到同一像素。
    projection[0][2] -= (projection[0][0] * lens.offset[0]) / lens.focus;
    projection[1][2] -= (projection[1][1] * lens.offset[1]) / lens.focus;
  }
  return { view, projection };
}

export function deskRenderer(state = deskState()) {
  const scene = buildScene(state),
    light = state.objects.find((o) => o.key === 'light')!.position;
  const ball = state.objects.find((o) => o.key === 'ball')!;
  const ballInverse = inverse(modelMatrix(ball.position, ball.rotation, ball.scale));
  const mode = String(state.params.mode);
  const lightVP = sceneMatrices(light).lightVP,
    shadowSize = Number(state.params.shadowSize);
  // bulb 是点光源的显示标记，不能让标记自身遮住这个理想点光源。
  const shadow =
    mode === 'lit'
      ? rasterizeWorld(
          scene.faces
            .filter((_, i) => scene.faceObjects[i] !== 'bulb')
            .map((f) => f.map((i) => scene.vertices[i])),
          lightVP,
          shadowSize,
        )
      : null;
  return (width: number, height: number, lens?: { offset: Vec2; focus: number }) => {
    const { view, projection } = deskCamera(state, width, height, lens);
    const frame = renderFrame(scene, {
      width,
      height,
      view,
      projection,
      reverse: state.params.reverse === true,
      background: [0.86, 0.85, 0.8],
      fragment: (f) => {
        const key = scene.faceObjects[f.face];
        if (key === 'ball') {
          const p = normalize(matVec(ballInverse, [...f.world, 1]).slice(0, 3));
          // 周期函数在球面接缝连续；不对跨越 0/1 的经度直接做三角形插值。
          f.uv = [
            (Math.atan2(p[1], p[0]) / (2 * Math.PI) + 1) % 1,
            Math.acos(Math.max(-1, Math.min(1, p[2]))) / Math.PI,
          ];
        }
        const rho = deskAlbedo(key, f.color, f.uv, f.world, state);
        if (mode === 'albedo') return rho;
        if (mode === 'normal') return f.normal.map((x) => (x + 1) / 2) as Vec3;
        if (mode === 'depth') {
          const d = 1 / Math.max(1, Math.hypot(...sub(state.camera.eye, f.world)));
          return [d, d, d];
        }
        if (key === 'bulb') return [1.8, 1.25, 0.5];
        const delta = sub(light, f.world),
          distance = Math.hypot(...delta);
        const E = pointIrradiance(
          Number(state.params.power),
          Math.max(0.03, distance),
          dot(f.normal, normalize(delta)),
        );
        const visibility = shadow
          ? shadowQuery(
              f.world,
              lightVP,
              shadow.depth,
              shadowSize,
              shadowSize,
              Number(state.params.bias),
              Number(state.params.pcf),
            ).visibility
          : 1;
        // 均匀环境辐照度 0.7 是已知输入；这里没有伪装成求解过的间接光。
        return rho.map((x) => (x / Math.PI) * (0.7 + E * visibility)) as Vec3;
      },
    });
    return { ...frame, faceObjects: scene.faceObjects, scene, lightVP, shadow, data: frame.color };
  };
}
export function renderDesk(state = deskState(), width = 160, height = Math.round((width * 2) / 3)) {
  return deskRenderer(state)(width, height);
}

const references = new Map<string, RGBImage>();
/** 图像章节读取同一场景的线性图像；复制像素，避免编辑污染下一章输入。 */
export function deskImage(width = 96, height = 64): RGBImage {
  const key = `${width}/${height}`;
  if (!references.has(key)) {
    const { data } = renderDesk(deskState(), width, height);
    if (references.size >= 8) references.clear();
    references.set(key, { width, height, data });
  }
  const image = references.get(key)!;
  return { width, height, data: new Float64Array(image.data) };
}

let referenceWidth = 0,
  reference: ReturnType<typeof renderDesk>;
export function referenceFrame(width: number) {
  if (width !== referenceWidth) {
    reference = renderDesk(deskState(), width);
    referenceWidth = width;
  }
  return reference;
}
