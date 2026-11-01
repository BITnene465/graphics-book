import type { Frame } from './drawing.ts';
import type { Vec2, Vec3 } from '../math/vector.ts';

export type ParamValue = number | string | boolean | number[] | number[][];
export type Params = Record<string, ParamValue>;
export type Control =
  | { key: string; label: string; min: number; max: number; step?: number; unit?: string }
  | { key: string; label: string; options: { value: string | number | boolean; label: string }[] };
export type FigureSpec = {
  id: string;
  chapter: string;
  title: string;
  subtitle: string;
  source: string;
  defaults: Params;
  controls: Control[];
  compute: (params: Params, progress: number) => Frame;
  animated?: boolean;
  duration?: number;
};
export const number = (p: Params, key: string): number => p[key] as number;
export const vec2 = (p: Params, key: string): Vec2 => p[key] as Vec2;
export const vec3 = (p: Params, key: string): Vec3 => p[key] as Vec3;
export const points = (p: Params, key: string): number[][] => p[key] as number[][];
export const slider = (
  key: string,
  label: string,
  min: number,
  max: number,
  step = 0.01,
  unit = '',
): Control => ({ key, label, min, max, step, unit });
export const choice = (
  key: string,
  label: string,
  options: [string | number | boolean, string][],
): Control => ({ key, label, options: options.map(([value, label]) => ({ value, label })) });
