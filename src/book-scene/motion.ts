import type { Vec2 } from '../math/vector.ts';
import { inverse, forward } from '../chapters/38-kinematics/core.ts';
import { oscillator } from '../chapters/39-dynamics/core.ts';
import { deskState, DESK, lampJoints } from './model.ts';

export function reachLamp(target: Vec2) {
  const local: Vec2 = [target[0] - DESK.base[0], target[1] - DESK.base[1]];
  const solution = inverse(local, DESK.lengths, -1),
    actual = forward(DESK.lengths, solution.angles)[2];
  return { ...solution, error: Math.hypot(actual[0] - local[0], actual[1] - local[1]) };
}

/** 水平振子的无量纲位移 q 驱动小球位置；灯头只跟随一部分位移，不额外模拟接触。 */
export function deskMotion(
  progress: number,
  method: 'analytic' | 'explicit' | 'symplectic' | 'verlet',
  step: number,
  amplitude: number,
) {
  const time = 4 * progress,
    omega = Math.PI / 2;
  const n = Math.max(1, Math.ceil(time / step)),
    dt = time / n;
  const analytic = { x: Math.cos(omega * time), v: -omega * Math.sin(omega * time) };
  const q = method === 'analytic' ? analytic : oscillator(dt, n, omega, method).at(-1)!;
  const displacement = amplitude * (1 - q.x),
    head = lampJoints()[2];
  const target: Vec2 = [head[0] + 0.3 * displacement, head[1]],
    aim = reachLamp(target);
  const state =
    displacement === 0
      ? deskState()
      : deskState({ ball: [DESK.ball[0] + displacement, DESK.ball[1]], angles: aim.angles });
  return {
    state,
    time,
    dt,
    target,
    reachable: aim.reachable,
    positionError: amplitude * Math.abs(q.x - analytic.x),
    relativeEnergy: (q.v * q.v + omega * omega * q.x * q.x) / (omega * omega),
    displacement,
    velocity: -amplitude * q.v,
  };
}
