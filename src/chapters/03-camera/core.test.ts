import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clipSegment,
  lookAt,
  orthographic,
  perspective,
  perspectiveDivide,
  transformPoints,
  viewport,
} from './core.ts';
import { framing, project } from './framing.ts';
import { matVec, multiply } from '../../math/matrix.ts';
import type { Vec3, Vec4 } from '../../math/vector.ts';

const close = (a: number[], b: number[], tolerance = 1e-10) => {
  assert.equal(a.length, b.length);
  a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) <= tolerance, `${x} != ${b[i]}`));
};
test('相机映到原点，目标映到负 z 轴', () => {
  const eye: Vec3 = [2, 3, 5],
    target: Vec3 = [1, 1, 0],
    m = lookAt(eye, target);
  close(transformPoints([eye], m)[0], [0, 0, 0, 1]);
  const p = transformPoints([target], m)[0];
  close(p.slice(0, 2), [0, 0]);
  assert.ok(p[2] < 0);
});
test('相机奇异姿态被明确拒绝', () => {
  assert.throws(() => lookAt([0, 0, 0], [0, 0, 0]));
  assert.throws(() => lookAt([0, 0, 1], [0, 0, 0], [0, 0, 1]));
});
test('相似三角形手算：clip→NDC→屏幕', () => {
  const p = matVec(perspective(90, 2, 1, 10), [2, 1, -4, 1]) as Vec4;
  close(p, [1, 1, 8 / 3, 4]);
  close(perspectiveDivide([p])[0], [0.25, 0.25, 2 / 3]);
  close(viewport(perspectiveDivide([p]), 640, 480)[0], [400, 180]);
});
test('近平面与远平面分别映到 -1 与 +1', () => {
  for (const m of [perspective(60, 1.8, 0.1, 100), orthographic(4, 1.8, 0.1, 100)]) {
    const z = perspectiveDivide(
      transformPoints(
        [
          [0, 0, -0.1],
          [0, 0, -100],
        ],
        m,
      ),
    ).map((p) => p[2]);
    close(z, [-1, 1]);
  }
});
test('两个端点都在侧面外的线段仍可能穿过画面', () => {
  assert.deepEqual(clipSegment([-2, 0, 0, 1], [2, 0, 0, 1]), [
    [-1, 0, 0, 1],
    [1, 0, 0, 1],
  ]);
  assert.equal(clipSegment([-2, 0, 0, 1], [-3, 1, 0, 1]), null);
});
test('跨越相机的线段先裁剪后除法', () => {
  const m = perspective(60, 1, 0.1, 10),
    a = matVec(m, [0, 0, 1, 1]) as Vec4,
    b = matVec(m, [0.1, 0, -2, 1]) as Vec4;
  const segment = clipSegment(a, b);
  assert.ok(segment);
  assert.ok(segment.every((p) => p[3] > 0));
  assert.ok(perspectiveDivide(segment).flat().every(Number.isFinite));
});
test('正交投影不随深度改变 xy', () => {
  const ndc = perspectiveDivide(
    transformPoints(
      [
        [1, 1, -2],
        [1, 1, -10],
      ],
      orthographic(4, 1, 0.1, 20),
    ),
  );
  close(ndc[0].slice(0, 2), ndc[1].slice(0, 2));
});
test('投影参数与非正 w 的输入检查', () => {
  for (const fov of [0, 180, NaN]) assert.throws(() => perspective(fov, 1, 0.1, 10));
  assert.throws(() => perspective(60, 0, 0.1, 10));
  assert.throws(() => perspective(60, 1, 10, 1));
  assert.throws(() => perspectiveDivide([[1, 1, 0, 0]]));
});
test('推拉变焦保持前景正面所有顶点不变', () => {
  const points: Vec3[] = [
    [-1.1, 0, 0],
    [-1.1, 2.2, 0],
    [-0.54, 1.64, 0],
  ];
  for (const d of [2.4, 2.8, 6, 15, 18])
    close(project(points, d, framing(d).focal).flat(), project(points, 6, 38).flat());
});
test('后退时背景增长并逐渐接近前景像高', () => {
  let previous = 0;
  for (const d of [2.4, 6, 18, 1e6]) {
    const f = framing(d);
    assert.ok(f.back > previous);
    assert.ok(f.ratio < 1);
    close([f.ratio], [d / (d + 8)]);
    previous = f.back;
  }
});
test('独立改变焦距只改变整体比例', () => {
  const a = framing(6, 20, 8, false),
    b = framing(6, 80, 8, false);
  close([a.ratio], [b.ratio]);
  close([4 * a.front, 4 * a.back], [b.front, b.back]);
});
test('像高测量等于实际投影顶点之间的距离', () => {
  for (const d of [2.4, 18])
    for (const gap of [2, 8, 14])
      for (const compensate of [true, false]) {
        const f = framing(d, 120, gap, compensate),
          p = project(
            [
              [0, 0, 0],
              [0, 2.2, 0],
              [0, 0, -gap],
              [0, 2.2, -gap],
            ],
            d,
            f.focal,
          );
        close([p[1][1] - p[0][1], p[3][1] - p[2][1]], [f.front / 24, f.back / 24]);
      }
});
test('样章投影与完整视图/透视矩阵一致', () => {
  const points: Vec3[] = [
    [-1.66, 0, 0],
    [-1.1, 2.2, 0],
    [1.65, 2.2, -8],
    [4, 3, -24],
  ];
  for (const d of [2.4, 6, 18]) {
    const focal = framing(d).focal,
      fov = (2 * Math.atan(12 / focal) * 180) / Math.PI;
    const m = multiply(perspective(fov, 1.8, 0.1, 100), lookAt([0, 1.1, d], [0, 1.1, 0]));
    const expected = perspectiveDivide(transformPoints(points, m)).map((p) => [
      p[0] * 0.9,
      p[1] * 0.5,
    ]);
    close(project(points, d, focal).flat(), expected.flat());
  }
});
test('零间隔取消相对大小变化，厚度不继承正面不变性', () => {
  assert.equal(framing(6, 38, 0).ratio, 1);
  assert.notDeepEqual(project([[0, 2.2, -0.26]], 6, 38), project([[0, 2.2, -0.26]], 18, 114));
});
test('样章拒绝非法距离与镜头后方的点', () => {
  assert.throws(() => framing(0));
  assert.throws(() => framing(6, NaN));
  assert.throws(() => framing(6, 38, -1));
  assert.throws(() => project([[0, 0, 6]], 6, 38));
});
