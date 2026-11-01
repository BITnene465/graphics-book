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

type SceneDisplay = 'image' | 'space' | 'split';
export type SceneSnapshot = {
  state: StudyState;
  channel: string;
  view: SceneDisplay;
  selected: string;
  probe?: [number, number];
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
  private undo: StudyState[] = [];
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
    this.display = saved?.view ?? (chapter === '14' ? 'space' : 'image');
    this.selected = saved?.selected ?? '';
    this.probePixel = saved?.probe;
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
    compactActions(host, this.abort.signal);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor('#f0efe6');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    editor.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#657261', 1.5));
    this.light = new THREE.PointLight('#ffffff', 70, 0, 2);
    this.light.position.set(-3, 4, 5);
    this.scene.add(this.light);
    const grid = new THREE.GridHelper(10, 20, '#a7b5a7', '#d4dbcd');
    grid.position.y = chapter === '10' || chapter === '15' ? -0.002 : -1.5;
    this.scene.add(grid);
    this.camera = this.perspective;
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = false;
    this.orbit.minDistance = 0.3;
    this.orbit.maxDistance = 80;
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setSize(0.75);
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed', (event) => {
      this.orbit.enabled = !event.value;
    });
    this.gizmo.addEventListener('mouseDown', () => this.remember());
    this.gizmo.addEventListener('objectChange', () => {
      const object = this.state.objects.find((o) => o.key === this.selected),
        mesh = this.meshes.get(this.selected);
      if (!object || !mesh) return;
      if (object.kind === 'light') mesh.position.y = Math.max(0.2, mesh.position.y);
      if (chapter === '15' && object.kind === 'sphere') {
        const s = Math.max(0.1, (mesh.scale.x + mesh.scale.y + mesh.scale.z) / 3);
        mesh.scale.setScalar(s);
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
    });
    this.gizmo.addEventListener('change', () => this.paint());
    this.orbit.addEventListener('start', () => {
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
    let start: [number, number] = [0, 0];
    this.renderer.domElement.addEventListener(
      'pointerdown',
      (e) => {
        editor.focus({ preventScroll: true });
        start = [e.clientX, e.clientY];
      },
      { signal },
    );
    this.renderer.domElement.addEventListener(
      'pointerup',
      (e) => {
        if (this.gizmo.axis || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 4) return;
        const rect = this.renderer.domElement.getBoundingClientRect(),
          pointer = new THREE.Vector2(
            (2 * (e.clientX - rect.left)) / rect.width - 1,
            1 - (2 * (e.clientY - rect.top)) / rect.height,
          ),
          ray = new THREE.Raycaster();
        ray.setFromCamera(pointer, this.camera);
        const hit = ray.intersectObjects(
          [...this.meshes.values()].filter((m) => m.userData.editable),
          false,
        )[0];
        if (hit) this.select(hit.object.userData.key);
        else this.select('');
      },
      { signal },
    );
    for (const surface of [this.result, this.renderer.domElement]) {
      surface.addEventListener('pointerenter', () => this.connectCamera(surface), { signal });
    }
    host.addEventListener(
      'keydown',
      (event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement)
          return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          this.restoreUndo();
          return;
        }
        if (event.key.toLowerCase() === 'g') this.setTool('translate');
        if (event.key.toLowerCase() === 'r') this.setTool('rotate');
        if (event.key.toLowerCase() === 's') this.setTool('scale');
        if (event.key.toLowerCase() === 'f') this.focus();
        if (event.key === 'Escape') this.select('');
      },
      { signal },
    );
    this.buildControls();
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
    this.undo.push(structuredClone(this.state));
    if (this.undo.length > 30) this.undo.shift();
  }
  private restoreUndo(): void {
    const state = this.undo.pop();
    if (!state) return;
    this.state = state;
    this.rebuild();
    this.restoreCamera();
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
        const output = document.createElement('output');
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
        roughness: 0.38,
        metalness: 0,
        side: THREE.DoubleSide,
        wireframe: this.wire,
      });
      if (object.kind === 'light') material.emissive.setRGB(...object.color);
      const mesh = new THREE.Mesh(this.geometry(object), material);
      mesh.position.fromArray(object.position);
      mesh.rotation.order = 'ZYX';
      mesh.rotation.set(...(object.rotation.map((x) => (x * Math.PI) / 180) as Vec3));
      mesh.scale.fromArray(object.scale);
      mesh.userData = { key: object.key, editable: object.editable };
      this.scene.add(mesh);
      this.meshes.set(object.key, mesh);
      if (object.editable) {
        const button = document.createElement('button');
        button.textContent = object.label;
        button.dataset.object = object.key;
        button.addEventListener(
          'click',
          () => {
            this.setView('space');
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
    for (const out of this.controls.querySelectorAll<HTMLOutputElement>('output'))
      out.textContent = format(
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
    this.syncSelection();
    this.paint();
  }
  private syncSelection(): void {
    for (const button of this.objects.querySelectorAll<HTMLButtonElement>('button'))
      button.classList.toggle('active', button.dataset.object === this.selected);
    const object = this.state.objects.find((o) => o.key === this.selected);
    this.host.querySelector('.scene-selection')!.textContent = object
      ? `${object.label}  ${object.position.map((x) => x.toFixed(2)).join(' · ')}`
      : '未选择物体';
  }
  private setTool(mode: typeof this.mode): void {
    this.mode = mode;
    this.gizmo.setMode(mode);
    for (const b of this.host.querySelectorAll<HTMLButtonElement>('[data-tool]'))
      b.classList.toggle('active', b.dataset.tool === mode);
    this.paint();
  }
  private focus(): void {
    const mesh = this.meshes.get(this.selected);
    if (!mesh) return;
    this.remember();
    const offset = this.camera.position.clone().sub(this.orbit.target);
    this.orbit.target.copy(mesh.position);
    this.camera.position.copy(mesh.position).add(offset);
    this.orbit.update();
  }
  private paint(): void {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
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
    };
  }
  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
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
    this.renderer.forceContextLoss();
  }
}
