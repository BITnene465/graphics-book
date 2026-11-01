import type { Vec2 } from '../../math/vector.ts';
import { random } from '../../math/vector.ts';
export function oscillator(
  dt: number,
  steps: number,
  omega: number,
  method: 'explicit' | 'symplectic' | 'verlet',
) {
  let x = 1,
    v = 0;
  const states = [{ t: 0, x, v, energy: 0.5 * omega * omega }];
  for (let i = 0; i < steps; i++) {
    const acceleration = -omega * omega * x;
    if (method === 'explicit') {
      x += dt * v;
      v += dt * acceleration;
    } else if (method === 'symplectic') {
      v += dt * acceleration;
      x += dt * v;
    } else {
      x += dt * v + 0.5 * dt * dt * acceleration;
      v += 0.5 * dt * (acceleration - omega * omega * x);
    }
    states.push({ t: (i + 1) * dt, x, v, energy: 0.5 * (v * v + omega * omega * x * x) });
  }
  return states;
}
export type Boid = { p: Vec2; v: Vec2 };
export function initialFlock(count: number, seed: number): Boid[] {
  const rng = random(seed);
  return Array.from({ length: count }, () => {
    const a = rng() * Math.PI * 2;
    return { p: [(rng() - 0.5) * 3, (rng() - 0.5) * 2], v: [0.6 * Math.cos(a), 0.6 * Math.sin(a)] };
  });
}
/** 同步读取旧状态；各项是行为控制，不保证硬碰撞约束。 */
export function flockStep(state: Boid[], dt: number, separation: number, target: Vec2): Boid[] {
  return state.map((bird, i) => {
    const force: Vec2 = [0.15 * (target[0] - bird.p[0]), 0.15 * (target[1] - bird.p[1])],
      center: Vec2 = [0, 0],
      velocity: Vec2 = [0, 0];
    let count = 0;
    state.forEach((other, j) => {
      if (i === j) return;
      const dx = other.p[0] - bird.p[0],
        dy = other.p[1] - bird.p[1],
        r2 = dx * dx + dy * dy;
      if (r2 < 1) {
        count++;
        center[0] += dx;
        center[1] += dy;
        velocity[0] += other.v[0];
        velocity[1] += other.v[1];
        if (r2 < 0.16 && r2 > 1e-10) {
          force[0] -= (separation * dx) / (r2 + 0.02);
          force[1] -= (separation * dy) / (r2 + 0.02);
        }
      }
    });
    if (count)
      for (let c = 0; c < 2; c++)
        force[c] += (0.5 * center[c]) / count + 0.7 * (velocity[c] / count - bird.v[c]);
    let v = bird.v.map((x, c) => x + dt * force[c]) as Vec2;
    const speed = Math.hypot(...v);
    if (speed > 1.2) v = v.map((x) => (x * 1.2) / speed) as Vec2;
    return { v, p: bird.p.map((x, c) => x + dt * v[c]) as Vec2 };
  });
}
export function particleAt(
  time: number,
  birth: number,
  velocity: Vec2,
  life: number,
  gravity = 1.5,
) {
  const age = time - birth;
  if (age < 0 || age >= life) return null;
  return {
    p: [velocity[0] * age, velocity[1] * age - 0.5 * gravity * age * age] as Vec2,
    age,
    opacity: 1 - age / life,
  };
}
