import katex from 'katex';
import type { FigureSpec, Params } from '../figures/spec.ts';
import type { Frame, Bounds, Handle } from '../figures/drawing.ts';

const NS = 'http://www.w3.org/2000/svg';
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
  private visible = true;
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
  private undo: Params[] = [];
  private disposed = false;

  constructor(host: HTMLElement, spec: FigureSpec, openSource: (path: string) => void) {
    this.host = host;
    this.spec = spec;
    this.params = structuredClone(spec.defaults);
    host.className = 'figure-study';
    host.innerHTML = `<header class="figure-heading"><div><span class="figure-kicker">${spec.chapter} / 交互研究</span><h3>${spec.title}</h3><p>${spec.subtitle}</p></div><div class="figure-actions"><button data-action="source" title="阅读计算源码">〈/〉</button><button data-action="undo" title="撤销">↶</button><button data-action="reset" title="恢复初始状态">↺</button><button data-action="fullscreen" title="全屏">⛶</button></div></header><div class="figure-layout"><div class="figure-stage" aria-label="${spec.title}"></div><aside class="figure-controls" aria-label="实验参数"></aside></div><div class="figure-timeline"><button data-action="play" aria-label="播放">▶</button><input type="range" min="0" max="1" step="0.001" value="1" aria-label="演示进度"><output>1.000</output></div><div class="figure-readout"><div class="figure-formula"></div><dl class="figure-metrics"></dl></div><p class="figure-error" role="status" hidden></p>`;
    this.stage = host.querySelector('.figure-stage')!;
    this.controls = host.querySelector('.figure-controls')!;
    this.metrics = host.querySelector('.figure-metrics')!;
    this.formula = host.querySelector('.figure-formula')!;
    this.time = host.querySelector('.figure-timeline input')!;
    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
    ) => el.addEventListener(type, fn, { signal: this.abort.signal });
    on(host.querySelector('[data-action="source"]')!, 'click', () => openSource(spec.source));
    on(host.querySelector('[data-action="reset"]')!, 'click', () => {
      this.remember();
      this.params = structuredClone(spec.defaults);
      this.progress = 1;
      this.playing = false;
      this.views.clear();
      this.sync();
      this.schedule();
    });
    on(host.querySelector('[data-action="undo"]')!, 'click', () => {
      const previous = this.undo.pop();
      if (previous) {
        this.params = previous;
        this.sync();
        this.schedule();
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
        const output = document.createElement('output');
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
        this.visible = entries[0].isIntersecting;
        if (this.visible) this.animate();
      },
      { rootMargin: '100px' },
    );
    this.observer.observe(host);
    this.resize = new ResizeObserver(() => this.schedule());
    this.resize.observe(this.stage);
    this.sync();
    this.draw();
  }
  private remember(): void {
    this.undo.push(structuredClone(this.params));
    if (this.undo.length > 30) this.undo.shift();
  }
  private sync(): void {
    for (const input of this.controls.querySelectorAll<HTMLInputElement>('input[data-key]'))
      input.value = String(this.params[input.dataset.key!]);
    for (const button of this.controls.querySelectorAll<HTMLButtonElement>('button[data-key]')) {
      const selected = JSON.stringify(this.params[button.dataset.key!]) === button.dataset.value;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    for (const control of this.spec.controls)
      if ('min' in control)
        this.controls.querySelector(`[data-readout="${control.key}"]`)!.textContent =
          `${pretty(this.params[control.key])}${control.unit ?? ''}`;
    this.time.value = String(this.progress);
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
      this.progress =
        (this.progress + (now - this.previous) / (1000 * (this.spec.duration ?? 7))) % 1;
      this.previous = now;
      this.sync();
      this.draw();
      this.animation = requestAnimationFrame(tick);
    };
    this.animation = requestAnimationFrame(tick);
  }
  private schedule(): void {
    if (this.request || this.disposed) return;
    this.request = requestAnimationFrame(() => {
      this.request = 0;
      this.draw();
    });
  }
  private draw(): void {
    const error = this.host.querySelector('.figure-error') as HTMLElement;
    try {
      this.frame = this.spec.compute(this.params, this.progress);
      error.hidden = true;
      const panels = this.frame.panels.length
        ? this.frame.panels
        : [{ key: '', bounds: this.frame.bounds, columns: 1 }];
      const next = new Set(panels.map((p) => p.key));
      for (const child of this.stage.querySelectorAll<SVGSVGElement>('svg'))
        if (!next.has(child.dataset.panel!)) child.remove();
      for (const panel of panels) {
        let canvas = [...this.stage.querySelectorAll<SVGSVGElement>('svg')].find(
          (el) => el.dataset.panel === panel.key,
        );
        if (!canvas) {
          canvas = svg('svg');
          canvas.dataset.panel = panel.key;
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `${this.spec.title} ${panel.key}`);
          this.stage.append(canvas);
          this.bindCanvas(canvas, panel.key);
        }
        const ratio = (panel.bounds[1] - panel.bounds[0]) / (panel.bounds[3] - panel.bounds[2]);
        canvas.style.aspectRatio = String(ratio);
        canvas.style.minWidth = '0';
        this.paint(canvas, panel.bounds, panel.key);
      }
      this.stage.classList.toggle('has-panels', panels.length > 1);
      this.stage.dataset.panels = String(panels.length);
      this.formula.innerHTML = this.frame.formula
        ? katex.renderToString(this.frame.formula, { throwOnError: false, displayMode: true })
        : '';
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
      const style = { opacity: item.opacity };
      if (item.kind === 'line' || item.kind === 'polygon') {
        node = svg(item.kind === 'line' ? 'polyline' : 'polygon', {
          points: item.points.map((p) => point(p).join(',')).join(' '),
          fill: item.kind === 'polygon' ? item.color : 'none',
          stroke: item.kind === 'line' ? item.color : 'none',
          'stroke-width': item.kind === 'line' ? item.width * pixel : 0,
          ...style,
        });
        if (item.kind === 'line' && item.dash) node.setAttribute('stroke-dasharray', '5 5');
      } else if (item.kind === 'circle') {
        const [x, y] = point(item.at);
        node = svg('circle', { cx: x, cy: y, r: item.radius * s, fill: item.color, ...style });
      } else if (item.kind === 'text') {
        const [x, y] = point(item.at);
        node = svg('text', {
          x,
          y,
          fill: item.color,
          'font-size': item.size * pixel,
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
      handle.append(
        svg('circle', { cx: x, cy: y, r: 18 * pixel, fill: 'transparent' }),
        svg('circle', {
          cx: x,
          cy: y,
          r: 6 * pixel,
          fill: '#fcfbf7',
          stroke: '#ae792d',
          'stroke-width': 1.5 * pixel,
        }),
      );
      if (h.label) {
        const label = svg('text', {
          x: x + 12 * pixel,
          y: y - 12 * pixel,
          fill: '#85652f',
          'font-size': 12 * pixel,
        });
        label.textContent = h.label;
        handle.append(label);
      }
      group.append(handle);
    });
    const active = canvas.querySelector(':focus')?.getAttribute('data-handle');
    canvas.replaceChildren(group);
    if (active) canvas.querySelector<SVGElement>(`[data-handle="${active}"]`)?.focus();
  }
  private bindCanvas(canvas: SVGSVGElement, key: string): void {
    const signal = this.abort.signal;
    let drag: {
      pointer: number;
      handle?: Handle;
      start: number[];
      previous: Params;
      view: { zoom: number; x: number; y: number };
    } | null = null;
    const position = (event: PointerEvent | WheelEvent): number[] => {
      const bounds = JSON.parse(canvas.dataset.bounds!) as Bounds,
        at = new DOMPoint(event.clientX, event.clientY).matrixTransform(
          canvas.getScreenCTM()!.inverse(),
        ),
        box = canvas.viewBox.baseVal;
      return [
        bounds[0] + (at.x / box.width) * (bounds[1] - bounds[0]),
        bounds[3] - (at.y / box.height) * (bounds[3] - bounds[2]),
      ];
    };
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        const target = (event.target as Element).closest('[data-handle]'),
          h = target ? this.frame!.handles[Number(target.getAttribute('data-handle'))] : undefined;
        if (!h && event.button !== 1 && !event.shiftKey) return;
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        this.remember();
        drag = {
          pointer: event.pointerId,
          handle: h,
          start: position(event),
          previous: structuredClone(this.params),
          view: { ...(this.views.get(key) ?? { zoom: 1, x: 0, y: 0 }) },
        };
        this.playing = false;
        this.sync();
      },
      { signal },
    );
    canvas.addEventListener(
      'pointermove',
      (event) => {
        if (!drag) return;
        const at = position(event);
        if (drag.handle) this.moveHandle(drag.handle, at, drag.previous);
        else {
          const view = this.views.get(key) ?? drag.view;
          this.views.set(key, {
            ...view,
            x: view.x + drag.start[0] - at[0],
            y: view.y + drag.start[1] - at[1],
          });
        }
        this.schedule();
      },
      { signal },
    );
    const stop = () => {
      drag = null;
    };
    canvas.addEventListener('pointerup', stop, { signal });
    canvas.addEventListener('pointercancel', stop, { signal });
    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const view = this.views.get(key) ?? { zoom: 1, x: 0, y: 0 };
        this.views.set(key, {
          ...view,
          zoom: Math.max(0.5, Math.min(8, view.zoom * Math.exp(-event.deltaY * 0.001))),
        });
        this.schedule();
      },
      { signal, passive: false },
    );
    canvas.addEventListener(
      'dblclick',
      () => {
        this.views.delete(key);
        this.schedule();
      },
      { signal },
    );
    canvas.addEventListener(
      'keydown',
      (event) => {
        const target = (event.target as Element).closest('[data-handle]');
        if (!target || !event.key.startsWith('Arrow')) return;
        event.preventDefault();
        const h = this.frame!.handles[Number(target.getAttribute('data-handle'))],
          step = event.shiftKey ? 0.01 : 0.05,
          at = [...h.at];
        at[0] += event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
        at[1] += event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
        this.remember();
        this.moveHandle(h, at, this.params);
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
  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    this.observer.disconnect();
    this.resize.disconnect();
    cancelAnimationFrame(this.request);
    cancelAnimationFrame(this.animation);
  }
}
