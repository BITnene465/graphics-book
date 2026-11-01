import katex from 'katex';
import { EditHistory } from './history.ts';
import { icon } from './icons.ts';
import { numberField } from './number-field.ts';
import { plotColor } from './visual-style.ts';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import { cameraFrame, defaults } from '../chapters/03-camera/scene.ts';
import type { CameraParams, CameraValues } from '../chapters/03-camera/scene.ts';
import type { Frame, Primitive } from '../figures/drawing.ts';
import framingSource from '../chapters/03-camera/framing.ts?raw';
type Events = HTMLElementEventMap & DocumentEventMap;
type On = <K extends keyof Events>(
  node: EventTarget,
  event: K,
  fn: (event: Events[K]) => unknown,
) => void;
const source = framingSource
  .slice(framingSource.indexOf('export function framing'), framingSource.indexOf('/** 固定'))
  .trim();
const NS = 'http://www.w3.org/2000/svg';
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const cameraIcon = `<svg viewBox="0 0 32 24" aria-hidden="true"><path d="M3 6h17v14H3zM20 10l9-5v16l-9-5M7 6V3h8v3"/></svg>`;

export type CameraSnapshot = { params: CameraParams; explanation: boolean; code: boolean };
export class CameraStudy {
  host: HTMLElement;
  params: CameraParams;
  controller: AbortController;
  observer: IntersectionObserver;
  frame?: Frame<CameraValues>;
  disposed = false;
  playing = false;
  animation = 0;
  frameRequest = 0;
  rayScale = 1;
  history = new EditHistory<CameraParams>();
  $: <T extends Element = HTMLElement>(selector: string) => T;
  constructor(host: HTMLElement, openSource: () => void, saved?: CameraSnapshot) {
    this.host = host;
    this.params = structuredClone(saved?.params ?? defaults);
    this.controller = new AbortController();
    host.className = 'camera-study';
    host.dataset.figure = 'camera-framing';
    host.setAttribute('aria-label', '前景不变，背景为何靠近？');
    host.innerHTML = `
      <header class="cs-heading">
        <div><span class="cs-kicker">相机研究 <span>01 / DOLLY ZOOM</span></span>
        <h3>前景不变，背景为何靠近？</h3></div>
        <div class="cs-actions"><button class="cs-undo" title="撤销" aria-label="撤销">${icon('undo')}</button><button class="cs-redo" title="重做" aria-label="重做">${icon('redo')}</button><button class="cs-reset" type="button" title="恢复基准构图" aria-label="重置相机研究">${icon('reset')}</button></div>
      </header>
      <div class="cs-scene">
        <svg class="cs-image" viewBox="0 0 1080 600" role="img" aria-label="TypeScript 投影的三维展廊，青色前景与金色背景为等高的拱门"><g transform="translate(540 300) scale(600 -600)"></g></svg>
        <div class="cs-scene-note"><span class="cs-live-dot"></span>透视成像 <span class="cs-framing-note">前景正面锁定</span></div>
        <span class="cs-object-label cs-front-label" data-focus="front">A<span>前景</span></span>
        <span class="cs-object-label cs-back-label" data-focus="back">B<span>背景</span></span>

      </div>
      <div class="cs-measurements">
        <div class="cs-metric cs-front" data-focus="front"><span><b>A</b> 前景像高</span><strong data-value="frontPercent">—</strong><small>占画幅高度</small></div>
        <div class="cs-metric cs-back" data-focus="back"><span><b>B</b> 背景像高</span><strong data-value="backPercent">—</strong><small>占画幅高度</small></div>
        <div class="cs-metric cs-ratio"><span>背景 / 前景</span><strong data-value="ratio">—</strong><small>两个正面等高</small></div>
      </div>
      <div class="cs-motion">
        <button class="cs-play" type="button" aria-label="播放相机运动" aria-pressed="false"><span>▶</span></button>
        <div class="cs-rail-wrap">
          <div class="cs-rail-heading"><span>后退</span><span>相机距离 <b data-value="distance">6.00 m</b></span><span>靠近</span></div>
          <div class="cs-rail" role="slider" tabindex="0" aria-label="相机到前景的距离" aria-valuemin="2.4" aria-valuemax="18" aria-valuenow="6">
            <div class="cs-rail-line"></div><div class="cs-rail-ticks" aria-hidden="true"></div>
            <span class="cs-camera">${cameraIcon}</span>
          </div>
        </div>
        <div class="cs-lens"><span>焦距 <i>f</i></span><strong data-value="focal">38.0 <small>mm</small></strong><span class="cs-linked">随距离联动</span></div>
      </div>
      <div class="cs-bottom-bar">
        <div class="cs-presets" aria-label="构图预设"><button type="button" data-distance="2.8">近 · 广角</button><button type="button" data-distance="15">远 · 长焦</button></div>
        <button class="cs-mode" type="button" aria-pressed="false">独立调整镜头 <span>↗</span></button>
      </div>
      <div class="cs-free" hidden>
        <label>焦距 <span><input type="range" min="12" max="120" step="0.1" data-param="focal" aria-label="独立焦距"><output data-output="focal"></output></span></label>
        <label>前后间隔 <span><input type="range" min="2" max="14" step="0.1" data-param="gap" aria-label="两道拱门的间隔"><output data-output="gap"></output></span></label>
        <p>固定距离，只改变焦距：比较 A、B 的像高比是否变化。</p>
      </div>
      <details class="cs-explanation">
        <summary><span><i>01</i> 展开光路与推导</span><span class="cs-summary-mark">＋</span></summary>
        <div class="cs-explanation-body">
          <div class="cs-section-title"><span>同一场景的侧面剖视</span><small>拖动相机或 B，检验不同的距离关系</small></div>
          <div class="cs-ray-wrap"><svg class="cs-rays" viewBox="0 0 960 200" role="group" aria-label="从相机到两道等高拱门的光线剖视，两个坐标轴使用相同空间尺度"><g class="cs-ray-art"></g><g class="cs-ray-labels"></g><g class="cs-ray-handle" data-ray-param="distance" role="slider" tabindex="0" aria-label="剖视相机距离" aria-valuemin="2.4" aria-valuemax="18"><rect x="-30" y="-28" width="60" height="56" fill="transparent"/><path d="M-18-8h20v16h-20zM2-4l9-5v18L2 4" fill="#203c49" stroke="#e6edf6" stroke-width="1.8"/><title>拖动相机</title></g><g class="cs-ray-handle" data-ray-param="gap" role="slider" tabindex="0" aria-label="剖视背景间隔" aria-valuemin="2" aria-valuemax="14"><rect x="-30" y="-40" width="60" height="80" fill="transparent"/><circle r="6" fill="#111824" stroke="#f4d66a" stroke-width="2"/><title>拖动背景 B</title></g></svg></div>
          <div class="cs-ray-distances"><span>相机到 A <b data-value="rayDistance">—</b></span><span>A 到 B <b data-value="gap">—</b></span></div>
          <div class="cs-argument">
            <p>相机后退，前景的深度从 <i>d</i> 增大；背景的深度则始终为 <i>d + Δ</i>。两者增加相同的距离，所占的比例却不同。</p>
            <div class="cs-equations"><div class="cs-equation cs-front" data-focus="front"><span>A · 前景</span><div data-tex="h_A=\\frac{fH}{d}"></div><output data-value="frontEquation">—</output><small>联动时，<i>f / d</i> 保持不变</small></div><div class="cs-equation cs-back" data-focus="back"><span>B · 背景</span><div data-tex="h_B=\\frac{fH}{d+\\Delta}"></div><output data-value="backEquation">—</output><small>同一个焦距，不同的深度</small></div></div>
            <div class="cs-conclusion"><div data-tex="\\frac{h_B}{h_A}=\\frac{d}{d+\\Delta}"></div><p>相对大小只由位置决定。距离越大，这个比值越接近 1；两道等高的拱门在图中也越接近一样高。<strong>只改变焦距，不会改变这个比值。</strong></p></div>
          </div>
          <details class="cs-code"><summary><span><i>02</i> 对照 TypeScript 实现</span><span>实际运行的函数 ↴</span></summary><pre><code class="language-typescript"></code></pre><footer><span>H = 2.2 m · 画幅高 24 mm · 基准 6 m / 38 mm</span><button class="cs-source" type="button">查看全部源码 ↗</button></footer></details>
        </div>
      </details>
      <p class="cs-error" role="alert" hidden></p>`;
    this.$ = <T extends Element = HTMLElement>(s: string) => host.querySelector<T>(s)!;
    this.$<HTMLDetailsElement>('.cs-explanation').open = saved?.explanation ?? false;
    this.$<HTMLDetailsElement>('.cs-code').open = saved?.code ?? false;
    const on: On = (node, event, fn) =>
      node.addEventListener(event, fn as EventListener, { signal: this.controller.signal });
    on(this.$('.cs-reset'), 'click', () => {
      this.remember();
      this.stop();
      this.params = structuredClone(defaults);
      this.syncControls();
      this.request();
    });
    on(this.$('.cs-undo'), 'click', () => this.restore(this.history.undo(this.params)));
    on(this.$('.cs-redo'), 'click', () => this.restore(this.history.redo(this.params)));
    on(host, 'keydown', (event) => {
      if (event.target instanceof HTMLInputElement) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        this.restore(
          event.shiftKey ? this.history.redo(this.params) : this.history.undo(this.params),
        );
      }
    });
    on(this.$('.cs-play'), 'click', () => (this.playing ? this.stop() : this.play()));
    on(this.$('.cs-source'), 'click', openSource);
    host.querySelectorAll<HTMLButtonElement>('[data-distance]').forEach((button) =>
      on(button, 'click', () => {
        this.remember();
        this.stop();
        this.params.mode = 'compensated';
        this.params.distance = Number(button.dataset.distance);
        this.host.classList.add('cs-has-interacted');
        this.syncControls();
        this.request();
      }),
    );
    on(this.$('.cs-mode'), 'click', () => {
      this.remember();
      this.stop();
      if (this.params.mode === 'compensated') {
        this.params.focal = this.frame?.values.focal ?? defaults.focal;
        this.params.mode = 'free';
      } else this.params.mode = 'compensated';
      this.syncControls();
      this.request();
    });
    host.querySelectorAll<HTMLInputElement>('[data-param]').forEach((input) => {
      const key = input.dataset.param as 'focal' | 'gap';
      on(input, 'pointerdown', () => this.remember());
      on(input, 'keydown', (event) => {
        if (event.key.startsWith('Arrow')) this.remember();
      });
      on(input, 'input', () => {
        this.stop();
        this.params[key] = +input.value;
        this.request();
      });
      const field = numberField(
        key === 'focal' ? '焦距 / mm' : '前后间隔 / m',
        +input.min,
        +input.max,
        +input.step,
        () => this.remember(),
        (value) => {
          this.stop();
          this.params[key] = value;
          this.request();
        },
        this.controller.signal,
      );
      field.dataset.output = key;
      this.$('[data-output="' + key + '"]').replaceWith(field);
    });
    this.bindDrag(this.$('.cs-rail'), on, true);
    this.bindDrag(this.$('.cs-scene'), on, false);
    this.bindRays(on);
    on(this.$('.cs-rail'), 'keydown', (event) => {
      const steps: Record<string, number> = {
        ArrowLeft: 0.2,
        ArrowRight: -0.2,
        ArrowUp: 0.2,
        ArrowDown: -0.2,
        PageUp: 2,
        PageDown: -2,
      };
      if (!(event.key in steps) && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      this.remember();
      this.stop();
      this.params.distance =
        event.key === 'Home'
          ? 2.4
          : event.key === 'End'
            ? 18
            : clamp(this.params.distance + steps[event.key] * (event.shiftKey ? 5 : 1), 2.4, 18);
      this.request();
    });
    host.querySelectorAll<HTMLElement>('[data-focus]').forEach((node) => {
      on(node, 'pointerenter', () => {
        host.dataset.focus = node.dataset.focus;
      });
      on(node, 'pointerleave', () => {
        delete host.dataset.focus;
      });
    });
    on(document, 'visibilitychange', () => {
      if (document.hidden) this.stop();
    });
    host
      .querySelectorAll<HTMLElement>('[data-tex]')
      .forEach((node) => katex.render(node.dataset.tex!, node, { throwOnError: false }));
    this.syncControls();
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (!this.frame) this.request();
        } else this.stop();
      },
      { rootMargin: '120px' },
    );
    this.observer.observe(host);
  }

  bindRays(on: On) {
    for (const handle of this.host.querySelectorAll<SVGGraphicsElement>('[data-ray-param]')) {
      const key = handle.dataset.rayParam as 'distance' | 'gap',
        min = Number(handle.getAttribute('aria-valuemin')),
        max = Number(handle.getAttribute('aria-valuemax'));
      let gesture: { x: number; value: number; scale: number } | undefined;
      on(handle, 'pointerdown', (event) => {
        if (event.button !== 0 || !this.frame) return;
        this.remember();
        this.stop();
        handle.setPointerCapture(event.pointerId);
        handle.focus({ preventScroll: true });
        gesture = {
          x: event.clientX,
          value: this.params[key],
          scale: (this.rayScale * this.$('.cs-rays').getBoundingClientRect().width) / 960,
        };
      });
      on(handle, 'pointermove', (event) => {
        if (!gesture) return;
        this.params[key] = clamp(
          gesture.value +
            ((event.clientX - gesture.x) / gesture.scale) * (key === 'distance' ? -1 : 1),
          min,
          max,
        );
        this.request();
      });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
        on(handle, event, () => {
          gesture = undefined;
        });
      on(handle, 'keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        this.remember();
        this.stop();
        const direction = (event.key === 'ArrowRight' ? 1 : -1) * (key === 'distance' ? -1 : 1);
        this.params[key] =
          event.key === 'Home'
            ? min
            : event.key === 'End'
              ? max
              : clamp(this.params[key] + direction * (event.shiftKey ? 1 : 0.2), min, max);
        this.request();
      });
    }
  }

  bindDrag(node: HTMLElement, on: On, absolute: boolean) {
    let gesture: { x: number; distance: number } | undefined;
    on(node, 'pointerdown', (event) => {
      if (event.button !== 0) return;
      this.remember();
      this.stop();
      node.setPointerCapture(event.pointerId);
      gesture = { x: event.clientX, distance: this.params.distance };
      node.classList.add('is-dragging');
      if (absolute) {
        node.focus({ preventScroll: true });
        move(event);
      }
    });
    const move = (event: PointerEvent) => {
      if (!gesture) return;
      const rect = node.getBoundingClientRect();
      // Leftwards is backwards, matching the side view and the track labels.
      this.params.distance = clamp(
        absolute
          ? 18 - ((event.clientX - rect.left) / rect.width) * 15.6
          : gesture.distance - ((event.clientX - gesture.x) / rect.width) * 15.6,
        2.4,
        18,
      );
      this.host.classList.add('cs-has-interacted');
      this.request();
    };
    on(node, 'pointermove', move);
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
      on(node, event, () => {
        gesture = undefined;
        node.classList.remove('is-dragging');
      });
  }

  remember() {
    this.history.remember(this.params);
    this.syncHistory();
  }
  syncHistory() {
    this.$<HTMLButtonElement>('.cs-undo').disabled = !this.history.canUndo;
    this.$<HTMLButtonElement>('.cs-redo').disabled = !this.history.canRedo;
  }
  restore(params?: CameraParams) {
    if (!params) return;
    this.stop();
    this.params = structuredClone(params);
    this.syncControls();
    this.request();
  }
  syncControls() {
    this.syncHistory();
    const free = this.params.mode === 'free';
    this.$('.cs-free').hidden = !free;
    this.$('.cs-mode').setAttribute('aria-pressed', String(free));
    this.$('.cs-mode').innerHTML = free
      ? '恢复前景锁定 <span>↙</span>'
      : '独立调整镜头 <span>↗</span>';
    this.$('.cs-linked').textContent = free ? '独立控制' : '随距离联动';
    this.$('.cs-framing-note').textContent = free ? '自由构图' : '前景正面锁定';
    this.host.dataset.mode = this.params.mode;
    for (const input of this.host.querySelectorAll<HTMLInputElement>('[data-param]'))
      input.value = String(this.params[input.dataset.param as 'focal' | 'gap']);
  }

  request() {
    if (this.disposed || this.frameRequest) return;
    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = 0;
      try {
        this.draw(cameraFrame(this.params));
      } catch (error) {
        this.stop();
        this.host.dataset.error = 'true';
        this.$('.cs-error').textContent = error instanceof Error ? error.message : String(error);
        this.$('.cs-error').hidden = false;
      }
    });
  }

  drawItems(group: SVGElement, items: Primitive[]) {
    const room: Record<string, string> = {
      '#237e79': '#58c4dd',
      '#eae5db': '#192333',
      '#e7e1d5': '#202c3b',
      '#f0ece3': '#182332',
      '#f8f5ee': '#131e2e',
      '#d2cbbb': '#3b5069',
      '#d9d2c3': '#31445b',
      '#ccc5b6': '#3b5069',
      '#bec8c5': '#71849a',
      '#175b59': '#397e8d',
      '#80592e': '#a8883b',
    };
    const color = (hex: string) => room[hex] ?? plotColor(hex);
    if (group.children.length !== items.length) {
      group.replaceChildren(
        ...items.map((item) =>
          document.createElementNS(
            NS,
            item.kind === 'line' ? 'polyline' : item.kind === 'circle' ? 'circle' : 'polygon',
          ),
        ),
      );
    }
    items.forEach((item, i) => {
      const node = group.children[i] as SVGElement;
      node.dataset.role = item.role || '';
      node.setAttribute('vector-effect', 'non-scaling-stroke');
      node.setAttribute('opacity', String(item.opacity));
      if (item.kind === 'circle') {
        node.setAttribute('cx', String(item.at[0]));
        node.setAttribute('cy', String(item.at[1]));
        node.setAttribute('r', String(item.radius));
        node.setAttribute('fill', color(item.color));
      } else if (item.kind === 'line' || item.kind === 'polygon') {
        node.setAttribute('points', item.points.map((p) => p.join(',')).join(' '));
        node.setAttribute('fill', item.kind === 'polygon' ? color(item.color) : 'none');
        node.setAttribute('stroke', color(item.color));
        node.setAttribute(
          'stroke-width',
          String(item.kind === 'line' ? item.width : item.opacity < 1 ? 0 : 0.3),
        );
        node.setAttribute('stroke-dasharray', item.kind === 'line' && item.dash ? '3 5' : 'none');
      }
    });
  }

  draw(frame: Frame<CameraValues>) {
    this.frame = frame;
    delete this.host.dataset.error;
    this.$('.cs-error').hidden = true;
    this.drawItems(
      this.$('.cs-image g'),
      frame.items.filter((item) => item.panel === 'scene'),
    );
    const v = frame.values;
    const values = {
      frontPercent: v.frontPercent.toFixed(1) + '%',
      backPercent: v.backPercent.toFixed(1) + '%',
      ratio: v.ratio.toFixed(3),
      distance: v.distance.toFixed(2) + ' m',
      focal: v.focal.toFixed(1) + ' mm',
      rayDistance: v.distance.toFixed(2) + ' m',
      gap: v.gap.toFixed(2) + ' m',
      frontEquation: v.front.toFixed(2) + ' mm / 24 mm = ' + v.frontPercent.toFixed(1) + '%',
      backEquation: v.back.toFixed(2) + ' mm / 24 mm = ' + v.backPercent.toFixed(1) + '%',
    };
    for (const [key, text] of Object.entries(values))
      this.$(`[data-value="${key}"]`).textContent = text;
    this.$('.cs-camera').style.left = ((18 - v.distance) / 15.6) * 100 + '%';
    this.$('.cs-rail').setAttribute('aria-valuenow', v.distance.toFixed(2));
    this.$('.cs-rail').setAttribute('aria-valuetext', v.distance.toFixed(2) + ' 米');
    for (const [i, selector] of ['.cs-front-label', '.cs-back-label'].entries()) {
      const [x, y] = v.anchors[i],
        label = this.$(selector);
      label.style.left = (x / 0.9 + 1) * 50 + '%';
      label.style.top = (1 - y / 0.5) * 50 + '%';
      label.hidden = Math.abs(x) > 0.86 || Math.abs(y) > 0.46;
    }
    this.$<HTMLInputElement>('[data-output="focal"]').value = v.focal.toFixed(1);
    this.$<HTMLInputElement>('[data-output="gap"]').value = v.gap.toFixed(1);
    for (const input of this.host.querySelectorAll<HTMLInputElement>('[data-param]')) {
      if (document.activeElement !== input)
        input.value = String(v[input.dataset.param as 'focal' | 'gap']);
    }
    const [xmin, xmax, ymin, ymax] = frame.panels.find((p) => p.key === 'rays')!.bounds;
    const scale = Math.min(896 / (xmax - xmin), 190 / (ymax - ymin));
    this.rayScale = scale;
    const origin = 480 - ((xmin + xmax) / 2) * scale;
    const art = this.$<SVGElement>('.cs-ray-art');
    art.setAttribute('transform', `translate(${origin} 90) scale(${scale} ${-scale})`);
    this.drawItems(
      art,
      frame.items.filter((item) => item.panel === 'rays'),
    );
    const labels: [number, string, string][] = [
      [-v.distance, '相机', '#e6edf6'],
      [0, 'A', '#58c4dd'],
      [v.gap, 'B', '#b88036'],
    ];
    this.$('.cs-ray-labels').replaceChildren(
      ...labels.map(([x, text, color]) => {
        const label = document.createElementNS(NS, 'text');
        label.setAttribute('x', String(origin + x * scale));
        label.setAttribute('y', String(90 + 1.1 * scale + 30));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', plotColor(color));
        label.textContent = text;
        return label;
      }),
    );
    for (const handle of this.host.querySelectorAll<SVGGraphicsElement>('[data-ray-param]')) {
      const key = handle.dataset.rayParam as 'distance' | 'gap',
        value = v[key];
      handle.setAttribute(
        'transform',
        `translate(${origin + (key === 'distance' ? -value : value) * scale} 90)`,
      );
      handle.setAttribute('aria-valuenow', value.toFixed(2));
      handle.setAttribute('aria-valuetext', value.toFixed(2) + ' 米');
    }
    const code = this.$('.cs-code code');
    if (!code.textContent) {
      code.textContent = source;
      if (Prism.languages.typescript)
        code.innerHTML = Prism.highlight(source, Prism.languages.typescript, 'typescript');
    }
    this.host.dataset.ready = 'true';
  }

  play() {
    this.remember();
    this.playing = true;
    this.$('.cs-play').setAttribute('aria-pressed', 'true');
    this.$('.cs-play').setAttribute('aria-label', '暂停相机运动');
    this.$('.cs-play span').textContent = 'Ⅱ';
    this.host.classList.add('cs-has-interacted');
    let phase = -Math.acos(clamp((this.params.distance - 10.2) / 7.8, -1, 1));
    let previous = performance.now(),
      sent = 0;
    const tick = (now: number) => {
      if (!this.playing) return;
      phase += (Math.min(now - previous, 80) / 16000) * 2 * Math.PI;
      previous = now;
      if (now - sent > 40) {
        this.params.distance = 10.2 + 7.8 * Math.cos(phase);
        this.request();
        sent = now;
      }
      this.animation = requestAnimationFrame(tick);
    };
    this.animation = requestAnimationFrame(tick);
  }

  stop() {
    this.playing = false;
    cancelAnimationFrame(this.animation);
    this.$('.cs-play').setAttribute('aria-pressed', 'false');
    this.$('.cs-play').setAttribute('aria-label', '播放相机运动');
    this.$('.cs-play span').textContent = '▶';
  }

  snapshot(): CameraSnapshot {
    return {
      params: structuredClone(this.params),
      explanation: this.$<HTMLDetailsElement>('.cs-explanation').open,
      code: this.$<HTMLDetailsElement>('.cs-code').open,
    };
  }
  dispose() {
    this.disposed = true;
    this.stop();
    cancelAnimationFrame(this.frameRequest);
    this.controller.abort();
    this.observer.disconnect();
  }
}
