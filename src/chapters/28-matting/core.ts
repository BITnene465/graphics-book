import type { Vec3 } from '../../math/vector.ts';
import { clamp, dot, sub } from '../../math/vector.ts';
import { constrainedSolve } from '../17-fairing/core.ts';
export const composite = (foreground: Vec3, background: Vec3, alpha: number): Vec3 =>
  foreground.map((f, c) => alpha * f + (1 - alpha) * background[c]) as Vec3;
/** F、B 都已知时投影到颜色线；F=B 时 alpha 不可识别。 */
export function knownAlpha(color: Vec3, foreground: Vec3, background: Vec3): number | null {
  const direction = sub(foreground, background),
    denominator = dot(direction, direction);
  return denominator < 1e-12 ? null : clamp(dot(sub(color, background), direction) / denominator);
}
/** 灰度一维闭式抠图的局部窗口模型；不是任意图像的二维替代。 */
export function matteLine(colors: number[], pins: Map<number, number>, epsilon = 1e-5): number[] {
  const n = colors.length,
    L = Array.from({ length: n }, () => Array(n).fill(0));
  for (let center = 1; center < n - 1; center++) {
    const ids = [center - 1, center, center + 1],
      mean = ids.reduce((s, i) => s + colors[i], 0) / 3,
      variance = ids.reduce((s, i) => s + (colors[i] - mean) ** 2, 0) / 3;
    for (const i of ids)
      for (const j of ids)
        L[i][j] +=
          Number(i === j) -
          (1 + ((colors[i] - mean) * (colors[j] - mean)) / (variance + epsilon / 3)) / 3;
  }
  return constrainedSolve(L, Array(n).fill(0), pins);
}
