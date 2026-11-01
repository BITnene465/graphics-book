import { Drawing, palette } from '../../figures/drawing.ts';
import { choice, slider, number } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { drawMesh } from '../../figures/advanced.ts';
import { gridMesh, adjacency } from '../../math/mesh.ts';
import { smooth, laplacian, dirichletEnergy, constrainedSolve } from './core.ts';

export const figures: FigureSpec[] = [
  {
    id: 'mesh-diffusion',
    orbitPanels: ['固定参考网格', '平滑后的网格'],
    chapter: '17',
    title: '减小起伏，也可能抹平真实形状',
    subtitle: '同一算子比较显式与隐式步进；固定边界或放开边界，观察收缩和稳定性。',
    source: '/src/chapters/17-fairing/core.ts',
    animated: true,
    duration: 8,
    defaults: {
      noise: 0.2,
      steps: 6,
      lambda: 0.4,
      method: 'implicit',
      weights: 'uniform',
      boundary: true,
      azimuth: 35,
      elevation: 35,
    },
    controls: [
      choice('method', '时间离散', [
        ['explicit', '显式'],
        ['implicit', '隐式'],
      ]),
      choice('weights', '邻接权重', [
        ['uniform', '均匀'],
        ['cotangent', '余切'],
      ]),
      choice('boundary', '边界约束', [
        [true, '固定'],
        [false, '自由'],
      ]),
      slider('noise', '高频起伏', 0, 0.4, 0.01),
      slider('lambda', '步长', 0, 1.5, 0.05),
      slider('steps', '迭代次数', 0, 12, 1),
      slider('azimuth', '观察方位', -180, 180, 1, '°'),
      slider('elevation', '观察仰角', -60, 70, 1, '°'),
    ],
    compute(p, t) {
      const d = new Drawing(),
        mesh = gridMesh(
          8,
          (x, y) =>
            0.3 * Math.cos(x * 1.5) * Math.cos(y * 1.5) +
            number(p, 'noise') * Math.sin(17 * x + 4 * y) * Math.cos(13 * y),
        );
      const boundary = adjacency(mesh)
          .boundary.map((b, i) => (b.length ? i : -1))
          .filter((i) => i >= 0),
        k = Math.floor(t * number(p, 'steps') + 1e-8),
        kind = p.weights as 'uniform' | 'cotangent';
      const next = smooth(
        mesh,
        k,
        number(p, 'lambda'),
        p.method === 'implicit',
        kind,
        p.boundary ? boundary : [],
      );
      const az = number(p, 'azimuth'),
        el = number(p, 'elevation'),
        L = laplacian(mesh, kind);
      d.panel('固定参考网格', [-1.8, 1.8, -1.5, 1.5], () =>
        drawMesh(d, mesh, az, el, palette.muted),
      );
      d.panel('平滑后的网格', [-1.8, 1.8, -1.5, 1.5], () => drawMesh(d, next, az, el));
      d.values = {
        迭代: k,
        原始高度能量: dirichletEnergy(
          L,
          mesh.vertices.map((p) => p[2]),
        ),
        当前高度能量: dirichletEnergy(
          L,
          next.vertices.map((p) => p[2]),
        ),
        最大绝对坐标: Math.max(...next.vertices.flat().map(Math.abs)),
        边界固定点: p.boundary ? boundary.length : 0,
      };
      d.formula =
        p.method === 'implicit'
          ? '(I+\\lambda\\widehat L)x^{k+1}=x^k'
          : 'x^{k+1}=x^k-\\lambda\\widehat Lx^k';
      return d.result();
    },
  },
  {
    id: 'laplace-constraints',
    chapter: '17',
    title: '同一个邻接算子，由边界选定解',
    subtitle: '拖动右端约束；比较一个锚点与两个锚点，区分零空间和边界条件。',
    source: '/src/chapters/17-fairing/core.ts',
    animated: false,
    defaults: { target: [1, 1], mode: 'two' },
    controls: [
      choice('mode', '固定条件', [
        ['one', '只固定左端'],
        ['two', '固定两端'],
      ]),
    ],
    compute(p) {
      const d = new Drawing([-0.15, 1.15, -1.6, 1.6]),
        n = 10,
        L = Array.from({ length: n }, () => Array(n).fill(0));
      for (let i = 0; i < n - 1; i++) {
        L[i][i]++;
        L[i + 1][i + 1]++;
        L[i][i + 1]--;
        L[i + 1][i]--;
      }
      const target = p.target as number[],
        fixed = new Map([[0, 0]]);
      if (p.mode === 'two') fixed.set(n - 1, target[1]);
      const y = constrainedSolve(L, Array(n).fill(0), fixed);
      d.axes(0, 1, -1.5, 1.5);
      d.line(
        y.map((v, i) => [i / (n - 1), v]),
        palette.blue,
        3,
      );
      y.forEach((v, i) => d.dot([i / (n - 1), v], palette.blue, 0.018));
      d.handle(target, 'target', '右端约束', { limits: [1, 1, -1.4, 1.4] });
      d.dot([0, 0], palette.yellow, 0.03);
      d.values = {
        固定点数: fixed.size,
        内部最大残差: Math.max(
          ...y.slice(1, -1).map((_, k) => Math.abs(L[k + 1].reduce((s, w, j) => s + w * y[j], 0))),
        ),
        能量: dirichletEnergy(L, y),
      };
      d.formula = 'L_{FF}x_F=-L_{FB}x_B';
      return d.result();
    },
  },
];
