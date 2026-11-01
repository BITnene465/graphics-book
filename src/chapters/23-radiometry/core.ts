/** 各向同性点光源：Φ 为 W，距离为 m，输出 E 为 W/m²。 */
export function pointIrradiance(flux: number, distance: number, cosine = 1): number {
  if (flux < 0 || distance <= 0) throw new RangeError('通量非负且距离为正');
  return (flux / (4 * Math.PI * distance * distance)) * Math.max(0, cosine);
}
/** 正对矩形在观察点处的立体角，a、b 为半边长，d 为距离。 */
export function rectangleSolidAngle(a: number, b: number, d: number): number {
  if (a < 0 || b < 0 || d <= 0) throw new RangeError('矩形与距离无效');
  return 4 * Math.atan2(a * b, d * Math.sqrt(d * d + a * a + b * b));
}
/** 两个平行面间的微分接收点辐照度：面积积分的中点求积。 */
export function rectangleIrradiance(
  radiance: number,
  a: number,
  b: number,
  distance: number,
  n = 40,
): number {
  let sum = 0;
  const area = (4 * a * b) / (n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = ((2 * (x + 0.5)) / n - 1) * a,
        dy = ((2 * (y + 0.5)) / n - 1) * b,
        r2 = dx * dx + dy * dy + distance * distance;
      sum += ((radiance * distance * distance) / (r2 * r2)) * area;
    }
  return sum;
}
