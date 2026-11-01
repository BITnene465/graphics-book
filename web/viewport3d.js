import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { TransformControls } from "./vendor/TransformControls.js";

// Browser interaction preview. Python remains the source of image formation.
// Backend triangle positions and vertex colors are world-space / linear RGB.
const DEG = Math.PI / 180;
const SUPPORTED = new Set([
  "03",
  "05",
  "06",
  "07",
  "09",
  "10",
  "12",
  "13",
  "14",
  "15",
]);
const SCALE_KEYS = { "06": ["sx", "sy", "sz"], 10: ["a", "b", "c"] };
const LIMITS = {
  15: { fov: [15, 110] },
  14: { radius: [0.2, 2], fov: [15, 110] },
  13: {
    light_x: [-10, 10],
    light_y: [-10, 10],
    light_z: [-10, 10],
    fov: [15, 110],
  },
  "03": {
    yaw: [-180, 180],
    pitch: [-85, 85],
    distance: [1, 20],
    fov: [15, 110, 1],
  },
  "06": {
    sx: [0.25, 2.5],
    sy: [0.25, 2.5],
    sz: [0.25, 2.5],
    light_x: [-10, 10],
    light_y: [-10, 10],
    light_z: [3, 12],
  },
  "07": { tilt: [0, 75, 1], rotation: [-180, 180, 1] },
  "09": { light_x: [-10, 10], light_y: [1, 12], light_z: [-10, 10] },
  10: { a: [0.2, 3], b: [0.2, 3], c: [0.2, 3], fov: [15, 110] },
  12: {
    light_x: [-10, 10],
    light_y: [2, 12],
    light_z: [-10, 10],
    fov: [15, 110],
    sphere_a_radius: [0.15, 2],
    sphere_b_radius: [0.15, 2],
  },
};
const sameArray = (a, b) =>
  a === b ||
  (!!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]));
const finite3 = (value) =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const wrapDegrees = (angle) => ((((angle + 180) % 360) + 360) % 360) - 180;

function boxCorners(box) {
  const points = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z])
        points.push(new THREE.Vector3(x, y, z));
  return points;
}

function disposeTree(object) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  object.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
    }
  });
  textures.forEach((value) => value.dispose());
  materials.forEach((value) => value.dispose());
  geometries.forEach((value) => value.dispose());
  object.clear();
}

function line(
  points,
  color,
  { dashed = false, opacity = 1, overlay = false } = {},
) {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map((p) => new THREE.Vector3(...p)),
  );
  const options = {
    color,
    transparent: opacity < 1,
    opacity,
    depthTest: !overlay,
  };
  const material = dashed
    ? new THREE.LineDashedMaterial({
        ...options,
        dashSize: 0.12,
        gapSize: 0.07,
      })
    : new THREE.LineBasicMaterial(options);
  const object = new THREE.Line(geometry, material);
  if (dashed) object.computeLineDistances();
  object.renderOrder = overlay ? 5 : 0;
  return object;
}

export class Viewport3D {
  constructor(
    container,
    { onChange = () => {}, onSelect = () => {}, onStatus = () => {} } = {},
  ) {
    this.container = container;
    this.onChange = onChange;
    this.onSelect = onSelect;
    this.onStatus = onStatus;
    this.chapter = null;
    this.params = {};
    this.tool = "orbit";
    this.viewMode = "space";
    this.display = {
      grid: false,
      wireframe: false,
      normals: false,
      frustum: false,
      controlNet: true,
    };
    this._observerTarget = new THREE.Vector3();
    this._disposed = false;
    this._frame = null;
    this._listeners = [];
    this._entries = new Map();
    this._drag = null;
    this._generation = 0;
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "low-power",
      });
    } catch (error) {
      this._failed = true;
      this._fallback = document.createElement("div");
      this._fallback.setAttribute("role", "status");
      this._fallback.textContent =
        "三维视口需要 WebGL 2。Python 成像仍可使用。";
      container.appendChild(this._fallback);
      onStatus(this._fallback.textContent);
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.canvas = this.renderer.domElement;
    Object.assign(this.canvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
      touchAction: "none",
      outline: "none",
    });
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute(
      "aria-label",
      "三维场景：拖动旋转，Shift 拖动平移，滚轮缩放；点击选择物体",
    );
    if (getComputedStyle(container).position === "static")
      container.style.position = "relative";
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x10171e);
    this.observer = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
    this.observer.position.set(7, 5, 8);
    this._configureOrbit(this.observer, this._observerTarget);
    this.transform = new TransformControls(this.observer, this.canvas);
    this.transform.setColors(0xf29488, 0x8ee2b3, 0x84baff, 0xffdb88);
    this.scene.add(this.transform.getHelper());
    this.transform.addEventListener("change", () => this._requestRender());
    this.transform.addEventListener("dragging-changed", (event) => {
      this.orbit.enabled =
        !event.value && (this.viewMode !== "camera" || this.cameraEditable);
    });
    this.transform.addEventListener("mouseDown", () => this._beginDrag());
    this.transform.addEventListener("objectChange", () =>
      this._transformChanged(),
    );
    this.transform.addEventListener("mouseUp", () => this._endDrag());

    this.world = new THREE.Group();
    this.annotations = new THREE.Group();
    this.cameraRig = new THREE.Group();
    this.cameraPose = new THREE.Group();
    this.cameraRig.add(this.cameraPose);
    this.fovHandle = new THREE.Object3D();
    this.lightHandle = new THREE.Group();
    this.scene.add(
      this.world,
      this.annotations,
      this.cameraRig,
      this.fovHandle,
      this.lightHandle,
    );
    this.scene.add(new THREE.HemisphereLight(0xdbefff, 0x39433b, 1.2));
    this.fillLight = new THREE.DirectionalLight(0xdcecff, 1.5);
    this.fillLight.position.set(4, 7, 5);
    this.scene.add(this.fillLight);
    this.pointLight = new THREE.PointLight(0xffeed5, 30, 0, 2);
    this.directionalLight = new THREE.DirectionalLight(0xfff1de, 2);
    this.scene.add(
      this.pointLight,
      this.directionalLight,
      this.directionalLight.target,
    );
    this.pointLight.visible = this.directionalLight.visible = false;

    this.selection = new THREE.Box3Helper(new THREE.Box3(), 0x79dbc3);
    this.selection.visible = false;
    this.selection.material.depthTest = false;
    this.selection.renderOrder = 8;
    this.scene.add(this.selection);
    this.raycaster = new THREE.Raycaster();
    this._buildMarkers();
    this._buildGrid(
      new THREE.Box3(new THREE.Vector3(-2, -1, -2), new THREE.Vector3(2, 1, 2)),
    );

    this._listen(
      this.canvas,
      "pointerdown",
      (event) => this._surfaceDown(event),
      { capture: true },
    );
    this._listen(
      this.canvas,
      "pointermove",
      (event) => this._surfaceMove(event),
      { capture: true },
    );
    this._listen(this.canvas, "pointerup", (event) => this._surfaceUp(event), {
      capture: true,
    });
    this._listen(this.canvas, "pointercancel", () => {
      this._viewGesture = null;
      this.transform.enabled = true;
      this._cancelDrag();
      this._cancelCameraEdit();
    });
    this._listen(this.canvas, "pointerdown", (event) => {
      this.canvas.focus({ preventScroll: true });
      this._pointer = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
        transform: !!this.transform.axis,
      };
    });
    this._listen(this.canvas, "pointerup", (event) => {
      const start = this._pointer;
      this._pointer = null;
      if (
        !start ||
        event.pointerId !== start.id ||
        start.transform ||
        this._drag ||
        this.transform.dragging ||
        event.button !== 0
      )
        return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5)
        this._pick(event);
    });
    this._listen(this.canvas, "dblclick", (event) => {
      const hit = this._intersect(event);
      if (hit) this._frameObject(hit.object);
      else this.resetView();
    });
    this._listen(this.canvas, "keydown", (event) => {
      const key = event.key.toLowerCase();
      if (["w", "e", "r"].includes(key)) {
        this.setTool({ w: "translate", e: "rotate", r: "scale" }[key]);
        event.preventDefault();
        event.stopPropagation();
      }
      if (key === "f") {
        this._selected
          ? this._frameObject(this._selected.object)
          : this.resetView();
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.key === "Escape") {
        this._drag
          ? this._cancelDrag()
          : this._cameraEdit
            ? this._cancelCameraEdit()
            : this._select(null, true, false);
        event.preventDefault();
        event.stopPropagation();
      }
    });
    this._listen(
      this.canvas,
      "wheel",
      (event) => {
        this._orbitWheel = true;
        this._wheelFov(event);
      },
      { passive: false, capture: true },
    );
    this._listen(this.canvas, "webglcontextlost", (event) => {
      event.preventDefault();
      this._contextLost = true;
      this.onStatus("三维绘图上下文暂时中断，等待恢复；Python 成像不受影响。");
    });
    this._listen(this.canvas, "webglcontextrestored", () => {
      this._contextLost = false;
      this._requestRender();
      this._toolStatus();
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  _listen(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    this._listeners.push(() =>
      target.removeEventListener(type, callback, options),
    );
  }

  _requestRender() {
    if (
      this._disposed ||
      this._failed ||
      this._contextLost ||
      this._frame !== null
    )
      return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      if (!this._width || !this._height || this._disposed) return;
      this._updateControlNet();
      this._sizeControlPoints();
      this.scene.updateMatrixWorld(true);
      if (this._selected) {
        this.selection.box.setFromObject(
          this._selected.mesh || this._selected.object,
        );
        this.selection.visible =
          this._selected.kind !== "control" && !this.selection.box.isEmpty();
      }
      this._updateFrustum();
      this.renderer.render(this.scene, this.activeCamera);
    });
  }

  setChapter(chapter, params = {}, result = null) {
    if (this._failed || this._disposed) return;
    this._cancelDrag(false);
    clearTimeout(this._cameraTimer);
    this._cameraEdit = null;
    clearTimeout(this._fovTimer);
    this._fovTimer = null;
    this.chapterSpec = typeof chapter === "object" ? chapter : null;
    this.chapter = String(this.chapterSpec?.id ?? chapter).padStart(2, "0");
    this.params = { ...(this.chapterSpec?.defaults || {}), ...params };
    this._source = null;
    this._observerFitted = false;
    this._bounds = null;
    this._selected = null;
    this.tool = "orbit";
    this._generation++;
    this._rayStep = null;
    this.transform.detach();
    this.selection.visible = false;
    disposeTree(this.world);
    disposeTree(this.annotations);
    this._meshEntries = [];
    this._controlEntries = [];
    this._controlNet = null;
    this._entries.clear();
    this.cameraRig.visible = this.lightHandle.visible = false;
    if (this.cameraHelper) this.cameraHelper.visible = false;
    if (this.lightCameraHelper) this.lightCameraHelper.visible = false;
    if (result?.geometry) this.update(params, result);
    else
      this.onStatus(
        SUPPORTED.has(this.chapter)
          ? "等待 Python 场景几何…"
          : "本章使用二维画布。",
      );
    this.resetView();
  }

  update(params = {}, result = null) {
    if (
      this._failed ||
      this._disposed ||
      (result?.chapter && result.chapter !== this.chapter)
    )
      return;
    // Surface-control objects survive tessellation rebuilds. The mesh may update
    // during their drag; the active gizmo must keep its original object reference.
    const controlDrag = this._drag && this._selected?.kind === "control";
    if ((this._drag && !controlDrag) || this._cameraEdit) return;
    this.params = { ...this.params, ...params };
    if (!result?.geometry) {
      this._requestRender();
      return;
    }
    const geometry = result.geometry;
    if (
      !Array.isArray(geometry.positions) ||
      geometry.positions.length % 9 ||
      !geometry.positions.every(Number.isFinite)
    ) {
      this.onStatus("场景三角形数据无效。");
      return;
    }
    const selectedId = this._selected?.id;
    const sourceParams = result.params || this.params;
    const firstResult = !this._source;
    const changed =
      !this._source ||
      !sameArray(geometry.positions, this._source.positions) ||
      !sameArray(geometry.colors, this._source.colors) ||
      !sameArray(geometry.normals, this._source.normals) ||
      !sameArray(geometry.uv, this._source.uv) ||
      geometry.texture !== this._source.texture;
    if (changed) this._buildGeometry(geometry, sourceParams);
    else for (const entry of this._meshEntries) this._restorePose(entry.object);
    for (const entry of this._meshEntries) {
      entry.meta =
        geometry.objects?.find((object) => object.id === entry.id) ||
        entry.meta;
      if (entry.meta.material && entry.mesh.material.isMeshStandardMaterial) {
        entry.mesh.material.roughness =
          1 - 0.8 * (entry.meta.material.reflectivity ?? 0);
        entry.mesh.material.metalness =
          0.35 * (entry.meta.material.reflectivity ?? 0);
      }
    }
    this._source = geometry;
    this._syncControlPoints(geometry);
    this._syncCamera(geometry);
    this._syncLight(geometry);
    this._drawProbe(result.probe, geometry);
    this._previewParams(geometry, sourceParams);
    this._setTextureFilter();
    const defaultId =
      this._meshEntries.find((entry) =>
        Object.values(entry.meta?.edit || {}).some(Boolean),
      )?.id || this._meshEntries[0]?.id;
    if (!controlDrag)
      this._select(
        selectedId && this._entries.has(selectedId) ? selectedId : defaultId,
        !selectedId || !this._entries.has(selectedId),
        !selectedId,
      );
    if (firstResult) this.resetView();
    this._requestRender();
  }

  _buildGeometry(source, sourceParams = this.params) {
    if (this._selected?.kind !== "control") this.transform.detach();
    for (const entry of this._meshEntries || []) {
      this.world.remove(entry.object);
      disposeTree(entry.object);
      this._entries.delete(entry.id);
    }
    this._generation++;
    this._meshEntries = [];
    const count = source.positions.length / 9;
    let parts;
    if (source.objects?.some((object) => object.count > 0))
      parts = source.objects
        .filter((object) => object.count > 0)
        .map((object) => [object.start, object.count, object.id, object.label]);
    else if (this.chapter === "03")
      parts = [
        [0, 12, "cube-a", "立方体 A"],
        [12, count - 12, "cube-b", "立方体 B"],
      ];
    else if (this.chapter === "05")
      parts = [
        [0, 1, "triangle-a", "斜面 A"],
        [1, 1, "triangle-b", "斜面 B"],
      ];
    else if (this.chapter === "09")
      parts = [
        [0, 2, "ground", "地面"],
        [2, count - 2, "pillar", "立方柱"],
      ];
    else if (this.chapter === "12") {
      const sphereCount = (count - 2) / 2;
      parts = [
        [0, 2, "ground", "有限地面"],
        [2, sphereCount, "sphere-a", "解析球 A · 预览网格"],
        [2 + sphereCount, sphereCount, "sphere-b", "解析球 B · 预览网格"],
      ];
    } else
      parts = [
        [0, count, "surface", this.chapter === "07" ? "纹理平面" : "椭球"],
      ];
    for (const [start, length, id, label] of parts) {
      if (length <= 0) continue;
      const buffer = new THREE.BufferGeometry();
      buffer.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          source.positions.slice(start * 9, (start + length) * 9),
          3,
        ),
      );
      const colors = source.colors?.slice(start * 9, (start + length) * 9);
      if (colors?.length === length * 9)
        buffer.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(colors, 3),
        );
      if (source.uv?.length === count * 6)
        buffer.setAttribute(
          "uv",
          new THREE.Float32BufferAttribute(
            source.uv.slice(start * 6, (start + length) * 6),
            2,
          ),
        );
      const hasNormals =
        source.normals?.length === source.positions.length &&
        source.normals.every(Number.isFinite);
      if (hasNormals)
        buffer.setAttribute(
          "normal",
          new THREE.Float32BufferAttribute(
            source.normals.slice(start * 9, (start + length) * 9),
            3,
          ),
        );
      const group = new THREE.Group();
      const meta = source.objects?.find((object) => object.id === id) || {
        id,
        label,
        edit: {},
        params: {},
      };
      if (finite3(meta.position)) group.position.fromArray(meta.position);
      if (finite3(meta.rotation)) group.rotation.set(...meta.rotation, "XYZ");
      if (finite3(meta.scale)) group.scale.fromArray(meta.scale);
      group.updateMatrix();
      buffer.applyMatrix4(group.matrix.clone().invert());
      if (!hasNormals) buffer.computeVertexNormals();
      const smoothSphere =
        (this.chapter === "12" && id.startsWith("sphere-")) ||
        meta.shape === "sphere";
      if (smoothSphere && !hasNormals) {
        const position = buffer.getAttribute("position"),
          normal = buffer.getAttribute("normal");
        for (let i = 0; i < position.count; i++) {
          const radial = new THREE.Vector3()
            .fromBufferAttribute(position, i)
            .normalize();
          normal.setXYZ(i, radial.x, radial.y, radial.z);
        }
      }
      const material =
        source.texture && this.chapter === "07"
          ? new THREE.MeshBasicMaterial({
              color: 0xffffff,
              side: THREE.DoubleSide,
            })
          : new THREE.MeshStandardMaterial({
              color: 0xffffff,
              vertexColors: !!buffer.getAttribute("color"),
              roughness: 0.58,
              metalness: 0.03,
              flatShading: !smoothSphere && !hasNormals,
              side: THREE.DoubleSide,
            });
      if (meta.material && material.isMeshStandardMaterial) {
        material.roughness = 1 - 0.8 * (meta.material.reflectivity ?? 0);
        material.metalness = 0.35 * (meta.material.reflectivity ?? 0);
      }
      material.polygonOffset = true;
      material.polygonOffsetFactor = 1;
      material.polygonOffsetUnits = 1;
      const mesh = new THREE.Mesh(buffer, material);
      group.add(mesh);
      const edgeGeometry = new THREE.WireframeGeometry(buffer);
      const edges = new THREE.LineSegments(
        edgeGeometry,
        new THREE.LineBasicMaterial({
          color: 0x92bcc8,
          transparent: true,
          opacity: 0.42,
        }),
      );
      edges.visible = this.display.wireframe;
      group.add(edges);
      // Sparse vertex normals explain orientation without obscuring the surface.
      const normalLines = [],
        positions = buffer.getAttribute("position"),
        normals = buffer.getAttribute("normal");
      const stride = Math.max(3, Math.ceil(positions.count / 120 / 3) * 3);
      const size =
        new THREE.Box3()
          .setFromBufferAttribute(positions)
          .getSize(new THREE.Vector3())
          .length() * 0.045;
      for (let i = 0; i < positions.count; i += stride) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, i),
          normal = new THREE.Vector3().fromBufferAttribute(normals, i);
        normalLines.push(
          ...point.toArray(),
          ...point.clone().addScaledVector(normal, size).toArray(),
        );
      }
      const normalGeometry = new THREE.BufferGeometry();
      normalGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(normalLines, 3),
      );
      const normalHelper = new THREE.LineSegments(
        normalGeometry,
        new THREE.LineBasicMaterial({
          color: 0xe5c878,
          transparent: true,
          opacity: 0.8,
        }),
      );
      normalHelper.visible = this.display.normals;
      group.add(normalHelper);
      group.userData.initialPose = {
        position: group.position.clone(),
        quaternion: group.quaternion.clone(),
        scale: group.scale.clone(),
      };
      const entry = {
        id,
        label,
        kind: "mesh",
        object: group,
        mesh,
        meta,
        edges,
        normalHelper,
      };
      group.userData.entry = entry;
      this._entries.set(id, entry);
      this._meshEntries.push(entry);
      this.world.add(group);
      if (this.display.normals) this._updateNormals(entry);
      if (source.texture && this.chapter === "07") {
        const generation = this._generation;
        const texture = new THREE.TextureLoader().load(
          source.texture,
          (loaded) => {
            if (this._disposed || generation !== this._generation) {
              loaded.dispose();
              return;
            }
            this._setTextureFilter();
            this._requestRender();
          },
          undefined,
          () => {
            if (!this._disposed && generation === this._generation)
              this.onStatus("纹理预览载入失败；Python 图像仍可检查。");
          },
        );
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false;
        material.map = texture;
      }
    }
    this.world.updateMatrixWorld(true);
    this._bounds = new THREE.Box3().setFromObject(this.world);
    this._buildGrid(this._bounds);
  }

  _syncControlPoints(source) {
    const controls = (source.objects || []).filter(
      (meta) => meta.kind === "control" && finite3(meta.position),
    );
    if (!controls.length && !this._controlEntries.length) return;
    const ids = new Set(controls.map((meta) => meta.id));
    for (const entry of this._controlEntries || []) {
      if (ids.has(entry.id)) continue;
      this.world.remove(entry.object);
      disposeTree(entry.object);
      this._entries.delete(entry.id);
    }
    this._controlEntries = controls.map((meta) => {
      let entry = this._entries.get(meta.id);
      if (!entry) {
        const object = new THREE.Group();
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(1, 12, 8),
          new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false }),
        );
        object.add(marker);
        entry = { id: meta.id, kind: "control", object, marker };
        object.userData.entry = entry;
        this.world.add(object);
        this._entries.set(meta.id, entry);
      }
      entry.meta = meta;
      entry.label = meta.label;
      if (this._drag?.object !== entry.object)
        entry.object.position.fromArray(meta.position);
      return entry;
    });
    this._controlEdges = (source.controlNet?.edges || []).filter(
      (edge) => edge.length === 2 && edge.every((id) => ids.has(id)),
    );
    if (!this._controlNet) {
      this._controlNet = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: 0x8eb5c9,
          transparent: true,
          opacity: 0.48,
          depthTest: false,
          depthWrite: false,
        }),
      );
      this._controlNet.renderOrder = 7;
      this.world.add(this._controlNet);
    }
    const length = this._controlEdges.length * 6;
    if (
      this._controlNet.geometry.getAttribute("position")?.array.length !==
      length
    )
      this._controlNet.geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(new Float32Array(length), 3),
      );
    this._controlNet.visible = this.display.controlNet;
    for (const entry of this._controlEntries)
      entry.object.visible = this.display.controlNet;
    this._updateControlNet();
  }

  _updateControlNet() {
    if (!this._controlNet) return;
    const positions = this._controlNet.geometry.getAttribute("position");
    let index = 0;
    for (const edge of this._controlEdges || [])
      for (const id of edge) {
        const point = this._entries.get(id)?.object.position;
        if (point) positions.setXYZ(index++, point.x, point.y, point.z);
      }
    positions.needsUpdate = true;
    this._controlNet.geometry.computeBoundingSphere();
  }

  _sizeControlPoints() {
    if (!this._height) return;
    const camera = this.activeCamera;
    camera.updateMatrixWorld(true);
    for (const entry of this._controlEntries || []) {
      const selected = entry.id === this._selected?.id;
      const editable = !!entry.meta.edit?.translate;
      const depth = -entry.object.position
        .clone()
        .applyMatrix4(camera.matrixWorldInverse).z;
      const worldPerPixel = camera.isPerspectiveCamera
        ? (2 *
            Math.max(camera.near, depth) *
            Math.tan((camera.fov * DEG) / 2)) /
          this._height
        : (camera.top - camera.bottom) / camera.zoom / this._height;
      entry.marker.scale.setScalar(worldPerPixel * (selected ? 6.5 : 4.5));
      entry.marker.material.color.setHex(
        selected ? 0xffdc80 : editable ? 0x9ccce2 : 0x718592,
      );
      entry.marker.renderOrder = selected ? 11 : editable ? 10 : 9;
    }
  }

  _pickControl(uv, camera) {
    if (
      !this.display.controlNet ||
      this._imageActive ||
      camera === this.renderCamera
    )
      return null;
    const radius = matchMedia("(any-pointer: coarse)").matches ? 22 : 12;
    let best = null;
    for (const entry of this._controlEntries || []) {
      const ndc = entry.object.position.clone().project(camera);
      if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || Math.abs(ndc.z) > 1)
        continue;
      const distance = Math.hypot(
        ((ndc.x + 1) / 2 - uv[0]) * this._width,
        ((ndc.y + 1) / 2 - uv[1]) * this._height,
      );
      if (distance > radius) continue;
      const editable = !!entry.meta.edit?.translate;
      if (
        best &&
        (distance > best.distance + 0.5 ||
          (Math.abs(distance - best.distance) <= 0.5 &&
            best.editable &&
            !editable))
      )
        continue;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(new THREE.Vector3()),
        entry.object.position,
      );
      const point = this.raycaster.ray.intersectPlane(
        plane,
        new THREE.Vector3(),
      );
      if (point) best = { entry, hit: { point }, distance, editable };
    }
    return best;
  }

  _restorePose(object) {
    const pose = object.userData.initialPose;
    if (!pose) return;
    object.position.copy(pose.position);
    object.quaternion.copy(pose.quaternion);
    object.scale.copy(pose.scale);
  }

  _cameraFromParams(source, params = this.params) {
    if (!["03", "10", "12", "13", "14", "15"].includes(this.chapter))
      return source;
    const pivot = new THREE.Vector3(...(params.camera_target || [0, 0, 0]));
    const yaw = (params.yaw ?? 35) * DEG,
      pitch = (params.pitch ?? 20) * DEG,
      distance = params.distance ?? 6;
    const eye = pivot
      .clone()
      .add(
        new THREE.Vector3(
          Math.cos(pitch) * Math.sin(yaw),
          Math.sin(pitch),
          Math.cos(pitch) * Math.cos(yaw),
        ).multiplyScalar(distance),
      );
    const base = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(eye, pivot, new THREE.Vector3(0, 1, 0)),
    );
    const offset = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        ...(params.camera_rotation || [0, 0, 0]).map((x) => x * DEG),
        "XYZ",
      ),
    );
    const rotation = base.multiply(offset),
      target = eye
        .clone()
        .add(new THREE.Vector3(0, 0, -distance).applyQuaternion(rotation));
    return {
      ...source,
      projection: params.projection ?? source.projection,
      near: params.near ?? source.near,
      far: params.far ?? source.far,
      camera: {
        ...source.camera,
        eye: eye.toArray(),
        target: target.toArray(),
        up: new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).toArray(),
        orbitTarget: pivot.toArray(),
        fov: params.fov ?? source.camera.fov,
      },
    };
  }

  _previewParams(source, baseline) {
    const pending = Object.keys(this.params).some(
      (key) =>
        // Resolution and request mode do not invalidate a world-space path.
        !["probe", "size", "preview"].includes(key) &&
        JSON.stringify(this.params[key]) !== JSON.stringify(baseline[key]),
    );
    this.annotations.visible = !pending;
    const read = (binding, fallback) =>
      Array.isArray(binding)
        ? binding.map((key, i) => this.params[key] ?? fallback[i])
        : (this.params[binding] ?? fallback);
    for (const entry of this._meshEntries) {
      const { object, meta } = entry,
        keys = meta.params || {};
      if (keys.position)
        object.position.fromArray(read(keys.position, meta.position));
      if (keys.scale) {
        const scale = read(keys.scale, meta.scale);
        object.scale.fromArray(
          Array.isArray(scale) ? scale : [scale, scale, scale],
        );
      }
      if (keys.rotation) {
        const rotation = read(keys.rotation, [0, 0, 0]);
        object.rotation.set(...rotation.map((x) => x * DEG), "XYZ");
        if (meta.rotationOffset) {
          const legacy = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
              -(this.params.tilt ?? 55) * DEG,
              0,
              (this.params.rotation ?? 0) * DEG,
              "ZXY",
            ),
          );
          object.quaternion.multiply(legacy);
        }
      }
      if (this.display.normals) this._updateNormals(entry);
    }
    for (const entry of this._controlEntries || []) {
      const value = this.params[entry.meta.params?.position];
      if (entry.meta.edit?.translate && finite3(value))
        entry.object.position.fromArray(value);
    }
    this._updateControlNet();
    if (this.lightHandle.visible) {
      ["x", "y", "z"].forEach((axis) => {
        const value = this.params[`light_${axis}`];
        if (Number.isFinite(value)) this.lightHandle.position[axis] = value;
      });
      this._previewLight();
    }
    if (
      ["03", "10", "12", "13", "14", "15"].includes(this.chapter) &&
      source.camera
    )
      this._syncCamera(this._cameraFromParams(source));
    else if (this.chapter === "06") {
      const extent = Math.max(
        1.9,
        Math.max(this.params.sx ?? 1.3, this.params.sy ?? 0.85) * 1.2,
      );
      this._syncCamera({ ...source, orthoHeight: 2 * extent });
    }
  }

  _setTextureFilter() {
    for (const entry of this._meshEntries || []) {
      const texture = entry.mesh.material.map;
      if (!texture) continue;
      texture.minFilter = texture.magFilter =
        this.params.filter === "nearest"
          ? THREE.NearestFilter
          : THREE.LinearFilter;
      texture.needsUpdate = true;
    }
  }

  _buildGrid(bounds) {
    if (this.grid) {
      this.scene.remove(this.grid, this.axes);
      disposeTree(this.grid);
      disposeTree(this.axes);
    }
    const size = bounds.isEmpty()
      ? 10
      : Math.max(
          6,
          Math.ceil(bounds.getSize(new THREE.Vector3()).length() / 2) * 2,
        );
    this.grid = new THREE.GridHelper(
      size,
      Math.min(40, size * 2),
      0x354550,
      0x25323c,
    );
    this.grid.position.y = ["09", "12"].includes(this.chapter)
      ? -0.015
      : bounds.isEmpty()
        ? -1
        : bounds.min.y - 0.025;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.55;
    this.axes = new THREE.AxesHelper(Math.min(2, size / 5));
    this.axes.setColors(0xcf7769, 0x76baa0, 0x79a9ce);
    this.grid.visible = this.axes.visible = this.display.grid;
    this.scene.add(this.grid, this.axes);
  }

  _buildMarkers() {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.17, 0.18),
      new THREE.MeshBasicMaterial({ color: 0x6ab4d5 }),
    );
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.055, 0.13, 12),
      new THREE.MeshBasicMaterial({ color: 0xa9deef }),
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.13;
    this.cameraMarker = new THREE.Group();
    this.cameraMarker.add(body, lens);
    this.cameraPose.add(this.cameraMarker);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.105, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffce7a }),
    );
    this.lightHandle.add(bulb);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.19, 0.008, 4, 36),
        new THREE.MeshBasicMaterial({ color: 0xdaa961 }),
      );
      if (i === 1) ring.rotation.x = Math.PI / 2;
      if (i === 2) ring.rotation.y = Math.PI / 2;
      this.lightHandle.add(ring);
    }
  }

  _syncCamera(source) {
    const camera = source.camera || {};
    if (!finite3(camera.eye) || !finite3(camera.target)) {
      this.cameraRig.visible = false;
      return;
    }
    const orthographic = source.projection === "orthographic";
    if (
      !this.renderCamera ||
      this.renderCamera.isOrthographicCamera !== orthographic
    ) {
      if (this.renderCamera) this.cameraPose.remove(this.renderCamera);
      if (this.cameraHelper) {
        this.scene.remove(this.cameraHelper);
        this.cameraHelper.dispose();
      }
      this.renderCamera = orthographic
        ? new THREE.OrthographicCamera(-2, 2, 2, -2, 0.05, 40)
        : new THREE.PerspectiveCamera(48, 1, 0.05, 40);
      this.cameraPose.add(this.renderCamera);
      this.frustumCamera = this.renderCamera.clone();
      this.cameraHelper = new THREE.CameraHelper(this.frustumCamera);
      this.cameraHelper.material.transparent = true;
      this.cameraHelper.material.opacity = 0.52;
      // CameraHelper (unlike TransformControls) requires Color instances.
      this.cameraHelper.setColors(
        ...[0x73a9c3, 0x96d7df, 0xe2cc91, 0x7cb9c7, 0x527c92].map(
          (value) => new THREE.Color(value),
        ),
      );
      this.scene.add(this.cameraHelper);
    }
    this._cameraTarget = new THREE.Vector3(...camera.target);
    const eye = new THREE.Vector3(...camera.eye);
    const up = finite3(camera.up)
      ? new THREE.Vector3(...camera.up)
      : new THREE.Vector3(0, 1, 0);
    this.cameraRig.position.set(0, 0, 0);
    this.cameraRig.quaternion.identity();
    this.cameraRig.scale.setScalar(1);
    this.cameraPose.position.copy(eye);
    this.cameraPose.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().lookAt(eye, this._cameraTarget, up),
    );
    this.cameraPose.scale.setScalar(1);
    this.cameraMarker.scale.setScalar(this.chapter === "03" ? 1.25 : 1);
    const clipRange = {
      "05": [1, 10],
      "07": [0.2, 10],
      "09": [0.3, 25],
      10: [0.05, 100],
    }[this.chapter] || [0.05, 25];
    this.renderCamera.near = source.near ?? clipRange[0];
    this.renderCamera.far = source.far ?? clipRange[1];
    if (orthographic) {
      const half = (source.orthoHeight ?? 4) / 2;
      Object.assign(this.renderCamera, {
        left: -half,
        right: half,
        top: half,
        bottom: -half,
      });
    } else this.renderCamera.fov = camera.fov ?? 48;
    this.renderCamera.updateProjectionMatrix();
    this.fovHandle.position.copy(eye);
    this.fovHandle.quaternion.copy(this.cameraPose.quaternion);
    this.fovHandle.scale.setScalar(1);
    this.cameraRig.visible = this.viewMode === "space";
    this.cameraHelper.visible =
      this.viewMode === "space" && this.display.frustum;
    const meta = source.objects?.find((object) => object.id === "camera") || {
      edit: {},
      params: {},
    };
    const entry = {
      id: "camera",
      label: "Python 渲染相机",
      kind: "camera",
      object: this.cameraPose,
      meta,
    };
    this.cameraMarker.userData.entry = entry;
    this._entries.set(entry.id, entry);
    if (this.viewMode === "camera") this._syncViewCamera();
  }

  _updateFrustum() {
    if (!this.cameraHelper || !this.renderCamera) return;
    this.frustumCamera.copy(this.renderCamera, false);
    if (this.chapter === "03") {
      const bounds = new THREE.Box3().setFromObject(this.world);
      const radius = bounds.isEmpty()
        ? 2
        : bounds.getBoundingSphere(new THREE.Sphere()).radius;
      const distance = this.renderCamera
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(this._cameraTarget);
      // The helper displays the scene-local portion, never changes Python's
      // real near/far planes, and is never included in the default framing.
      this.frustumCamera.far = Math.min(
        this.renderCamera.far,
        Math.max(this.renderCamera.near + 0.01, distance + radius * 0.7),
      );
      this.frustumCamera.updateProjectionMatrix();
    }
    this.cameraHelper.update();
  }

  _syncLight(source) {
    const position = source.light?.position;
    this.lightHandle.visible = finite3(position);
    this.pointLight.visible = this.lightHandle.visible && this.chapter !== "09";
    this.directionalLight.visible =
      this.lightHandle.visible && this.chapter === "09";
    this.fillLight.intensity = this.lightHandle.visible ? 0.45 : 1.5;
    if (!this.lightHandle.visible) {
      this._entries.delete("light");
      return;
    }
    if (this.chapter === "09" && !this.lightCamera) {
      this.lightCamera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 20);
      this.lightCameraHelper = new THREE.CameraHelper(this.lightCamera);
      this.lightCameraHelper.setColors(
        ...[0xd8b777, 0xf4d291, 0xffe8ac, 0xd0ae69, 0x9a8156].map(
          (value) => new THREE.Color(value),
        ),
      );
      this.lightCameraHelper.material.transparent = true;
      this.lightCameraHelper.material.opacity = 0.4;
      this.scene.add(this.lightCamera, this.lightCameraHelper);
    }
    if (this.lightCameraHelper)
      this.lightCameraHelper.visible =
        this.display.frustum &&
        this.viewMode === "space" &&
        this.chapter === "09";
    this.lightHandle.position.fromArray(position);
    this.lightHandle.quaternion.identity();
    this.lightHandle.scale.setScalar(1);
    this._previewLight();
    const meta = source.objects?.find((object) => object.id === "light") || {
      edit: { translate: true },
      params: { position: ["light_x", "light_y", "light_z"] },
    };
    const entry = {
      id: "light",
      label: this.chapter === "09" ? "平行光相机" : "点光源",
      kind: "light",
      object: this.lightHandle,
      meta,
    };
    this.lightHandle.userData.entry = entry;
    this._entries.set(entry.id, entry);
  }

  _previewLight() {
    this.pointLight.position.copy(this.lightHandle.position);
    this.pointLight.intensity =
      this.chapter === "06" ? (this.params.power ?? 40) : 2;
    this.pointLight.decay = this.chapter === "12" ? 0 : 2;
    this.directionalLight.position.copy(this.lightHandle.position);
    if (this.chapter === "09") {
      const target = new THREE.Vector3(
        ...(this.params.light_target || [0, 0, 0]),
      );
      this.directionalLight.target.position.copy(target);
      this.lightHandle.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().lookAt(
          this.lightHandle.position,
          target,
          new THREE.Vector3(0, 0, -1),
        ),
      );
      if (this.lightCamera) {
        this.lightCamera.position.copy(this.lightHandle.position);
        this.lightCamera.up.set(0, 0, -1);
        this.lightCamera.lookAt(target);
        this.lightCamera.updateMatrixWorld(true);
        this.lightCameraHelper.update();
      }
    }
  }

  _drawProbe(probe = {}, geometry = {}) {
    disposeTree(this.annotations);
    for (const segment of probe?.segments || []) {
      if (!finite3(segment.origin) || !finite3(segment.end)) continue;
      const group = new THREE.Group();
      group.userData.bounce = segment.bounce ?? 0;
      group.visible =
        this._rayStep == null || group.userData.bounce <= this._rayStep;
      this.annotations.add(group);
      const origin = new THREE.Vector3(...segment.origin);
      const delta = new THREE.Vector3(...segment.end).sub(origin);
      const length = delta.length();
      const color = segment.bounce ? 0xf2a25a : 0x9ee4bc;
      if (length > 1e-8) {
        const direction = delta.clone().normalize();
        // World-space tubes remain legible on Retina displays, where WebGL
        // line width is limited to one physical pixel. Built only per probe.
        const material = new THREE.MeshBasicMaterial({
          color,
          depthTest: false,
          depthWrite: false,
          transparent: true,
          opacity: 0.92,
        });
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.023, 0.023, length, 6),
          material,
        );
        shaft.position.copy(origin).addScaledVector(delta, 0.5);
        shaft.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction,
        );
        shaft.renderOrder = 6;
        const tip = new THREE.Mesh(
          new THREE.ConeGeometry(0.065, 0.19, 10),
          material,
        );
        tip.position.copy(origin).addScaledVector(delta, 0.6);
        tip.quaternion.copy(shaft.quaternion);
        tip.renderOrder = 7;
        group.add(shaft, tip);
      }
      if (segment.shadow?.length === 2 && segment.shadow.every(finite3)) {
        group.add(
          line(segment.shadow, 0x73c5ed, {
            dashed: true,
            opacity: 0.85,
            overlay: true,
          }),
        );
      }
      if (segment.owner >= 0) {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.042, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xffdb98, depthTest: false }),
        );
        dot.position.fromArray(segment.end);
        dot.renderOrder = 6;
        group.add(dot);
      }
    }
    const point = geometry.probe || probe?.world;
    if (finite3(point)) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd687, depthTest: false }),
      );
      dot.position.fromArray(point);
      this.annotations.add(dot);
      if (finite3(geometry.normal)) {
        const normal = new THREE.Vector3(...geometry.normal);
        if (normal.lengthSq())
          this.annotations.add(
            new THREE.ArrowHelper(
              normal.normalize(),
              dot.position,
              0.65,
              0xf4b765,
              0.13,
              0.075,
            ),
          );
      }
    }
  }

  setRayStep(index = null) {
    this._rayStep = Number.isInteger(index) && index >= 0 ? index : null;
    for (const object of this.annotations?.children || []) {
      object.visible =
        object.userData.bounce == null ||
        this._rayStep == null ||
        object.userData.bounce <= this._rayStep;
    }
    this._requestRender();
    return this._rayStep;
  }

  get cameraEditable() {
    return (
      ["03", "10", "12", "13", "14", "15"].includes(this.chapter) &&
      !!this._entries.get("camera")?.meta?.edit?.translate
    );
  }

  get interactionElement() {
    return this._imageActive ? this._imageElement : this.canvas;
  }

  // Input is attached to the actual Python image, never to an invisible canvas.
  // Both presentations share the same camera and object edit transactions.
  setImageSurface(element, active) {
    if (this._failed || this._disposed) return;
    if (this._imageElement !== element) {
      this._imageElement = element;
      this._listen(
        element,
        "pointerdown",
        (event) => {
          if (!this._imageActive) return;
          this.imageGestureMoved = false;
          this._imagePointer = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
          element.focus({ preventScroll: true });
          this._surfaceDown(event);
        },
        { capture: true },
      );
      this._listen(
        element,
        "pointermove",
        (event) => {
          if (!this._imageActive) return;
          const start = this._imagePointer;
          if (
            start?.id === event.pointerId &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3
          )
            this.imageGestureMoved = true;
          this._surfaceMove(event);
        },
        { capture: true },
      );
      this._listen(
        element,
        "pointerup",
        (event) => {
          if (!this._imageActive) return;
          this._imagePointer = null;
          this._surfaceUp(event);
        },
        { capture: true },
      );
      this._listen(element, "pointercancel", () => {
        if (this._imageActive) this._cancelImageGesture();
      });
      this._listen(element, "keydown", (event) => {
        if (
          event.key !== "Escape" ||
          !this._imageActive ||
          (!this._drag && !this._cameraEdit)
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        this._cancelImageGesture();
      });
      this._listen(
        element,
        "wheel",
        (event) => {
          if (!this._imageActive) return;
          this._orbitWheel = true;
          this._wheelFov(event);
        },
        { capture: true, passive: false },
      );
      // A click in reading mode must not inherit a previous drag's suppression.
      this._listen(element, "pointerdown", () => {
        if (!this._imageActive) this.imageGestureMoved = false;
      });
    }
    if (!!this._imageActive === !!active) return;
    this._cancelDrag();
    this._endCameraEdit();
    if (active) this._imagePreviousMode = this.viewMode;
    this._imageActive = !!active;
    this.imageGestureMoved = false;
    this._imagePointer = null;
    this.transform.axis = null;
    this.setViewMode(active ? "camera" : this._imagePreviousMode || "space");
    element.style.touchAction = active ? "none" : "pan-y";
    element.style.cursor = active ? "grab" : "crosshair";
    element.title = ["03", "10", "12", "13", "14", "15"].includes(this.chapter)
      ? "拖动表面移动物体；Alt 拖动旋转相机，Shift 平移，滚轮缩放；单击检查像素"
      : "本节使用固定成像相机；拖动表面编辑物体，进入空间视图自由观察；单击检查像素";
  }

  _cancelImageGesture() {
    const pointer = this._imagePointer;
    this._imagePointer = null;
    this._viewGesture = null;
    this.imageGestureMoved = true;
    this._cancelDrag();
    this._cancelCameraEdit();
    this.transform.enabled = true;
    // Discard OrbitControls' pointer state as well as the camera transaction.
    // Otherwise a late pointermove could reapply the cancelled gesture.
    const target = this.orbit.target.clone();
    this._configureOrbit(this.activeCamera, target);
    if (pointer && this._imageElement.hasPointerCapture(pointer.id))
      this._imageElement.releasePointerCapture(pointer.id);
  }

  _configureOrbit(camera, target) {
    this.orbit?.dispose();
    this.orbit = new OrbitControls(camera, this.interactionElement);
    this.orbit.target.copy(target);
    this.orbit.enableDamping = false;
    this.orbit.screenSpacePanning = true;
    const distanceControl = this.chapterSpec?.controls?.find(
      (item) => item.key === "distance",
    );
    this.orbit.minDistance =
      this.viewMode === "camera" ? (distanceControl?.min ?? 1) : 0.25;
    this.orbit.maxDistance =
      this.viewMode === "camera" ? (distanceControl?.max ?? 30) : 160;
    this.orbit.minPolarAngle = 5 * DEG;
    this.orbit.maxPolarAngle = 175 * DEG;
    // Orthographic height is fixed by these lessons' Python projection.
    this.orbit.enableZoom = !camera.isOrthographicCamera;
    this.orbit.addEventListener("start", () => {
      if (this.viewMode === "camera" && this.cameraEditable)
        this._beginCameraEdit();
    });
    this.orbit.addEventListener("change", () => {
      this._applyCameraRoll();
      if (!this._syncingCamera && this._cameraEdit) this._cameraChanged();
      this._requestRender();
    });
    this.orbit.addEventListener("end", () => {
      if (!this._cameraEdit) return;
      clearTimeout(this._cameraTimer);
      if (this._orbitWheel)
        this._cameraTimer = setTimeout(() => this._endCameraEdit(), 180);
      else this._endCameraEdit();
      this._orbitWheel = false;
    });
    this.orbit.update();
    this._applyCameraRoll();
    if (this.viewMode === "camera" && !this.cameraEditable)
      this.orbit.enabled = false;
  }

  setViewMode(mode) {
    if (this._failed || this._disposed || !["space", "camera"].includes(mode))
      return { mode: this.viewMode, editable: false };
    this._cancelDrag();
    this._endCameraEdit();
    if (this.viewMode === "space") this._observerTarget.copy(this.orbit.target);
    this.viewMode = mode;
    if (mode === "camera" && this.renderCamera) {
      if (this._source) this._syncCamera(this._cameraFromParams(this._source));
      this._syncViewCamera(true);
    } else this._configureOrbit(this.observer, this._observerTarget);
    this.transform.camera = this.activeCamera;
    this._attachTool();
    this.setDisplay(this.display);
    this.resize();
    if (mode === "space" && !this._observerFitted && this._source)
      this.resetView();
    this._toolStatus();
    return { mode, editable: this.cameraEditable };
  }

  _syncViewCamera(rebuild = false) {
    if (!this.renderCamera || this._cameraEdit) return;
    this._syncingCamera = true;
    this.scene.updateMatrixWorld(true);
    const changedType =
      !this.viewCamera ||
      this.viewCamera.isOrthographicCamera !==
        this.renderCamera.isOrthographicCamera;
    const previousUp = this.viewCamera?.up.clone();
    if (changedType) this.viewCamera = this.renderCamera.clone();
    this.viewCamera.copy(this.renderCamera, false);
    this.renderCamera.getWorldPosition(this.viewCamera.position);
    this.renderCamera.getWorldQuaternion(this.viewCamera.quaternion);
    const upright = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(
        this.viewCamera.position,
        this._cameraTarget,
        new THREE.Vector3(0, 1, 0),
      ),
    );
    const roll = new THREE.Euler().setFromQuaternion(
      upright.invert().multiply(this.viewCamera.quaternion),
      "XYZ",
    );
    this._viewRoll = roll.z;
    this.viewCamera.up.set(0, 1, 0);
    this.viewCamera.scale.setScalar(1);
    this.viewCamera.updateMatrixWorld(true);
    this.viewCamera.updateProjectionMatrix();
    if (
      changedType ||
      rebuild ||
      this.orbit.object !== this.viewCamera ||
      !previousUp?.equals(this.viewCamera.up)
    ) {
      this._configureOrbit(this.viewCamera, this._cameraTarget);
    } else {
      this.orbit.target.copy(this._cameraTarget);
      this.orbit.update();
      this._applyCameraRoll();
    }
    this.transform.camera = this.viewCamera;
    this._syncingCamera = false;
  }

  _applyCameraRoll() {
    if (this.viewMode !== "camera" || !this.viewCamera) return;
    // OrbitControls keeps world-up; retain the lens roll after its lookAt.
    this.viewCamera.lookAt(this.orbit.target);
    this.viewCamera.quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        this._viewRoll || 0,
      ),
    );
    this.viewCamera.updateMatrixWorld(true);
  }

  _beginCameraEdit() {
    if (this._syncingCamera || !this.cameraEditable || this._cameraEdit) return;
    clearTimeout(this._cameraTimer);
    this._cameraEdit = { params: structuredClone(this.params), patch: null };
    this.annotations.visible = false;
  }

  _cameraChanged() {
    if (!this._cameraEdit || this._syncingCamera) return;
    const target = this.orbit.target.clone().clampScalar(-10, 10);
    this.viewCamera.position.add(target.clone().sub(this.orbit.target));
    this.orbit.target.copy(target);
    let eye = this.viewCamera.position.clone();
    const offset = eye.clone().sub(target);
    const distance = this._bound("distance", offset.length());
    const yaw = this._bound(
      "yaw",
      wrapDegrees(Math.atan2(offset.x, offset.z) / DEG),
    );
    const pitch = this._bound(
      "pitch",
      Math.asin(THREE.MathUtils.clamp(offset.y / offset.length(), -1, 1)) / DEG,
    );
    this.viewCamera.position
      .copy(target)
      .add(
        new THREE.Vector3(
          Math.cos(pitch * DEG) * Math.sin(yaw * DEG),
          Math.sin(pitch * DEG),
          Math.cos(pitch * DEG) * Math.cos(yaw * DEG),
        ).multiplyScalar(distance),
      );
    eye = this.viewCamera.position.clone();
    this._applyCameraRoll();
    // Re-express the current world pose in Python's yaw/pitch + local-offset
    // convention. This preserves a pre-existing lens rotation, including roll.
    const basis = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(eye, target, new THREE.Vector3(0, 1, 0)),
    );
    const residual = basis.invert().multiply(this.viewCamera.quaternion);
    const euler = new THREE.Euler().setFromQuaternion(residual, "XYZ");
    const patch = {
      camera_target: target.toArray(),
      yaw,
      pitch,
      distance,
      camera_rotation: [euler.x, euler.y, euler.z].map((value) =>
        wrapDegrees(value / DEG),
      ),
    };
    this._cameraEdit.patch = patch;
    this.params = { ...this.params, ...patch };
    this.onChange(patch, { commit: false });
  }

  _endCameraEdit() {
    clearTimeout(this._cameraTimer);
    if (!this._cameraEdit) return;
    const patch = this._cameraEdit.patch;
    this._cameraEdit = null;
    if (patch) this.onChange(patch, { commit: true });
    else if (this._source) this._previewParams(this._source, this.params);
    this._requestRender();
  }

  _cancelCameraEdit() {
    clearTimeout(this._cameraTimer);
    if (!this._cameraEdit) return;
    const original = this._cameraEdit.params;
    const keys = Object.keys(this._cameraEdit.patch || {});
    this._cameraEdit = null;
    this.params = original;
    if (this._source)
      this._syncCamera(this._cameraFromParams(this._source, original));
    this._syncViewCamera(true);
    this.onChange(Object.fromEntries(keys.map((key) => [key, original[key]])), {
      commit: true,
      cancelled: true,
    });
    this._requestRender();
  }

  setDisplay(options = {}) {
    Object.assign(this.display, options);
    if (this.grid) this.grid.visible = this.display.grid;
    if (this.axes) this.axes.visible = this.display.grid;
    if (this.cameraRig)
      this.cameraRig.visible = this.viewMode === "space" && !!this.renderCamera;
    if (this.cameraHelper)
      this.cameraHelper.visible =
        this.viewMode === "space" && this.display.frustum;
    if (this.lightCameraHelper)
      this.lightCameraHelper.visible =
        this.viewMode === "space" &&
        this.display.frustum &&
        this.chapter === "09";
    if (this._controlNet) this._controlNet.visible = this.display.controlNet;
    for (const entry of this._controlEntries || [])
      entry.object.visible = this.display.controlNet;
    if (this._selected?.kind === "control") this._attachTool();
    for (const entry of this._meshEntries || []) {
      entry.edges.visible = this.display.wireframe;
      entry.normalHelper.visible = this.display.normals;
      if (this.display.normals) this._updateNormals(entry);
    }
    this._requestRender();
  }

  _updateNormals(entry) {
    entry.object.updateMatrixWorld(true);
    const positions = entry.mesh.geometry.getAttribute("position");
    const normals = entry.mesh.geometry.getAttribute("normal");
    const output = entry.normalHelper.geometry.getAttribute("position");
    const stride = Math.max(3, Math.ceil(positions.count / 120 / 3) * 3);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(
      entry.object.matrixWorld,
    );
    const inverse = new THREE.Matrix3()
      .setFromMatrix4(entry.object.matrixWorld)
      .invert();
    const size =
      new THREE.Box3()
        .setFromBufferAttribute(positions)
        .getSize(new THREE.Vector3())
        .length() * 0.045;
    let j = 0;
    for (let i = 0; i < positions.count; i += stride) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, i);
      const delta = new THREE.Vector3()
        .fromBufferAttribute(normals, i)
        .applyMatrix3(normalMatrix)
        .normalize()
        .applyMatrix3(inverse)
        .multiplyScalar(size);
      output.setXYZ(j++, point.x, point.y, point.z);
      point.add(delta);
      output.setXYZ(j++, point.x, point.y, point.z);
    }
    output.needsUpdate = true;
  }

  _surfaceDown(event) {
    this._orbitWheel = false;
    if (event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) {
      this._viewGesture = event.pointerId;
      this.transform.enabled = false;
      return;
    }
    if (event.button !== 0 || this.transform.dragging || this.transform.axis)
      return;
    const result = this._hits(this._eventUV(event));
    if (!result?.entry.meta?.edit?.translate || result.entry.kind === "camera")
      return;
    if (
      this._selected?.id === result.entry.id &&
      ["rotate", "scale"].includes(this.tool)
    )
      return;
    this._select(result.entry.id, true);
    this.tool = "translate";
    this._attachTool();
    this._beginDrag();
    if (!this._drag) return;
    const normal = this.activeCamera.getWorldDirection(new THREE.Vector3());
    this._drag.surface = {
      id: event.pointerId,
      element: this.interactionElement,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(
        normal,
        result.hit.point,
      ),
      anchor: result.hit.point.clone(),
    };
    this.orbit.enabled = false;
    this.transform.enabled = false;
    this.interactionElement.setPointerCapture(event.pointerId);
    this.interactionElement.focus({ preventScroll: true });
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  _surfaceMove(event) {
    const surface = this._drag?.surface;
    if (!surface) {
      const entry = this._intersect(event);
      this.interactionElement.style.cursor =
        !event.altKey && !event.shiftKey && entry?.meta?.edit?.translate
          ? "move"
          : this.orbit.enabled
            ? "grab"
            : "default";
      return;
    }
    if (surface.id !== event.pointerId) return;
    this.interactionElement.style.cursor = "grabbing";
    this._hits(this._eventUV(event)); // Updates the ray in the active camera.
    const hit = this.raycaster.ray.intersectPlane(
      surface.plane,
      new THREE.Vector3(),
    );
    if (hit) {
      this._drag.object.position
        .copy(this._drag.position)
        .add(hit.sub(surface.anchor));
      this._transformChanged();
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  _surfaceUp(event) {
    if (this._viewGesture === event.pointerId) {
      this._viewGesture = null;
      this.transform.enabled = true;
    }
    if (this._drag?.surface?.id !== event.pointerId) return;
    this._endDrag();
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  _releaseSurface() {
    const surface = this._drag?.surface;
    if (surface?.element.hasPointerCapture(surface.id))
      surface.element.releasePointerCapture(surface.id);
    this.transform.enabled = true;
  }

  get activeCamera() {
    return this.viewMode === "camera" && this.viewCamera
      ? this.viewCamera
      : this.observer;
  }

  _hits(uv, camera = this.activeCamera) {
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(
      new THREE.Vector2(uv[0] * 2 - 1, uv[1] * 2 - 1),
      camera,
    );
    const control = this._pickControl(uv, camera);
    if (control) return control;
    const objects = [...this._entries.values()]
      .filter(
        (entry) =>
          entry.kind !== "control" &&
          !(camera !== this.observer && entry.kind === "camera") &&
          !(camera === this.renderCamera && entry.kind !== "mesh"),
      )
      .map((entry) =>
        entry.kind === "camera" ? this.cameraMarker : entry.object,
      )
      .filter((object) => object.visible);
    for (const hit of this.raycaster.intersectObjects(objects, true)) {
      if (!hit.object.isMesh) continue;
      let object = hit.object;
      while (object && !object.userData.entry) object = object.parent;
      if (object?.userData.entry) return { entry: object.userData.entry, hit };
    }
    return null;
  }

  _eventUV(event) {
    const rect = this.interactionElement.getBoundingClientRect();
    return [
      (event.clientX - rect.left) / rect.width,
      1 - (event.clientY - rect.top) / rect.height,
    ];
  }

  _intersect(event) {
    return this._hits(this._eventUV(event))?.entry || null;
  }

  pickImage(uv) {
    if (!this.renderCamera || !Array.isArray(uv)) return null;
    const result = this._hits(uv, this.renderCamera);
    if (!result) {
      this._select(null);
      return null;
    }
    this._select(result.entry.id);
    const normal = result.hit.face?.normal
      .clone()
      .applyNormalMatrix(
        new THREE.Matrix3().getNormalMatrix(result.hit.object.matrixWorld),
      )
      .normalize();
    return {
      id: result.entry.id,
      point: result.hit.point.toArray(),
      normal: normal?.toArray() || null,
    };
  }

  projectWorld(point, mode = "camera") {
    const camera = mode === "camera" ? this.renderCamera : this.observer;
    if (!camera) return null;
    this.scene.updateMatrixWorld(true);
    const ndc = new THREE.Vector3(...point).project(camera);
    return {
      uv: [(ndc.x + 1) / 2, (ndc.y + 1) / 2],
      visible:
        Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1,
    };
  }

  _pick(event) {
    const entry = this._intersect(event);
    this._select(entry?.id, true);
  }

  selectObject(id) {
    if (this._failed || this._disposed) return;
    this._cancelDrag();
    this._select(id, true);
    this.canvas.focus({ preventScroll: true });
  }

  focusSelected() {
    if (this._selected) this._frameObject(this._selected.object);
    else this.resetView();
  }

  _select(id, notify = true, autoTool = true) {
    this._selected = this._entries.get(id) || null;
    this.selection.visible = !!this._selected;
    if (this.cameraHelper)
      this.cameraHelper.visible =
        this.display.frustum && this.viewMode === "space";
    if (this.lightCameraHelper)
      this.lightCameraHelper.visible =
        this.display.frustum &&
        this.viewMode === "space" &&
        this.chapter === "09";
    const edit = this._selected?.meta?.edit || {};
    if (
      autoTool &&
      this._selected &&
      (this.tool === "orbit" || !edit[this.tool])
    )
      this.tool =
        ["translate", "rotate", "scale"].find((tool) => edit[tool]) || "orbit";
    this._attachTool();
    if (notify)
      this.onSelect(
        this._selected
          ? {
              id: this._selected.id,
              label: this._selected.label,
              kind: this._selected.kind,
              tool: this.tool,
              ...this._selected.meta,
            }
          : { id: "scene", label: "场景", kind: "scene", tool: this.tool },
      );
    if (
      this.viewMode === "space" &&
      this._selected?.kind === "light" &&
      this._width &&
      this._height
    ) {
      this.observer.updateMatrixWorld(true);
      const screen = this.lightHandle
        .getWorldPosition(new THREE.Vector3())
        .project(this.observer);
      if (
        Math.abs(screen.x) > 0.8 ||
        Math.abs(screen.y) > 0.8 ||
        screen.z < -1 ||
        screen.z > 1
      )
        this.resetView();
    }
    this._toolStatus();
    this._requestRender();
  }

  setTool(tool) {
    if (
      this._failed ||
      this._disposed ||
      !["orbit", "translate", "rotate", "scale"].includes(tool)
    )
      return;
    this._cancelDrag();
    this.tool = tool;
    this._select(this._selected?.id, true, false);
    this.canvas.focus({ preventScroll: true });
  }

  _attachTool() {
    this.transform.detach();
    this.orbit.enabled = this.viewMode !== "camera" || this.cameraEditable;
    const entry = this._selected;
    if (
      !entry ||
      this.tool === "orbit" ||
      !entry.meta?.edit?.[this.tool] ||
      (entry.kind === "control" && !this.display.controlNet) ||
      (this.viewMode === "camera" && entry.kind === "camera")
    )
      return;
    this.transform.setMode(this.tool);
    this.transform.setSpace(this.tool === "scale" ? "local" : "world");
    const axes =
      this.tool === "scale"
        ? entry.meta.scaleAxes || [true, true, true]
        : [true, true, true];
    [this.transform.showX, this.transform.showY, this.transform.showZ] = axes;
    this.transform.attach(entry.object);
  }

  _bound(key, value) {
    const control = this.chapterSpec?.controls?.find(
      (item) => item.key === key,
    );
    const [min, max, integer] = control
      ? [control.min, control.max, control.step === 1]
      : LIMITS[this.chapter]?.[key] || [-Infinity, Infinity];
    const result = THREE.MathUtils.clamp(value, min, max);
    return integer ? Math.round(result) : Math.round(result * 10000) / 10000;
  }

  _beginDrag() {
    if (!this.transform.object || !this._selected) return;
    const object = this.transform.object;
    this._drag = {
      params: structuredClone(this.params),
      object,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
      patch: null,
    };
    this.annotations.visible = false;
    this.onStatus("正在编辑场景 · Python 同步成像");
  }

  _transformChanged() {
    if (!this._drag) return;
    const { object, params: base } = this._drag,
      entry = this._selected,
      meta = entry.meta,
      keys = meta.params || {};
    let patch = {};
    const bind = (binding, values) => {
      if (Array.isArray(binding))
        binding.forEach((key, i) => {
          patch[key] = this._bound(key, values[i]);
        });
      else patch[binding] = values;
    };
    if (entry.kind === "camera") {
      if (this.tool === "translate") {
        const delta = object.position.clone().sub(this._drag.position);
        patch.camera_target = (base.camera_target || [0, 0, 0]).map((v, i) =>
          THREE.MathUtils.clamp(v + delta.getComponent(i), -10, 10),
        );
        object.position
          .copy(this._drag.position)
          .add(
            new THREE.Vector3(...patch.camera_target).sub(
              new THREE.Vector3(...base.camera_target),
            ),
          );
      } else if (this.tool === "rotate") {
        const pivot = new THREE.Vector3(...base.camera_target),
          yaw = base.yaw * DEG,
          pitch = base.pitch * DEG;
        const eye = pivot
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(pitch) * Math.sin(yaw),
              Math.sin(pitch),
              Math.cos(pitch) * Math.cos(yaw),
            ).multiplyScalar(base.distance),
          );
        const baseRotation = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(eye, pivot, new THREE.Vector3(0, 1, 0)),
        );
        const offset = baseRotation.invert().multiply(object.quaternion);
        const euler = new THREE.Euler().setFromQuaternion(offset, "XYZ");
        patch.camera_rotation = [euler.x, euler.y, euler.z].map((x) =>
          wrapDegrees(x / DEG),
        );
      }
    } else if (entry.kind === "light") {
      if (this.tool === "translate") {
        ["x", "y", "z"].forEach((axis) => {
          const key = `light_${axis}`;
          patch[key] = this._bound(key, object.position[axis]);
          object.position[axis] = patch[key];
        });
      } else if (this.tool === "rotate" && this.chapter === "09") {
        const distance = new THREE.Vector3(...base.light_target).distanceTo(
          object.position,
        );
        const target = object.position
          .clone()
          .add(
            new THREE.Vector3(0, 0, -distance).applyQuaternion(
              object.quaternion,
            ),
          );
        patch.light_target = target
          .toArray()
          .map((v, i) => THREE.MathUtils.clamp(v, -10, i === 1 ? 0 : 10));
      }
    } else if (this.tool === "translate" && keys.position) {
      const values = object.position
        .toArray()
        .map((v, i) =>
          THREE.MathUtils.clamp(
            v,
            this.chapter === "06" && i === 2 ? -2 : -10,
            this.chapter === "06" && i === 2 ? 2 : 10,
          ),
        );
      object.position.fromArray(values);
      bind(keys.position, values);
    } else if (this.tool === "rotate" && keys.rotation) {
      let rotation = object.quaternion.clone();
      if (meta.rotationOffset) {
        const legacy = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            -(base.tilt ?? 55) * DEG,
            0,
            (base.rotation ?? 0) * DEG,
            "ZXY",
          ),
        );
        rotation.multiply(legacy.invert());
      }
      const euler = new THREE.Euler().setFromQuaternion(rotation, "XYZ");
      bind(
        keys.rotation,
        [euler.x, euler.y, euler.z].map((x) => wrapDegrees(x / DEG)),
      );
    } else if (this.tool === "scale" && keys.scale) {
      if (meta.scaleMode === "uniform") {
        const ratios = object.scale
          .toArray()
          .map((value, i) => value / this._drag.scale.getComponent(i));
        const ratio = ratios.reduce(
          (best, value) =>
            Math.abs(value - 1) > Math.abs(best - 1) ? value : best,
          1,
        );
        const radius = this._bound(
          keys.scale,
          base[keys.scale] * Math.max(0.01, ratio),
        );
        patch[keys.scale] = radius;
        object.scale.setScalar(radius);
      } else {
        const values = object.scale
          .toArray()
          .map((value, i) =>
            meta.scaleAxes?.[i] === false
              ? 1
              : THREE.MathUtils.clamp(
                  value,
                  Array.isArray(keys.scale)
                    ? (LIMITS[this.chapter]?.[keys.scale[i]]?.[0] ?? 0.1)
                    : 0.1,
                  Array.isArray(keys.scale)
                    ? (LIMITS[this.chapter]?.[keys.scale[i]]?.[1] ?? 3)
                    : 3,
                ),
          );
        object.scale.fromArray(values);
        bind(keys.scale, values);
      }
    }
    if (!Object.keys(patch).length) return;
    this._drag.patch = { ...this._drag.patch, ...patch };
    this.params = { ...this.params, ...patch };
    if (entry.kind === "light") this._previewLight();
    if (entry.kind === "mesh" && this.display.normals)
      this._updateNormals(entry);
    this.onChange(patch, { commit: false });
    this._requestRender();
  }

  _endDrag() {
    if (!this._drag) return;
    const patch = this._drag.patch;
    this._releaseSurface();
    this._drag = null;
    this.orbit.enabled = this.viewMode !== "camera" || this.cameraEditable;
    if (this._source) this._previewParams(this._source, this.params);
    if (patch) this.annotations.visible = false;
    this._attachTool();
    if (patch) {
      this.onStatus("已提交参数，正在等待 Python 成像。");
      this.onChange(patch, { commit: true });
    }
    this._requestRender();
  }

  _cancelDrag(notify = true) {
    if (!this._drag) return;
    const original = this._drag.params,
      keys = Object.keys(this._drag.patch || {});
    this._releaseSurface();
    this._drag = null;
    this.transform.reset();
    this.transform.pointerUp(null);
    this.params = original;
    this.orbit.enabled = this.viewMode !== "camera" || this.cameraEditable;
    if (this._source) this._previewParams(this._source, original);
    this._attachTool();
    if (notify) {
      this.onChange(
        Object.fromEntries(keys.map((key) => [key, original[key]])),
        { commit: true, cancelled: true },
      );
      this.onStatus("已取消本次拖动。");
    }
    this._requestRender();
  }

  _wheelFov(event) {
    if (
      !event.altKey ||
      !["03", "10", "12", "13", "14", "15"].includes(this.chapter) ||
      (this._selected?.kind !== "camera" && this.viewMode !== "camera") ||
      this._drag
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this.renderCamera?.isOrthographicCamera) {
      this.onStatus("正交投影使用固定窗口；切到透视投影后可调整镜头视野。");
      return;
    }
    const fov = this._bound(
      "fov",
      (this.params.fov ?? 48) + Math.sign(event.deltaY) * 2,
    );
    this.params.fov = fov;
    if (this.renderCamera?.isPerspectiveCamera) {
      this.renderCamera.fov = fov;
      this.renderCamera.updateProjectionMatrix();
    }
    if (this.viewCamera?.isPerspectiveCamera) {
      this.viewCamera.fov = fov;
      this.viewCamera.updateProjectionMatrix();
    }
    this.onChange({ fov }, { commit: false });
    clearTimeout(this._fovTimer);
    this._fovTimer = setTimeout(() => {
      this._fovTimer = null;
      if (!this._disposed)
        this.onChange({ fov: this.params.fov }, { commit: true });
    }, 160);
    this.onStatus(`渲染相机视野 ${fov}° · Alt + 滚轮调整`);
    this._requestRender();
  }

  _toolStatus() {
    if (this._drag || this._cameraEdit) return;
    if (this.transform.object) {
      const action = {
        translate: "平移",
        rotate: "旋转",
        scale:
          this._selected.meta.scaleMode === "uniform" ? "统一缩放" : "缩放",
      }[this.tool];
      this.onStatus(`${this._selected.label} · ${action}`);
    } else if (this._selected && this.tool !== "orbit") {
      this.onStatus(
        this._selected.meta?.reason?.[this.tool] ||
          "当前对象不支持此变换；可自由观察空间。",
      );
    } else
      this.onStatus(
        this.viewMode === "camera"
          ? this.cameraEditable
            ? "成像视角 · 相机可编辑"
            : "成像视角 · 固定拍摄相机"
          : "空间观察",
      );
  }

  _frameObject(object) {
    const bounds = new THREE.Box3().setFromObject(
      object.userData.entry?.mesh || object,
    );
    if (bounds.isEmpty()) return;
    if (object.userData.entry?.kind === "control")
      bounds.expandByScalar(
        Math.max(
          0.3,
          (this._bounds?.getSize(new THREE.Vector3()).length() || 2) * 0.12,
        ),
      );
    if (this.viewMode === "camera") {
      if (!this.cameraEditable) return;
      this._beginCameraEdit();
      const target = bounds.getCenter(new THREE.Vector3());
      const delta = target.clone().sub(this.orbit.target);
      this.orbit.target.copy(target);
      this.viewCamera.position.add(delta);
      if (this.viewCamera.isPerspectiveCamera) {
        const direction = this.viewCamera.position
          .clone()
          .sub(target)
          .normalize();
        const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
        const distance = this._bound(
          "distance",
          (radius / Math.sin((this.viewCamera.fov * DEG) / 2)) * 1.12,
        );
        this.viewCamera.position
          .copy(target)
          .addScaledVector(direction, distance);
      }
      this.orbit.update();
      this._cameraChanged();
      this._endCameraEdit();
    } else this._frameBounds(bounds);
  }

  _frameBounds(
    bounds,
    {
      points = boxCorners(bounds),
      direction = new THREE.Vector3(1.1, 0.72, 1.35),
      padding = 1.12,
    } = {},
  ) {
    // Fit the actual view-space extents, rather than a mostly empty enclosing
    // sphere. This matters especially on a tall, narrow workbench pane.
    direction = direction.clone().normalize();
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const center = bounds.getCenter(new THREE.Vector3());
    const vertical = (this.observer.fov * DEG) / 2;
    const horizontal = Math.atan(Math.tan(vertical) * this.observer.aspect);
    let distance = 1;
    for (const point of points) {
      const offset = point.clone().sub(center),
        depth = offset.dot(direction);
      distance = Math.max(
        distance,
        depth + (padding * Math.abs(offset.dot(right))) / Math.tan(horizontal),
        depth + (padding * Math.abs(offset.dot(up))) / Math.tan(vertical),
      );
    }
    this.orbit.target.copy(center);
    this.observer.position.copy(center).addScaledVector(direction, distance);
    this.observer.near = Math.max(0.005, distance / 1000);
    this.observer.far = Math.max(200, distance * 30);
    this.observer.updateProjectionMatrix();
    this.orbit.update();
    this.orbit.saveState();
    this._observerFitted = !!this._source;
    this._requestRender();
  }

  resetView() {
    if (this._failed || this._disposed) return;
    if (this.viewMode === "camera") {
      this._syncViewCamera();
      this._requestRender();
      return;
    }
    this.scene.updateMatrixWorld(true);
    const objects = [
      ...(this._meshEntries || []),
      ...(this._controlEntries || []),
    ].map((entry) => entry.object);
    if (["03", "12"].includes(this.chapter) && this.cameraRig.visible)
      objects.push(this.cameraMarker);
    if (this.chapter === "12" && this.annotations.visible)
      objects.push(this.annotations);
    // Keep the small ellipsoid large while studying its surface. Selecting its
    // light can frame both; a remote lamp must not shrink every surface lesson.
    if (
      this.lightHandle.visible &&
      (["09", "12"].includes(this.chapter) || this._selected?.kind === "light")
    )
      objects.push(this.lightHandle);
    const bounds = new THREE.Box3(),
      points = [];
    for (const object of objects) {
      const box = new THREE.Box3().setFromObject(object);
      if (this.chapter === "03" && object === this.cameraMarker)
        box.expandByScalar(0.65);
      if (!box.isEmpty()) {
        bounds.union(box);
        points.push(...boxCorners(box));
      }
    }
    if (bounds.isEmpty()) {
      bounds.set(new THREE.Vector3(-2, -1, -2), new THREE.Vector3(2, 1, 2));
      points.push(...boxCorners(bounds));
    }
    let direction = new THREE.Vector3(1.1, 0.72, 1.35);
    if (this.chapter === "03" && this._cameraTarget) {
      direction
        .copy(this.cameraPose.getWorldPosition(new THREE.Vector3()))
        .sub(this._cameraTarget);
      const elevation = Math.atan2(
        direction.y,
        Math.hypot(direction.x, direction.z),
      );
      direction.y = 0;
      direction.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), 5 * DEG);
      direction.y = Math.tan(
        THREE.MathUtils.clamp(elevation - 10 * DEG, 5 * DEG, 35 * DEG),
      );
    }
    if (this.chapter === "12" && this._cameraTarget) {
      // Look across the viewing ray, not down it: otherwise the incident and
      // reflected paths collapse into almost the same point on the sphere.
      direction.copy(this.cameraPose.position).sub(this._cameraTarget);
      direction.y = 0;
      direction
        .normalize()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), 65 * DEG);
      direction.y = 0.7;
    }
    this._frameBounds(bounds, {
      points,
      direction,
      padding: this.chapter === "03" ? 1.06 : 1.1,
    });
  }

  resize() {
    if (this._failed || this._disposed) return;
    const rect = this.container.getBoundingClientRect();
    const square = this.viewMode === "camera";
    const side = Math.floor(Math.min(rect.width, rect.height));
    this._width = Math.max(0, Math.round(square ? side : rect.width));
    this._height = Math.max(0, Math.round(square ? side : rect.height));
    Object.assign(this.canvas.style, {
      position: "absolute",
      width: `${this._width}px`,
      height: `${this._height}px`,
      left: `${square ? (rect.width - side) / 2 : 0}px`,
      top: `${square ? (rect.height - side) / 2 : 0}px`,
    });
    if (!this._width || !this._height) return;
    this.renderer.setSize(this._width, this._height, false);
    this.observer.aspect = this._width / this._height;
    this.observer.updateProjectionMatrix();
    this.transform.setSize(this._width < 600 ? 1.1 : 1.15);
    this._requestRender();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._generation++;
    clearTimeout(this._fovTimer);
    clearTimeout(this._cameraTimer);
    if (this._frame !== null) cancelAnimationFrame(this._frame);
    this.resizeObserver?.disconnect();
    this._listeners.forEach((remove) => remove());
    if (this._failed) {
      this._fallback?.remove();
      return;
    }
    this.transform.detach();
    this.scene.remove(this.transform.getHelper());
    this.transform.dispose();
    this.orbit.dispose();
    disposeTree(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    this._entries.clear();
  }
}
