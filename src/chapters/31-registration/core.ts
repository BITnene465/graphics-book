import type { Vec2 } from '../../math/vector.ts';
import { leastSquares } from '../../math/linear.ts';
import { random } from '../../math/vector.ts';
export function homography(source: Vec2[], target: Vec2[]): number[] {
  if (source.length < 4 || source.length !== target.length) throw new RangeError('至少四组对应');
  const a: number[][] = [],
    b: number[] = [];
  source.forEach(([x, y], i) => {
    const [u, v] = target[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(u, v);
  });
  return [...leastSquares(a, b), 1];
}
export function warp(H: number[], p: Vec2): Vec2 {
  const [x, y] = p,
    w = H[6] * x + H[7] * y + H[8];
  if (Math.abs(w) < 1e-10) throw new RangeError('点映到无穷远');
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}
/** 小型已匹配点集的 RANSAC；候选退化时跳过，最后用内点重估。 */
export function robustHomography(
  source: Vec2[],
  target: Vec2[],
  threshold = 0.04,
  seed = 3,
  iterations = 100,
) {
  if (source.length < 4 || target.length !== source.length) throw new RangeError('至少四组对应');
  const rng = random(seed);
  let inliers: number[] = [],
    best: number[] | null = null;
  for (let k = 0; k < iterations; k++) {
    const ids = new Set<number>();
    while (ids.size < 4) ids.add(Math.floor(rng() * source.length));
    try {
      const H = homography(
          [...ids].map((i) => source[i]),
          [...ids].map((i) => target[i]),
        ),
        keep = source.flatMap((p, i) =>
          Math.hypot(...warp(H, p).map((x, c) => x - target[i][c])) <= threshold ? [i] : [],
        );
      if (keep.length > inliers.length) {
        best = H;
        inliers = keep;
      }
    } catch {
      /* 共线样本不能确定单应矩阵。 */
    }
  }
  if (!best || inliers.length < 4) throw new RangeError('没有足够一致的对应');
  return {
    H: homography(
      inliers.map((i) => source[i]),
      inliers.map((i) => target[i]),
    ),
    inliers,
  };
}
