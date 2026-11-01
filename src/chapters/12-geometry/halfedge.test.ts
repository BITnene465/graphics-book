import test from 'node:test';
import assert from 'node:assert/strict';
import { halfedges, faceCycle, flipEdge } from './halfedge.ts';

test('半边面环闭合、内部 twin 成对、边界不冒充一个面', () => {
  const mesh = halfedges(4, [
    [0, 1, 2],
    [0, 2, 3],
  ]);
  assert.deepEqual(faceCycle(mesh, 0), [0, 1, 2]);
  assert.deepEqual(faceCycle(mesh, 1), [3, 4, 5]);
  assert.equal(mesh.edges.filter((e) => e.twin < 0).length, 4);
  for (const [h, e] of mesh.edges.entries())
    if (e.twin >= 0) {
      assert.equal(mesh.edges[e.twin].twin, h);
      assert.equal(mesh.edges[e.next].origin, mesh.edges[e.twin].origin);
    }
});
test('翻边更换内部对角线，保持边界、定向与面数', () => {
  const mesh = halfedges(4, [
      [0, 1, 2],
      [0, 2, 3],
    ]),
    flipped = flipEdge(mesh, 2);
  const boundary = (m: typeof mesh) =>
    m.edges
      .filter((e) => e.twin < 0)
      .map((e) => `${e.origin},${m.edges[e.next].origin}`)
      .sort();
  assert.deepEqual(boundary(mesh), boundary(flipped));
  assert.equal(flipped.faces.length, 2);
  assert.ok(flipped.edges.some((e) => e.origin === 1 && flipped.edges[e.next].origin === 3));
  const vertices = [
    [0, 0],
    [2, 0],
    [2, 1],
    [0, 1],
  ];
  const area = flipped.faces.reduce((sum, _, f) => {
    const [a, b, c] = faceCycle(flipped, f).map((h) => vertices[flipped.edges[h].origin]);
    const twice = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    assert.ok(twice > 0);
    return sum + twice / 2;
  }, 0);
  assert.equal(area, 2);
  assert.throws(() => flipEdge(mesh, 0));
});
test('半边构建拒绝坏索引、重复有向边和第三个共享面', () => {
  assert.throws(() => halfedges(3, [[0, 1, 3]]));
  assert.throws(() =>
    halfedges(4, [
      [0, 1, 2],
      [0, 1, 3],
    ]),
  );
  assert.throws(() =>
    halfedges(5, [
      [0, 1, 2],
      [1, 0, 3],
      [0, 1, 4],
    ]),
  );
});
