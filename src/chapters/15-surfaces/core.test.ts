import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePatch,
  deCasteljauPatch,
  surfaceFrame,
  patchMesh,
  stitchPatches,
  joinDiagnostics,
} from './core.ts';
import type { ControlNet } from './core.ts';
const close = (a: number, b: number, t = 1e-10) => assert.ok(Math.abs(a - b) < t, `${a} ≠ ${b}`);
const plane: ControlNet = Array.from({ length: 4 }, (_, i) =>
  Array.from({ length: 4 }, (_, j) => [i / 3, j / 3, 0]),
);
test('张量积与两个方向 de Casteljau 求同一点', () => {
  const control = plane.map((row, i) =>
    row.map((p, j) => [p[0], p[1], Math.sin(i + j)] as [number, number, number]),
  );
  for (const order of ['u', 'v'] as const)
    deCasteljauPatch(control, 0.37, 0.63, order).position.forEach((x, i) =>
      close(x, evaluatePatch(control, 0.37, 0.63)[i]),
    );
});
test('平面曲率为零，切向面积正确，退化参数网不虚构法线', () => {
  const f = surfaceFrame(plane, 0.4, 0.6);
  assert.equal(f.regular, true);
  close(f.area, 1);
  close(f.meanCurvature, 0);
  close(f.gaussianCurvature, 0);
  close(f.normal[2], 1);
  const bad = surfaceFrame(
    plane.map((row) => row.map((p) => [p[0], 0, 0])),
    0.4,
    0.6,
  );
  assert.equal(bad.regular, false);
  assert.ok(Number.isNaN(bad.meanCurvature));
});
test('曲面网格绕序与解析法线一致，不改变解析曲面', () => {
  const m = patchMesh(plane, [3, 5]);
  assert.equal(m.vertices.length, 24);
  assert.equal(m.faces.length, 30);
  assert.ok(m.normals.every((n) => n[2] > 0.999));
});
test('C2 跨片拼接考虑参数跨度，沿缝独立检查', () => {
  const right = plane.map((row) =>
      row.map((p) => [p[0] + 1, p[1], p[0] * 0.3] as [number, number, number]),
    ),
    joined = stitchPatches(plane, right, 'C2', 2, 0.7);
  for (const v of [0, 0.2, 0.6, 1]) {
    const d = joinDiagnostics(joined.left, joined.right, v, 2, 0.7);
    assert.equal(d.c2, true);
    assert.equal(d.g1, true);
  }
});
