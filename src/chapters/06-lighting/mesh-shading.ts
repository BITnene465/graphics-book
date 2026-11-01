import type { Vec3 } from '../../math/vector.ts';
import { identity } from '../../math/matrix.ts';
import { normalize, lightAt, shade } from './core.ts';
import type { Material } from './core.ts';
import { faceGeometry } from '../10-geometry/core.ts';
import { renderFrame } from '../13-pipeline/core.ts';

export function interpolateNormal(weights: Vec3, normals: Vec3[]): Vec3 {
  return normalize(
    [0, 1, 2].map((c) => weights.reduce((s, w, i) => s + w * normals[i][c], 0)) as Vec3,
  );
}
export function rasterizeMesh(
  vertices: Vec3[],
  faces: Vec3[],
  vertexNormals: Vec3[],
  size = 160,
  extent = 1.9,
  light: Vec3 = [-3, 4, 5],
  material: Material = {},
  lighting?: (point: Vec3, normal: Vec3) => Vec3,
) {
  const faceData = faceGeometry(vertices, faces),
    illuminate =
      lighting ??
      ((p: Vec3, n: Vec3): Vec3 => {
        const l = lightAt(p, light, true, 40);
        return shade(n, l.direction, [0, 0, 1], { ...material, irradiance: l.irradiance }).total;
      });
  const faceColors = faceData.map((f) => illuminate(f.center, f.normal)),
    vertexColors = vertices.map((p, i) => illuminate(p, vertexNormals[i]));
  const zExtent = Math.max(1, ...vertices.map((p) => Math.abs(p[2]) + 1)),
    projection = [
      [1 / extent, 0, 0, 0],
      [0, 1 / extent, 0, 0],
      [0, 0, -1 / zExtent, 0],
      [0, 0, 0, 1],
    ];
  const scene = {
    vertices,
    faces,
    normals: vertexNormals,
    uv: vertices.map(() => [0, 0] as [number, number]),
    colors: vertexColors,
  };
  const frame = renderFrame(scene, {
    width: size,
    view: identity(4),
    projection,
    fragment: (f) => f.color,
  });
  const flat = frame.color.slice(),
    gouraud = frame.color.slice(),
    phong = frame.color.slice();
  let phongCount = 0;
  frame.owner.forEach((id, i) => {
    if (id < 0) return;
    flat.set(faceColors[id], i * 3);
    phong.set(
      illuminate(
        [...frame.world.slice(i * 3, i * 3 + 3)] as Vec3,
        [...frame.normal.slice(i * 3, i * 3 + 3)] as Vec3,
      ),
      i * 3,
    );
    phongCount++;
  });
  return {
    ...frame,
    images: { flat, gouraud, phong },
    faceColors,
    vertexColors,
    faceNormals: faceData.map((f) => f.normal),
    evaluations: { flat: faces.length, gouraud: vertices.length, phong: phongCount },
  };
}
