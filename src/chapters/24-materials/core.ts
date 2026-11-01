import { clamp } from '../../math/vector.ts';
export function fresnel(
  cosine: number,
  etaI: number,
  etaT: number,
): { reflectance: number; cosTransmitted: number | null } {
  if (etaI <= 0 || etaT <= 0) throw new RangeError('折射率必须为正');
  if (etaI === etaT) return { reflectance: 0, cosTransmitted: clamp(Math.abs(cosine)) };
  const ci = clamp(Math.abs(cosine)),
    sin2 = (etaI / etaT) ** 2 * (1 - ci * ci);
  if (sin2 >= 1) return { reflectance: 1, cosTransmitted: null };
  const ct = Math.sqrt(1 - sin2),
    rs = (etaI * ci - etaT * ct) / (etaI * ci + etaT * ct),
    rp = (etaT * ci - etaI * ct) / (etaT * ci + etaI * ct);
  return { reflectance: (rs * rs + rp * rp) / 2, cosTransmitted: ct };
}
export function ggxDistribution(cosHalf: number, alpha: number): number {
  if (alpha <= 0 || cosHalf <= 0) return 0;
  const a2 = alpha * alpha,
    q = cosHalf * cosHalf * (a2 - 1) + 1;
  return a2 / (Math.PI * q * q);
}
export function smithG1(cosine: number, alpha: number): number {
  if (cosine <= 0) return 0;
  return (2 * cosine) / (cosine + Math.sqrt(alpha * alpha + (1 - alpha * alpha) * cosine * cosine));
}
/** 各向同性单次散射 GGX 镜面 BRDF；两个方向从表面向外。 */
export function ggx(thetaI: number, thetaO: number, alpha: number, eta = 1.5): number {
  const ci = Math.cos(thetaI),
    co = Math.cos(thetaO),
    hx = Math.sin(thetaI) + Math.sin(thetaO),
    hz = ci + co,
    norm = Math.hypot(hx, hz);
  if (ci <= 0 || co <= 0 || norm < 1e-12) return 0;
  const ch = hz / norm,
    ih = (Math.sin(thetaI) * hx + ci * hz) / norm;
  return (
    (ggxDistribution(ch, alpha) *
      smithG1(ci, alpha) *
      smithG1(co, alpha) *
      fresnel(ih, 1, eta).reflectance) /
    (4 * ci * co)
  );
}
export const beerLambert = (absorption: number, distance: number) =>
  Math.exp(-absorption * distance);
