import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, leastSquares } from './linear.ts';
import { cubeMesh, triangulate, gridMesh, adjacency } from './mesh.ts';
import {
  catmullClark,
  dooSabin,
  loopSubdivision,
  loopBeta,
  dooSabinWeights,
  butterflyPoint,
} from '../chapters/16-subdivision/core.ts';
import { laplacian, smooth, dirichletEnergy } from '../chapters/17-fairing/core.ts';
import { quadrics, quadricError, simplify, splitEdge } from '../chapters/18-remeshing/core.ts';
import { lscm, harmonic, distortion } from '../chapters/19-parameterization/core.ts';
import { ffd, arap2, differentialEdit } from '../chapters/20-deformation/core.ts';
import {
  triangulateRays,
  stereoDepth,
  icp,
  tetraSurface,
} from '../chapters/21-reconstruction/core.ts';
import { rewrite, turtle, midpointDisplacement } from '../chapters/22-procedural-modeling/core.ts';
import type { Vec2, Vec3 } from './vector.ts';
const near = (a: number, b: number, tol = 1e-8) => assert.ok(Math.abs(a - b) < tol, a + ' ≠ ' + b);
test('小型线性系统主元交换、最小二乘与退化拒绝', () => {
  assert.deepEqual(
    solve(
      [
        [0, 2],
        [1, 1],
      ],
      [4, 3],
    ),
    [1, 2],
  );
  const x = leastSquares(
    [
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    [1, 2, 2],
  );
  near(x[0], 7 / 6);
  near(x[1], 0.5);
  assert.throws(() =>
    solve(
      [
        [1, 1],
        [2, 2],
      ],
      [1, 2],
    ),
  );
  assert.throws(() =>
    leastSquares(
      [
        [1, 1],
        [1, 1],
      ],
      [1, 2],
    ),
  );
});
test('三套闭合细分保持定向流形与欧拉示性数，并保持仿射平移', () => {
  for (const rule of [catmullClark, dooSabin, loopSubdivision]) {
    const mesh = rule === loopSubdivision ? triangulate(cubeMesh()) : cubeMesh(),
      out = rule(mesh),
      a = adjacency(out);
    assert.equal(out.vertices.length - a.edges.length + out.faces.length, 2);
    assert.ok(a.edges.every((e) => e.faces.length === 2));
    const shifted = rule({
      ...mesh,
      vertices: mesh.vertices.map((p) => p.map((x) => x + 3) as Vec3),
    });
    out.vertices.forEach((p, i) => p.forEach((x, j) => near(shifted.vertices[i][j], x + 3)));
  }
});
test('细分模板手算权重、边界与负权输出', () => {
  near(loopBeta(3), 3 / 16);
  near(loopBeta(6), 1 / 16);
  near(
    dooSabinWeights(4, 0).reduce((a, b) => a + b, 0),
    1,
  );
  const mesh = {
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ] as Vec3[],
    faces: [[0, 1, 2, 3]],
  };
  assert.deepEqual(catmullClark(mesh).vertices[0], [0.125, 0.125, 0]);
  const points = Array.from({ length: 8 }, () => [0, 0, 0] as Vec3);
  points[4][2] = 1;
  near(butterflyPoint(points)[2], -1 / 16);
  assert.throws(() => dooSabin(mesh));
});
test('余切算子消灭常数与平面内部的线性坐标', () => {
  const m = gridMesh(4),
    L = laplacian(m, 'cotangent'),
    boundary = adjacency(m).boundary;
  L.forEach((r, i) => {
    near(
      r.reduce((s, x) => s + x, 0),
      0,
    );
    if (!boundary[i].length)
      for (const axis of [0, 1])
        near(
          r.reduce((s, w, j) => s + w * m.vertices[j][axis], 0),
          0,
        );
  });
});
test('隐式扩散固定边界并降低对称 Dirichlet 能量', () => {
  const m = gridMesh(5, (x, y) => Math.sin(4 * x) * Math.cos(5 * y)),
    pins = adjacency(m).boundary.flatMap((v, i) => (v.length ? [i] : [])),
    L = laplacian(m);
  const out = smooth(m, 3, 3, true, 'uniform', pins);
  pins.forEach((i) => assert.deepEqual(out.vertices[i], m.vertices[i]));
  assert.ok(
    dirichletEnergy(
      L,
      out.vertices.map((p) => p[2]),
    ) <
      dirichletEnergy(
        L,
        m.vertices.map((p) => p[2]),
      ),
  );
});
test('二次误差使用单位平面的距离平方，折叠保持闭合拓扑', () => {
  const plane = gridMesh(1),
    q = quadrics(plane);
  near(quadricError(q[1], [0, 0, 2]), 4);
  const m = triangulate(catmullClark(cubeMesh())),
    before = JSON.stringify(m),
    out = simplify(m, 8);
  assert.equal(JSON.stringify(m), before);
  assert.ok(out.mesh.faces.length < m.faces.length);
  for (const h of out.history) {
    const a = adjacency(h);
    assert.equal(h.vertices.length - a.edges.length + h.faces.length, 2);
    assert.ok(a.edges.every((e) => e.faces.length === 2));
  }
  const e = adjacency(m).edges[0],
    split = splitEdge(m, e.a, e.b);
  assert.equal(split.faces.length, m.faces.length + 2);
});
test('调和坐标复现仿射平面，LSCM 复现平面相似变换', () => {
  const m = gridMesh(3),
    boundary = new Map<number, Vec2>();
  adjacency(m).boundary.forEach((v, i) => {
    if (v.length) boundary.set(i, m.vertices[i].slice(0, 2) as Vec2);
  });
  const a = harmonic(m, boundary, 'cotangent'),
    b = lscm(
      m,
      new Map([
        [0, [-1, -1]],
        [15, [1, 1]],
      ]),
    );
  for (const out of [a, b]) out.forEach((p, i) => p.forEach((x, j) => near(x, m.vertices[i][j])));
  for (const f of m.faces) near(distortion(m, b, f).ratio, 1);
});
test('Jacobian 分开记录反转、面积与长度失真', () => {
  const m = {
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ] as Vec3[],
    faces: [[0, 1, 2]],
  };
  const d = distortion(
    m,
    [
      [0, 0],
      [2, 0],
      [0, -0.5],
    ],
    [0, 1, 2],
  );
  near(d.det, -1);
  near(d.ratio, 4);
});
test('FFD 复现恒等映射；差分编辑与 ARAP 复现一致平移约束', () => {
  ffd(
    [0.2, 0.3],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  ).forEach((x, i) => near(x, [0.2, 0.3][i]));
  const m = gridMesh(3),
    handles = new Map<number, Vec3>([
      [0, [-0.5, -0.75, 0]],
      [15, [1.5, 1.25, 0]],
    ]);
  const a = differentialEdit(m, handles).vertices,
    b = arap2(m, new Map([...handles].map(([i, p]) => [i, p.slice(0, 2) as Vec2])), 20);
  a.forEach((p, i) => {
    near(p[0], m.vertices[i][0] + 0.5);
    near(p[1], m.vertices[i][1] + 0.25);
  });
  for (const [i, p] of handles) {
    near(b[i][0], p[0]);
    near(b[i][1], p[1]);
  }
});
test('三角测量复现空间点，平行射线不伪造有限深度', () => {
  const p = triangulateRays(
    [
      [-1, 0, 0],
      [1, 0, 0],
    ],
    [
      [1, 0.4, -3],
      [-1, 0.4, -3],
    ],
  );
  p.forEach((x, i) => near(x, [0, 0.4, -3][i]));
  assert.throws(() =>
    triangulateRays(
      [
        [0, 0, 0],
        [1, 0, 0],
      ],
      [
        [0, 0, -1],
        [0, 0, -1],
      ],
    ),
  );
  near(stereoDepth(800, 0.1, 20), 4);
});
test('ICP 恒等输入不移动；四面体线性等值面满足方程', () => {
  const ps: Vec2[] = [
    [0, 0],
    [1, 0],
    [0, 2],
  ];
  assert.deepEqual(icp(ps, ps, 3).points, ps);
  const p: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    out = tetraSurface(p, [-0.5, 0.5, -0.5, -0.5]);
  assert.equal(out.length, 1);
  out.flat().forEach((v) => near(v[0], 0.5));
});
test('并行重写、栈恢复和随机细化具有确定性', () => {
  assert.equal(rewrite('A', { A: 'AB', B: 'A' }, 3), 'ABAAB');
  const ls = turtle('F[+F]F', Math.PI / 2, 1);
  near(ls.at(-1)![1][1], 2);
  const a = midpointDisplacement(6, 0.7, 3),
    b = midpointDisplacement(7, 0.7, 3);
  assert.equal(a.length, 65);
  a.forEach((p, i) => assert.deepEqual(p, b[2 * i]));
  assert.throws(() => turtle(']', 1, 1));
});
