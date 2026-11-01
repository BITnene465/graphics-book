/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */

/** 张量积曲面：先沿 v，对每行求值，再沿 u 求值。 */
export function tensorPoint(control: number[][][], u: number, v: number): number[] {
  function evaluate(points: number[][], t: number): number[] {
    if (!points.length) throw new RangeError('控制点不能为空');
    let row = points.map((p) => [...p]);
    while (row.length > 1)
      row = row.slice(0, -1).map((p, i) => p.map((x, c) => x * (1 - t) + row[i + 1][c] * t));
    return row[0];
  }
  return evaluate(
    control.map((row) => evaluate(row, v)),
    u,
  );
}
/** 接缝后的第一排：按两个曲面的 u 参数跨度匹配一阶导数。 */
export function c1ControlRow(left: number[][][], leftSpan: number, rightSpan: number): number[][] {
  if (left.length < 2 || leftSpan <= 0 || rightSpan <= 0) throw new RangeError('控制网和跨度无效');
  return left
    .at(-1)!
    .map((p, j) => p.map((x, c) => x + (rightSpan / leftSpan) * (x - left.at(-2)![j][c])));
}
