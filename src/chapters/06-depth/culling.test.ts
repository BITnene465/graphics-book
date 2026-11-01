import test from 'node:test';
import assert from 'node:assert/strict';
import { boxPlane, frustumPlanes, classifyBox } from './culling.ts';
import type { Box } from './culling.ts';
import { dot } from '../../math/vector.ts';

test('中心半径界与八个角点的独立最值一致，包括非单位法线', () => {
  const box: Box = { center: [2, -1, -4], halfSize: [0.7, 1.3, 0.2] };
  for (const plane of [
    ...frustumPlanes(65, 1.5, 0.5, 20),
    { name: '斜', normal: [2, -3, 7] as [number, number, number], offset: 4 },
  ]) {
    const corners = Array.from({ length: 8 }, (_, mask) =>
      box.center.map((x, i) => x + (mask & (1 << i) ? 1 : -1) * box.halfSize[i]),
    );
    const values = corners.map((p) => dot(p, plane.normal) + plane.offset),
      range = boxPlane(box, plane);
    assert.ok(Math.abs(range.min - Math.min(...values)) < 1e-12);
    assert.ok(Math.abs(range.max - Math.max(...values)) < 1e-12);
  }
});
test('视锥整盒剔除、候选、完全在内及相切保留', () => {
  const planes = frustumPlanes(90, 1, 1, 8),
    halfSize: [number, number, number] = [0.5, 0.5, 0.5];
  assert.equal(classifyBox({ center: [0, 0, -4], halfSize }, planes).state, 'inside');
  assert.equal(classifyBox({ center: [20, 0, -4], halfSize }, planes).state, 'outside');
  assert.equal(classifyBox({ center: [0, 0, 1], halfSize }, planes).rejecting, '近');
  assert.equal(classifyBox({ center: [0, 0, -0.5], halfSize }, planes).state, 'candidate');
  assert.equal(classifyBox({ center: [4.5, 0, -4], halfSize }, planes).state, 'candidate');
});
