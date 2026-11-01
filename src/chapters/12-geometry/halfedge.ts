export type Halfedge = { origin: number; next: number; twin: number; face: number };
export type HalfedgeMesh = { edges: Halfedge[]; faces: number[]; vertexCount: number };

/** 有向面环；边界半边用 twin=-1，不构造虚拟外部面。 */
export function halfedges(vertexCount: number, polygons: number[][]): HalfedgeMesh {
  if (!Number.isInteger(vertexCount) || vertexCount < 1) throw new RangeError('顶点数须为正整数');
  const edges: Halfedge[] = [],
    faces: number[] = [],
    lookup = new Map<string, number>();
  for (const [face, polygon] of polygons.entries()) {
    if (
      polygon.length < 3 ||
      new Set(polygon).size !== polygon.length ||
      polygon.some((v) => !Number.isInteger(v) || v < 0 || v >= vertexCount)
    )
      throw new RangeError('面须含至少三个不同的有效顶点');
    const start = edges.length;
    faces.push(start);
    for (let j = 0; j < polygon.length; j++) {
      const a = polygon[j],
        b = polygon[(j + 1) % polygon.length],
        key = `${a},${b}`;
      if (lookup.has(key)) throw new RangeError('重复有向边：绕序不一致或边非流形');
      const index = edges.length,
        twin = lookup.get(`${b},${a}`) ?? -1;
      edges.push({ origin: a, next: start + ((j + 1) % polygon.length), twin, face });
      if (twin >= 0) edges[twin].twin = index;
      lookup.set(key, index);
    }
  }
  return { edges, faces, vertexCount };
}

export function faceCycle(mesh: HalfedgeMesh, face: number): number[] {
  const first = mesh.faces[face];
  if (first === undefined) throw new RangeError('面编号不存在');
  const result = [first];
  for (let h = mesh.edges[first].next; h !== first; h = mesh.edges[h].next) result.push(h);
  return result;
}

/** 教学翻边：重建这两个三角面并验证连接；几何凸性须由调用者保证。 */
export function flipEdge(mesh: HalfedgeMesh, h: number): HalfedgeMesh {
  const edge = mesh.edges[h],
    twin = edge && mesh.edges[edge.twin];
  if (!edge || !twin) throw new RangeError('只能翻转内部边');
  const left = faceCycle(mesh, edge.face),
    right = faceCycle(mesh, twin.face);
  if (left.length !== 3 || right.length !== 3) throw new RangeError('两侧须为三角形');
  const a = edge.origin,
    b = twin.origin;
  const c = mesh.edges[mesh.edges[edge.next].next].origin;
  const d = mesh.edges[mesh.edges[twin.next].next].origin;
  if (c === d || mesh.edges.some((e) => e.origin === c && mesh.edges[e.next].origin === d))
    throw new RangeError('新对角线会退化或重复');
  const polygons = mesh.faces.map((_, f) => faceCycle(mesh, f).map((e) => mesh.edges[e].origin));
  polygons[edge.face] = [c, d, b];
  polygons[twin.face] = [d, c, a];
  return halfedges(mesh.vertexCount, polygons);
}
