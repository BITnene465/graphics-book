import test from 'node:test';
import assert from 'node:assert/strict';
import { capstoneSpec, renderCapstone, inspectCapstone } from './core.ts';
import { renderStudy } from '../render/render-study.ts';
import { close } from '../exercises/assert.ts';

test('综合场景有真实几何、阴影查询和逐像素回读', () => {
  const state = capstoneSpec().state,
    frame = renderStudy(state, 48),
    i = frame.owner.findIndex((x) => x >= 0);
  assert.ok(i >= 0);
  const probe = inspectCapstone(state, frame, Math.floor(i / 48), i % 48);
  assert.equal(probe.background, false);
  if (!probe.background) {
    assert.ok(probe.shadow.visibility >= 0 && probe.shadow.visibility <= 1);
    close(probe.world, [...frame.world.slice(i * 3, i * 3 + 3)]);
  }
});
test('综合渲染的深度测试不依赖物体提交顺序', () => {
  const state = capstoneSpec().state,
    a = renderCapstone(state, 32);
  state.params.reverse = true;
  assert.deepEqual(renderCapstone(state, 32).pixels, a.pixels);
});
test('固定输出尺寸的超采样在线性光空间平均', () => {
  const state = capstoneSpec().state,
    large = renderStudy(state, 64),
    small = renderCapstone(state, 32, 2);
  assert.equal(small.pixels.length, 32 * 32 * 4);
  for (const [row, col] of [
    [5, 9],
    [15, 16],
    [25, 18],
  ])
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 2; x++)
          sum += large.linear[((row * 2 + y) * 64 + col * 2 + x) * 3 + c] / 4;
      close(small.linear[(row * 32 + col) * 3 + c], sum);
    }
});
