import type { Vec2, Vec3 } from '../math/vector.ts';
import type { Scene } from '../chapters/11-pipeline/core.ts';
import { deCasteljau } from '../chapters/13-bezier/core.ts';

/** 灯罩母线：外壁由一条三次 Bézier 定义，内壁保留固定径向厚度。 */
export const shadeControl = (bulge = 0): Vec2[] => [
  [0.16, 0.34],
  [0.2 + bulge, 0.29],
  [0.35 + bulge, 0.1],
  [0.5, 0],
];
export function shadeProfile(bulge = 0, steps = 6, control = shadeControl(bulge)): Vec2[] {
  const outer = Array.from(
    { length: steps + 1 },
    (_, i) => deCasteljau(control, i / steps).at(-1)![0] as Vec2,
  );
  return [...outer, ...[...outer].reverse().map(([r, y]) => [r - 0.035, y] as Vec2)];
}

/** (半径, 高度) 绕局部 Y 轴旋转；剖面闭合，角向索引环绕。 */
export function latheMesh(profile: Vec2[], segments = 16) {
  if (profile.length < 3 || segments < 3 || !Number.isInteger(segments))
    throw new RangeError('旋转曲面需要闭合剖面和至少三个角向分段');
  const vertices: Vec3[] = [],
    faces: number[][] = [];
  for (const [r, y] of profile) {
    if (r <= 0 || !Number.isFinite(r + y)) throw new RangeError('剖面半径必须为正');
    for (let j = 0; j < segments; j++) {
      const a = (2 * Math.PI * j) / segments;
      vertices.push([r * Math.cos(a), y, r * Math.sin(a)]);
    }
  }
  for (let i = 0; i < profile.length; i++)
    for (let j = 0; j < segments; j++) {
      const next = (i + 1) % profile.length,
        k = (j + 1) % segments;
      faces.push([i * segments + j, i * segments + k, next * segments + k, next * segments + j]);
    }
  return { vertices, faces };
}

/** 显示用三角网格；法线来自母线切向，UV 在接缝处独立复制。 */
export function latheScene(profile: Vec2[], segments: number, color: Vec3): Scene {
  const vertices: Vec3[] = [],
    normals: Vec3[] = [],
    uv: Vec2[] = [],
    faces: Vec3[] = [];
  const n = profile.length;
  for (let i = 0; i <= n; i++) {
    const [r, y] = profile[i % n],
      prev = profile[(i + n - 1) % n],
      next = profile[(i + 1) % n];
    const dr = next[0] - prev[0],
      dy = next[1] - prev[1],
      length = Math.hypot(dr, dy);
    for (let j = 0; j <= segments; j++) {
      const angle = (j / segments) * 2 * Math.PI,
        c = Math.cos(angle),
        s = Math.sin(angle);
      vertices.push([r * c, y, r * s]);
      normals.push([(-dy * c) / length, dr / length, (-dy * s) / length]);
      uv.push([j / segments, i / n]);
      if (i < n && j < segments) {
        const a = i * (segments + 1) + j,
          b = a + segments + 1;
        faces.push([a, a + 1, b + 1], [a, b + 1, b]);
      }
    }
  }
  return { vertices, normals, uv, faces, colors: vertices.map(() => color) };
}

/** 灯罩只取外壁并沿一条母线切开，接缝两侧保留不同的顶点索引。 */
export function shadeStrip(n = 6) {
  const vertices: Vec3[] = [],
    faces: number[][] = [],
    control = shadeControl();
  for (let y = 0; y <= n; y++)
    for (let x = 0; x <= n; x++) {
      const [r, h] = deCasteljau(control, y / n).at(-1)![0],
        a = (x / n) * 2 * Math.PI;
      vertices.push([r * Math.cos(a), h, r * Math.sin(a)]);
      if (x < n && y < n) {
        const i = y * (n + 1) + x;
        faces.push([i, i + 1, i + n + 2], [i, i + n + 2, i + n + 1]);
      }
    }
  return { vertices, faces };
}
