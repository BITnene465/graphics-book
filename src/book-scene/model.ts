import type { Vec2, Vec3 } from '../math/vector.ts';
import type { ObjectState, StudyState, StudySpec } from '../render/scenes.ts';
import { forward } from '../chapters/38-kinematics/core.ts';
import { shadeProfile } from './geometry.ts';
import { slider, choice } from '../figures/spec.ts';

export const DESK = {
  base: [-1.35, 0.16, -0.25] as Vec3,
  lengths: [1.45, 1.05] as Vec2,
  angles: [(70 * Math.PI) / 180, (-90 * Math.PI) / 180] as Vec2,
  ball: [1, 0.4] as Vec2,
  radius: 0.36,
  lampColor: [0.055, 0.28, 0.26] as Vec3,
  ballColor: [0.65, 0.2, 0.055] as Vec3,
  eye: [3.2, 2.4, 4.4] as Vec3,
  target: [0, 0.6, 0] as Vec3,
};
export type DeskParameters = {
  ball: Vec2;
  ballHeight: number;
  angles: Vec2;
  bulge: number;
  detail: number;
  power: number;
  stripes: number;
  phase: number;
  profile: Vec2[];
};
export function lampJoints(angles: Vec2 = DESK.angles): Vec3[] {
  return forward(DESK.lengths, angles).map(([x, y]) => [
    DESK.base[0] + x,
    DESK.base[1] + y,
    DESK.base[2],
  ]);
}
const part = (
  key: string,
  label: string,
  kind: ObjectState['kind'],
  position: Vec3,
  scale: Vec3,
  color: Vec3,
  rotation: Vec3 = [0, 0, 0],
): ObjectState => ({
  key,
  label,
  kind,
  position: [...position],
  scale: [...scale],
  color: [...color],
  rotation: [...rotation],
  detail: kind === 'sphere' && key !== 'ball' ? 5 : undefined,
  editable: key === 'ball',
});

/** 全书只在这里定义桌面场景；函数每次返回独立数组。长度单位为米。 */
export function deskState(options: Partial<DeskParameters> = {}): StudyState {
  const angles = options.angles ?? DESK.angles,
    joints = lampJoints(angles),
    head = joints[2];
  const ball = options.ball ?? DESK.ball,
    r = DESK.radius,
    dark: Vec3 = [0.075, 0.09, 0.095];
  const objects: ObjectState[] = [
    part('table', '刻度桌面', 'box', [0, -0.09, 0], [2.25, 0.09, 1.45], [0.48, 0.43, 0.33]),
    part(
      'base',
      '台灯底座',
      'sphere',
      [DESK.base[0], 0.09, DESK.base[2]],
      [0.42, 0.09, 0.34],
      DESK.lampColor,
    ),
    part(
      'ball',
      '斜纹小球',
      'sphere',
      [ball[0], options.ballHeight ?? r, ball[1]],
      [r, r, r],
      DESK.ballColor,
    ),
  ];
  for (let i = 0; i < 2; i++) {
    const a = joints[i],
      b = joints[i + 1],
      angle = ((angles[0] + (i ? angles[1] : 0)) * 180) / Math.PI;
    objects.push(
      part(
        `arm-${i}`,
        i ? '上灯臂' : '下灯臂',
        'box',
        a.map((x, c) => (x + b[c]) / 2) as Vec3,
        [DESK.lengths[i] / 2, 0.045, 0.055],
        DESK.lampColor,
        [0, 0, angle],
      ),
    );
  }
  joints.forEach((p, i) =>
    objects.push(part(`joint-${i}`, `关节 ${i}`, 'sphere', p, [0.085, 0.085, 0.1], dark)),
  );
  objects.push({
    ...part(
      'shade',
      'Bézier 母线灯罩',
      'lathe',
      [head[0], head[1] - 0.34, head[2]],
      [1, 1, 1],
      DESK.lampColor,
    ),
    profile: shadeProfile(options.bulge, 6, options.profile),
  });
  const light: Vec3 = [head[0], head[1] - 0.36, head[2]];
  objects.push(
    part('bulb', '发光口的显示标记', 'sphere', light, [0.12, 0.025, 0.12], [1, 0.72, 0.25]),
  );
  objects.push(part('light', '台灯点光源', 'light', light, [0.03, 0.03, 0.03], [1, 0.82, 0.5]));
  return {
    chapter: '10',
    objects,
    camera: { eye: [...DESK.eye], target: [...DESK.target], fov: 38, projection: 'perspective' },
    params: {
      desk: true,
      detail: options.detail ?? 10,
      resolution: 384,
      shadowSize: 192,
      bias: 0.003,
      pcf: 1,
      power: options.power ?? 36,
      stripes: options.stripes ?? 6,
      phase: options.phase ?? 0,
      mode: 'lit',
    },
  };
}

export function deskSpec(): StudySpec {
  return {
    title: '桌面场景的像素与表面信息',
    source: '/src/book-scene/render.ts',
    state: deskState(),
    controls: [
      slider('power', '点光源通量', 0, 80, 1, 'W'),
      slider('stripes', '小球纹样周期', 1, 18, 1),
      choice('mode', '检查量', [
        ['lit', '成像'],
        ['albedo', '反射率'],
        ['normal', '法线'],
        ['depth', '距离倒数'],
      ]),
      slider('shadowSize', '阴影图边长', 64, 512, 64, 'px'),
      slider('bias', '阴影深度偏移', 0, 0.02, 0.0005),
      slider('pcf', 'PCF 半径', 0, 3, 1, 'px'),
      choice('resolution', '输出分辨率', [
        [192, '192'],
        [384, '384'],
        [768, '768'],
      ]),
    ],
  };
}
