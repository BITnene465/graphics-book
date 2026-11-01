import { Drawing, palette } from '../../figures/drawing.ts';
import { choice, number, points } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { halfedges, flipEdge, faceCycle } from './halfedge.ts';

const corners = [
  [-2, -1],
  [2, -1],
  [2, 1],
  [-2, 1],
];
export const halfedgeFigure: FigureSpec = {
  id: 'halfedge-links',
  chapter: '12',
  title: '沿面走一步，或者跨过一条边',
  subtitle: '黄色为当前半边，绿色为 next，蓝色为 twin；拖动顶点不会改变连接关系。',
  source: '/src/chapters/12-geometry/halfedge.ts',
  defaults: { points: corners, edge: 2, flipped: false },
  controls: [
    choice(
      'edge',
      '半边',
      Array.from({ length: 6 }, (_, i) => [i, `h${i}`] as [number, string]),
    ),
    choice('flipped', '内部对角线', [
      [false, '原连接'],
      [true, '翻边'],
    ]),
  ],
  animated: false,
  compute(p) {
    const d = new Drawing([-3, 3, -2, 2]),
      vertices = points(p, 'points'),
      original = halfedges(4, [
        [0, 1, 2],
        [0, 2, 3],
      ]);
    const mesh = p.flipped ? flipEdge(original, 2) : original,
      selected = number(p, 'edge'),
      edge = mesh.edges[selected];
    for (let f = 0; f < 2; f++) {
      const cycle = faceCycle(mesh, f),
        polygon = cycle.map((h) => vertices[mesh.edges[h].origin]);
      const center = polygon[0].map((_, i) => polygon.reduce((s, q) => s + q[i], 0) / 3);
      d.polygon(polygon, f ? palette.green : palette.blue, 0.12);
      d.text([center[0] - 0.1, center[1]], `面 ${f}`, palette.muted, 12);
      for (const h of cycle) {
        const e = mesh.edges[h],
          a = vertices[e.origin],
          b = vertices[mesh.edges[e.next].origin];
        const start = a.map((x, i) => 0.78 * x + 0.12 * b[i] + 0.1 * center[i]);
        const end = b.map((x, i) => 0.78 * x + 0.12 * a[i] + 0.1 * center[i]);
        const color =
          h === selected
            ? palette.yellow
            : h === edge.next
              ? palette.green
              : h === edge.twin
                ? palette.blue
                : palette.muted;
        d.arrow(start, end, color);
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        d.text(
          [
            (start[0] + end[0]) / 2 - (0.2 * (b[1] - a[1])) / length - 0.06,
            (start[1] + end[1]) / 2 + (0.2 * (b[0] - a[0])) / length,
          ],
          `h${h}`,
          color,
          12,
        );
      }
    }
    vertices.forEach((q, index) => {
      const c = corners[index];
      d.handle(q, 'points', `v${index}`, {
        index,
        limits: [c[0] - 0.35, c[0] + 0.35, c[1] - 0.35, c[1] + 0.35],
      });
    });
    d.values = {
      当前半边: selected,
      '起点 → 终点': [edge.origin, mesh.edges[edge.next].origin],
      next: edge.next,
      twin: edge.twin < 0 ? '边界' : edge.twin,
      所属面: edge.face,
      边界半边数: mesh.edges.filter((h) => h.twin < 0).length,
    };
    d.formula = '\\operatorname{twin}(\\operatorname{twin}(h))=h\\quad\\text{(interior)}';
    return d.result();
  },
};
