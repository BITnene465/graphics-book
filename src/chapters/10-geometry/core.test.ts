import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parametric,
  implicit,
  tangents,
  analyticNormal,
  makeMesh,
  meshStatistics,
  analyticSlice,
} from './core.ts';
import { dot } from '../../math/vector.ts';
test('参数点满足隐式方程，梯度垂直于两条切向', () => {
  const axes: [number, number, number] = [2, 1, 0.7],
    p = parametric(0.7, 1.1, axes),
    t = tangents(0.7, 1.1, axes),
    n = analyticNormal(p, axes);
  assert.ok(Math.abs(implicit(p, axes)) < 1e-12);
  assert.ok(Math.abs(dot(n, t.du)) < 1e-12);
  assert.ok(Math.abs(dot(n, t.dv)) < 1e-12);
});
test('椭球网格闭合、欧拉数为 2、细化收敛且体积方向正确', () => {
  let previous = Infinity;
  for (const n of [4, 8, 16]) {
    const m = makeMesh([1, 1, 1], n, 2 * n),
      s = meshStatistics(m.vertices, m.faces, [1, 1, 1]);
    assert.equal(s.euler, 2);
    assert.equal(s.closedEdges, true);
    assert.ok(s.volume > 0);
    assert.ok(s.relativeVolumeError < previous);
    previous = s.relativeVolumeError;
  }
});
test('极点截线是一个点，球外截线为空', () => {
  assert.deepEqual(analyticSlice(1, [1, 1, 1]), [[0, 0, 1]]);
  assert.deepEqual(analyticSlice(2, [1, 1, 1]), []);
});
