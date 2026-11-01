import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from '../exercises/assert.ts';
import type { Vec2, Vec3 } from '../math/vector.ts';
import { sub } from '../math/vector.ts';
import { compose, inverse, matVec } from '../math/matrix.ts';
import { lookAt } from '../chapters/03-camera/core.ts';
import { homography, warp } from '../chapters/31-registration/core.ts';
import { buildScene } from '../render/scenes.ts';
import { DESK, deskState, lampJoints } from './model.ts';
import { shadeProfile, latheMesh, latheScene, shadeStrip } from './geometry.ts';
import { deskCamera, renderDesk, deskImage } from './render.ts';
import { reachLamp, deskMotion } from './motion.ts';
import { deskMatte, lensImage } from './imaging.ts';
import { opening } from './foundations.ts';
import { ending } from './animation-studies.ts';

test('各章场景独立；修改位置、母线与相机不会污染下一章', () => {
  const a = deskState(),
    b = deskState(),
    expected = structuredClone(b);
  a.camera.eye[0] = 100;
  a.objects.find((o) => o.key === 'ball')!.color[0] = 0;
  a.objects.find((o) => o.key === 'shade')!.profile![0][0] = 1;
  assert.deepEqual(b, expected);
  assert.deepEqual(deskState(), expected);
});

test('灯臂长度与光源连接保持；不可达目标报告实际残差', () => {
  for (const target of [
    [0.2, 1.2],
    [0.8, 1.6],
    [1.9, 2.6],
  ] as Vec2[]) {
    const aim = reachLamp(target),
      joints = lampJoints(aim.angles),
      state = deskState({ angles: aim.angles });
    for (let i = 0; i < 2; i++)
      close(Math.hypot(...sub(joints[i + 1], joints[i])), DESK.lengths[i]);
    close(aim.error, Math.hypot(joints[2][0] - target[0], joints[2][1] - target[1]));
    close(state.objects.find((o) => o.key === 'light')!.position, [
      joints[2][0],
      joints[2][1] - 0.36,
      joints[2][2],
    ]);
    if (aim.reachable) close(aim.error, 0);
    else {
      const distance = Math.hypot(target[0] - DESK.base[0], target[1] - DESK.base[1]);
      close(aim.error, Math.max(distance - 2.5, 0.4 - distance));
    }
  }
});

test('空心灯罩壁闭合，展开接缝三维重合但索引分开', () => {
  const mesh = latheMesh(shadeProfile(), 8),
    edges = new Map<string, number>();
  for (const f of mesh.faces)
    for (let i = 0; i < f.length; i++) {
      const key = [f[i], f[(i + 1) % f.length]].sort((a, b) => a - b).join('/');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  assert.ok([...edges.values()].every((n) => n === 2));
  // 环形截面绕轴旋转形成环面拓扑，V-E+F=0。
  assert.equal(mesh.vertices.length - edges.size + mesh.faces.length, 0);
  for (const n of latheScene(shadeProfile(), 8, [1, 1, 1]).normals) close(Math.hypot(...n), 1);
  const strip = shadeStrip(6);
  for (let row = 0; row <= 6; row++) close(strip.vertices[7 * row], strip.vertices[7 * row + 6]);
  close(shadeProfile()[0], [0.16, 0.34]);
  close(shadeProfile()[6], [0.5, 0]);
});

test('纹样和灯的通量只改变颜色，相机只改变投影', () => {
  const state = deskState(),
    initial = renderDesk(state, 64);
  const changed = renderDesk(deskState({ stripes: 11, power: 72 }), 64);
  assert.deepEqual(changed.depth, initial.depth);
  assert.deepEqual(changed.owner, initial.owner);
  assert.deepEqual(changed.world, initial.world);
  assert.notDeepEqual(changed.color, initial.color);
  close(Array.from(renderDesk(deskState({ phase: 1 }), 64).color), Array.from(initial.color));
  const geometry = buildScene(state);
  state.camera.eye[0] += 1;
  assert.deepEqual(buildScene(state), geometry);
  assert.notDeepEqual(renderDesk(state, 64).depth, initial.depth);
});

test('每个可见像素的表面位置能由真实三角形与记录权重重建', () => {
  const f = renderDesk(deskState(), 48);
  for (let i = 0; i < f.owner.length; i++) {
    if (f.owner[i] < 0) continue;
    const face = f.scene.faces[f.owner[i]],
      w = Array.from(f.weights.slice(3 * i, 3 * i + 3));
    close(
      w.reduce((a, b) => a + b, 0),
      1,
    );
    const world = [0, 1, 2].map((c) =>
      face.reduce((sum, v, k) => sum + w[k] * f.scene.vertices[v][c], 0),
    );
    close(world, Array.from(f.world.slice(3 * i, 3 * i + 3)));
  }
});

test('孔径视图保持对焦平面；离焦偏移符合相似三角形', () => {
  const state = deskState(),
    focus = 5,
    offset: Vec2 = [0.2, -0.1];
  const worldFromCamera = inverse(lookAt(state.camera.eye, state.camera.target));
  const a = deskCamera(state, 180, 120),
    b = deskCamera(state, 180, 120, { focus, offset });
  const project = (camera: typeof a, p: number[]) => {
    const q = matVec(compose(camera.projection, camera.view), p);
    return [q[0] / q[3], q[1] / q[3]];
  };
  for (const distance of [3, 5, 8]) {
    const world = matVec(worldFromCamera, [0.7, -0.3, -distance, 1]);
    const p = project(a, world),
      q = project(b, world);
    close(sub(q, p), [
      a.projection[0][0] * offset[0] * (1 / focus - 1 / distance),
      a.projection[1][1] * offset[1] * (1 / focus - 1 / distance),
    ]);
  }
  close(Array.from(lensImage(5, 0, 5, 32, 24).data), Array.from(renderDesk(state, 32, 24).color));
});

test('桌面单应适用于额外平面点，不能消除球心的离面视差', () => {
  const a = deskState(),
    b = deskState();
  b.camera.eye[0] += 0.8;
  const project = (state: typeof a, p: Vec3): Vec2 => {
    const c = deskCamera(state, 160, 107),
      q = matVec(compose(c.projection, c.view), [...p, 1]);
    return [q[0] / q[3], q[1] / q[3]];
  };
  const corners: Vec3[] = [
    [-2, 0, -1.2],
    [2, 0, -1.2],
    [2, 0, 1.2],
    [-2, 0, 1.2],
  ];
  const H = homography(
    corners.map((p) => project(a, p)),
    corners.map((p) => project(b, p)),
  );
  close(warp(H, project(a, [0.5, 0, 0.5])), project(b, [0.5, 0, 0.5]));
  const ball: Vec3 = [DESK.ball[0], DESK.radius, DESK.ball[1]];
  assert.ok(Math.hypot(...sub(warp(H, project(a, ball)), project(b, ball))) > 0.01);
});

test('图像章节读取真实渲染；编辑副本不改变原图，覆盖对象可分解', () => {
  const a = deskImage(32, 24),
    expected = renderDesk(deskState(), 32, 24);
  assert.deepEqual(a.data, expected.color);
  a.data.fill(0);
  assert.deepEqual(deskImage(32, 24).data, expected.color);
  const ball = deskMatte('ball'),
    lamp = deskMatte('lamp'),
    both = deskMatte('both');
  assert.ok(both.alpha.some((x) => x > 0 && x < 1));
  for (let i = 0; i < both.alpha.length; i++) {
    close(ball.alpha[i] + lamp.alpha[i], both.alpha[i]);
    assert.ok([0, 0.25, 0.5, 0.75, 1].includes(both.alpha[i]));
  }
});

test('首章与终章初始图像逐字节相同；解析一周期恢复同一场景', () => {
  const initial = opening.compute(opening.defaults, 0).items.filter((x) => x.kind === 'raster');
  for (const method of ['analytic', 'explicit', 'symplectic', 'verlet'] as const) {
    assert.deepEqual(deskMotion(0, method, 0.1, 0.2).state, deskState());
    const last = ending
      .compute({ ...ending.defaults, method }, 0)
      .items.filter((x) => x.kind === 'raster');
    assert.deepEqual(last, initial);
  }
  assert.deepEqual(deskMotion(1, 'analytic', 0.1, 0.2).state, deskState());
});

test('终章运动使用解析误差与能量参照；细化显式步长减小偏差', () => {
  const coarse = deskMotion(1, 'explicit', 0.2, 0.2),
    fine = deskMotion(1, 'explicit', 0.02, 0.2);
  assert.ok(coarse.relativeEnergy > 2 && coarse.positionError > 0.1);
  assert.ok(fine.positionError < coarse.positionError / 4);
  close(deskMotion(0.37, 'analytic', 0.1, 0.2).relativeEnergy, 1);
  close(deskMotion(0.5, 'analytic', 0.1, 0.2).displacement, 0.4);
});
