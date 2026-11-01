import { finite, clamp } from '../../math/vector.ts';
import { aliasFrequency, sinc } from './core.ts';

export function frameTimes(fps: number, duration = 1): number[] {
  finite([fps, duration]);
  if (fps <= 0 || duration < 0 || fps * duration > 4096)
    throw new RangeError('帧率、时长或样本总数非法');
  return Array.from({ length: Math.floor(fps * duration + 1e-12) + 1 }, (_, i) => i / fps);
}
export function apparentSpeed(speed: number, fps: number, blades = 8): number {
  if (!Number.isInteger(blades) || blades < 1 || blades > 64)
    throw new RangeError('亮瓣数须为 1 至 64');
  return aliasFrequency(blades * speed, fps) / blades;
}
export function cosineSignal(
  time: number,
  frequency: number,
  phase = 0,
  mean = 0.55,
  amplitude = 0.45,
): number {
  finite([time, frequency, phase, mean, amplitude]);
  return mean + amplitude * Math.cos(2 * Math.PI * frequency * time + phase);
}
export function cosineExposure(
  time: number,
  duration: number,
  frequency: number,
  phase = 0,
  mean = 0.55,
  amplitude = 0.45,
): number {
  finite([duration]);
  if (duration < 0) throw new RangeError('曝光时长不能为负');
  return cosineSignal(time, frequency, phase, mean, amplitude * sinc(frequency * duration));
}
export function shutterInterval(center: number, fps: number, duty: number) {
  finite([center, fps, duty]);
  if (fps <= 0 || duty < 0 || duty > 1) throw new RangeError('非法快门参数');
  const duration = duty / fps;
  return { open: center - duration / 2, close: center + duration / 2, duration };
}
export function midpointTimes(center: number, duration: number, samples: number): number[] {
  finite([center, duration]);
  if (duration < 0 || !Number.isInteger(samples) || samples < 1 || samples > 512)
    throw new RangeError('非法时间样本');
  return Array.from({ length: samples }, (_, i) => center + duration * ((i + 0.5) / samples - 0.5));
}
export function wheelCoordinates(resolution = 128) {
  if (!Number.isInteger(resolution) || resolution < 1 || resolution > 1024)
    throw new RangeError('轮面尺寸须为 1 至 1024');
  return Array.from({ length: resolution * resolution }, (_, i) => {
    const x = (2 * ((i % resolution) + 0.5)) / resolution - 1,
      y = 1 - (2 * (Math.floor(i / resolution) + 0.5)) / resolution,
      r = Math.hypot(x, y);
    return {
      angle: Math.atan2(y, x),
      envelope: clamp((r - 0.14) / 0.11) * clamp((0.94 - r) / 0.12),
    };
  });
}
export function wheelFrame(
  time: number,
  speed = 1,
  blades = 8,
  resolution = 128,
  duration = 0,
): Float64Array {
  const data = new Float64Array(resolution * resolution * 3),
    tint = [0.2, 0.57, 0.96],
    background = [0.013, 0.019, 0.029];
  wheelCoordinates(resolution).forEach(({ angle, envelope }, i) => {
    const intensity = cosineExposure(time, duration, -blades * speed, blades * angle);
    for (let c = 0; c < 3; c++) data[3 * i + c] = background[c] + envelope * intensity * tint[c];
  });
  return data;
}
export const wheelReference = (
  center: number,
  duration: number,
  speed = 1,
  blades = 8,
  resolution = 128,
): Float64Array => wheelFrame(center, speed, blades, resolution, duration);
export function wheelExposure(
  center: number,
  duration: number,
  samples: number,
  speed = 1,
  blades = 8,
  resolution = 128,
): Float64Array {
  const result = new Float64Array(resolution * resolution * 3);
  for (const t of midpointTimes(center, duration, samples))
    wheelFrame(t, speed, blades, resolution).forEach((v, i) => (result[i] += v / samples));
  return result;
}
