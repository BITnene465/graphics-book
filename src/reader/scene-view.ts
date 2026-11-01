import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { studySpec, localScene } from '../render/scenes.ts';
import type { StudyState, StudySpec, ObjectState } from '../render/scenes.ts';
import type { StudyOutput } from '../render/render-study.ts';
import type { Vec3 } from '../math/vector.ts';
import { StudyRenderer } from './render-client.ts';
import type { RenderQuality } from './render-client.ts';
import { compactActions } from './actions.ts';
import { EditHistory } from './history.ts';
import { numberField } from './number-field.ts';
import { makeGuides, ViewCompass } from './scene-guides.ts';
import { stageColor } from './visual-style.ts';
import { icon } from './icons.ts';

type SceneDisplay = 'image' | 'space' | 'split';
export type SceneSnapshot = {
  state: StudyState;
  channel: string;
  view: SceneDisplay;
  selected: string;
  probe?: [number, number];
  wire?: boolean;
};

const format = (value: number): string =>
  Number.isFinite(value) ? Number(value.toFixed(4)).toString() : '—';

/** 空间操作使用标准 Orbit/TransformControls；正式图像由教学算法在 Worker 中生成。 */
export class SceneView {
  private host: HTMLElement;
  private spec: StudySpec;
  private state: StudyState;
  private abort = new AbortController();
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private perspective = new THREE.PerspectiveCamera(48, 1, 0.01, 1000);
  private orthographic = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.01, 1000);
  private orbit: OrbitControls;
  private gizmo: TransformControls;
  private meshes = new Map<string, THREE.Mesh>();
  private selected = '';
  private light: THREE.PointLight;
  private result: HTMLCanvasElement;
  private status: HTMLElement;
  private controls: HTMLElement;
  private stats: HTMLElement;
  private objects: HTMLElement;
  private probe: HTMLElement;
  private resize: ResizeObserver;
  private intersection: IntersectionObserver;
  private renderClient: StudyRenderer;
  private frame?: StudyOutput;
  private dirty = true;
  private quality: RenderQuality = 'preview';
  private display: SceneDisplay = 'image';
  private raf = 0;
  private visible = false;
  private disposed = false;
  private restoring = false;
  private mode: 'translate' | 'rotate' | 'scale' = 'translate';
  private history = new EditHistory<SceneSnapshot>();
  private guides: THREE.Group;
  private compass: ViewCompass;
  private selectionBox = new THREE.BoxHelper(new THREE.Object3D(), '#f4d66a');
  private cameraMotion = 0;
  private snap = false;
  private probePixel?: [number, number];
  private channel = 'color';
  private wire = false;

  constructor(
    host: HTMLElement,
    chapter: string,
    openSource: (path: string) => void,
    customSpec?: StudySpec,
    saved?: SceneSnapshot,
  ) {
    this.host = host;
    this.spec = customSpec ?? studySpec(chapter);
    this.state = structuredClone(saved?.state ?? this.spec.state);
    this.channel = saved?.channel ?? 'color';
    this.display =
      saved?.view ?? (chapter === '14' ? 'space' : innerWidth >= 1200 ? 'split' : 'image');
    this.selected = saved?.selected ?? '';
    this.probePixel = saved?.probe;
    this.wire = saved?.wire ?? false;
    host.className = 'scene-study';
    host.innerHTML = `
      <header class="figure-heading"><div><span class="figure-kicker">${chapter} / 综合实验</span><h3>${this.spec.title}</h3></div>
        <div class="figure-actions"><button data-action="source" title="阅读完整算法" aria-label="阅读完整算法">〈/〉</button><button data-action="undo" title="撤销" aria-label="撤销">↶</button><button data-action="reset" title="恢复场景与相机" aria-label="恢复场景与相机">↺</button><button data-action="save" title="下载完整图像" aria-label="导出 PNG" disabled>↓</button><button data-action="full" title="全屏" aria-label="全屏">⛶</button></div>
      </header>
      <div class="scene-toolbar">
        <div class="scene-display" role="group" aria-label="视图"><button data-view="image">成像</button><button data-view="space">空间</button><button data-view="split">对照</button></div>
        <div class="scene-projection" role="group" aria-label="投影"><button data-projection="perspective">透视</button><button data-projection="orthographic">正交</button></div>
        <button data-action="parameters" class="scene-parameters-toggle" aria-expanded="true">参数</button>
      </div>
      <div class="scene-tools-bar"><div class="scene-tools" role="group" aria-label="物体工具"><button data-tool="translate" title="移动 G">移动</button><button data-tool="rotate" title="旋转 R">旋转</button><button data-tool="scale" title="缩放 S">缩放</button></div><button data-action="wire" aria-pressed="false">网格</button><button data-action="frame" title="聚焦所选物体 F">聚焦</button><span class="scene-selection"></span></div>
      <div class="scene-layout">
        <div class="scene-viewports">
          <section class="scene-pane scene-image-pane"><header><span>算法成像</span><small class="scene-status" role="status">等待视图</small></header>
            <div class="scene-result-wrap"><canvas class="scene-result" aria-label="拖动环绕相机，点击检查像素" tabindex="0"></canvas><i class="scene-crosshair" hidden></i></div>
            <div class="scene-channels" role="group" aria-label="成像通道"><button data-channel="color">颜色</button><button data-channel="depth" title="灰度拉伸到当前可见深度范围；原始值见像素检查">深度</button><button data-channel="normal">法线</button><button data-channel="owner">图元</button></div>
          </section>
          <section class="scene-pane scene-space-pane"><header><span>空间视图</span><small>近似材质 · 几何编辑</small></header><div class="scene-editor" tabindex="0" aria-label="三维空间编辑器"></div><div class="scene-view-bottom"><span>相机</span><span class="scene-camera-position"></span></div></section>
        </div>
        <aside class="scene-inspector" aria-label="实验参数"><div class="scene-controls"></div><details class="scene-object-tree"><summary>场景物体</summary><div class="scene-objects"></div></details><details class="scene-advanced"><summary>更多参数与成像质量</summary><div class="scene-more-controls"></div></details></aside>
      </div>
      <div class="scene-footer"><details class="scene-probe"><summary>像素检查</summary><div class="scene-probe-values">点击成像中的表面检查计算结果。</div></details><details class="scene-diagnostics"><summary>计算详情</summary><dl class="scene-stats"></dl></details><details class="scene-shortcuts"><summary>操作与快捷键</summary><p>两种视图均可拖动环绕、右键平移、滚轮缩放。空间视图中选中物体后拖动轴柄；G 移动、R 旋转、S 缩放、F 聚焦、Esc 取消选择，⌘/Ctrl Z 撤销。拖动时显示低分辨率预览，停下后恢复完整成像。</p></details></div>`;

    this.result = host.querySelector('.scene-result')!;
    this.status = host.querySelector('.scene-status')!;
    this.controls = host.querySelector('.scene-inspector')!;
    this.stats = host.querySelector('.scene-stats')!;
    this.objects = host.querySelector('.scene-objects')!;
    this.probe = host.querySelector('.scene-probe-values')!;
    this.renderClient = new StudyRenderer(
      (frame, quality, current) => {
        this.frame = frame;
        this.quality = quality;
        this.dirty = quality !== 'final' || !current;
        this.host.dataset.render = quality;
        this.status.textContent =
          quality === 'preview' ? `交互预览 · ${frame.width}²` : `${frame.width}² · 完整成像`;
        this.host.querySelector<HTMLButtonElement>('[data-action="save"]')!.disabled =
          quality !== 'final';
        this.showFrame();
        this.showStats();
        this.showProbe();
      },
      (message) => {
        this.status.textContent = message;
        this.host.dataset.render = 'error';
      },
    );
    const editor = host.querySelector('.scene-editor') as HTMLElement;
    const redo = document.createElement('button');
    redo.dataset.action = 'redo';
    redo.title = '重做';
    host.querySelector('[data-action="undo"]')!.after(redo);
    compactActions(host, this.abort.signal);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(stageColor);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    editor.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight('#dbeaff', '#30364e', 2.1));
    this.light = new THREE.PointLight('#ffffff', 70, 0, 2);
    this.light.position.set(-3, 4, 5);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.camera.near = 0.1;
    this.light.shadow.camera.far = 60;
    this.light.shadow.bias = -0.0002;
    this.scene.add(this.light);
    this.guides = makeGuides(chapter === '10' || chapter === '15' ? -0.002 : -1.5);
    this.scene.add(this.guides, this.selectionBox);
    this.selectionBox.visible = false;
    this.selectionBox.material.depthTest = false;
    this.selectionBox.material.transparent = true;
    this.selectionBox.material.opacity = 0.7;
    this.compass = new ViewCompass(
      editor,
      (direction) => this.alignView(direction),
      this.abort.signal,
    );
    this.camera = this.perspective;
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = false;
    this.orbit.rotateSpeed = 0.65;
    this.orbit.zoomSpeed = 0.8;
    this.orbit.panSpeed = 0.8;
    this.orbit.minDistance = 0.3;
    this.orbit.maxDistance = 80;
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setSize(0.9);
    this.gizmo.setColors('#58c4dd', '#83c167', '#fc6255', '#f4d66a');
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed', (event) => {
      this.orbit.enabled = !event.value;
    });
    this.gizmo.addEventListener('mouseDown', () => this.remember());
    this.gizmo.addEventListener('objectChange', () => {
      this.acceptTransform();
    });
    this.gizmo.addEventListener('change', () => this.paint());
    this.orbit.addEventListener('start', () => {
      cancelAnimationFrame(this.cameraMotion);
      if (!this.restoring) this.remember();
    });
    this.orbit.addEventListener('change', () => {
      if (this.restoring) return;
      this.state.camera.zoom =
        this.camera instanceof THREE.OrthographicCamera ? this.camera.zoom : 1;
      this.state.camera.eye = this.camera.position.toArray() as Vec3;
      this.state.camera.target = this.orbit.target.toArray() as Vec3;
      this.syncCameraReadout();
      this.paint();
      this.scheduleRender();
    });
    const signal = this.abort.signal,
      on = (selector: string, fn: () => void) =>
        host.querySelector(selector)!.addEventListener('click', fn, { signal });
    on('[data-action="source"]', () => openSource(this.spec.source));
    on('[data-action="reset"]', () => {
      this.remember();
      this.state = structuredClone(this.spec.state);
      this.channel = 'color';
      this.sync();
      this.rebuild();
      this.restoreCamera();
      this.scheduleRender();
    });
    on('[data-action="undo"]', () => this.restoreUndo());
    on('[data-action="redo"]', () => this.restoreUndo(true));
    on('[data-action="parameters"]', () => {
      const hidden = host.classList.toggle('parameters-hidden');
      host
        .querySelector('[data-action="parameters"]')!
        .setAttribute('aria-expanded', String(!hidden));
    });
    host.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
      button.addEventListener('click', () => this.setView(button.dataset.view as SceneDisplay), {
        signal,
      });
    });
    on('[data-action="full"]', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void host.requestFullscreen();
    });
    on('[data-action="wire"]', () => {
      this.wire = !this.wire;
      this.meshes.forEach(
        (mesh) => ((mesh.material as THREE.MeshStandardMaterial).wireframe = this.wire),
      );
      host.querySelector('[data-action="wire"]')!.setAttribute('aria-pressed', String(this.wire));
      this.paint();
    });
    on('[data-action="frame"]', () => this.focus());
    on('[data-action="save"]', () => {
      if (!this.frame || this.quality !== 'final') return;
      const a = document.createElement('a');
      a.download = `graphics-${chapter}-${this.channel}.png`;
      a.href = this.result.toDataURL('image/png');
      a.click();
    });
    host.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) =>
      b.addEventListener('click', () => this.setTool(b.dataset.tool as typeof this.mode), {
        signal,
      }),
    );
    host.querySelectorAll<HTMLButtonElement>('[data-projection]').forEach((b) =>
      b.addEventListener(
        'click',
        () => {
          this.remember();
          this.state.camera.projection = b.dataset.projection as 'perspective' | 'orthographic';
          this.state.camera.zoom = 1;
          this.restoreCamera();
          this.sync();
          this.scheduleRender();
        },
        { signal },
      ),
    );
    host.querySelectorAll<HTMLButtonElement>('[data-channel]').forEach((b) =>
      b.addEventListener(
        'click',
        () => {
          this.channel = b.dataset.channel!;
          this.showFrame();
          this.sync();
        },
        { signal },
      ),
    );
    let resultDown: [number, number] = [0, 0];
    this.result.addEventListener(
      'pointerdown',
      (event) => {
        resultDown = [event.clientX, event.clientY];
        this.result.focus({ preventScroll: true });
      },
      { signal },
    );
    this.result.addEventListener(
      'click',
      (event) => {
        if (
          !this.frame ||
          Math.hypot(event.clientX - resultDown[0], event.clientY - resultDown[1]) > 4
        )
          return;
        const r = this.result.getBoundingClientRect();
        this.probePixel = [
          Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)),
          Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)),
        ];
        this.showProbe();
        (host.querySelector('.scene-probe') as HTMLDetailsElement).open = true;
      },
      { signal },
    );
    this.bindDirectDrag(editor);
    for (const surface of [this.result, this.renderer.domElement]) {
      surface.addEventListener('pointerenter', () => this.connectCamera(surface), { signal });
      surface.addEventListener(
        'wheel',
        (event) => {
          if (
            !event.ctrlKey &&
            document.activeElement !== surface &&
            document.activeElement !== editor
          )
            event.stopImmediatePropagation();
        },
        { signal, capture: true },
      );
    }
    host.addEventListener(
      'keydown',
      (event) => {
        if (event.target instanceof HTMLInputElement) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          this.restoreUndo(event.shiftKey);
          return;
        }
        if (event.target instanceof HTMLButtonElement) return;
        if (event.key.toLowerCase() === 'g') this.setTool('translate');
        if (event.key.toLowerCase() === 'r') this.setTool('rotate');
        if (event.key.toLowerCase() === 's') this.setTool('scale');
        if (event.key.toLowerCase() === 'f') this.focus();
        if (event.key === 'Home') {
          event.preventDefault();
          this.focus(true);
        }
        if (event.key === 'Escape') {
          this.select('');
          (document.activeElement as HTMLElement)?.blur();
        }
        if (event.key === '1') this.alignView([0, 0, 1]);
        if (event.key === '3') this.alignView([1, 0, 0]);
        if (event.key === '7') this.alignView([0, 1, 0]);
      },
      { signal },
    );
    this.buildControls();
    this.buildInspector();
    this.rebuild();
    this.restoreCamera();
    this.sync();
    this.setTool('translate');
    this.setView(this.display);
    this.resize = new ResizeObserver(() => {
      const rect = editor.getBoundingClientRect();
      if (rect.width && rect.height) {
        this.renderer.setSize(rect.width, rect.height, false);
        this.paint();
      }
    });
    this.resize.observe(editor);
    this.intersection = new IntersectionObserver(
      (entries) => {
        this.visible = entries[0].isIntersecting;
        if (this.visible && this.dirty) this.scheduleRender();
        if (!this.visible) this.renderClient.cancel();
      },
      { rootMargin: '150px' },
    );
    this.intersection.observe(host);
  }
  private connectCamera(surface: HTMLCanvasElement): void {
    if (this.orbit.domElement === surface || this.gizmo.dragging) return;
    this.orbit.disconnect();
    this.orbit.connect(surface);
  }
  private setView(view: SceneDisplay): void {
    this.display = view;
    this.host.dataset.view = view;
    this.host.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
    (this.host.querySelector('.scene-object-tree') as HTMLDetailsElement).open = view !== 'image';
    this.connectCamera(view === 'image' ? this.result : this.renderer.domElement);
    this.paint();
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
  private restoreUndo(redo = false): void {
    const saved = redo ? this.history.redo(this.snapshot()) : this.history.undo(this.snapshot());
    if (!saved) return;
    cancelAnimationFrame(this.cameraMotion);
    this.state = saved.state;
    this.selected = saved.selected;
    this.channel = saved.channel;
    this.probePixel = saved.probe;
    this.wire = saved.wire ?? false;
    this.rebuild();
    this.restoreCamera();
    this.setView(saved.view);
    this.sync();
    this.scheduleRender();
  }
  private buildControls(): void {
    const fov = { key: 'fov', label: '垂直视场角', min: 15, max: 110, step: 1, unit: '°' };
    const primary: Record<string, string[]> = {
      '03': ['fov', 'near', 'far'],
      '06': ['depthTest', 'reverse', 'bits'],
      '07': ['normalMode', 'ks', 'exponent'],
      '08': ['filter', 'correct', 'frequency'],
      '09': ['environment', 'mapping', 'envAngle'],
      '10': ['bias', 'pcf', 'shadowSize'],
      '11': ['mode', 'depthTest', 'cull'],
      '12': ['detail'],
      '14': ['pair', 'continuity', 'detail'],
      '15': ['bounces', 'mirrorA', 'mirrorB', 'specular'],
    };
    const geometryKeys = new Set(['detail', 'wave', 'pair', 'continuity', 'leftSpan', 'rightSpan']);
    for (const control of [fov, ...this.spec.controls]) {
      const group = document.createElement('div');
      group.className = 'figure-control';
      const label = document.createElement('label');
      label.textContent = control.label;
      group.append(label);
      if ('options' in control) {
        const row = document.createElement('div');
        row.className = 'figure-segments';
        for (const option of control.options) {
          const b = document.createElement('button');
          b.textContent = option.label;
          b.dataset.param = control.key;
          b.dataset.value = JSON.stringify(option.value);
          b.addEventListener(
            'click',
            () => {
              this.remember();
              this.state.params[control.key] = option.value;
              if (geometryKeys.has(control.key)) this.updateGeometry();
              this.sync();
              this.scheduleRender();
            },
            { signal: this.abort.signal },
          );
          row.append(b);
        }
        group.append(row);
      } else {
        const output = numberField(
          control.label,
          control.min,
          control.max,
          control.step ?? 1,
          () => this.remember(),
          (value) => {
            if (control.key === 'fov') {
              this.state.camera.fov = value;
              this.restoreCamera();
            } else this.state.params[control.key] = value;
            if (geometryKeys.has(control.key)) this.updateGeometry();
            this.sync();
            this.scheduleRender();
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
        input.dataset.param = control.key;
        input.setAttribute('aria-label', control.label);
        input.addEventListener('pointerdown', () => this.remember(), { signal: this.abort.signal });
        input.addEventListener(
          'keydown',
          (event) => {
            if (event.key.startsWith('Arrow')) this.remember();
          },
          { signal: this.abort.signal },
        );
        input.addEventListener(
          'input',
          () => {
            if (control.key === 'fov') {
              this.state.camera.fov = Number(input.value);
              this.restoreCamera();
            } else {
              this.state.params[control.key] = Number(input.value);
              if (geometryKeys.has(control.key)) this.updateGeometry();
            }
            this.sync();
            this.scheduleRender();
          },
          { signal: this.abort.signal },
        );
        group.append(input);
      }
      this.host
        .querySelector(
          (primary[this.state.chapter] ?? []).includes(control.key)
            ? '.scene-controls'
            : '.scene-more-controls',
        )!
        .append(group);
    }
  }
  private setInspector(tab: 'parameters' | 'objects'): void {
    this.controls.dataset.tab = tab;
    this.controls
      .querySelectorAll<HTMLButtonElement>('[data-inspector]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.inspector === tab)),
      );
  }
  private buildInspector(): void {
    const signal = this.abort.signal;
    const tabs = document.createElement('div');
    tabs.className = 'scene-inspector-tabs';
    tabs.innerHTML =
      '<button data-inspector="parameters">实验参数</button><button data-inspector="objects">物体</button>';
    tabs
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((button) =>
        button.addEventListener(
          'click',
          () => this.setInspector(button.dataset.inspector as 'parameters' | 'objects'),
          { signal },
        ),
      );
    this.controls.prepend(tabs);
    const fields = document.createElement('section');
    fields.className = 'scene-transform';
    fields.hidden = true;
    fields.innerHTML = '<h4 class="scene-transform-name"></h4>';
    for (const property of ['position', 'rotation', 'scale'] as const) {
      const row = document.createElement('div');
      row.className = 'scene-transform-row';
      const name = document.createElement('span');
      name.textContent = { position: '位置', rotation: '旋转 / °', scale: '缩放' }[property];
      row.append(name);
      for (let axis = 0; axis < 3; axis++) {
        const label = document.createElement('label');
        label.dataset.axis = String(axis);
        const axisName = document.createElement('span');
        axisName.textContent = 'XYZ'[axis];
        const input = numberField(
          name.textContent + ' ' + 'XYZ'[axis],
          property === 'scale' ? 0.03 : -1000,
          property === 'scale' ? 30 : 1000,
          property === 'rotation' ? 1 : 0.01,
          () => this.remember(),
          (value) => {
            const mesh = this.meshes.get(this.selected);
            if (!mesh) return;
            if (property === 'rotation')
              mesh.rotation.set(
                ...([mesh.rotation.x, mesh.rotation.y, mesh.rotation.z].map((n, i) =>
                  i === axis ? (value * Math.PI) / 180 : n,
                ) as Vec3),
              );
            else mesh[property].setComponent(axis, value);
            this.acceptTransform(property === 'scale' ? axis : undefined);
          },
          signal,
        );
        input.dataset.transform = property;
        input.dataset.axis = String(axis);
        label.append(axisName, input);
        row.append(label);
      }
      fields.append(row);
    }
    this.controls.querySelector('.scene-object-tree')!.after(fields);
    this.setInspector('parameters');
    this.host.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
      const mode = button.dataset.tool!;
      button.innerHTML =
        icon(mode === 'translate' ? 'move' : mode) +
        '<span>' +
        button.textContent +
        '</span><kbd>' +
        { translate: 'G', rotate: 'R', scale: 'S' }[mode as 'translate'] +
        '</kbd>';
    });
    const bar = this.host.querySelector('.scene-tools-bar')!;
    const space = document.createElement('button');
    space.textContent = '世界';
    space.title = '切换世界 / 局部变换轴';
    space.dataset.action = 'space';
    space.addEventListener(
      'click',
      () => {
        const next = this.gizmo.space === 'world' ? 'local' : 'world';
        this.gizmo.setSpace(next);
        space.textContent = next === 'world' ? '世界' : '局部';
        this.paint();
      },
      { signal },
    );
    const snap = document.createElement('button');
    snap.textContent = '吸附';
    snap.title = '移动 0.25 · 旋转 15° · 缩放 0.1';
    snap.dataset.action = 'snap';
    snap.setAttribute('aria-pressed', 'false');
    snap.addEventListener(
      'click',
      () => {
        this.snap = !this.snap;
        snap.setAttribute('aria-pressed', String(this.snap));
        this.gizmo.setTranslationSnap(this.snap ? 0.25 : null);
        this.gizmo.setRotationSnap(this.snap ? Math.PI / 12 : null);
        this.gizmo.setScaleSnap(this.snap ? 0.1 : null);
      },
      { signal },
    );
    const guides = document.createElement('button');
    guides.textContent = '坐标';
    guides.dataset.action = 'guides';
    guides.setAttribute('aria-pressed', 'true');
    guides.addEventListener(
      'click',
      () => {
        this.guides.visible = !this.guides.visible;
        guides.setAttribute('aria-pressed', String(this.guides.visible));
        this.paint();
      },
      { signal },
    );
    this.host.querySelector('[data-action="wire"]')!.textContent = '线框';
    bar.querySelector('.scene-tools')!.after(space, snap, guides);
    this.host.querySelector('.scene-shortcuts p')!.textContent =
      '拖动物体在观察平面内移动；拖动空白区域或 Alt 拖动环绕。右键平移，点击画布后滚轮缩放。G / R / S 切换移动、旋转、缩放，F 聚焦，Home 查看全部；1 / 3 / 7 切换正、侧、顶视角。Ctrl / ⌘ Z 撤销，Ctrl / ⌘ Shift Z 重做。图像中的点击用于检查像素。';
  }
  private acceptTransform(scaleAxis?: number): void {
    const object = this.state.objects.find((o) => o.key === this.selected),
      mesh = this.meshes.get(this.selected);
    if (!object || !mesh) return;
    if (object.kind === 'light') mesh.position.y = Math.max(0.2, mesh.position.y);
    if (this.state.chapter === '15' && object.kind === 'sphere') {
      const axis =
        scaleAxis ?? (this.gizmo.axis?.length === 1 ? 'XYZ'.indexOf(this.gizmo.axis) : -1);
      mesh.scale.setScalar(
        Math.max(
          0.1,
          axis >= 0
            ? mesh.scale.getComponent(axis)
            : (mesh.scale.x + mesh.scale.y + mesh.scale.z) / 3,
        ),
      );
    }
    mesh.scale.set(
      Math.max(0.03, mesh.scale.x),
      Math.max(0.03, mesh.scale.y),
      Math.max(0.03, mesh.scale.z),
    );
    object.position = mesh.position.toArray() as Vec3;
    object.rotation = [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z].map(
      (x) => (x * 180) / Math.PI,
    ) as Vec3;
    object.scale = mesh.scale.toArray() as Vec3;
    if (object.kind === 'control') this.updatePatch();
    this.updateLight();
    this.syncSelection();
    this.scheduleRender();
    this.paint();
  }
  private bindDirectDrag(editor: HTMLElement): void {
    const canvas = this.renderer.domElement,
      signal = this.abort.signal;
    const ray = new THREE.Raycaster();
    let drag:
      | {
          pointer: number;
          mesh: THREE.Mesh;
          plane: THREE.Plane;
          start: THREE.Vector3;
          origin: THREE.Vector3;
          screen: number[];
          snapshot: SceneSnapshot;
          moved: boolean;
        }
      | undefined;
    let empty: number[] | undefined;
    const cast = (event: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          (2 * (event.clientX - rect.left)) / rect.width - 1,
          1 - (2 * (event.clientY - rect.top)) / rect.height,
        ),
        this.camera,
      );
    };
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        editor.focus({ preventScroll: true });
        empty = undefined;
        if (event.button !== 0 || event.altKey || this.gizmo.axis) return;
        if (event.pointerType === 'touch') {
          empty = [event.clientX, event.clientY];
          return; // Touch gestures remain with OrbitControls; tap selects an object.
        }
        cast(event);
        const hit = ray.intersectObjects(
          [...this.meshes.values()].filter((mesh) => mesh.userData.editable),
          false,
        )[0];
        if (!hit) {
          empty = [event.clientX, event.clientY];
          return;
        }
        cancelAnimationFrame(this.cameraMotion);
        const snapshot = this.snapshot();
        this.select(hit.object.userData.key);
        const mesh = hit.object as THREE.Mesh;
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          this.camera.getWorldDirection(new THREE.Vector3()),
          hit.point,
        );
        drag = {
          pointer: event.pointerId,
          mesh,
          plane,
          start: hit.point.clone(),
          origin: mesh.position.clone(),
          screen: [event.clientX, event.clientY],
          snapshot,
          moved: false,
        };
        this.orbit.enabled = false;
        this.gizmo.enabled = false;
        editor.classList.add('is-dragging');
        canvas.setPointerCapture(event.pointerId);
        event.stopImmediatePropagation();
        event.preventDefault();
      },
      { signal, capture: true },
    );
    canvas.addEventListener(
      'pointermove',
      (event) => {
        if (!drag || drag.pointer !== event.pointerId) return;
        event.stopImmediatePropagation();
        if (
          !drag.moved &&
          Math.hypot(event.clientX - drag.screen[0], event.clientY - drag.screen[1]) < 3
        )
          return;
        cast(event);
        const point = ray.ray.intersectPlane(drag.plane, new THREE.Vector3());
        if (!point) return;
        if (!drag.moved) {
          this.history.remember(drag.snapshot);
          this.syncHistory();
          drag.moved = true;
        }
        drag.mesh.position.copy(point).sub(drag.start).add(drag.origin);
        if (this.snap || event.shiftKey)
          for (let axis = 0; axis < 3; axis++)
            drag.mesh.position.setComponent(
              axis,
              Math.round(drag.mesh.position.getComponent(axis) / 0.25) * 0.25,
            );
        this.acceptTransform();
      },
      { signal, capture: true },
    );
    const stop = (event: PointerEvent) => {
      if (drag) {
        event.stopImmediatePropagation();
        if (event.type === 'pointercancel') {
          drag.mesh.position.copy(drag.origin);
          this.acceptTransform();
        }
        drag = undefined;
        this.orbit.enabled = true;
        this.gizmo.enabled = true;
        editor.classList.remove('is-dragging');
        if (canvas.hasPointerCapture(event.pointerId))
          canvas.releasePointerCapture(event.pointerId);
      } else if (empty && Math.hypot(event.clientX - empty[0], event.clientY - empty[1]) < 3) {
        cast(event);
        const hit = ray.intersectObjects(
          [...this.meshes.values()].filter((mesh) => mesh.userData.editable),
          false,
        )[0];
        this.select(hit?.object.userData.key ?? '');
      }
      empty = undefined;
    };
    canvas.addEventListener('pointerup', stop, { signal, capture: true });
    canvas.addEventListener('pointercancel', stop, { signal, capture: true });
    canvas.addEventListener('lostpointercapture', stop, { signal });
    editor.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape' || !drag) return;
        drag.mesh.position.copy(drag.origin);
        this.acceptTransform();
        const pointer = drag.pointer;
        drag = undefined;
        this.orbit.enabled = this.gizmo.enabled = true;
        editor.classList.remove('is-dragging');
        if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
        event.stopPropagation();
      },
      { signal },
    );
    canvas.addEventListener('dblclick', () => this.focus(), { signal });
  }
  private alignView(direction?: Vec3): void {
    if (!direction) {
      this.moveCamera(this.spec.state.camera.eye, this.spec.state.camera.target);
      return;
    }
    const center = this.orbit.target.clone();
    const distance = this.camera.position.distanceTo(center);
    const axis = new THREE.Vector3(...direction);
    if (Math.abs(axis.y) === 1) axis.z = 0.00001;
    this.moveCamera(
      axis.normalize().multiplyScalar(distance).add(center).toArray() as Vec3,
      center.toArray() as Vec3,
    );
  }
  private moveCamera(eye: Vec3, target: Vec3): void {
    cancelAnimationFrame(this.cameraMotion);
    this.remember();
    const before = structuredClone(this.state.camera),
      start = performance.now();
    const from = new THREE.Spherical().setFromVector3(
      new THREE.Vector3(...before.eye).sub(new THREE.Vector3(...before.target)),
    );
    const to = new THREE.Spherical().setFromVector3(
      new THREE.Vector3(...eye).sub(new THREE.Vector3(...target)),
    );
    // Interpolate on the orbit, never through the scene when switching opposite views.
    let angle = to.theta - from.theta;
    angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280;
    const tick = (now: number) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1,
        eased = t * t * (3 - 2 * t);
      this.state.camera.target = before.target.map((n, i) => n + (target[i] - n) * eased) as Vec3;
      const offset = new THREE.Vector3().setFromSpherical(
        new THREE.Spherical(
          from.radius + (to.radius - from.radius) * eased,
          from.phi + (to.phi - from.phi) * eased,
          from.theta + angle * eased,
        ),
      );
      this.state.camera.eye = offset
        .add(new THREE.Vector3(...this.state.camera.target))
        .toArray() as Vec3;
      this.restoreCamera();
      this.scheduleRender();
      if (t < 1) this.cameraMotion = requestAnimationFrame(tick);
    };
    this.cameraMotion = requestAnimationFrame(tick);
  }
  private geometry(object: ObjectState): THREE.BufferGeometry {
    const mesh = localScene(object, this.state),
      g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices.flat(), 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals.flat(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uv.flat(), 2));
    g.setIndex(mesh.faces.flat());
    g.computeBoundingSphere();
    return g;
  }
  private rebuild(): void {
    this.gizmo.detach();
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.meshes.clear();
    this.objects.replaceChildren();
    for (const object of this.state.objects) {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setRGB(...object.color),
        roughness: 0.48,
        metalness: 0,
        side: THREE.DoubleSide,
        wireframe: this.wire,
      });
      if (object.kind === 'light') material.emissive.setRGB(...object.color);
      if (object.kind === 'ground') {
        material.color.set('#26384b');
        material.roughness = 0.9;
      }
      const mesh = new THREE.Mesh(this.geometry(object), material);
      mesh.position.fromArray(object.position);
      mesh.rotation.order = 'ZYX';
      mesh.rotation.set(...(object.rotation.map((x) => (x * Math.PI) / 180) as Vec3));
      mesh.scale.fromArray(object.scale);
      mesh.userData = { key: object.key, editable: object.editable };
      mesh.castShadow = object.kind !== 'light' && object.kind !== 'ground';
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.meshes.set(object.key, mesh);
      if (object.editable) {
        const button = document.createElement('button');
        button.textContent = object.label;
        button.dataset.object = object.key;
        button.addEventListener(
          'click',
          () => {
            if (this.display === 'image') this.setView('space');
            this.select(object.key);
          },
          {
            signal: this.abort.signal,
          },
        );
        this.objects.append(button);
      }
    }
    this.updateLight();
    this.select(this.meshes.has(this.selected) ? this.selected : '');
    this.paint();
  }
  private updateGeometry(): void {
    for (const object of this.state.objects) {
      const mesh = this.meshes.get(object.key)!;
      mesh.geometry.dispose();
      mesh.geometry = this.geometry(object);
    }
    this.paint();
  }
  private updatePatch(): void {
    const object = this.state.objects.find((o) => o.kind === 'patch');
    if (object) {
      const mesh = this.meshes.get(object.key)!;
      mesh.geometry.dispose();
      mesh.geometry = this.geometry(object);
    }
  }
  private updateLight(): void {
    const light = this.state.objects.find((o) => o.kind === 'light');
    if (light) this.light.position.fromArray(light.position);
  }
  private restoreCamera(): void {
    this.restoring = true;
    const c = this.state.camera,
      height =
        new THREE.Vector3(...c.eye).distanceTo(new THREE.Vector3(...c.target)) *
        Math.tan((c.fov * Math.PI) / 360);
    this.perspective.fov = c.fov;
    this.perspective.updateProjectionMatrix();
    this.orthographic.zoom = c.zoom ?? 1;
    this.orthographic.left = -height;
    this.orthographic.right = height;
    this.orthographic.top = height;
    this.orthographic.bottom = -height;
    this.orthographic.updateProjectionMatrix();
    this.camera = c.projection === 'perspective' ? this.perspective : this.orthographic;
    this.camera.position.fromArray(c.eye);
    this.camera.lookAt(new THREE.Vector3(...c.target));
    this.orbit.object = this.camera;
    this.orbit.target.fromArray(c.target);
    this.gizmo.camera = this.camera;
    this.orbit.update();
    this.restoring = false;
    this.syncCameraReadout();
    this.paint();
  }
  private syncCameraReadout(): void {
    this.host.querySelector('.scene-camera-position')!.textContent =
      `相机 ${this.state.camera.eye.map((x) => x.toFixed(1)).join(' · ')}`;
  }
  private sync(): void {
    this.syncHistory();
    for (const input of this.controls.querySelectorAll<HTMLInputElement>('input[data-param]')) {
      input.value = String(
        input.dataset.param === 'fov'
          ? this.state.camera.fov
          : this.state.params[input.dataset.param!],
      );
      input.style.setProperty(
        '--range',
        `${(100 * (Number(input.value) - Number(input.min))) / (Number(input.max) - Number(input.min))}%`,
      );
    }
    for (const out of this.controls.querySelectorAll<HTMLInputElement>('input[data-readout]'))
      out.value = format(
        Number(
          out.dataset.readout === 'fov'
            ? this.state.camera.fov
            : this.state.params[out.dataset.readout!],
        ),
      );
    for (const button of this.host.querySelectorAll<HTMLButtonElement>(
      '[data-param][data-value]',
    )) {
      button.classList.toggle(
        'active',
        JSON.stringify(this.state.params[button.dataset.param!]) === button.dataset.value,
      );
      button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    }
    for (const button of this.host.querySelectorAll<HTMLButtonElement>('[data-projection]')) {
      button.classList.toggle('active', button.dataset.projection === this.state.camera.projection);
      button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    }
    for (const button of this.host.querySelectorAll<HTMLButtonElement>('[data-channel]')) {
      button.classList.toggle('active', button.dataset.channel === this.channel);
      button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    }
  }
  private select(key: string): void {
    this.selected = key;
    const mesh = this.meshes.get(key);
    if (mesh && mesh.userData.editable) this.gizmo.attach(mesh);
    else this.gizmo.detach();
    this.selectionBox.visible = !!mesh;
    if (mesh) {
      this.selectionBox.setFromObject(mesh);
      this.setInspector('objects');
    }
    this.syncSelection();
    this.paint();
  }
  private syncSelection(): void {
    for (const button of this.objects.querySelectorAll<HTMLButtonElement>('button')) {
      button.classList.toggle('active', button.dataset.object === this.selected);
      button.setAttribute('aria-pressed', String(button.dataset.object === this.selected));
    }
    const object = this.state.objects.find((o) => o.key === this.selected);
    this.host.querySelector('.scene-selection')!.textContent = object ? object.label : '选择物体';
    const transform = this.host.querySelector<HTMLElement>('.scene-transform')!;
    transform.hidden = !object;
    this.host.querySelector('.scene-transform-name')!.textContent = object?.label ?? '';
    for (const input of transform.querySelectorAll<HTMLInputElement>('[data-transform]')) {
      const property = input.dataset.transform as 'position' | 'rotation' | 'scale';
      input.value = object ? format(object[property][Number(input.dataset.axis)]) : '0';
    }
  }
  private setTool(mode: typeof this.mode): void {
    this.mode = mode;
    this.gizmo.setMode(mode);
    for (const b of this.host.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
      b.classList.toggle('active', b.dataset.tool === mode);
      b.setAttribute('aria-pressed', String(b.dataset.tool === mode));
    }
    this.paint();
  }
  private focus(all = false): void {
    const box = new THREE.Box3();
    const selected = this.meshes.get(this.selected);
    for (const object of this.state.objects) {
      if (object.kind === 'light' || object.kind === 'ground') continue;
      const mesh = this.meshes.get(object.key)!;
      if (all || !selected || selected === mesh) box.expandByObject(mesh);
    }
    if (box.isEmpty() && selected) box.expandByObject(selected);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const distance = Math.max(
      0.5,
      (radius * 1.25) / Math.sin((this.state.camera.fov * Math.PI) / 360),
    );
    const eye = this.camera.position
      .clone()
      .sub(this.orbit.target)
      .normalize()
      .multiplyScalar(distance)
      .add(center);
    this.moveCamera(eye.toArray() as Vec3, center.toArray() as Vec3);
  }
  private paint(): void {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      const selected = this.meshes.get(this.selected);
      if (selected) this.selectionBox.update();
      this.compass.update(this.camera);
      this.renderer.render(this.scene, this.camera);
    });
  }
  private scheduleRender(): void {
    this.dirty = true;
    if (!this.visible || this.disposed) return;
    this.status.textContent = '更新中…';
    this.host.dataset.render = 'updating';
    this.host.querySelector<HTMLButtonElement>('[data-action="save"]')!.disabled = true;
    this.renderClient.update(this.state);
  }
  private showFrame(): void {
    const frame = this.frame;
    if (!frame) return;
    let pixels = frame.pixels;
    if (this.channel !== 'color') {
      pixels = frame.pixels.slice();
      let min = Infinity,
        max = -Infinity;
      if (this.channel === 'depth')
        frame.depth.forEach((z, i) => {
          if (frame.owner[i] >= 0 && Number.isFinite(z)) {
            min = Math.min(min, z);
            max = Math.max(max, z);
          }
        });
      for (let i = 0; i < frame.owner.length; i++) {
        if (frame.owner[i] < 0) {
          pixels.set([240, 239, 230, 255], i * 4);
          continue;
        }
        if (this.channel === 'depth') {
          const z = max > min ? 1 - (frame.depth[i] - min) / (max - min) : 0.5,
            v = Math.round(z * 255);
          pixels.set([v, v, v, 255], i * 4);
        } else if (this.channel === 'normal')
          pixels.set(
            [0, 1, 2].map((c) => Math.round((frame.normal[3 * i + c] + 1) * 127.5)).concat(255),
            i * 4,
          );
        else {
          const id = frame.owner[i];
          pixels.set(
            [70 + ((id * 73) % 170), 65 + ((id * 113) % 175), 80 + ((id * 47) % 160), 255],
            i * 4,
          );
        }
      }
    }
    this.result.width = frame.width;
    this.result.height = frame.height;
    this.result
      .getContext('2d')!
      .putImageData(new ImageData(new Uint8ClampedArray(pixels), frame.width, frame.height), 0, 0);
  }
  private showStats(): void {
    if (!this.frame) return;
    this.stats.replaceChildren();
    for (const [key, value] of Object.entries(this.frame.stats)) {
      const div = document.createElement('div'),
        dt = document.createElement('dt'),
        dd = document.createElement('dd');
      dt.textContent = key;
      dd.textContent = format(value);
      div.append(dt, dd);
      this.stats.append(div);
    }
  }
  private showProbe(): void {
    const frame = this.frame;
    if (!frame || !this.probePixel) return;
    const row = Math.min(frame.height - 1, Math.floor(this.probePixel[0] * frame.height)),
      col = Math.min(frame.width - 1, Math.floor(this.probePixel[1] * frame.width)),
      i = row * frame.width + col;
    const cross = this.host.querySelector('.scene-crosshair') as HTMLElement;
    cross.hidden = false;
    cross.style.left = `${((col + 0.5) / frame.width) * 100}%`;
    cross.style.top = `${((row + 0.5) / frame.height) * 100}%`;
    const values = {
      '像素 [row, col]': [row, col],
      图元: frame.owner[i],
      '深度 / 射线参数': frame.depth[i],
      '线性 RGB': [...frame.linear.slice(i * 3, i * 3 + 3)],
      世界位置: [...frame.world.slice(i * 3, i * 3 + 3)],
      法线: [...frame.normal.slice(i * 3, i * 3 + 3)],
      UV: [...frame.uv.slice(i * 2, i * 2 + 2)],
    };
    this.probe.replaceChildren();
    for (const [key, value] of Object.entries(values)) {
      const line = document.createElement('p');
      line.textContent = `${key}  ${Array.isArray(value) ? value.map(format).join('  ') : format(value)}`;
      this.probe.append(line);
    }
  }
  snapshot(): SceneSnapshot {
    return {
      state: structuredClone(this.state),
      channel: this.channel,
      view: this.display,
      selected: this.selected,
      probe: this.probePixel,
      wire: this.wire,
    };
  }
  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.cameraMotion);
    this.renderClient.dispose();
    this.abort.abort();
    this.resize.disconnect();
    this.intersection.disconnect();
    this.gizmo.dispose();
    this.orbit.dispose();
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.scene.traverse((object) => {
      if (object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
        else object.material.dispose();
      }
    });
    this.renderer.dispose();
    this.guides.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        if ('geometry' in object) object.geometry.dispose();
        const material = object.material as THREE.MeshBasicMaterial;
        material.map?.dispose();
        material.dispose();
      }
    });
    this.light.shadow.map?.dispose();
    this.renderer.forceContextLoss();
  }
}
