/** 右手系，相机看 -Z；列向量，NDC ∈ [-1,1]。 */
import { cross, dot, finite, normalize, sub } from '../../math/vector.ts';
import type { Vec2, Vec3, Vec4 } from '../../math/vector.ts';
import { matVec } from '../../math/matrix.ts';
import type { Matrix } from '../../math/matrix.ts';

export function lookAt(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Matrix {
  finite([...eye, ...target, ...up]);
  const f = normalize(sub(target, eye));
  const r = normalize(cross(f, normalize(up)));
  const u = cross(r, f);
  return [
    [...r, -dot(r, eye)],
    [...u, -dot(u, eye)],
    [-f[0], -f[1], -f[2], dot(f, eye)],
    [0, 0, 0, 1],
  ];
}

function checkVolume(aspect: number, near: number, far: number): void {
  finite([aspect, near, far]);
  if (aspect <= 0 || near <= 0 || far <= near)
    throw new RangeError('要求 aspect > 0 且 0 < near < far');
}

export function perspective(
  fovYDegrees: number,
  aspect: number,
  near: number,
  far: number,
): Matrix {
  checkVolume(aspect, near, far);
  if (!Number.isFinite(fovYDegrees) || fovYDegrees <= 0 || fovYDegrees >= 180)
    throw new RangeError('垂直视场角须在 (0,180) 内');
  const s = 1 / Math.tan((fovYDegrees * Math.PI) / 360);
  return [
    [s / aspect, 0, 0, 0],
    [0, s, 0, 0],
    [0, 0, -(far + near) / (far - near), (-2 * far * near) / (far - near)],
    [0, 0, -1, 0],
  ];
}

export function orthographic(height: number, aspect: number, near: number, far: number): Matrix {
  checkVolume(aspect, near, far);
  if (!Number.isFinite(height) || height <= 0) throw new RangeError('正交窗口高度须为正数');
  return [
    [2 / (height * aspect), 0, 0, 0],
    [0, 2 / height, 0, 0],
    [0, 0, -2 / (far - near), -(far + near) / (far - near)],
    [0, 0, 0, 1],
  ];
}

export function transformPoints(points: Vec3[], matrix: Matrix): Vec4[] {
  finite(points.flat());
  finite(matrix.flat());
  if (matrix.length !== 4 || matrix.some((row) => row.length !== 4))
    throw new RangeError('需要 4×4 矩阵');
  return points.map((p) => matVec(matrix, [...p, 1]) as Vec4);
}

/** 在齐次空间裁剪，避免穿过 w=0 时先做除法。 */
export function clipSegment(start: Vec4, end: Vec4): [Vec4, Vec4] | null {
  finite([...start, ...end]);
  let enter = 0,
    leave = 1;
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const g0 = start[3] + sign * start[axis],
        g1 = end[3] + sign * end[axis];
      if (g0 < 0 && g1 < 0) return null;
      if (g0 < 0 && g1 >= 0) enter = Math.max(enter, g0 / (g0 - g1));
      if (g1 < 0 && g0 >= 0) leave = Math.min(leave, g0 / (g0 - g1));
      if (enter > leave) return null;
    }
  const point = (t: number): Vec4 => start.map((x, i) => x + (end[i] - x) * t) as Vec4;
  const a = point(enter),
    b = point(leave);
  return a[3] <= 0 || b[3] <= 0 ? null : [a, b];
}

export function perspectiveDivide(points: Vec4[]): Vec3[] {
  finite(points.flat());
  if (points.some((p) => p[3] <= 0)) throw new RangeError('必须先裁剪；不能除以非正 w');
  return points.map((p) => [p[0] / p[3], p[1] / p[3], p[2] / p[3]]);
}

/** 左上原点，y 仅翻转一次；边界是 width/height，像素中心另加 0.5。 */
export function viewport(points: Vec3[], width: number, height: number): Vec2[] {
  finite([width, height, ...points.flat()]);
  if (width <= 0 || height <= 0) throw new RangeError('画幅宽高须为正数');
  return points.map((p) => [((p[0] + 1) * width) / 2, ((1 - p[1]) * height) / 2]);
}

export function projectWireframe(
  vertices: Vec3[],
  edges: Vec2[],
  view: Matrix,
  projection: Matrix,
  width: number,
  height: number,
): Vec2[][] {
  const clip = transformPoints(vertices, view).map((p) => matVec(projection, p) as Vec4);
  return edges.flatMap(([a, b]) => {
    const segment = clipSegment(clip[a], clip[b]);
    return segment ? [viewport(perspectiveDivide(segment), width, height)] : [];
  });
}
