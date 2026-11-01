/** 几何 y 向上，输出数组行向下；像素中心为 (i+0.5,j+0.5)。 */
import { finite } from '../../math/vector.ts';
import type { Vec2, Vec3, Vec4 } from '../../math/vector.ts';
import type { Triangle2 } from './core.ts';

export const SUBPIXEL = 256;
export const CLIP_PLANES: Vec4[] = [
  [1, 0, 0, 1],
  [-1, 0, 0, 1],
  [0, 1, 0, 1],
  [0, -1, 0, 1],
  [0, 0, 1, 1],
  [0, 0, -1, 1],
];
export type CoverageRule = 'top_left' | 'inclusive';
export type Fragment = { row: number; col: number; weights: Vec3 };

export function edgeFunction(a: Vec2, b: Vec2, p: Vec2): number {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}

export function topLeft(a: Vec2, b: Vec2): boolean {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  return dy < 0 || (dy === 0 && dx < 0);
}

function roundEven(x: number): number {
  const floor = Math.floor(x),
    fraction = x - floor;
  return fraction === 0.5 ? floor + (Math.abs(floor) % 2) : Math.round(x);
}

export function snapVertices(vertices: Triangle2): Triangle2 {
  finite(vertices.flat());
  // 在此范围内，所有整数边函数都能由 Number 精确表示。
  if (vertices.flat().some((x) => Math.abs(x) > 1e5))
    throw new RangeError('屏幕坐标绝对值不能超过 100000');
  return vertices.map((v) => v.map((x) => roundEven(x * SUBPIXEL)) as Vec2) as Triangle2;
}

export function triangleCoverage(
  vertices: Triangle2,
  points: Vec2[],
  rule: CoverageRule = 'top_left',
): { covered: boolean[]; weights: Vec3[] } {
  const q = snapVertices(vertices),
    area = edgeFunction(q[0], q[1], q[2]);
  finite(points.flat());
  if (!['top_left', 'inclusive'].includes(rule)) throw new RangeError('未知覆盖规则');
  if (points.flat().some((x) => Math.abs(x) > 1e5)) throw new RangeError('求值点超出精确整数范围');
  if (area === 0)
    return { covered: points.map(() => false), weights: points.map(() => [NaN, NaN, NaN]) };
  const edges: [Vec2, Vec2][] = [
    [q[1], q[2]],
    [q[2], q[0]],
    [q[0], q[1]],
  ].map(([a, b]) => (area > 0 ? [a, b] : [b, a]));
  const included = edges.map(([a, b]) => rule === 'inclusive' || topLeft(a, b));
  const values = points.map(
    (p) =>
      edges.map(([a, b]) =>
        edgeFunction(a, b, p.map((x) => roundEven(x * SUBPIXEL)) as Vec2),
      ) as Vec3,
  );
  return {
    covered: values.map((v) => v.every((x, i) => x > 0 || (x === 0 && included[i]))),
    weights: values.map((v) => v.map((x) => x / Math.abs(area)) as Vec3),
  };
}

export function pixelBounds(
  vertices: Triangle2,
  width: number,
  height: number,
): [number, number, number, number] {
  if (![width, height].every((n) => Number.isInteger(n) && n >= 1 && n <= 4096))
    throw new RangeError('图像尺寸须为 1 至 4096 的整数');
  const q = snapVertices(vertices).map((v) => v.map((x) => x / SUBPIXEL));
  const bound = (axis: number, size: number): Vec2 => [
    Math.max(0, Math.min(size, Math.ceil(Math.min(...q.map((p) => p[axis])) - 0.5))),
    Math.max(0, Math.min(size, Math.floor(Math.max(...q.map((p) => p[axis])) - 0.5) + 1)),
  ];
  const [x0, x1] = bound(0, width),
    [y0, y1] = bound(1, height);
  return [x0, x1, y0, y1];
}

/** 回调逐片元执行，避免为整张图像建立大量临时对象。 */
export function rasterizeTriangle(
  vertices: Triangle2,
  width: number,
  height: number,
  fragment: (f: Fragment) => void,
  rule: CoverageRule = 'top_left',
): void {
  const [x0, x1, y0, y1] = pixelBounds(vertices, width, height),
    q = snapVertices(vertices);
  const area = edgeFunction(q[0], q[1], q[2]);
  if (area === 0) return;
  const edges: [Vec2, Vec2][] = [
    [q[1], q[2]],
    [q[2], q[0]],
    [q[0], q[1]],
  ].map(([a, b]) => (area > 0 ? [a, b] : [b, a]));
  const included = edges.map(([a, b]) => rule === 'inclusive' || topLeft(a, b));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const p: Vec2 = [(x + 0.5) * SUBPIXEL, (y + 0.5) * SUBPIXEL];
      const values = edges.map(([a, b]) => edgeFunction(a, b, p));
      if (values.every((v, i) => v > 0 || (v === 0 && included[i])))
        fragment({
          row: height - 1 - y,
          col: x,
          weights: values.map((v) => v / Math.abs(area)) as Vec3,
        });
    }
}

export type ClippedPolygon = { vertices: Vec4[]; attributes: number[][] };

export function clipPolygon(
  vertices: Vec4[],
  attributes: number[][] = vertices.map(() => []),
): ClippedPolygon {
  finite(vertices.flat());
  finite(attributes.flat());
  if (
    attributes.length !== vertices.length ||
    attributes.some((a) => a.length !== attributes[0].length)
  )
    throw new RangeError('属性与顶点必须对应');
  let points = vertices.map((v) => [...v] as Vec4),
    attrs = attributes.map((a) => [...a]);
  for (const plane of CLIP_PLANES) {
    const output: Vec4[] = [],
      outputAttrs: number[][] = [];
    const distance = (p: Vec4): number => p.reduce((s, x, i) => s + x * plane[i], 0);
    for (let i = 0; i < points.length; i++) {
      let a = points[(i + points.length - 1) % points.length],
        b = points[i];
      let aa = attrs[(i + attrs.length - 1) % attrs.length],
        ab = attrs[i];
      let da = distance(a),
        db = distance(b);
      if (da >= 0 !== db >= 0) {
        const firstDifference = a.findIndex((x, j) => x !== b[j]);
        if (firstDifference >= 0 && a[firstDifference] > b[firstDifference]) {
          [a, b] = [b, a];
          [aa, ab] = [ab, aa];
          [da, db] = [db, da];
        }
        const t = da / (da - db),
          point = a.map((x, j) => x + (b[j] - x) * t) as Vec4;
        const axis = plane.slice(0, 3).findIndex((x) => x !== 0);
        point[axis] = -plane[axis] * point[3];
        output.push(point);
        outputAttrs.push(aa.map((x, j) => x + (ab[j] - x) * t));
      }
      if (distance(points[i]) >= 0) {
        output.push(points[i]);
        outputAttrs.push(attrs[i]);
      }
    }
    const keep = output.map(
      (p, i) =>
        output.length === 1 ||
        p.some((x, j) => x !== output[(i + output.length - 1) % output.length][j]),
    );
    points = output.filter((_, i) => keep[i]);
    attrs = outputAttrs.filter((_, i) => keep[i]);
  }
  return { vertices: points, attributes: attrs };
}

export function triangulateFan(polygon: ClippedPolygon): ClippedPolygon[] {
  return Array.from({ length: Math.max(0, polygon.vertices.length - 2) }, (_, i) => ({
    vertices: [polygon.vertices[0], polygon.vertices[i + 1], polygon.vertices[i + 2]],
    attributes: [polygon.attributes[0], polygon.attributes[i + 1], polygon.attributes[i + 2]],
  }));
}

export function clipTriangle(
  vertices: [Vec4, Vec4, Vec4],
  attributes?: number[][],
): ClippedPolygon[] {
  return triangulateFan(clipPolygon(vertices, attributes));
}

export function clipToScreen(points: Vec4[], width: number, height: number) {
  finite(points.flat());
  if (points.some((p) => p[3] <= 0)) throw new RangeError('必须先裁剪，再除以正 w');
  return {
    xy: points.map(
      (p) => [((p[0] / p[3] + 1) * width) / 2, ((p[1] / p[3] + 1) * height) / 2] as Vec2,
    ),
    depth: points.map((p) => p[2] / p[3]),
    inverseW: points.map((p) => 1 / p[3]),
  };
}
