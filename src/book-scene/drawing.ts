import { Drawing, palette, circle } from '../figures/drawing.ts';
import { imagePanel } from '../figures/advanced.ts';
import type { Vec2, Vec3 } from '../math/vector.ts';
import type { StudyState } from '../render/scenes.ts';
import { DESK, lampJoints } from './model.ts';
import { shadeProfile } from './geometry.ts';
import type { renderDesk } from './render.ts';

export function orbitCamera(
  state: StudyState,
  azimuth: number,
  elevation: number,
  distance = 5.73,
) {
  const a = (azimuth * Math.PI) / 180,
    e = (elevation * Math.PI) / 180;
  state.camera.eye = state.camera.target.map(
    (x, i) => x + distance * [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)][i],
  ) as Vec3;
}

/** 俯视图直接编辑世界 X/Z；旁边的相机图像由三维数据重算。 */
export function deskPlan(d: Drawing, state: StudyState, key = 'ball') {
  d.panel('桌面俯视 · X / Z', [-2.5, 2.5, -1.65, 1.65], () => {
    d.polygon(
      [
        [-2.25, -1.45],
        [2.25, -1.45],
        [2.25, 1.45],
        [-2.25, 1.45],
      ],
      palette.muted,
      0.1,
    );
    for (let x = -2; x <= 2; x += 0.5)
      d.line(
        [
          [x, -1.45],
          [x, 1.45],
        ],
        palette.muted,
        0.6,
        0.3,
      );
    for (let z = -1; z <= 1; z += 0.5)
      d.line(
        [
          [-2.25, z],
          [2.25, z],
        ],
        palette.muted,
        0.6,
        0.3,
      );
    const base: Vec2 = [DESK.base[0], DESK.base[2]],
      ball = state.objects.find((o) => o.key === 'ball')!.position;
    const light = state.objects.find((o) => o.key === 'light')!.position;
    d.line(circle(base, 0.4), palette.green, 2);
    d.line([base, [light[0], light[2]]], palette.green, 5);
    d.dot([light[0], light[2]], palette.yellow, 0.08);
    d.line(circle([ball[0], ball[2]], DESK.radius), palette.yellow, 3);
    d.handle([ball[0], ball[2]], key, '小球 · 桌面位置', { limits: [-1.9, 1.9, -1.05, 1.05] });
    d.text([-2.25, -1.55], '每格 0.5 m', palette.muted, 11);
  });
}

/** 正视剖面保持与三维灯臂相同的关节数据，不另画一套姿态。 */
export function lampFront(d: Drawing, angles: Vec2, target?: Vec2, key = 'target') {
  const joints = lampJoints(angles),
    head = joints[2],
    ball: Vec2 = [DESK.ball[0], DESK.radius];
  d.panel('灯臂正视 · X / Y', [-2.6, 2.5, -0.25, 2.9], () => {
    d.line(
      [
        [-2.4, 0],
        [2.3, 0],
      ],
      palette.muted,
      2,
    );
    d.line(
      joints.map(([x, y]) => [x, y]),
      palette.green,
      9,
    );
    joints.forEach(([x, y]) => d.dot([x, y], palette.yellow, 0.065));
    const outer = shadeProfile().slice(0, 7);
    d.polygon(
      [
        ...outer.map(([r, y]) => [head[0] - r, head[1] - 0.34 + y]),
        ...[...outer].reverse().map(([r, y]) => [head[0] + r, head[1] - 0.34 + y]),
      ],
      palette.green,
      0.35,
    );
    d.line(circle(ball, DESK.radius), palette.yellow, 2);
    if (target) d.handle(target, key, '灯头目标', { limits: [-2.1, 1.9, 0.7, 2.6] });
    d.text([DESK.base[0] - 0.32, -0.14], '固定底座', palette.muted, 11);
  });
}

/** 探针回读已经渲染的像素；移动探针不重新生成场景。 */
export function pixelPanels(
  d: Drawing,
  frame: ReturnType<typeof renderDesk>,
  point: Vec2,
  title = '台灯、小球与桌面',
) {
  const { width, height } = frame,
    aspect = width / height;
  const col = Math.max(0, Math.min(width - 1, Math.floor(((point[0] / aspect + 1) * width) / 2)));
  const row = Math.max(0, Math.min(height - 1, Math.floor(((1 - point[1]) * height) / 2)));
  imagePanel(
    d,
    title,
    width,
    height,
    frame.color,
    1,
    () => {
      d.handle(point, 'probe', '像素探针', {
        limits: [-aspect + 0.01, aspect - 0.01, -0.99, 0.99],
      });
    },
    true,
  );
  d.panels[d.panels.length - 1].columns = 2;
  const size = 7,
    data = new Float64Array(size * size * 3);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = Math.max(0, Math.min(width - 1, col + x - 3)),
        r = Math.max(0, Math.min(height - 1, row + y - 3));
      data.set(
        frame.color.subarray(3 * (r * width + c), 3 * (r * width + c) + 3),
        3 * (y * size + x),
      );
    }
  imagePanel(
    d,
    '同一像素的 7 × 7 邻域',
    size,
    size,
    data,
    1,
    () => {
      d.line(
        [
          [-1 / 7, -1 / 7],
          [1 / 7, -1 / 7],
          [1 / 7, 1 / 7],
          [-1 / 7, 1 / 7],
          [-1 / 7, -1 / 7],
        ],
        palette.yellow,
        2,
      );
    },
    true,
  );
  const i = row * width + col,
    face = frame.owner[i];
  const names: Record<string, string> = {
    table: '桌面',
    base: '台灯底座',
    ball: '斜纹小球',
    shade: '灯罩',
    bulb: '发光口标记',
    'arm-0': '下灯臂',
    'arm-1': '上灯臂',
    'joint-0': '底座关节',
    'joint-1': '中间关节',
    'joint-2': '灯头关节',
  };
  return {
    row,
    col,
    face,
    object: face < 0 ? '背景' : (names[frame.faceObjects[face]] ?? frame.faceObjects[face]),
    rgb: Array.from(frame.color.slice(3 * i, 3 * i + 3)),
    world: Array.from(frame.world.slice(3 * i, 3 * i + 3)),
    normal: Array.from(frame.normal.slice(3 * i, 3 * i + 3)),
    uv: Array.from(frame.uv.slice(2 * i, 2 * i + 2)),
    weights: Array.from(frame.weights.slice(3 * i, 3 * i + 3)),
  };
}
