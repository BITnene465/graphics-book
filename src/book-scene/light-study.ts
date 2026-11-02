import { Drawing, palette } from '../figures/drawing.ts';
import { imagePanel } from '../figures/advanced.ts';
import { slider, number, vec2 } from '../figures/spec.ts';
import type { FigureSpec } from '../figures/spec.ts';
import type { Vec3 } from '../math/vector.ts';
import { dot, normalize, sub } from '../math/vector.ts';
import { compose, matVec } from '../math/matrix.ts';
import { lookAt, perspective } from '../chapters/03-camera/core.ts';
import { pointIrradiance } from '../chapters/23-radiometry/core.ts';
import { shadowQuery } from '../chapters/10-shadows/core.ts';
import { deskState } from './model.ts';
import { renderDesk } from './render.ts';

export const radiometry: FigureSpec = {
  id: 'desk-irradiance',
  chapter: '23',
  title: '桌面上的直接辐照度',
  subtitle: '拖动桌面采样点；分别核对距离、入射余弦和光源可见性。',
  source: '/src/book-scene/light-study.ts',
  animated: false,
  defaults: { point: [0.65, 0.5], power: 36 },
  controls: [slider('power', '台灯辐射通量', 0, 80, 1, 'W')],
  compute(p) {
    const state = deskState({ power: number(p, 'power') }),
      point = vec2(p, 'point'),
      f = renderDesk(state, 192),
      d = new Drawing();
    const world: Vec3 = [point[0], 0, point[1]],
      light = state.objects.find((o) => o.key === 'light')!.position;
    const delta = sub(light, world),
      distance = Math.hypot(...delta),
      cosine = dot([0, 1, 0], normalize(delta));
    const E = pointIrradiance(number(p, 'power'), distance, cosine);
    const visibility = shadowQuery(
      world,
      f.lightVP,
      f.shadow!.depth,
      f.shadow!.width,
      f.shadow!.height,
      Number(state.params.bias),
      Number(state.params.pcf),
    ).visibility;
    const clip = matVec(
      compose(
        perspective(state.camera.fov, f.width / f.height, 0.1, 30),
        lookAt(state.camera.eye, state.camera.target),
      ),
      [...world, 1],
    );
    imagePanel(d, '采样点在原场景中的位置', f.width, f.height, f.color, 1, () =>
      d.dot([((clip[0] / clip[3]) * f.width) / f.height, clip[1] / clip[3]], palette.yellow, 0.025),
    );
    d.panel('桌面采样 · X / Z', [-2.3, 2.3, -1.5, 1.5], () => {
      d.axes(-2.2, 2.2, -1.4, 1.4);
      d.line([[light[0], light[2]], point], palette.yellow, 2);
      d.dot([light[0], light[2]], palette.green, 0.06);
      d.handle(point, 'point', '桌面采样点', { limits: [-2.1, 2.1, -1.3, 1.3] });
    });
    d.values = {
      '距离 / m': distance,
      入射余弦: cosine,
      '无遮挡 E / W·m⁻²': E,
      阴影图可见率: visibility,
      '直射 E / W·m⁻²': E * visibility,
      '环境 E / W·m⁻²': 0.7,
    };
    d.formula = 'E_{\\mathrm{direct}}=V\\,\\frac{\\Phi}{4\\pi r^2}\\max(0,n\\cdot\\omega_i)';
    return d.result();
  },
};
