import { dot, sub, add, scale, finite, cross } from '../../math/vector.ts';
import type { Vec3 } from '../../math/vector.ts';
import { unit } from '../02-transforms/spatial.ts';

export type Sphere = { center: Vec3; radius: number; color: Vec3; mirror: number };
export type RayScene = {
  spheres: Sphere[];
  groundColor: Vec3;
  groundMirror: number;
  groundExtent: number;
};
export const defaultScene = (): RayScene => ({
  spheres: [
    { center: [-0.95, 0.8, 0], radius: 0.8, color: [0.16, 0.34, 0.43], mirror: 0.65 },
    { center: [1, 0.7, -0.5], radius: 0.7, color: [0.65, 0.2, 0.08], mirror: 0.08 },
  ],
  groundColor: [0.57, 0.58, 0.44],
  groundMirror: 0.2,
  groundExtent: 5,
});
export function reflect(direction: Vec3, normal: Vec3): Vec3 {
  const n = unit(normal);
  return sub(direction, scale(n, 2 * dot(direction, n))) as Vec3;
}
/** q 形式避免 -h 与根号相消；非单位射线不能省略 a=d·d。 */
export function sphereRoots(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  radius: number,
): [number, number] {
  finite([...origin, ...direction, ...center, radius]);
  if (radius <= 0) throw new RangeError('半径须为正');
  const oc = sub(origin, center),
    a = dot(direction, direction),
    h = dot(oc, direction),
    c = dot(oc, oc) - radius * radius;
  if (a === 0) throw new RangeError('射线方向不能为零');
  const discriminant = h * h - a * c;
  if (discriminant < 0) return [Infinity, Infinity];
  const root = Math.sqrt(discriminant),
    q = -h - (h >= 0 ? root : -root);
  if (q === 0) return [-h / a, -h / a];
  const roots = [q / a, c / q].sort((a, b) => a - b);
  return roots as [number, number];
}
export function planeT(
  origin: Vec3,
  direction: Vec3,
  point: Vec3 = [0, 0, 0],
  normal: Vec3 = [0, 1, 0],
): number {
  const n = unit(normal),
    denominator = dot(direction, n);
  return denominator === 0 ? Infinity : dot(sub(point, origin), n) / denominator;
}
export type Hit = { t: number; owner: number; point: Vec3; normal: Vec3 };
export function nearestHit(
  origin: Vec3,
  direction: Vec3,
  tMin = 1e-5,
  tMax = Infinity,
  scene = defaultScene(),
): Hit {
  finite([...origin, ...direction, tMin]);
  if (tMin < 0 || tMax < tMin || Number.isNaN(tMax)) throw new RangeError('射线区间非法');
  let t = Infinity,
    owner = -1;
  scene.spheres.forEach((sphere, i) => {
    for (const root of sphereRoots(origin, direction, sphere.center, sphere.radius))
      if (root >= tMin && root <= tMax && root < t) {
        t = root;
        owner = i;
      }
  });
  const groundT = planeT(origin, direction),
    groundPoint = Number.isFinite(groundT) ? add(origin, scale(direction, groundT)) : origin;
  if (
    groundT >= tMin &&
    groundT <= tMax &&
    groundT < t &&
    Math.abs(groundPoint[0]) <= scene.groundExtent &&
    Math.abs(groundPoint[2]) <= scene.groundExtent
  ) {
    t = groundT;
    owner = scene.spheres.length;
  }
  const point = (owner < 0 ? origin : add(origin, scale(direction, t))) as Vec3;
  const normal: Vec3 =
    owner < 0
      ? [0, 0, 0]
      : owner === scene.spheres.length
        ? [0, 1, 0]
        : unit(sub(point, scene.spheres[owner].center) as Vec3);
  return { t, owner, point, normal };
}
export function cameraRay(
  col: number,
  row: number,
  width: number,
  height: number,
  eye: Vec3 = [4, 2.5, 6],
  target: Vec3 = [0, 0.65, 0],
  fov = 42,
  up: Vec3 = [0, 1, 0],
) {
  finite([col, row, width, height, fov]);
  if (width <= 0 || height <= 0 || fov <= 0 || fov >= 180) throw new RangeError('相机参数非法');
  const forward = unit(sub(target, eye) as Vec3),
    right = unit(cross(forward, up)),
    vertical = cross(right, forward),
    s = Math.tan((fov * Math.PI) / 360);
  const x = (((2 * (col + 0.5)) / width - 1) * s * width) / height,
    y = (1 - (2 * (row + 0.5)) / height) * s;
  return {
    origin: eye,
    direction: unit(add(forward, add(scale(right, x), scale(vertical, y))) as Vec3),
  };
}
export function shadowHit(
  point: Vec3,
  normal: Vec3,
  light: Vec3,
  epsilon: number,
  scene = defaultScene(),
) {
  finite([epsilon]);
  if (epsilon < 0) throw new RangeError('起点偏移不能为负');
  const origin = add(point, scale(normal, epsilon)) as Vec3,
    delta = sub(light, origin),
    distance = Math.hypot(...delta);
  if (distance <= 2 * epsilon)
    return { blocked: false, origin, direction: [0, 0, 0] as Vec3, distance, hit: null };
  const direction = unit(delta as Vec3),
    hit = nearestHit(origin, direction, epsilon, distance - epsilon, scene);
  return { blocked: hit.owner >= 0, origin, direction, distance, hit };
}
export type TraceOptions = {
  scene?: RayScene;
  light?: Vec3;
  bounces?: number;
  epsilon?: number;
  specular?: number;
  shininess?: number;
};
export function trace(
  origin: Vec3,
  direction: Vec3,
  {
    scene = defaultScene(),
    light = [-3, 5, 4],
    bounces = 2,
    epsilon = 1e-4,
    specular = 0,
    shininess = 48,
  }: TraceOptions = {},
) {
  if (
    !Number.isInteger(bounces) ||
    bounces < 0 ||
    bounces > 16 ||
    epsilon < 0 ||
    !Number.isFinite(epsilon)
  )
    throw new RangeError('反射预算或起点偏移非法');
  let rayOrigin = origin,
    rayDirection = unit(direction),
    throughput = 1;
  const color = [0, 0, 0] as Vec3,
    segments: {
      origin: Vec3;
      direction: Vec3;
      hit: Hit;
      throughput: number;
      shadow?: ReturnType<typeof shadowHit>;
    }[] = [];
  for (let bounce = 0; bounce <= bounces && throughput > 1e-6; bounce++) {
    const hit = nearestHit(rayOrigin, rayDirection, epsilon, Infinity, scene),
      segment = {
        origin: rayOrigin,
        direction: rayDirection,
        hit,
        throughput,
      } as (typeof segments)[number];
    segments.push(segment);
    if (hit.owner < 0) {
      [0.416, 0.494, 0.539].forEach((v, i) => (color[i] += throughput * v));
      break;
    }
    const sphere = scene.spheres[hit.owner],
      mirror = bounce < bounces ? (sphere?.mirror ?? scene.groundMirror) : 0;
    const base = sphere?.color ?? scene.groundColor,
      checker =
        !sphere && (Math.floor(hit.point[0]) + Math.floor(hit.point[2])) % 2 === 0 ? 0.55 : 1;
    const lightDirection = unit(sub(light, hit.point) as Vec3),
      diffuse = Math.max(0, dot(hit.normal, lightDirection)),
      shadow = shadowHit(hit.point, hit.normal, light, epsilon, scene);
    segment.shadow = shadow;
    const alignment = Math.max(
        0,
        dot(reflect(scale(lightDirection, -1) as Vec3, hit.normal), scale(rayDirection, -1)),
      ),
      highlight = specular * alignment ** shininess * Number(!shadow.blocked && diffuse > 0);
    for (let c = 0; c < 3; c++)
      color[c] +=
        throughput *
        (1 - mirror) *
        (base[c] * checker * (0.12 + 0.88 * diffuse * Number(!shadow.blocked)) + highlight);
    throughput *= mirror;
    rayOrigin = add(hit.point, scale(hit.normal, epsilon)) as Vec3;
    rayDirection = unit(reflect(rayDirection, hit.normal));
  }
  return { color, segments };
}
/** 逐行入口便于 Web Worker 渐进渲染与取消；不依赖 DOM。 */
export function renderRows(
  width: number,
  height: number,
  start: number,
  end: number,
  eye: Vec3,
  target: Vec3,
  fov: number,
  options: TraceOptions = {},
) {
  const data = new Float64Array(width * (end - start) * 3);
  for (let row = start; row < end; row++)
    for (let col = 0; col < width; col++) {
      const ray = cameraRay(col, row, width, height, eye, target, fov);
      data.set(trace(ray.origin, ray.direction, options).color, ((row - start) * width + col) * 3);
    }
  return data;
}
