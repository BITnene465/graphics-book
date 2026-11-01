/** 综合实践只负责组合章节函数；光栅、阴影和颜色算法仍在各章。 */
import { studySpec, buildScene } from '../render/scenes.ts';
import type { StudySpec, StudyState } from '../render/scenes.ts';
import { renderStudy } from '../render/render-study.ts';
import type { StudyOutput } from '../render/render-study.ts';
import { encodeRgba } from '../chapters/01-pixels/core.ts';
import { rasterizeWorld, sceneMatrices, shadowQuery } from '../chapters/09-shadows/core.ts';
import type { Vec3 } from '../math/vector.ts';

export function capstoneSpec(): StudySpec {
  const spec = studySpec('09');
  spec.title = '综合实践：一幅图像，两次可见性计算';
  spec.source = '/src/capstone/core.ts';
  spec.state.objects.find((o) => o.key === 'pillar')!.position = [-1, 0.8, -0.4];
  spec.state.objects.push({
    key: 'ellipsoid',
    label: '椭球',
    kind: 'sphere',
    position: [1, 0.75, 0.3],
    rotation: [0, 0, 0],
    scale: [0.9, 0.75, 0.6],
    color: [0.12, 0.46, 0.35],
    editable: true,
  });
  return spec;
}

/** 保持最终尺寸，以规则子像素样本积分线性 RGB；最后才编码。 */
export function renderCapstone(state = capstoneSpec().state, size = 384, samplesPerAxis = 1) {
  if (
    !Number.isInteger(samplesPerAxis) ||
    samplesPerAxis < 1 ||
    samplesPerAxis > 4 ||
    size * samplesPerAxis > 2048
  )
    throw new RangeError('每轴 1–4 个样本，内部图像最大 2048');
  const frame = renderStudy(state, size * samplesPerAxis);
  if (samplesPerAxis === 1)
    return { width: size, height: size, linear: frame.linear, pixels: frame.pixels };
  const linear = new Float64Array(size * size * 3),
    count = samplesPerAxis ** 2;
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) {
      for (let sy = 0; sy < samplesPerAxis; sy++)
        for (let sx = 0; sx < samplesPerAxis; sx++) {
          const source =
            ((row * samplesPerAxis + sy) * frame.width + col * samplesPerAxis + sx) * 3;
          for (let c = 0; c < 3; c++)
            linear[(row * size + col) * 3 + c] += frame.linear[source + c] / count;
        }
    }
  return { width: size, height: size, linear, pixels: encodeRgba(linear) };
}

/** 读取实际像素，再用其世界位置重做光源查询；没有编造演示数字。 */
export function inspectCapstone(state: StudyState, frame: StudyOutput, row: number, col: number) {
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    row < 0 ||
    col < 0 ||
    row >= frame.height ||
    col >= frame.width
  )
    throw new RangeError('像素超出图像');
  const i = row * frame.width + col,
    owner = frame.owner[i];
  if (owner < 0) return { row, col, owner, background: true as const };
  const world = [...frame.world.slice(i * 3, i * 3 + 3)] as Vec3,
    normal = [...frame.normal.slice(i * 3, i * 3 + 3)],
    scene = buildScene(state),
    light = state.objects.find((o) => o.kind === 'light')!.position;
  const vp = sceneMatrices(light).lightVP,
    size = Number(state.params.shadowSize);
  const shadow = rasterizeWorld(
    scene.faces.map((face) => face.map((j) => scene.vertices[j])),
    vp,
    size,
  );
  const query = shadowQuery(
    world,
    vp,
    shadow.depth,
    size,
    size,
    Number(state.params.bias),
    Number(state.params.pcf),
  );
  return {
    row,
    col,
    owner,
    background: false as const,
    depth: frame.depth[i],
    world,
    normal,
    linear: [...frame.linear.slice(i * 3, i * 3 + 3)],
    shadow: query,
  };
}
