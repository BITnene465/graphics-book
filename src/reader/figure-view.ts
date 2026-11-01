import katex from 'katex';
import type { FigureSpec, Params } from '../figures/spec.ts';
import type { Frame, Bounds, Handle } from '../figures/drawing.ts';
import { compactActions } from './actions.ts';
import { EditHistory } from './history.ts';
import { plotColor } from './visual-style.ts';
import { numberField } from './number-field.ts';

const NS = 'http://www.w3.org/2000/svg';
export type FigureSnapshot = {
  params: Params;
  progress: number;
  views: [string, { zoom: number; x: number; y: number }][];
  panel: string;
};
function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}
const pretty = (value: unknown): string =>
  typeof value === 'number'
    ? Number.isFinite(value)
      ? Number(value.toFixed(4)).toString()
      : String(value)
    : Array.isArray(value)
      ? Array.isArray(value[0])
        ? value.map((row) => `[ ${pretty(row)} ]`).join('\n')
        : value.map(pretty).join('  ')
      : String(value);

/** 只做显示与事件绑定。每一帧的坐标、颜色和数值均由章节函数返回。 */
export class FigureView {
  private host: HTMLElement;
  private spec: FigureSpec;
  private params: Params;
  private progress = 1;
  private playing = false;
  private visible = false;
  private abort = new AbortController();
  private observer: IntersectionObserver;
  private resize: ResizeObserver;
  private request = 0;
  private animation = 0;
  private previous = 0;
  private frame?: Frame;
  private stage: HTMLElement;
  private controls: HTMLElement;
  private metrics: HTMLElement;
  private formula: HTMLElement;
  private time: HTMLInputElement;
  private views = new Map<string, { zoom: number; x: number; y: number }>();
  private history = new EditHistory<FigureSnapshot>();
  private selected = '';
  private speed = 1;
  private disposed = false;
  private formulaText = '';
  private panel = '';
  private panelKeys = '';

  constructor(
    host: HTMLElement,
    spec: FigureSpec,
    openSource: (path: string) => void,
    saved?: FigureSnapshot,
  ) {
    this.host = host;
    this.spec = spec;
    this.params = structuredClone(saved?.params ?? spec.defaults);
    this.progress = saved?.progress ?? spec.initialProgress ?? 1;
    this.views = new Map(saved?.views ?? []);
    this.panel = saved?.panel ?? '';
    host.className = 'figure-study';
    host.innerHTML = `<header class="figure-heading"><div><span class="figure-kicker">${spec.chapter} / 交互研究</span><h3>${spec.title}</h3><p>${spec.subtitle}</p></div><div class="figure-actions"><button data-action="source" title="阅读计算源码">〈/〉</button><button data-action="undo" title="撤销">↶</button><button data-action="reset" title="恢复初始状态">↺</button><button data-action="fullscreen" title="全屏">⛶</button></div></header><div class="figure-layout"><div class="figure-stage" aria-label="${spec.title}"></div><aside class="figure-controls" aria-label="实验参数"></aside></div><div class="figure-timeline"><button data-action="play" aria-label="播放">▶</button><input type="range" min="0" max="1" step="0.001" value="1" aria-label="演示进度"><output>1.000</output></div><div class="figure-readout"><div class="figure-formula"></div><dl class="figure-metrics"></dl></div><p class="figure-error" role="status" hidden></p>`;
    this.stage = host.querySelector('.figure-stage')!;
    const redo = document.createElement('button');
    redo.dataset.action = 'redo';
    redo.title = '重做';
    host.querySelector('[data-action="undo"]')!.after(redo);
    compactActions(host, this.abort.signal);
    this.controls = host.querySelector('.figure-controls')!;
    this.metrics = host.querySelector('.figure-metrics')!;
    this.formula = host.querySelector('.figure-formula')!;
    this.time = host.querySelector('.figure-timeline input')!;
    const panelTabs = document.createElement('nav');
    panelTabs.className = 'figure-panel-tabs';
    panelTabs.setAttribute('aria-label', '图解视图');
    this.stage.before(panelTabs);
    const toolbar = document.createElement('div');
    toolbar.className = 'figure-viewport-bar';
    toolbar.innerHTML =
      '<span class="figure-selection">图解</span><div><button data-action="zoom-out" title="缩小">−</button><button data-action="view-home" title="恢复视图">适应</button><button data-action="zoom-in" title="放大">＋</button></div>';
    this.stage.after(toolbar);
    const coordinates = document.createElement('div');
    coordinates.className = 'figure-coordinates';
    coordinates.hidden = true;
    for (let axis = 0; axis < 2; axis++) {
      const field = numberField(
        axis === 0 ? '选中点横坐标' : '选中点纵坐标',
        -10000,
        10000,
        0.01,
        () => this.remember(),
        (value) => {
          const handle = this.frame?.handles.find(
            (h) => `${h.key}:${h.index ?? ''}:${h.panel ?? ''}` === this.selected,
          );
          if (!handle) return;
          const point = [...handle.at];
          point[axis] = value;
          this.moveHandle(handle, point, this.params);
          this.schedule();
        },
        this.abort.signal,
      );
      field.dataset.coordinate = String(axis);
      coordinates.append(field);
    }
    toolbar.querySelector('.figure-selection')!.after(coordinates);
    const speed = document.createElement('button');
    speed.dataset.action = 'speed';
    speed.title = '播放速度';
    speed.textContent = '1×';
    host.querySelector('.figure-timeline')!.append(speed);
    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
    ) => el.addEventListener(type, fn, { signal: this.abort.signal });
    on(host.querySelector('[data-action="source"]')!, 'click', () => openSource(spec.source));
    on(host.querySelector('[data-action="reset"]')!, 'click', () => {
      this.remember();
      this.params = structuredClone(spec.defaults);
      this.progress = spec.initialProgress ?? 1;
      this.playing = false;
      this.views.clear();
      this.sync();
      this.schedule();
    });
    on(host.querySelector('[data-action="undo"]')!, 'click', () => {
      this.restore(this.history.undo(this.snapshot()));
    });
    on(redo, 'click', () => this.restore(this.history.redo(this.snapshot())));
    on(speed, 'click', () => {
      this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 0.5 : 1;
      speed.textContent = this.speed + '×';
    });
    on(toolbar.querySelector('[data-action="view-home"]')!, 'click', () => {
      this.views.clear();
      this.schedule();
    });
    for (const [action, factor] of [
      ['zoom-in', 1.25],
      ['zoom-out', 0.8],
    ] as const)
      on(toolbar.querySelector(`[data-action="${action}"]`)!, 'click', () => {
        for (const panel of this.frame?.panels.length ? this.frame.panels : [{ key: '' }]) {
          const view = this.views.get(panel.key) ?? { zoom: 1, x: 0, y: 0 };
          this.views.set(panel.key, {
            ...view,
            zoom: Math.max(0.2, Math.min(20, view.zoom * factor)),
          });
        }
        this.schedule();
      });
    on(host, 'keydown', (event) => {
      if (event.target instanceof HTMLInputElement) return;
      if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        this.restore(
          event.shiftKey || event.key.toLowerCase() === 'y'
            ? this.history.redo(this.snapshot())
            : this.history.undo(this.snapshot()),
        );
      } else if (event.code === 'Space' && !(event.target as Element).closest('button')) {
        event.preventDefault();
        this.playing = !this.playing;
        if (this.playing && this.progress >= 1) this.progress = 0;
        this.sync();
        this.animate();
      }
    });
    on(host.querySelector('[data-action="fullscreen"]')!, 'click', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void host.requestFullscreen();
    });
    on(host.querySelector('[data-action="play"]')!, 'click', () => {
      this.playing = !this.playing;
      if (this.playing && this.progress >= 1) this.progress = 0;
      this.sync();
      this.animate();
    });
    on(this.time, 'input', () => {
      this.playing = false;
      this.progress = Number(this.time.value);
      this.sync();
      this.schedule();
    });
    (host.querySelector('.figure-timeline') as HTMLElement).hidden = spec.animated === false;
    for (const control of spec.controls) {
      const group = document.createElement('div');
      group.className = 'figure-control';
      const label = document.createElement('label');
      label.textContent = control.label;
      group.append(label);
      if ('options' in control) {
        const buttons = document.createElement('div');
        buttons.className = 'figure-segments';
        for (const option of control.options) {
          const button = document.createElement('button');
          button.textContent = option.label;
          button.dataset.key = control.key;
          button.dataset.value = JSON.stringify(option.value);
          button.type = 'button';
          on(button, 'click', () => {
            this.remember();
            this.params[control.key] = option.value;
            this.sync();
            this.schedule();
          });
          buttons.append(button);
        }
        group.append(buttons);
      } else {
        const output = numberField(
          control.label,
          control.min,
          control.max,
          control.step ?? 0.01,
          () => this.remember(),
          (value) => {
            this.params[control.key] = value;
            this.sync();
            this.schedule();
          },
          this.abort.signal,
        );
        output.dataset.readout = control.key;
        label.append(output);
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(control.min);
        input.max = String(control.max);
        input.step = String(control.step ?? 0.01);
        input.dataset.key = control.key;
        input.setAttribute('aria-label', control.label);
        on(input, 'pointerdown', () => this.remember());
        on(input, 'keydown', (e) => {
          if (e.key.startsWith('Arrow')) this.remember();
        });
        on(input, 'input', () => {
          this.params[control.key] = Number(input.value);
          this.sync();
          this.schedule();
        });
        group.append(input);
      }
      this.controls.append(group);
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        // 同一批可能先离开再进入视口；单一观察对象取最后一条状态。
        this.visible = entries.at(-1)!.isIntersecting;
        if (this.visible) {
          this.schedule();
          this.animate();
        }
      },
      { rootMargin: '100px' },
    );
    this.observer.observe(host);
    this.resize = new ResizeObserver(() => {
      if (this.visible) this.schedule();
    });
    this.resize.observe(this.stage);
    this.sync();
  }
  private remember(): void {
    this.history.remember(this.snapshot());
    this.syncHistory();
  }
  private syncHistory(): void {
    this.host.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled =
      !this.history.canUndo;
    this.host.querySelector<HTMLButtonElement>('[data-action="redo"]')!.disabled =
      !this.history.canRedo;
  }
  private restore(value?: FigureSnapshot): void {
    if (!value) return;
    this.params = value.params;
    this.progress = value.progress;
    this.views = new Map(value.views);
    this.panel = value.panel;
    this.playing = false;
    this.sync();
    this.schedule();
  }
  private sync(): void {
    this.syncHistory();
    for (const input of this.controls.querySelectorAll<HTMLInputElement>('input[data-key]')) {
      input.value = String(this.params[input.dataset.key!]);
      input.style.setProperty(
        '--range',
        `${(100 * (Number(input.value) - Number(input.min))) / (Number(input.max) - Number(input.min))}%`,
      );
    }
    for (const button of this.controls.querySelectorAll<HTMLButtonElement>('button[data-key]')) {
      const selected = JSON.stringify(this.params[button.dataset.key!]) === button.dataset.value;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    for (const control of this.spec.controls)
      if ('min' in control)
        this.controls.querySelector<HTMLInputElement>(`[data-readout="${control.key}"]`)!.value =
          pretty(this.params[control.key]);
    this.time.value = String(this.progress);
    this.time.style.setProperty('--range', `${100 * this.progress}%`);
    this.time.nextElementSibling!.textContent = this.progress.toFixed(3);
    const play = this.host.querySelector('[data-action="play"]')!;
    play.textContent = this.playing ? 'Ⅱ' : '▶';
    play.setAttribute('aria-label', this.playing ? '暂停' : '播放');
  }
  private animate(): void {
    if (!this.playing || !this.visible || this.animation || this.disposed) return;
    this.previous = performance.now();
    const tick = (now: number) => {
      this.animation = 0;
      if (!this.playing || !this.visible || this.disposed) return;
      this.progress = Math.min(
        1,
        this.progress + (this.speed * (now - this.previous)) / (1000 * (this.spec.duration ?? 7)),
      );
      if (this.progress === 1) this.playing = false;
      this.previous = now;
      this.sync();
      this.draw();
      if (this.playing) this.animation = requestAnimationFrame(tick);
    };
    this.animation = requestAnimationFrame(tick);
  }
  private schedule(): void {
    if (this.request || this.disposed || !this.visible) return;
    this.request = requestAnimationFrame(() => {
      this.request = 0;
      this.draw();
    });
  }
  private draw(): void {
    const error = this.host.querySelector('.figure-error') as HTMLElement;
    try {
      this.frame = this.spec.compute(this.params, this.progress);
      const handle = this.frame.handles.find(
        (h) => `${h.key}:${h.index ?? ''}:${h.panel ?? ''}` === this.selected,
      );
      this.host.querySelector<HTMLElement>('.figure-coordinates')!.hidden = !handle;
      if (handle) {
        this.host.querySelector('.figure-selection')!.textContent = handle.label || handle.key;
        for (const field of this.host.querySelectorAll<HTMLInputElement>('[data-coordinate]')) {
          if (field.readOnly)
            field.value = String(Number(handle.at[Number(field.dataset.coordinate)].toFixed(3)));
        }
      }
      error.hidden = true;
      const panels = this.frame.panels.length
        ? this.frame.panels
        : [{ key: '', bounds: this.frame.bounds, columns: 1 }];
      const next = new Set(panels.map((p) => p.key));
      this.stage.classList.toggle('has-panels', panels.length > 1);
      this.stage.dataset.panels = String(panels.length);
      this.stage.dataset.many = String(panels.length > 3);
      this.stage.style.setProperty(
        '--figure-columns',
        panels.length > 3
          ? 'repeat(3, minmax(0, 1fr))'
          : panels.map((p) => `minmax(0, ${p.columns}fr)`).join(' '),
      );
      if (!next.has(this.panel)) this.panel = panels[0].key;
      const keys = panels.map((p) => p.key).join('|');
      if (keys !== this.panelKeys) {
        this.panelKeys = keys;
        const tabs = this.host.querySelector('.figure-panel-tabs')!;
        tabs.replaceChildren(
          ...panels
            .filter(() => panels.length > 1)
            .map((p) => {
              const button = document.createElement('button');
              button.textContent = p.key;
              button.dataset.panel = p.key;
              button.onclick = () => {
                this.panel = p.key;
                this.schedule();
              };
              return button;
            }),
        );
      }
      this.host
        .querySelectorAll<HTMLButtonElement>('.figure-panel-tabs button')
        .forEach((button) => {
          button.setAttribute('aria-pressed', String(button.dataset.panel === this.panel));
        });
      for (const child of this.stage.querySelectorAll<SVGSVGElement>('svg'))
        if (!next.has(child.dataset.panel!)) child.remove();
      for (const panel of panels) {
        let canvas = [...this.stage.querySelectorAll<SVGSVGElement>('svg')].find(
          (el) => el.dataset.panel === panel.key,
        );
        if (!canvas) {
          canvas = svg('svg');
          canvas.dataset.panel = panel.key;
          canvas.setAttribute('role', 'group');
          canvas.setAttribute('tabindex', '0');
          canvas.setAttribute('aria-label', `${this.spec.title} ${panel.key}`);
          this.stage.append(canvas);
          this.bindCanvas(canvas, panel.key);
        }
        const ratio = (panel.bounds[1] - panel.bounds[0]) / (panel.bounds[3] - panel.bounds[2]);
        canvas.style.aspectRatio = String(ratio);
        canvas.style.minWidth = '0';
        canvas.dataset.active = String(panel.key === this.panel);
      }
      // 先完成网格布局，再按各面板的实际像素比例排版文字和手柄。
      for (const panel of panels) {
        const canvas = [...this.stage.querySelectorAll<SVGSVGElement>('svg')].find(
          (el) => el.dataset.panel === panel.key,
        )!;
        this.paint(canvas, panel.bounds, panel.key);
      }
      if ((this.frame.formula ?? '') !== this.formulaText) {
        this.formulaText = this.frame.formula ?? '';
        this.formula.innerHTML = this.formulaText
          ? katex.renderToString(this.formulaText.replace(/#[\da-f]{6}/gi, plotColor), {
              throwOnError: false,
              displayMode: true,
            })
          : '';
      }
      this.metrics.replaceChildren();
      for (const [key, value] of Object.entries(this.frame.values)) {
        const group = document.createElement('div'),
          dt = document.createElement('dt'),
          dd = document.createElement('dd');
        dt.textContent = key;
        dd.textContent = pretty(value);
        group.append(dt, dd);
        this.metrics.append(group);
      }
    } catch (e) {
      error.hidden = false;
      error.textContent = e instanceof Error ? e.message : String(e);
    }
  }
  private viewBounds(bounds: Bounds, key: string): Bounds {
    const view = this.views.get(key) ?? { zoom: 1, x: 0, y: 0 },
      cx = (bounds[0] + bounds[1]) / 2 + view.x,
      cy = (bounds[2] + bounds[3]) / 2 + view.y,
      halfX = (bounds[1] - bounds[0]) / 2 / view.zoom,
      halfY = (bounds[3] - bounds[2]) / 2 / view.zoom;
    return [cx - halfX, cx + halfX, cy - halfY, cy + halfY];
  }
  private paint(canvas: SVGSVGElement, bounds: Bounds, key: string): void {
    const view = this.viewBounds(bounds, key),
      [x0, x1, y0, y1] = view,
      width = 900,
      height = (width * (y1 - y0)) / (x1 - x0),
      s = width / (x1 - x0);
    canvas.setAttribute('viewBox', `0 0 ${width} ${height}`);
    // Text and picking targets keep their screen size across panels and zoom levels.
    const pixel = 1 / Math.max(0.01, Math.abs(canvas.getScreenCTM()?.a ?? 1));
    canvas.dataset.bounds = JSON.stringify(view);
    const point = (p: number[]): number[] => [(p[0] - x0) * s, (y1 - p[1]) * s],
      group = svg('g');
    for (const item of this.frame!.items.filter((i) => (i.panel ?? '') === key)) {
      let node: SVGElement;
      const style = { opacity: item.opacity },
        color = plotColor(item.color);
      if (item.kind === 'line' || item.kind === 'polygon') {
        node = svg(item.kind === 'line' ? 'polyline' : 'polygon', {
          points: item.points.map((p) => point(p).join(',')).join(' '),
          fill: item.kind === 'polygon' ? color : 'none',
          stroke: item.kind === 'line' ? color : 'none',
          'stroke-width': item.kind === 'line' ? item.width * pixel : 0,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          ...style,
        });
        if (item.kind === 'line' && item.dash)
          node.setAttribute('stroke-dasharray', `${4 * pixel} ${5 * pixel}`);
      } else if (item.kind === 'circle') {
        const [x, y] = point(item.at);
        node = svg('circle', { cx: x, cy: y, r: item.radius * s, fill: color, ...style });
      } else if (item.kind === 'text') {
        const [x, y] = point(item.at);
        node = svg('text', {
          x,
          y,
          fill: color,
          'font-size': item.size * pixel,
          stroke: '#111824',
          'stroke-width': 3 * pixel,
          'paint-order': 'stroke fill',
          'stroke-linejoin': 'round',
          'dominant-baseline': 'middle',
          ...style,
        });
        node.textContent = item.text;
      } else {
        const [x, y] = point([item.at[0], item.at[1] + item.size[1]]);
        let url = '';
        if (item.kind === 'image') url = item.url;
        else {
          const temp = document.createElement('canvas');
          temp.width = item.width;
          temp.height = item.height;
          temp
            .getContext('2d')!
            .putImageData(
              new ImageData(new Uint8ClampedArray(item.data), item.width, item.height),
              0,
              0,
            );
          url = temp.toDataURL();
        }
        node = svg('image', {
          x,
          y,
          width: item.size[0] * s,
          height: item.size[1] * s,
          href: url,
          preserveAspectRatio: 'none',
        });
        if (item.pixelated) node.style.imageRendering = 'pixelated';
      }
      group.append(node);
    }
    this.frame!.handles.forEach((h, index) => {
      if ((h.panel ?? '') !== key) return;
      const [x, y] = point(h.at),
        handle = svg('g', {
          'data-handle': index,
          tabindex: 0,
          role: 'slider',
          'aria-label': h.label || h.key,
          'aria-valuetext': pretty(this.params[h.key]),
        });
      handle.classList.add('figure-handle');
      handle.style.setProperty('--handle-radius', `${9 * pixel}px`);
      handle.style.setProperty('--handle-stroke', `${3 * pixel}px`);
      handle.classList.toggle(
        'selected',
        this.selected === `${h.key}:${h.index ?? ''}:${h.panel ?? ''}`,
      );
      handle.append(
        svg('circle', { cx: x, cy: y, r: 18 * pixel, fill: 'transparent' }),
        svg('circle', {
          cx: x,
          cy: y,
          r: 7 * pixel,
          fill: '#111824',
          stroke: '#f4d66a',
          'stroke-width': 2 * pixel,
        }),
      );
      if (h.label) {
        const left = x + (h.label.length * 12 + 20) * pixel > width;
        const label = svg('text', {
          x: x + (left ? -12 : 12) * pixel,
          y: y + (y + 27 * pixel > height ? -14 : 23) * pixel,
          'text-anchor': left ? 'end' : 'start',
          fill: '#f4d66a',
          'font-size': 12 * pixel,
          stroke: '#111824',
          'stroke-width': 3 * pixel,
          'paint-order': 'stroke fill',
        });
        label.textContent = h.label;
        handle.append(label);
      }
      group.append(handle);
    });
    const active = canvas.querySelector(':focus')?.getAttribute('data-handle');
    canvas.replaceChildren(group);
    if (active)
      canvas.querySelector<SVGElement>(`[data-handle="${active}"]`)?.focus({ preventScroll: true });
  }
  private bindCanvas(canvas: SVGSVGElement, key: string): void {
    const signal = this.abort.signal;
    let drag:
      | {
          pointer: number;
          handle?: Handle;
          start: number[];
          offset: number[];
          screen: number[];
          bounds: Bounds;
          previous: FigureSnapshot;
        }
      | undefined;
    const touches = new Map<number, [number, number]>();
    let pinch = 0;
    const position = (event: { clientX: number; clientY: number }): number[] => {
      const bounds = JSON.parse(canvas.dataset.bounds!) as Bounds;
      const at = new DOMPoint(event.clientX, event.clientY).matrixTransform(
        canvas.getScreenCTM()!.inverse(),
      );
      const box = canvas.viewBox.baseVal;
      return [
        bounds[0] + (at.x / box.width) * (bounds[1] - bounds[0]),
        bounds[3] - (at.y / box.height) * (bounds[3] - bounds[2]),
      ];
    };
    const zoom = (anchor: number[], factor: number) => {
      const view = this.views.get(key) ?? { zoom: 1, x: 0, y: 0 };
      const bounds = JSON.parse(canvas.dataset.bounds!) as Bounds;
      const next = Math.max(0.2, Math.min(20, view.zoom * factor));
      this.views.set(key, {
        zoom: next,
        x: view.x + (anchor[0] - (bounds[0] + bounds[1]) / 2) * (1 - view.zoom / next),
        y: view.y + (anchor[1] - (bounds[2] + bounds[3]) / 2) * (1 - view.zoom / next),
      });
      this.schedule();
    };
    const stop = (event?: PointerEvent) => {
      if (event) touches.delete(event.pointerId);
      if (event && canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      drag = undefined;
      pinch = 0;
      this.host.classList.remove('is-dragging');
    };
    canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (event.pointerType === 'touch')
          touches.set(event.pointerId, [event.clientX, event.clientY]);
        event.preventDefault();
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(event.pointerId);
        if (touches.size === 2) {
          const [a, b] = [...touches.values()];
          pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
          drag = undefined;
          return;
        }
        const target = (event.target as Element).closest('[data-handle]');
        const handle =
          event.button === 0 && !event.altKey && target
            ? this.frame!.handles[Number(target.getAttribute('data-handle'))]
            : undefined;
        const at = position(event);
        drag = {
          pointer: event.pointerId,
          handle,
          start: at,
          offset: handle ? handle.at.map((x, i) => x - at[i]) : [0, 0],
          screen: [event.clientX, event.clientY],
          bounds: JSON.parse(canvas.dataset.bounds!) as Bounds,
          previous: this.snapshot(),
        };
        this.remember();
        this.playing = false;
        this.selected = handle ? `${handle.key}:${handle.index ?? ''}:${handle.panel ?? ''}` : '';
        this.host.classList.add('is-dragging');
        if (target && handle) (target as SVGElement).focus({ preventScroll: true });
        this.host.querySelector('.figure-selection')!.textContent = handle
          ? handle.label || handle.key
          : '平移视图';
        this.sync();
        this.schedule();
      },
      { signal },
    );
    canvas.addEventListener(
      'pointermove',
      (event) => {
        if (touches.has(event.pointerId))
          touches.set(event.pointerId, [event.clientX, event.clientY]);
        if (touches.size === 2 && pinch) {
          const [a, b] = [...touches.values()];
          const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
          zoom(
            position({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 }),
            distance / pinch,
          );
          pinch = distance;
          return;
        }
        if (!drag || drag.pointer !== event.pointerId) return;
        const at = position(event);
        if (drag.handle) {
          const target = at.map((x, i) => x + drag!.offset[i]);
          if (event.shiftKey)
            for (let i = 0; i < 2; i++) target[i] = Math.round(target[i] * 10) / 10;
          this.moveHandle(drag.handle, target, drag.previous.params);
        } else {
          const view = new Map(drag.previous.views).get(key) ?? { zoom: 1, x: 0, y: 0 };
          const rect = canvas.getBoundingClientRect();
          const scale = Math.max(
            (drag.bounds[1] - drag.bounds[0]) / rect.width,
            (drag.bounds[3] - drag.bounds[2]) / rect.height,
          );
          this.views.set(key, {
            ...view,
            x: view.x - (event.clientX - drag.screen[0]) * scale,
            y: view.y + (event.clientY - drag.screen[1]) * scale,
          });
        }
        this.schedule();
      },
      { signal },
    );
    canvas.addEventListener('pointerup', stop, { signal });
    canvas.addEventListener(
      'pointercancel',
      (event) => {
        if (drag) this.restore(drag.previous);
        stop(event);
      },
      { signal },
    );
    canvas.addEventListener(
      'wheel',
      (event) => {
        if (
          !event.ctrlKey &&
          !canvas.contains(document.activeElement) &&
          document.activeElement !== canvas
        )
          return;
        event.preventDefault();
        zoom(position(event), Math.exp(-event.deltaY * 0.0015));
      },
      { signal, passive: false },
    );
    canvas.addEventListener(
      'dblclick',
      (event) => {
        if (!(event.target as Element).closest('[data-handle]')) {
          this.views.delete(key);
          this.schedule();
        }
      },
      { signal },
    );
    canvas.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') {
          if (drag) this.restore(drag.previous);
          stop();
          (document.activeElement as HTMLElement)?.blur();
          return;
        }
        if (event.key === 'Home') {
          event.preventDefault();
          this.views.delete(key);
          this.schedule();
          return;
        }
        const target = (event.target as Element).closest('[data-handle]');
        if (!target || !event.key.startsWith('Arrow')) return;
        event.preventDefault();
        const handle = this.frame!.handles[Number(target.getAttribute('data-handle'))];
        const step = event.shiftKey ? 0.01 : 0.05,
          at = [...handle.at];
        at[0] += event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
        at[1] += event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
        this.remember();
        this.selected = `${handle.key}:${handle.index ?? ''}:${handle.panel ?? ''}`;
        this.moveHandle(handle, at, this.params);
        this.schedule();
      },
      { signal },
    );
  }
  private moveHandle(handle: Handle, point: number[], previous: Params): void {
    const at = point.map(
      (x, i) => (x - (handle.mapping?.offset[i] ?? 0)) / (handle.mapping?.scale[i] ?? 1),
    );
    if (handle.limits) {
      at[0] = Math.max(handle.limits[0], Math.min(handle.limits[1], at[0]));
      at[1] = Math.max(handle.limits[2], Math.min(handle.limits[3], at[1]));
    }
    const value = structuredClone(previous[handle.key]);
    if (typeof value === 'number') this.params[handle.key] = at[handle.axes[0] ?? 0];
    else if (Array.isArray(value)) {
      const vector = (handle.index === undefined ? value : value[handle.index]) as number[];
      handle.axes.forEach((axis, i) => (vector[axis] = at[i]));
      this.params[handle.key] = value;
    }
    this.sync();
  }
  snapshot(): FigureSnapshot {
    return {
      params: structuredClone(this.params),
      progress: this.progress,
      views: [...this.views],
      panel: this.panel,
    };
  }
  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    this.observer.disconnect();
    this.resize.disconnect();
    cancelAnimationFrame(this.request);
    cancelAnimationFrame(this.animation);
  }
}
