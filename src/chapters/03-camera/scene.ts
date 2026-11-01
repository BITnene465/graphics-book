/** 推拉变焦的场景作图。所有几何、投影与测量均调用本章 TypeScript。 */
import { Drawing, palette } from '../../figures/drawing.ts';
import { degrees } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { framing, project } from './framing.ts';

export type CameraParams = {
  distance: number;
  focal: number;
  gap: number;
  mode: 'compensated' | 'free';
};
export const defaults: CameraParams = { distance: 6, focal: 38, gap: 8, mode: 'compensated' };
export type CameraValues = ReturnType<typeof framing> & {
  distance: number;
  gap: number;
  frontPercent: number;
  backPercent: number;
  fov: number;
  anchors: Vec2[];
};
type Face = { points: Vec3[]; color: string; role: string };

export function arch(x: number, z: number, role: 'front' | 'back'): Face[] {
  const radius = 0.56,
    inner = 0.39,
    spring = 1.64;
  const angles = Array.from({ length: 25 }, (_, i) => (i * Math.PI) / 24);
  const outer = angles.map(
    (a) => [x + radius * Math.cos(a), spring + radius * Math.sin(a)] as Vec2,
  );
  const inside = angles.map((a) => [x + inner * Math.cos(a), spring + inner * Math.sin(a)] as Vec2);
  const sections: Vec2[][] = [
    [
      [x - radius, 0],
      [x - inner, 0],
      [x - inner, spring],
      [x - radius, spring],
    ],
    [
      [x + inner, 0],
      [x + radius, 0],
      [x + radius, spring],
      [x + inner, spring],
    ],
    ...angles.slice(0, -1).map((_, i) => [outer[i], outer[i + 1], inside[i + 1], inside[i]]),
  ];
  const [frontColor, sideColor] =
    role === 'front' ? [palette.green, '#175b59'] : [palette.yellow, '#80592e'];
  const faces: Face[] = [];
  for (const section of sections) {
    const front = section.map(([px, py]) => [px, py, z] as Vec3),
      back = front.map(([px, py, pz]) => [px, py, pz - 0.26] as Vec3);
    faces.push(
      { points: back, color: sideColor, role },
      { points: front, color: frontColor, role },
    );
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      faces.push({ points: [front[i], front[j], back[j], back[i]], color: sideColor, role });
    }
  }
  return faces;
}

export function cameraFrame(p: CameraParams) {
  const { distance, gap } = p;
  const values = framing(distance, p.focal, gap, p.mode === 'compensated');
  const { focal } = values;
  const drawing = new Drawing<CameraValues>([-0.9, 0.9, -0.5, 0.5], {
    ...values,
    distance,
    gap,
    frontPercent: (values.front / 24) * 100,
    backPercent: (values.back / 24) * 100,
    fov: degrees(2 * Math.atan(12 / focal)),
    anchors: project(
      [
        [-1.1, 2.45, 0],
        [1.65, 2.45, -gap],
      ],
      distance,
      focal,
    ),
  });
  const polygon = (points: Vec3[], color: string, role = 'room') =>
    drawing.polygon(project(points, distance, focal), color, 1, role);
  const line = (points: Vec3[], color: string, width = 1, role = 'room') =>
    drawing.line(project(points, distance, focal), color, width, 1, false, role);

  drawing.panel('scene', [-0.9, 0.9, -0.5, 0.5], () => {
    // 只对本例轴对齐的房间平面求近端交点；通用裁剪在下一节展示。
    const near = distance - 0.2;
    polygon(
      [
        [-5, 0, -40],
        [5, 0, -40],
        [5, 4.6, -40],
        [-5, 4.6, -40],
      ],
      '#eae5db',
    );
    polygon(
      [
        [-5, 0, near],
        [5, 0, near],
        [5, 0, -40],
        [-5, 0, -40],
      ],
      '#e7e1d5',
    );
    for (const x of [-5, 5])
      polygon(
        [
          [x, 0, near],
          [x, 0, -40],
          [x, 4.6, -40],
          [x, 4.6, near],
        ],
        '#f0ece3',
      );
    polygon(
      [
        [-5, 4.6, near],
        [-5, 4.6, -40],
        [5, 4.6, -40],
        [5, 4.6, near],
      ],
      '#f8f5ee',
    );
    for (let x = -4; x <= 4; x++)
      line(
        [
          [x, 0, near],
          [x, 0, -40],
        ],
        '#d2cbbb',
        0.8,
      );
    for (let z = 16; z > -40; z -= 2)
      if (z < near)
        line(
          [
            [-5, 0, z],
            [5, 0, z],
          ],
          '#d2cbbb',
          0.8,
        );
    for (const z of [-26, -18, -12, -6]) {
      for (const x of [-4.96, 4.96])
        polygon(
          [
            [x, 0, z],
            [x, 4.6, z],
            [x, 4.6, z - 0.18],
            [x, 0, z - 0.18],
          ],
          '#d9d2c3',
        );
      polygon(
        [
          [-5, 4.58, z],
          [5, 4.58, z],
          [5, 4.58, z - 0.18],
          [-5, 4.58, z - 0.18],
        ],
        '#d9d2c3',
      );
    }
    const faces = [...arch(-1.1, 0, 'front'), ...arch(1.65, -gap, 'back')];
    // 平行光沿 (1,-3,-.6) 落到 y=0；同色面覆盖形成投影的并集。
    for (const face of faces)
      polygon(
        face.points.map(([x, y, z]) => [x + y / 3, 0, z - y * 0.2]),
        '#ccc5b6',
        'shadow',
      );
    faces.sort(
      (a, b) =>
        a.points.reduce((s, p) => s + p[2], 0) / 4 - b.points.reduce((s, p) => s + p[2], 0) / 4,
    );
    for (const face of faces) polygon(face.points, face.color, face.role);
    for (const object of [
      { x: -1.1, z: 0, color: palette.green, role: 'front' },
      { x: 1.65, z: -gap, color: palette.yellow, role: 'back' },
    ]) {
      const { x, z, color, role } = object;
      for (const y of [0, 2.2])
        line(
          [
            [x + 0.65, y, z],
            [x + 0.79, y, z],
          ],
          color,
          1.3,
          role,
        );
      line(
        [
          [x + 0.72, 0, z],
          [x + 0.72, 2.2, z],
        ],
        color,
        1.3,
        role,
      );
    }
  });
  drawing.panel('rays', [-19.6, 15.6, -1.8, 1.8], () => {
    drawing.line(
      [
        [-19, 0],
        [15, 0],
      ],
      '#bec8c5',
      1,
      1,
      true,
    );
    for (const { depth, color, role } of [
      { depth: 0, color: palette.green, role: 'front' },
      { depth: gap, color: palette.yellow, role: 'back' },
    ]) {
      drawing.polygon(
        [
          [-distance, 0],
          [depth, -1.1],
          [depth, 1.1],
        ],
        color,
        0.07,
        role,
      );
      drawing.line(
        [
          [-distance, 0],
          [depth, 1.1],
        ],
        color,
        1.4,
        1,
        false,
        role,
      );
      drawing.line(
        [
          [-distance, 0],
          [depth, -1.1],
        ],
        color,
        1.4,
        1,
        false,
        role,
      );
      drawing.line(
        [
          [depth, -1.1],
          [depth, 1.1],
        ],
        color,
        4,
        1,
        false,
        role,
      );
    }
    drawing.dot([-distance, 0], palette.ink, 0.1);
  });
  return drawing.result();
}
