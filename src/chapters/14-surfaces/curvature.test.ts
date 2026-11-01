import test from 'node:test';
import assert from 'node:assert/strict';
import { principalCurvatures, normalCurvature } from './curvature.ts';
import type { SurfaceJet } from './curvature.ts';
import { defaultControl, surfaceFrame, surfacePartials } from './core.ts';
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test('斜交参数下主曲率不等于参数 Hessian 的特征值，Euler 公式仍成立', () => {
  const d: SurfaceJet = {
    du: [1, 0, 0],
    dv: [1, 2, 0],
    duu: [0, 0, 2],
    duv: [0, 0, 2],
    dvv: [0, 0, 0],
  };
  const f = principalCurvatures(d)!;
  near(f.k1, 2);
  near(f.k2, -0.5);
  for (const theta of [0, 0.3, Math.PI / 4, Math.PI / 2]) {
    const x = Math.cos(theta),
      y = Math.sin(theta);
    near(normalCurvature(d, [x - y / 2, y / 2])!, 2 * x * x - 0.5 * y * y);
  }
});

test('曲面主曲率的和与积独立匹配既有 H/K 公式，翻转法线改变符号', () => {
  const net = defaultControl();
  for (const u of [0.1, 0.5, 0.8])
    for (const v of [0.2, 0.6]) {
      const d = surfacePartials(net, u, v),
        f = principalCurvatures(d)!,
        reference = surfaceFrame(net, u, v);
      near((f.k1 + f.k2) / 2, reference.meanCurvature);
      near(f.k1 * f.k2, reference.gaussianCurvature);
      const flipped = principalCurvatures({
        du: d.dv,
        dv: d.du,
        duu: d.dvv,
        duv: d.duv,
        dvv: d.duu,
      })!;
      near(flipped.k1, -f.k2);
      near(flipped.k2, -f.k1);
    }
});

test('脐点不声称有唯一主方向，退化参数与零方向没有有效法曲率', () => {
  const d: SurfaceJet = {
    du: [1, 0, 0],
    dv: [0, 1, 0],
    duu: [0, 0, 2],
    duv: [0, 0, 0],
    dvv: [0, 0, 2],
  };
  assert.equal(principalCurvatures(d)!.unique, false);
  assert.equal(normalCurvature(d, [0, 0]), null);
  assert.equal(principalCurvatures({ ...d, dv: d.du }), null);
});
