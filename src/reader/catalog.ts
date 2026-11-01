export type Chapter = {
  id: string;
  slug: string;
  title: string;
  part: string;
  kind: '2D' | '3D';
  module: string;
};
const chapter = (
  id: string,
  slug: string,
  title: string,
  part: string,
  kind: '2D' | '3D',
  module = 'foundations',
): Chapter => ({ id, slug, title, part, kind, module });
export const chapters: Chapter[] = [
  chapter('01', '01-pixels', '像素与颜色', '图像与空间', '2D'),
  chapter('02', '02-transforms', '变换与坐标', '图像与空间', '3D'),
  chapter('03', '03-camera', '相机与投影', '图像与空间', '3D'),
  chapter('04', '04-barycentric', '图元与光栅化', '光栅化与采样', '2D'),
  chapter('05', '05-sampling', '采样与抗锯齿', '光栅化与采样', '2D'),
  chapter('06', '06-depth', '深度与可见性', '光栅化与采样', '3D'),
  chapter('07', '07-lighting', '法线与光照', '表面与着色', '3D'),
  chapter('08', '08-textures', '纹理映射与过滤', '表面与着色', '3D'),
  chapter('09', '09-texture-functions', '纹理作为函数', '表面与着色', '3D'),
  chapter('10', '10-shadows', '阴影映射', '表面与着色', '3D'),
  chapter('11', '11-pipeline', '一条完整的光栅管线', '表面与着色', '3D'),
  chapter('12', '12-geometry', '几何表示与空间组织', '几何', '3D'),
  chapter('13', '13-bezier', '曲线与样条', '几何', '2D'),
  chapter('14', '14-surfaces', '从曲线到曲面', '几何', '3D'),
  chapter('15', '15-rays', '光线追踪', '光线追踪', '3D'),
  chapter('16', '16-subdivision', '细分与极限曲面', '几何处理与建模', '3D', 'geometry'),
  chapter('17', '17-fairing', '平滑与离散算子', '几何处理与建模', '3D', 'geometry'),
  chapter('18', '18-remeshing', '简化与重网格', '几何处理与建模', '3D', 'geometry'),
  chapter('19', '19-parameterization', '从网格反求参数域', '几何处理与建模', '3D', 'geometry'),
  chapter('20', '20-deformation', '约束与几何形变', '几何处理与建模', '3D', 'geometry'),
  chapter('21', '21-reconstruction', '三维获取与重建', '几何处理与建模', '3D', 'geometry'),
  chapter('22', '22-procedural-modeling', '规则生成形体', '几何处理与建模', '3D', 'geometry'),
  chapter('23', '23-radiometry', '光的度量', '光传输', '3D', 'light-transport'),
  chapter('24', '24-materials', '反射、折射与材质', '光传输', '3D', 'light-transport'),
  chapter('25', '25-global-illumination', '全局光照与辐射度', '光传输', '3D', 'light-transport'),
  chapter('26', '26-path-tracing', '随机积分与路径追踪', '光传输', '3D', 'light-transport'),
  chapter('27', '27-acceleration', '加速可见性查询', '光传输', '3D', 'light-transport'),
  chapter('28', '28-matting', '抠图与透明合成', '图像处理', '2D', 'image-processing'),
  chapter('29', '29-image-editing', '颜色与梯度域编辑', '图像处理', '2D', 'image-processing'),
  chapter('30', '30-retargeting', '内容感知缩放', '图像处理', '2D', 'image-processing'),
  chapter('31', '31-registration', '配准与图像拼接', '图像处理', '2D', 'image-processing'),
  chapter('32', '32-lenses', '镜头、光圈与景深', '计算摄像', '3D', 'computational-imaging'),
  chapter('33', '33-sensors', '传感器与数码重建', '计算摄像', '2D', 'computational-imaging'),
  chapter(
    '34',
    '34-computational-imaging',
    '编码、反演与光场',
    '计算摄像',
    '2D',
    'computational-imaging',
  ),
  chapter('35', '35-stylization', '边缘、色阶与笔画', '风格化绘制', '2D', 'stylization'),
  chapter('36', '36-texture-synthesis', '纹理合成与时间一致性', '风格化绘制', '2D', 'stylization'),
  chapter('37', '37-keyframes', '关键帧与形状插值', '动画与模拟', '3D', 'animation'),
  chapter('38', '38-kinematics', '关节、约束与蒙皮', '动画与模拟', '3D', 'animation'),
  chapter('39', '39-dynamics', '粒子、动力学与群体', '动画与模拟', '3D', 'animation'),
];

/** 名称链接不随编排变化。数字链接只用于兼容初版的书签。 */
export const chapterKey = (entry: Chapter): string => entry.slug.slice(3);
export const chapterHref = (entry: Chapter): string => `?chapter=${chapterKey(entry)}`;
const legacyKeys = [
  'pixels',
  'transforms',
  'camera',
  'barycentric',
  'depth',
  'lighting',
  'textures',
  'sampling',
  'shadows',
  'geometry',
  'bezier',
  'rays',
  'pipeline',
  'texture-functions',
  'surfaces',
];
export function resolveChapter(value: string | null): Chapter {
  const key =
    value && /^\d{2}$/.test(value)
      ? (legacyKeys[Number(value) - 1] ?? chapters.find((c) => c.id === value)?.slug)
      : value;
  return chapters.find((entry) => chapterKey(entry) === key || entry.slug === key) ?? chapters[0];
}

export const appendices = [
  { id: 'capstone', title: '综合实践', file: '/content/foundations/capstone.md' },
  { id: 'math', title: '数学补充', file: '/content/resources/math/bridge.md' },
  { id: 'glossary', title: '术语与符号', file: '/content/resources/reading/glossary.md' },
  { id: 'reading', title: '参考文献', file: '/content/resources/reading/classics.md' },
];
