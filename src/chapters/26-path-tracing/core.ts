import type { Vec3 } from '../../math/vector.ts';
import { random, cross, normalize, dot } from '../../math/vector.ts';
import { cameraRay, nearestHit, defaultScene } from '../15-rays/core.ts';
import type { RayScene } from '../15-rays/core.ts';

/** 以立体角为测度的余弦半球采样，pdf=cosθ/π。 */
export function cosineHemisphere(normal: Vec3, rng: () => number): Vec3 {
  const r = Math.sqrt(rng()),
    a = 2 * Math.PI * rng(),
    z = Math.sqrt(Math.max(0, 1 - r * r));
  const tangent = normalize(cross(Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0], normal)),
    bitangent = cross(normal, tangent);
  return normal.map(
    (v, i) => v * z + tangent[i] * r * Math.cos(a) + bitangent[i] * r * Math.sin(a),
  ) as Vec3;
}
export function estimateSquare(samples: number, seed: number, importance = false) {
  const rng = random(seed);
  let sum = 0,
    sum2 = 0;
  const running: number[] = [];
  for (let i = 0; i < samples; i++) {
    const u = Math.max(Number.EPSILON, rng()),
      x = importance ? Math.sqrt(u) : u,
      pdf = importance ? 2 * x : 1,
      v = (x * x) / pdf;
    sum += v;
    sum2 += v * v;
    running.push(sum / (i + 1));
  }
  return {
    running,
    mean: sum / samples,
    variance: samples > 1 ? (sum2 - (sum * sum) / samples) / (samples - 1) : 0,
  };
}
/** 仅漫反射 + 无限远环境；固定反射深度带来截断偏差。 */
export function pathSample(
  origin: Vec3,
  direction: Vec3,
  scene: RayScene,
  rng: () => number,
  bounces: number,
): Vec3 {
  let o = origin,
    d = direction,
    beta: Vec3 = [1, 1, 1];
  for (let depth = 0; depth <= bounces; depth++) {
    const hit = nearestHit(o, d, 1e-4, Infinity, scene);
    if (hit.owner < 0) {
      const sky = Math.max(0, d[1]),
        L: Vec3 = [0.45 + 0.3 * sky, 0.55 + 0.3 * sky, 0.8 + 0.2 * sky];
      return beta.map((v, c) => v * L[c]) as Vec3;
    }
    if (depth === bounces) return [0, 0, 0];
    const rho =
      hit.owner < scene.spheres.length ? scene.spheres[hit.owner].color : scene.groundColor;
    beta = beta.map((v, c) => v * rho[c]) as Vec3;
    const n = (dot(hit.normal, d) > 0 ? hit.normal.map((x) => -x) : hit.normal) as Vec3;
    d = cosineHemisphere(n, rng);
    o = hit.point.map((x, c) => x + 1e-4 * n[c]) as Vec3;
  }
  return [0, 0, 0];
}
export function renderPaths(
  width: number,
  height: number,
  samples: number,
  bounces: number,
  seed: number,
  position: Vec3 = [1, 0.7, -0.5],
): Float64Array {
  const scene = defaultScene();
  scene.spheres[1].center = [...position];
  const out = new Float64Array(width * height * 3);
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      // 每像素独立随机流；增加样本数保留此前样本。
      const rng = random(seed + Math.imul(row * width + col + 1, 2654435761));
      for (let s = 0; s < samples; s++) {
        const ray = cameraRay(col + rng() - 0.5, row + rng() - 0.5, width, height, [3.4, 2.5, 5.5]);
        const color = pathSample(ray.origin, ray.direction, scene, rng, bounces);
        for (let c = 0; c < 3; c++) out[3 * (row * width + col) + c] += color[c] / samples;
      }
    }
  return out;
}
