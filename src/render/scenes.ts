import type { Vec3 } from '../math/vector.ts';
import { matVec } from '../math/matrix.ts';
import { modelMatrix, flatScene, gridScene } from '../chapters/11-pipeline/core.ts';
import type { Scene } from '../chapters/11-pipeline/core.ts';
import { transformNormals } from '../chapters/07-lighting/core.ts';
import { makeMesh, analyticNormal } from '../chapters/12-geometry/core.ts';
import { defaultControl, patchMesh, stitchPatches } from '../chapters/14-surfaces/core.ts';
import type { Continuity } from '../chapters/13-bezier/splines.ts';
import { slider, choice } from '../figures/spec.ts';
import type { Control, Params } from '../figures/spec.ts';

export type ObjectState = {
  key: string;
  label: string;
  kind: 'box' | 'sphere' | 'plane' | 'ground' | 'grid' | 'patch' | 'control' | 'light';
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: Vec3;
  editable?: boolean;
  mirror?: number;
};
export type CameraState = {
  eye: Vec3;
  target: Vec3;
  fov: number;
  projection: 'perspective' | 'orthographic';
  zoom?: number;
};
export type StudyState = {
  chapter: string;
  params: Params;
  objects: ObjectState[];
  camera: CameraState;
};
export type StudySpec = { title: string; source: string; controls: Control[]; state: StudyState };
const object = (
  key: string,
  label: string,
  kind: ObjectState['kind'],
  position: Vec3 = [0, 0, 0],
  scale: Vec3 = [1, 1, 1],
  color: Vec3 = [0.12, 0.46, 0.33],
): ObjectState => ({
  key,
  label,
  kind,
  position,
  scale,
  color,
  rotation: [0, 0, 0],
  editable: true,
});
export const sceneChapters = new Set(['03', '06', '07', '08', '10', '12', '15', '11', '09', '14']);
export function studySpec(chapter: string): StudySpec {
  const camera: CameraState = {
      eye: [3, 2, 5],
      target: [0, 0, 0],
      fov: 48,
      projection: 'perspective',
    },
    objects: ObjectState[] = [],
    controls: Control[] = [],
    params: Params = { resolution: 384, lightX: -3, lightY: 4, lightZ: 5 };
  let title = '',
    source = '';
  if (chapter === '03') {
    title = '在空间中摆放物体与相机';
    source = '03-camera/core.ts';
    objects.push(
      object('a', '物体 A', 'box', [-0.9, 0, 0.5], [0.65, 0.65, 0.65]),
      object('b', '物体 B', 'sphere', [1, 0, -1], [0.7, 0.7, 0.7], [0.65, 0.3, 0.1]),
    );
    params.near = 0.1;
    params.far = 40;
    controls.push(slider('near', '近平面', 0.01, 3, 0.01), slider('far', '远平面', 5, 100, 1));
  } else if (chapter === '06') {
    title = '相交表面的可见性';
    source = '06-depth/core.ts';
    const a = object('a', '斜面 A', 'plane', [-0.15, 0, 0], [1.5, 1.1, 1], [0.1, 0.4, 0.65]),
      b = object('b', '斜面 B', 'plane', [0.15, 0, 0], [1.5, 1.1, 1]);
    a.rotation = [0, 35, 0];
    b.rotation = [0, -35, 0];
    objects.push(a, b);
    params.depthTest = true;
    params.reverse = false;
    params.bits = 0;
    controls.push(
      choice('depthTest', '逐像素深度', [
        [true, '开'],
        [false, '关'],
      ]),
      choice('reverse', '提交顺序', [
        [false, 'A → B'],
        [true, 'B → A'],
      ]),
      choice('bits', '深度精度', [
        [0, 'Float64'],
        [8, '8-bit'],
        [16, '16-bit'],
        [24, '24-bit'],
      ]),
    );
    camera.eye = [0, 0, 5];
  } else if (chapter === '07' || chapter === '12') {
    title = chapter === '07' ? '光照与非均匀缩放' : '从解析曲面到三角网格';
    source = chapter === '07' ? '07-lighting/core.ts' : '12-geometry/core.ts';
    objects.push(object('surface', '椭球', 'sphere', [0, 0, 0], [1.3, 0.85, 1]));
    params.detail = 16;
    params.exponent = 64;
    params.normalMode = 'correct';
    params.ks = 0.35;
    controls.push(slider('detail', '纬向分段', 3, 64, 1));
    if (chapter === '07')
      controls.push(
        slider('exponent', '高光指数', 1, 512, 1),
        slider('ks', '高光系数', 0, 1, 0.01),
        choice('normalMode', '法线变换', [
          ['correct', '逆转置'],
          ['wrong', '错误对照'],
        ]),
      );
  } else if (chapter === '08') {
    title = '倾斜平面上的纹理';
    source = '08-textures/core.ts';
    const plane = object('surface', '纹理平面', 'plane', [0, 0, 0], [1.7, 1.2, 1], [1, 1, 1]);
    plane.rotation = [-45, 0, 0];
    objects.push(plane);
    params.filter = 'trilinear';
    params.correct = true;
    params.frequency = 16;
    params.textureSize = 128;
    params.lodBias = 0;
    params.anisotropy = 8;
    controls.push(
      choice('correct', '属性插值', [
        [true, '透视正确'],
        [false, '屏幕仿射'],
      ]),
      choice('filter', '纹理过滤', [
        ['nearest', '最近邻'],
        ['bilinear', '双线性'],
        ['trilinear', '三线性'],
        ['anisotropic', '各向异性'],
      ]),
      slider('frequency', '棋盘格数', 2, 128, 1),
      slider('lodBias', 'LOD 偏移', -3, 3, 0.05),
      choice('anisotropy', '各向异性上限', [
        [1, '1×'],
        [4, '4×'],
        [8, '8×'],
        [16, '16×'],
      ]),
    );
    camera.eye = [0, 1, 4.5];
  } else if (chapter === '10') {
    title = '光源看到的深度与相机看到的表面';
    source = '10-shadows/core.ts';
    objects.push(
      object('pillar', '立方柱', 'box', [0, 0.8, 0], [0.55, 0.8, 0.55], [0.63, 0.25, 0.1]),
      {
        ...object('ground', '地面', 'ground', [0, 0, 0], [1, 1, 1], [0.53, 0.58, 0.45]),
        editable: false,
      },
    );
    params.bias = 0.004;
    params.pcf = 1;
    params.shadowSize = 256;
    params.lightX = -3;
    params.lightY = 6;
    params.lightZ = -2;
    controls.push(
      slider('bias', '阴影偏移', 0, 0.05, 0.0002),
      choice('pcf', '过滤', [
        [0, '硬阴影'],
        [1, '3×3'],
        [2, '5×5'],
      ]),
      choice('shadowSize', '阴影分辨率', [
        [64, '64'],
        [128, '128'],
        [256, '256'],
        [512, '512'],
        [1024, '1024'],
        [2048, '2048'],
      ]),
    );
    camera.eye = [6, 5, 7];
    camera.target = [0, 0.55, 0];
  } else if (chapter === '15') {
    title = '光线如何在场景中传播';
    source = '15-rays/core.ts';
    objects.push(
      {
        ...object('a', '球 A', 'sphere', [-0.95, 0.8, 0], [0.8, 0.8, 0.8], [0.16, 0.34, 0.43]),
        mirror: 0.65,
      },
      {
        ...object('b', '球 B', 'sphere', [1, 0.7, -0.5], [0.7, 0.7, 0.7], [0.65, 0.2, 0.08]),
        mirror: 0.08,
      },
      {
        ...object('ground', '地面', 'ground', [0, 0, 0], [1, 1, 1], [0.57, 0.58, 0.44]),
        editable: false,
      },
    );
    params.bounces = 2;
    params.epsilon = 0.0001;
    params.specular = 0.3;
    params.shininess = 48;
    params.mirrorA = 0.65;
    params.mirrorB = 0.08;
    params.resolution = 384;
    params.visibility = 'ray';
    params.detail = 20;
    params.lightY = 5;
    params.lightZ = 4;
    controls.push(
      choice('visibility', '可见性算法', [
        ['ray', '解析光线'],
        ['raster', '三角网格'],
      ]),
      slider('detail', '球网格分段', 4, 64, 1),
      slider('bounces', '反射次数', 0, 8, 1),
      slider('epsilon', '起点偏移', 0, 0.02, 0.0001),
      slider('specular', '局部高光', 0, 1, 0.01),
      slider('shininess', '高光指数', 1, 512, 1),
      slider('mirrorA', '球 A 反射权重', 0, 0.95, 0.01),
      slider('mirrorB', '球 B 反射权重', 0, 0.95, 0.01),
    );
    camera.eye = [4, 2.5, 6];
    camera.target = [0, 0.65, 0];
    camera.fov = 42;
  } else if (chapter === '11') {
    title = '一帧图像的完整生成过程';
    source = '11-pipeline/core.ts';
    objects.push(object('model', '双层网格', 'grid'));
    params.detail = 8;
    params.wave = 0.2;
    params.mode = 'checker';
    params.depthTest = true;
    params.earlyDepth = true;
    params.cull = false;
    params.reverse = false;
    controls.push(
      slider('detail', '网格分段', 1, 32, 1),
      slider('wave', '波幅', 0, 0.8, 0.01),
      choice('mode', '片元程序', [
        ['checker', '光照棋盘'],
        ['lit', '光照'],
        ['uv', 'UV'],
        ['normal', '法线'],
      ]),
      choice('depthTest', '深度测试', [
        [true, '开'],
        [false, '关'],
      ]),
      choice('earlyDepth', '提前深度', [
        [true, '开'],
        [false, '关'],
      ]),
      choice('cull', '背面剔除', [
        [false, '关'],
        [true, '开'],
      ]),
      choice('reverse', '提交顺序', [
        [false, '前层先'],
        [true, '后层先'],
      ]),
    );
  } else if (chapter === '09') {
    title = '按反射方向查询环境';
    source = '09-texture-functions/core.ts';
    objects.push(object('sphere', '镜面球', 'sphere'));
    params.environment = 'studio';
    params.mapping = 'analytic';
    params.envAngle = 0;
    params.mapSize = 128;
    params.detail = 40;
    controls.push(
      choice('environment', '环境', [
        ['studio', '柔光空间'],
        ['direction', '方向编码'],
      ]),
      choice('mapping', '查询方式', [
        ['analytic', '连续函数'],
        ['latlong', '经纬图'],
        ['cube', '立方体图'],
      ]),
      slider('envAngle', '环境方位', -180, 180, 1, '°'),
      choice('mapSize', '纹理尺寸', [
        [16, '16'],
        [32, '32'],
        [128, '128'],
        [256, '256'],
      ]),
    );
    camera.eye = [3, 1.4, 4];
    camera.fov = 42;
  } else if (chapter === '14') {
    title = '直接编辑三维控制网';
    source = '14-surfaces/core.ts';
    objects.push({ ...object('patch', 'Bézier 曲面', 'patch'), editable: false });
    defaultControl()
      .flat()
      .forEach((p, i) =>
        objects.push(
          object(
            `p${i}`,
            `控制点 P${Math.floor(i / 4)}${i % 4}`,
            'control',
            p,
            [0.045, 0.045, 0.045],
            [0.85, 0.5, 0.1],
          ),
        ),
      );
    params.detail = 20;
    params.pair = false;
    params.continuity = 'C1';
    params.leftSpan = 1;
    params.rightSpan = 1;
    controls.push(
      slider('detail', '曲面分段', 3, 64, 1),
      choice('pair', '曲面', [
        [false, '单片'],
        [true, '双片拼接'],
      ]),
      choice('continuity', '接缝约束', [
        ['C0', 'C⁰'],
        ['G1', 'G¹'],
        ['C1', 'C¹'],
        ['C2', 'C²'],
      ]),
      slider('leftSpan', '左片参数跨度', 0.3, 2, 0.05),
      slider('rightSpan', '右片参数跨度', 0.3, 2, 0.05),
    );
    camera.eye = [3, 3, 5];
    camera.fov = 42;
  } else throw new RangeError('此章没有三维综合演示');
  if (['07', '10', '15', '11', '14'].includes(chapter))
    objects.push(
      object(
        'light',
        '光源',
        'light',
        [params.lightX as number, params.lightY as number, params.lightZ as number],
        [0.12, 0.12, 0.12],
        [1, 0.8, 0.25],
      ),
    );
  controls.push(
    choice('resolution', '输出分辨率', [
      [192, '192'],
      [384, '384'],
      [768, '768'],
      [1536, '1536'],
    ]),
  );
  return {
    title,
    source: '/src/chapters/' + source,
    controls,
    state: { chapter, params, objects, camera },
  };
}

/** 几何也由教学函数生成。Three.js 和软件渲染读取同一份顶点与法线。 */
export function localScene(object: ObjectState, state: StudyState): Scene {
  const detail = Number(state.params.detail ?? 20),
    color = object.color;
  if (object.kind === 'sphere' || object.kind === 'light' || object.kind === 'control') {
    const mesh = makeMesh(
      [1, 1, 1],
      object.kind === 'sphere' ? detail : 6,
      object.kind === 'sphere' ? detail * 2 : 12,
    );
    return {
      ...mesh,
      normals: mesh.vertices.map((p) => analyticNormal(p)),
      uv: mesh.vertices.map((p) => [
        (Math.atan2(p[1], p[0]) / (2 * Math.PI) + 1) % 1,
        Math.acos(Math.max(-1, Math.min(1, p[2]))) / Math.PI,
      ]),
      colors: mesh.vertices.map(() => color),
    };
  }
  if (object.kind === 'plane' || object.kind === 'ground') {
    const ground = object.kind === 'ground',
      vertices: Vec3[] = ground
        ? [
            [-5, 0, -5],
            [5, 0, -5],
            [5, 0, 5],
            [-5, 0, 5],
          ]
        : [
            [-1, -1, 0],
            [1, -1, 0],
            [1, 1, 0],
            [-1, 1, 0],
          ];
    return {
      vertices,
      faces: ground
        ? [
            [0, 2, 1],
            [0, 3, 2],
          ]
        : [
            [0, 1, 2],
            [0, 2, 3],
          ],
      normals: vertices.map(() => (ground ? [0, 1, 0] : [0, 0, 1])),
      uv: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      colors: vertices.map(() => color),
    };
  }
  if (object.kind === 'grid') {
    const scene = gridScene(detail),
      wave = Number(state.params.wave);
    scene.vertices = scene.vertices.map(([x, y, z]) => [
      x,
      y,
      z + wave * Math.sin(2 * x) * Math.sin(2 * y),
    ]);
    scene.normals = scene.vertices.map(([x, y]) => {
      const n: Vec3 = [
          -wave * 2 * Math.cos(2 * x) * Math.sin(2 * y),
          -wave * 2 * Math.sin(2 * x) * Math.cos(2 * y),
          1,
        ],
        length = Math.hypot(...n);
      return n.map((x) => x / length) as Vec3;
    });
    return scene;
  }
  if (object.kind === 'patch') {
    const control = Array.from({ length: 4 }, (_, i) =>
      Array.from(
        { length: 4 },
        (_, j) => state.objects.find((o) => o.key === `p${i * 4 + j}`)!.position,
      ),
    );
    let mesh = patchMesh(control, detail);
    if (state.params.pair) {
      const right = defaultControl().map((row) =>
          row.map((p) => [p[0] + 2.7, p[1] - 0.4, p[2]] as Vec3),
        ),
        joined = stitchPatches(
          control,
          right,
          state.params.continuity as Continuity,
          Number(state.params.leftSpan),
          Number(state.params.rightSpan),
        ),
        other = patchMesh(joined.right, detail),
        offset = mesh.vertices.length;
      mesh = {
        vertices: [...mesh.vertices, ...other.vertices],
        normals: [...mesh.normals, ...other.normals],
        uv: [...mesh.uv, ...other.uv],
        faces: [...mesh.faces, ...other.faces.map((f) => f.map((i) => i + offset) as Vec3)],
        regular: [...mesh.regular, ...other.regular],
      };
    }
    return {
      ...mesh,
      normals: mesh.normals.map((n, i) => (mesh.regular[i] ? n : [0, 0, 0])),
      colors: mesh.vertices.map(() => color),
    };
  }
  const vertices: Vec3[] = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
    faces: Vec3[] = [
      [0, 3, 2],
      [0, 2, 1],
      [4, 5, 6],
      [4, 6, 7],
      [0, 4, 7],
      [0, 7, 3],
      [1, 2, 6],
      [1, 6, 5],
      [3, 7, 6],
      [3, 6, 2],
      [0, 1, 5],
      [0, 5, 4],
    ];
  return flatScene(
    faces.map((f) => f.map((i) => vertices[i])),
    faces.map(() => color),
  );
}
export function buildScene(state: StudyState): Scene {
  const result: Scene = { vertices: [], faces: [], normals: [], uv: [], colors: [] };
  for (const object of state.objects) {
    if (object.kind === 'control' || object.kind === 'light') continue;
    const mesh = localScene(object, state),
      m = modelMatrix(object.position, object.rotation, object.scale),
      offset = result.vertices.length;
    result.vertices.push(...mesh.vertices.map((p) => matVec(m, [...p, 1]).slice(0, 3) as Vec3));
    result.normals.push(
      ...transformNormals(
        mesh.normals,
        m.slice(0, 3).map((r) => r.slice(0, 3)),
        state.params.normalMode !== 'wrong',
      ),
    );
    result.faces.push(...mesh.faces.map((f) => f.map((i) => i + offset) as Vec3));
    result.uv.push(...mesh.uv);
    result.colors.push(...mesh.colors);
  }
  return result;
}
