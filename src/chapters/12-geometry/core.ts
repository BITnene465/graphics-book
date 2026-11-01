import { finite, cross, sub, dot, mix, radians, scale } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { unit } from '../02-transforms/spatial.ts';

export type Mesh = { vertices: Vec3[]; faces: Vec3[] };
export function validAxes(axes: Vec3): Vec3 {
  finite(axes);
  if (axes.some((x) => x <= 0)) throw new RangeError('半轴须为正');
  return axes;
}
export function parametric(u: number, v: number, axes: Vec3 = [1, 1, 1]): Vec3 {
  const [a, b, c] = validAxes(axes);
  return [a * Math.sin(v) * Math.cos(u), b * Math.sin(v) * Math.sin(u), c * Math.cos(v)];
}
export function tangents(u: number, v: number, axes: Vec3 = [1, 1, 1]) {
  const [a, b, c] = validAxes(axes);
  return {
    du: [-a * Math.sin(v) * Math.sin(u), b * Math.sin(v) * Math.cos(u), 0] as Vec3,
    dv: [a * Math.cos(v) * Math.cos(u), b * Math.cos(v) * Math.sin(u), -c * Math.sin(v)] as Vec3,
  };
}
export function implicit(point: Vec3, axes: Vec3 = [1, 1, 1]): number {
  validAxes(axes);
  return point.reduce((s, p, i) => s + (p / axes[i]) ** 2, 0) - 1;
}
export function analyticNormal(point: Vec3, axes: Vec3 = [1, 1, 1]): Vec3 {
  validAxes(axes);
  return unit(point.map((x, i) => x / axes[i] ** 2) as Vec3);
}
/** 极点各一个顶点，经线按模闭合，无重复接缝或退化极帽。 */
export function makeMesh(axes: Vec3 = [1, 1, 1], latitude = 8, longitude = 16): Mesh {
  validAxes(axes);
  if (
    !Number.isInteger(latitude) ||
    !Number.isInteger(longitude) ||
    latitude < 2 ||
    longitude < 3 ||
    latitude > 256 ||
    longitude > 512
  )
    throw new RangeError('非法网格分段');
  const vertices: Vec3[] = [[0, 0, axes[2]]],
    faces: Vec3[] = [];
  for (let v = 1; v < latitude; v++)
    for (let u = 0; u < longitude; u++)
      vertices.push(parametric((u * 2 * Math.PI) / longitude, (v * Math.PI) / latitude, axes));
  vertices.push([0, 0, -axes[2]]);
  for (let k = 0; k < longitude; k++) {
    const k1 = (k + 1) % longitude;
    faces.push([0, 1 + k, 1 + k1]);
    for (let ring = 0; ring < latitude - 2; ring++) {
      const a = 1 + ring * longitude + k,
        b = 1 + ring * longitude + k1;
      faces.push([a, a + longitude, b + longitude], [a, b + longitude, b]);
    }
    const base = 1 + (latitude - 2) * longitude;
    faces.push([vertices.length - 1, base + k1, base + k]);
  }
  return { vertices, faces };
}
export function faceGeometry(vertices: Vec3[], faces: Vec3[]) {
  return faces.map((face) => {
    const [a, b, c] = face.map((i) => vertices[i]),
      n = cross(sub(b, a), sub(c, a)),
      area = Math.hypot(...n) / 2;
    if (area === 0) throw new RangeError('退化面没有法线');
    return { center: a.map((x, i) => (x + b[i] + c[i]) / 3) as Vec3, normal: unit(n), area };
  });
}
export function meshStatistics(vertices: Vec3[], faces: Vec3[], axes: Vec3) {
  const geometry = faceGeometry(vertices, faces),
    edges = new Map<string, number>();
  let volume = 0,
    maxError = 0;
  faces.forEach((face) => {
    for (const [a, b] of [
      [face[0], face[1]],
      [face[1], face[2]],
      [face[2], face[0]],
    ]) {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    volume += dot(vertices[face[0]], cross(vertices[face[1]], vertices[face[2]])) / 6;
  });
  for (const { center } of geometry) {
    const r = Math.sqrt(implicit(center, axes) + 1);
    maxError = Math.max(maxError, Math.hypot(...center) * Math.abs(1 / r - 1));
  }
  const exactVolume = (4 * Math.PI * axes[0] * axes[1] * axes[2]) / 3;
  return {
    vertices: vertices.length,
    faces: faces.length,
    edges: edges.size,
    euler: vertices.length - edges.size + faces.length,
    closedEdges: [...edges.values()].every((n) => n === 2),
    volume,
    exactVolume,
    relativeVolumeError: Math.abs(volume - exactVolume) / exactVolume,
    area: geometry.reduce((s, f) => s + f.area, 0),
    maxRadialSampleError: maxError,
  };
}
export function analyticSlice(z: number, axes: Vec3, samples = 160): Vec3[] {
  const [a, b, c] = validAxes(axes),
    factor = 1 - (z / c) ** 2;
  if (factor < 0) return [];
  if (factor === 0) return [[0, 0, z]];
  return Array.from({ length: samples + 1 }, (_, i) => [
    a * Math.sqrt(factor) * Math.cos((i / samples) * 2 * Math.PI),
    b * Math.sqrt(factor) * Math.sin((i / samples) * 2 * Math.PI),
    z,
  ]);
}
export function meshSlice(vertices: Vec3[], faces: Vec3[], z: number): [Vec3, Vec3][] {
  const segments = new Map<string, [Vec3, Vec3]>();
  for (const face of faces) {
    const points = new Map<string, Vec3>();
    for (let i = 0; i < 3; i++) {
      const a = vertices[face[i]],
        b = vertices[face[(i + 1) % 3]],
        da = a[2] - z,
        db = b[2] - z;
      if (da === 0) points.set(a.join(','), a);
      if (da * db < 0) {
        const p = mix(a, b, da / (da - db)) as Vec3;
        points.set(p.join(','), p);
      }
    }
    if (points.size === 2) {
      const pair = [...points.values()].sort(
        (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2],
      ) as [Vec3, Vec3];
      segments.set(pair.flat().join(','), pair);
    }
  }
  return [...segments.values()];
}
export function radialMeshPoint(point: Vec3, vertices: Vec3[], faces: Vec3[]) {
  const direction = unit(point);
  for (let i = 0; i < faces.length; i++) {
    const [a, b, c] = faces[i].map((j) => vertices[j]),
      e1 = sub(b, a),
      e2 = sub(c, a),
      h = cross(direction, e2),
      det = dot(e1, h);
    if (Math.abs(det) <= 1e-12 * Math.hypot(...e1) * Math.hypot(...e2)) continue;
    const s = scale(a, -1),
      u = dot(s, h) / det,
      q = cross(s, e1),
      v = dot(direction, q) / det,
      t = dot(e2, q) / det;
    if (u >= -1e-10 && v >= -1e-10 && u + v <= 1 + 1e-10 && t > 0)
      return { point: scale(direction, t) as Vec3, face: i, weights: [1 - u - v, u, v] as Vec3 };
  }
  throw new RangeError('射线没有命中闭合网格');
}
export function project(points: Vec3[], azimuth = 35, elevation = 25) {
  const az = radians(azimuth),
    el = radians(elevation),
    forward: Vec3 = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)],
    right: Vec3 = [-Math.sin(az), Math.cos(az), 0],
    up = cross(forward, right);
  return {
    xy: points.map((p) => [dot(p, right), dot(p, up)] as Vec2),
    depth: points.map((p) => dot(p, forward)),
    right,
    up,
    forward,
  };
}

/** 正交观察下的解析轮廓，同时满足 F=0 和 ∇F·观察方向=0。 */
export function silhouette(axes: Vec3, azimuth = 35, elevation = 25, samples = 160): Vec3[] {
  validAxes(axes);
  if (!Number.isInteger(samples) || samples < 3) throw new RangeError('轮廓至少需要三个样本');
  const { forward } = project([], azimuth, elevation),
    normal = unit(forward.map((x, i) => x / axes[i]) as Vec3);
  const reference: Vec3 = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0],
    a = unit(cross(normal, reference)),
    b = cross(normal, a);
  return Array.from(
    { length: samples + 1 },
    (_, i) =>
      a.map(
        (x, c) =>
          axes[c] *
          (Math.cos((i / samples) * 2 * Math.PI) * x +
            Math.sin((i / samples) * 2 * Math.PI) * b[c]),
      ) as Vec3,
  );
}

/** 从正交观察平面反投影，取朝向观察者的椭球交点。 */
export function pickSurface(
  x: number,
  y: number,
  axes: Vec3,
  azimuth = 35,
  elevation = 25,
): Vec3 | null {
  validAxes(axes);
  finite([x, y]);
  const { right, up, forward } = project([], azimuth, elevation),
    origin = right.map((r, i) => x * r + y * up[i]);
  const a = forward.reduce((sum, d, i) => sum + (d / axes[i]) ** 2, 0),
    b = 2 * origin.reduce((sum, p, i) => sum + (p * forward[i]) / axes[i] ** 2, 0),
    c = implicit(origin as Vec3, axes);
  const discriminant = b * b - 4 * a * c,
    scale = b * b + 4 * a * (c + 2),
    tolerance = 32 * Number.EPSILON * scale;
  if (discriminant < -tolerance) return null;
  const t = (-b + Math.sqrt(Math.max(0, discriminant))) / (2 * a);
  return origin.map((p, i) => p + t * forward[i]) as Vec3;
}
