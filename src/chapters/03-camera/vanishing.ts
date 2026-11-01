import { finite } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { rotate } from '../02-transforms/spatial.ts';

/** 只变换方向，不加相机平移；yaw/pitch 为度。 */
export function viewDirection(direction: Vec3, yaw: number, pitch: number): Vec3 {
  return rotate(
    rotate(direction, [0, 1, 0], (yaw * Math.PI) / 180),
    [1, 0, 0],
    (pitch * Math.PI) / 180,
  );
}

/** 平行于像平面的方向消失在无穷远，用 null 表示，而不是巨大数值。 */
export function vanishingPoint(direction: Vec3, focal = 1): Vec2 | null {
  finite([...direction, focal]);
  if (focal <= 0 || Math.hypot(...direction) === 0) throw new RangeError('需要正焦距与非零方向');
  if (Math.abs(direction[2]) <= 1e-10 * Math.hypot(...direction)) return null;
  return [(-focal * direction[0]) / direction[2], (-focal * direction[1]) / direction[2]];
}
