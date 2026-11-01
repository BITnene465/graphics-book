import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Matrix4 } from 'three';
import { modelMatrix } from '../chapters/13-pipeline/core.ts';
import { pixelFootprint } from '../chapters/07-textures/core.ts';
import {
  silhouette,
  pickSurface,
  project,
  implicit,
  analyticNormal,
} from '../chapters/10-geometry/core.ts';
import { snapVertices } from '../chapters/04-barycentric/raster.ts';
import { dot } from '../math/vector.ts';
import type { Vec2, Vec3 } from '../math/vector.ts';
import { studySpec } from './scenes.ts';
import { renderStudy } from './render-study.ts';
import { close } from '../exercises/assert.ts';

test('空间编辑器与教学模型采用相同的 Euler 次序', () => {
  const angles: [number, number, number] = [0.3, -0.8, 1.1],
    matrix = new Matrix4().makeRotationFromEuler(new Euler(...angles, 'ZYX'));
  const core = modelMatrix([0, 0, 0], angles.map((x) => (x * 180) / Math.PI) as Vec3);
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 4; col++) close(matrix.elements[col * 4 + row], core[row][col]);
});
test('正交窗口缩放改变实际成像，不能只改变空间预览', () => {
  const state = studySpec('03').state;
  state.camera.projection = 'orthographic';
  const a = renderStudy(state, 32);
  state.camera.zoom = 2;
  const b = renderStudy(state, 32);
  assert.notDeepEqual(a.owner, b.owner);
});
test('解析椭球轮廓与拾取满足独立几何条件', () => {
  const axes: Vec3 = [2, 1, 0.7],
    view = project([], 35, 25);
  for (const p of silhouette(axes, 35, 25, 24)) {
    close(implicit(p, axes), 0);
    close(dot(analyticNormal(p, axes), view.forward), 0);
    const [xy] = project([p], 35, 25).xy;
    const hit = pickSurface(...xy, axes);
    assert.ok(hit);
    close(hit, p, 1e-6);
  }
  assert.equal(pickSurface(8, 8, axes), null);
});
test('像素四角的平面足迹与消失线', () => {
  const triangle: [Vec2, Vec2, Vec2] = [
      [0, 0],
      [2, 0],
      [0, 2],
    ],
    uv: Vec2[] = [
      [0, 0],
      [1, 0],
      [0, 1],
    ];
  close(pixelFootprint(triangle, uv, [1, 1, 1], 0.5, 0.5), [
    [0, 0],
    [0.5, 0],
    [0.5, 0.5],
    [0, 0.5],
  ]);
  assert.throws(() => pixelFootprint(triangle, uv, [1, 0.01, 0.01], 2, 2));
});
test('子像素量化使用最近偶数，含负数与半格', () => {
  close(
    snapVertices([
      [0.5 / 256, -0.5 / 256],
      [1.5 / 256, -1.5 / 256],
      [2.5 / 256, -2.5 / 256],
    ]),
    [
      [0, 0],
      [2, -2],
      [2, -2],
    ],
  );
});

test('环境背景按眼射线查询，与镜面使用同一个方向函数', async () => {
  const { studyRay } = await import('./render-study.ts');
  const { analyticEnvironment } = await import('../chapters/14-texture-functions/core.ts');
  const state = studySpec('14').state;
  state.params.environment = 'direction';
  state.params.envAngle = 30;
  const frame = renderStudy(state, 32),
    i = frame.owner.findIndex((owner) => owner < 0);
  assert.ok(i >= 0);
  const ray = studyRay(state, i % 32, Math.floor(i / 32), 32);
  close(
    [...frame.linear.slice(i * 3, i * 3 + 3)],
    analyticEnvironment(ray.direction, Math.PI / 6, 'direction'),
  );
});
