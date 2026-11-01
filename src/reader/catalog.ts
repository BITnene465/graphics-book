export type Chapter = { id: string; slug: string; title: string; part: string; kind: '2D' | '3D' };
const chapter = (
  id: string,
  slug: string,
  title: string,
  part: string,
  kind: '2D' | '3D',
): Chapter => ({ id, slug, title, part, kind });
export const chapters: Chapter[] = [
  chapter('01', '01-pixels', '像素与颜色', '图像与空间', '2D'),
  chapter('02', '02-transforms', '变换与坐标', '图像与空间', '3D'),
  chapter('03', '03-camera', '相机与投影', '图像与空间', '3D'),
  chapter('04', '04-barycentric', '三角形与重心坐标', '光栅化与采样', '2D'),
  chapter('08', '08-sampling', '采样与抗锯齿', '光栅化与采样', '2D'),
  chapter('05', '05-depth', '深度与可见性', '光栅化与采样', '3D'),
  chapter('06', '06-lighting', '法线与光照', '表面与着色', '3D'),
  chapter('07', '07-textures', '纹理与透视插值', '表面与着色', '3D'),
  chapter('14', '14-texture-functions', '纹理作为函数', '表面与着色', '3D'),
  chapter('09', '09-shadows', '阴影映射', '表面与着色', '3D'),
  chapter('13', '13-pipeline', '一条完整的光栅管线', '表面与着色', '3D'),
  chapter('10', '10-geometry', '几何的三种表达', '几何', '3D'),
  chapter('11', '11-bezier', '曲线与样条', '几何', '2D'),
  chapter('15', '15-surfaces', '从曲线到曲面', '几何', '3D'),
  chapter('12', '12-rays', '光线追踪', '光线追踪', '3D'),
];

export const appendices = [
  { id: 'capstone', title: '综合实践', file: '/content/foundations/capstone.md' },
  { id: 'math', title: '数学补充', file: '/content/resources/math/bridge.md' },
  { id: 'glossary', title: '术语与符号', file: '/content/resources/reading/glossary.md' },
  { id: 'reading', title: '参考文献', file: '/content/resources/reading/classics.md' },
];
