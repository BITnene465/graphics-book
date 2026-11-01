import test from 'node:test';
import assert from 'node:assert/strict';
import { studySpec, sceneChapters } from './scenes.ts';
import { renderStudy } from './render-study.ts';
for (const chapter of sceneChapters)
  test(`${chapter} 三维综合演示实际生成可检查的像素`, () => {
    const state = studySpec(chapter).state,
      frame = renderStudy(state, 32);
    assert.equal(frame.pixels.length, 32 * 32 * 4);
    assert.ok(
      frame.owner.some((x) => x >= 0),
      '画幅内须有几何',
    );
    assert.ok(
      frame.pixels.some((x, i) => i % 4 !== 3 && x !== frame.pixels[i % 4]),
      '图像不能只是同一背景',
    );
    assert.ok(frame.depth.every((x, i) => frame.owner[i] < 0 || Number.isFinite(x)));
    assert.ok(frame.normal.every(Number.isFinite));
  });
test('改变相机或物体必须改变正式图像', () => {
  const state = studySpec('03').state,
    a = renderStudy(state, 32);
  state.objects[0].position[0] += 0.5;
  const b = renderStudy(state, 32);
  assert.notDeepEqual(a.pixels, b.pixels);
  state.camera.eye = [0, 0, 6];
  const c = renderStudy(state, 32);
  assert.notDeepEqual(b.pixels, c.pixels);
});
test('正交投影与透视投影在完整演示中不同', () => {
  const state = studySpec('15').state,
    a = renderStudy(state, 32);
  state.camera.projection = 'orthographic';
  const b = renderStudy(state, 32);
  assert.notDeepEqual(a.pixels, b.pixels);
});
test('材质参数改变光线追踪颜色，但不改变首次可见表面', () => {
  const state = studySpec('15').state;
  state.params.mirrorA = 0;
  const matte = renderStudy(state, 48);
  state.params.mirrorA = 0.95;
  const mirror = renderStudy(state, 48);
  assert.deepEqual(matte.owner, mirror.owner);
  assert.notDeepEqual(matte.pixels, mirror.pixels);
  state.params.specular = 1;
  state.params.shininess = 1;
  const broad = renderStudy(state, 48);
  state.params.shininess = 512;
  const narrow = renderStudy(state, 48);
  assert.deepEqual(broad.depth, narrow.depth);
  assert.notDeepEqual(broad.pixels, narrow.pixels);
});
