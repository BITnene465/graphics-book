import test from 'node:test';
import assert from 'node:assert/strict';
import { block, sphere, contains, sampleSolid } from './csg.ts';
import type { Solid } from './csg.ts';
import {
  buildOctree,
  childCube,
  classifyCube,
  octreeLeaves,
  queryOctree,
  volumeBounds,
} from './octree.ts';

test('CSG 的内外、边界和差集次序可由已知点独立检查', () => {
  const a = block([0, 0, 0], [1, 1, 1]),
    b = sphere([1, 0, 0], 0.75);
  const union: Solid = { kind: 'union', left: a, right: b };
  const intersection: Solid = { ...union, kind: 'intersection' };
  const difference: Solid = { ...union, kind: 'difference' };
  const reverse: Solid = { kind: 'difference', left: b, right: a };
  const x = [0, 0.6, 1.3, 2];
  assert.deepEqual(
    x.map((x) => contains(union, [x, 0, 0])),
    [true, true, true, false],
  );
  assert.deepEqual(
    x.map((x) => contains(intersection, [x, 0, 0])),
    [false, true, false, false],
  );
  assert.deepEqual(
    x.map((x) => contains(difference, [x, 0, 0])),
    [true, false, false, false],
  );
  assert.deepEqual(
    x.map((x) => contains(reverse, [x, 0, 0])),
    [false, false, true, false],
  );
  assert.ok(contains(b, [1.75, 0, 0]));
  assert.ok(!contains(difference, [0.25, 0, 0]));
  assert.ok(!contains({ kind: 'difference', left: a, right: a }, [1, 0, 0]));
  assert.throws(() => sphere([0, 0, 0], -1));
});

test('CSG 中心采样与三维索引一致，组合后仍保留连续点查询', () => {
  const a = block([0.5, 0, 0], [0.49, 0.99, 0.99]);
  assert.deepEqual([...sampleSolid(a, 1, 2)], [0, 1, 0, 1, 0, 1, 0, 1]);
  const tiny = sphere([0, 0, 0], 0.1);
  assert.ok(contains(tiny, [0, 0, 0]));
  assert.ok(
    sampleSolid(tiny, 1, 2).every((x) => x === 0),
    '中心采样可能漏掉小物体',
  );
});

test('八叉树的整盒判定不会把角点之外的小球漏掉', () => {
  const cube = { center: [0, 0, 0] as [number, number, number], halfSize: 1 };
  assert.equal(classifyCube(cube, sphere([0, 0, 0], 0.1)), 'boundary');
  assert.equal(classifyCube(cube, sphere([0, 0, 0], 2)), 'inside');
  assert.equal(classifyCube(cube, sphere([3, 0, 0], 0.5)), 'outside');
  assert.equal(classifyCube(cube, sphere([2, 0, 0], 1)), 'boundary', '相切仍有边界');
  const centers = Array.from({ length: 8 }, (_, i) => childCube(cube, i).center);
  assert.equal(new Set(centers.map(String)).size, 8);
  assert.deepEqual(centers[5], [0.5, -0.5, 0.5]);
});

test('细化给出嵌套体积界，叶子体积合计为根盒体积', () => {
  const ball = sphere([0.2, -0.15, 0.1], 1.1),
    cube = { center: [0, 0, 0] as [number, number, number], halfSize: 2 };
  const exact = (4 * Math.PI * ball.radius ** 3) / 3;
  let previous = { lower: 0, upper: 64 };
  for (let depth = 0; depth <= 5; depth++) {
    const root = buildOctree(ball, cube, depth),
      bounds = volumeBounds(root);
    assert.ok(bounds.lower <= exact && exact <= bounds.upper);
    assert.ok(bounds.lower >= previous.lower && bounds.upper <= previous.upper);
    assert.equal(
      octreeLeaves(root).reduce((v, n) => v + (2 * n.halfSize) ** 3, 0),
      64,
    );
    previous = bounds;
  }
  assert.ok(previous.upper - previous.lower < 3);
});

test('八叉树查询在分割面只选一个子盒，边界叶仍须精确查询', () => {
  const root = buildOctree(sphere([0, 0, 0], 1.1), { center: [0, 0, 0], halfSize: 2 }, 4);
  const hit = queryOctree(root, [0, 0, 0]);
  assert.equal(hit.indices[0], 7);
  assert.equal(hit.path.at(-1)!.state, 'inside');
  assert.equal(queryOctree(root, [2, 2, 2]).path.at(-1)!.state, 'outside');
  assert.equal(queryOctree(root, [2.01, 0, 0]).path.length, 0);
  assert.equal(queryOctree(root, [1.1, 0, 0]).path.at(-1)!.state, 'boundary');
});
