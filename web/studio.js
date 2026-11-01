import { TeachingFigure, figureCatalog } from "./teaching-figures.js";
let figureInstances = [];
import { RenderComparison } from "./render-comparison.js";
import { Viewport2D } from "./viewport2d.js";
import { Viewport3D } from "./viewport3d.js";

// UI and transport only. Mathematics and final images live in Python.
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const clone = (value) => structuredClone(value);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const state = {
  catalog: [],
  chapter: null,
  params: {},
  result: null,
  viewport: null,
  mode: "book",
  document: "lesson",
  channel: null,
  revision: 0,
  queued: null,
  running: false,
  displayedRevision: -1,
  viewMode: "space",
  presentation: "image",
  inspector: "experiment",
  panelPreference: null,
  imageTouch: false,
  rayStep: null,
  source: null,
  tool: null,
  undo: [],
  redo: [],
  editStart: null,
  transformFields: [],
};
let cancelNumericEdit = null;
let previewTimer,
  toastTimer,
  sourceRevision = 0,
  lessonRevision = 0;
const inlineDemo = $("#inline-demo"),
  chapterCode = $("#chapter-code");
const comparison = new RenderComparison(
  $("#render-well"),
  $("#render-image"),
  $("#compare-render"),
  $("#freeze-render"),
);
const experiments = {
  15: [
    "在控制网中移动控制点，查看 Python 曲面、法线与曲率成像。",
    "接缝的共享边、跨界切向量和二阶变化分别由哪几行控制点决定？",
    [],
  ],
  14: [
    "移动镜面球与拍摄相机，单击像素检查反射方向和环境地址。",
    "同一个反射方向，在经纬图和六张立方体面中如何找到颜色？",
    [
      [
        "柔光空间",
        { environment: "studio", mapping: "latlong", map_size: 128 },
      ],
      ["方向编码", { environment: "direction", mapping: "analytic" }],
      ["低分辨率经纬", { mapping: "latlong", map_size: 16 }],
      ["六个立方面", { mapping: "cube", map_size: 32 }],
    ],
  ],
  13: [
    "移动网格和相机，点击成像追溯像素的原始三角形。",
    "更改管线中的哪一步，会改变几何、颜色或可见性？",
    [
      ["波动顶点", { wave: 0.5, fragment: "checker" }],
      ["UV程序", { fragment: "uv" }],
      [
        "顺序反例",
        { depth_test: false, reverse: false, wave: 0, yaw: 0, pitch: 0 },
      ],
      ["提前深度测试", { depth_test: true, early_depth: true }],
    ],
  ],
  "01": [
    "放大圆的边缘，单击像素检查行、列与线性 RGB。比较采样前后的轮廓。",
    "增加图像分辨率和增加每像素采样，分别改变了什么？",
    [
      ["中心采样", { size: 64, samples: 1 }],
      ["多重采样", { size: 64, samples: 8 }],
      ["颜色方向", { pattern: "corners" }],
    ],
  ],
  "02": [
    "拖动观察点；改变变换顺序，比较原图与变换后的位置。",
    "同样的平移和旋转，为什么交换顺序会把物体放到不同位置？",
    [
      ["先转后移", { order: "TRS", angle: 55, tx: 1.2, ty: 0.5 }],
      ["先移后转", { order: "RTS", angle: 55, tx: 1.2, ty: 0.5 }],
      ["镜像", { sx: -1, sy: 1, angle: 0 }],
    ],
  ],
  "03": [
    "选择相机，按 W 拖动坐标轴。自由旋转空间视图，观察视锥与成像结果。",
    "观察用的视角和拍摄图像的相机有什么区别？哪一个决定近大远小？",
    [
      ["广角近拍", { fov: 85, distance: 3 }],
      ["长焦远拍", { fov: 25, distance: 10 }],
      ["正交投影", { projection: "orthographic" }],
    ],
  ],
  "04": [
    "拖动 A、B、C 三个顶点，或移动白色采样点。检查三个权重如何变化。",
    "顶点颜色为何能覆盖整个三角形？三角形外的负权重意味着什么？",
    [
      ["颜色插值", { mode: "color" }],
      ["检查权重", { mode: "weights" }],
      ["像素覆盖", { mode: "coverage", size: 64 }],
    ],
  ],
  "05": [
    "绕场景观察两个相交的面，再切换提交顺序和深度精度。",
    "物体的绘制顺序变了，为什么启用深度测试后，结果仍应保持一致？",
    [
      ["A 先画", { order: "AB" }],
      ["B 先画", { order: "BA" }],
      ["低精度深度", { bits: 8, slope: 0.1 }],
    ],
  ],
  "06": [
    "选中光源并按 W 移动，或选中曲面按 R 拉伸。切换图像通道比较法线。",
    "非均匀缩放后，直接用模型矩阵变换法线会产生什么错误？",
    [
      ["柔和高光", { surface_model: "analytic", exponent: 12, ks: 0.25 }],
      [
        "网格着色对照",
        {
          surface_model: "mesh",
          mesh_latitude: 5,
          exponent: 128,
          ks: 0.7,
          light_x: -2,
          light_y: 2,
        },
      ],
      ["非均匀缩放", { surface_model: "analytic", sx: 2.2, sy: 0.5, sz: 1 }],
    ],
  ],
  "07": [
    "选择纹理平面，按 E 拖动旋转环。比较透视校正与仿射插值的差别。",
    "为什么屏幕里的线性插值，不能直接用来插值三维物体的纹理坐标？",
    [
      ["正视平面", { tilt: 0 }],
      ["掠射角", { tilt: 72 }],
      ["高频纹理", { frequency: 48, filter: "nearest" }],
      [
        "缩小与过滤",
        {
          tilt: 70,
          frequency: 64,
          texture_size: 512,
          filter: "anisotropic",
          max_anisotropy: 8,
        },
      ],
    ],
  ],
  "08": [
    "放大细线，拖动像素探针。让边缘移动不到一个像素，观察颜色跳变。",
    "更多样本如何估计一个像素内的覆盖率？过滤能恢复已丢失的细节吗？",
    [
      ["单次采样", { samples: 1 }],
      ["64 个样本", { samples: 64 }],
      ["高频棋盘", { scene: "checker", cell: 0.7 }],
    ],
  ],
  "09": [
    "选择光源，按 W 拖动它的位置。检查阴影图与最终图像的对应关系。",
    "光源看不见的表面为什么处在阴影里？偏移过小和过大会各有什么现象？",
    [
      ["硬阴影", { pcf: 0 }],
      ["柔化边缘", { pcf: 2 }],
      ["观察偏移", { bias: 0, pcf: 0 }],
    ],
  ],
  10: [
    "选择椭球，按 R 沿坐标轴缩放。调整网格分段并检查参数点。",
    "同一张曲面，如何同时用一个方程、两个参数和一组三角形描述？",
    [
      ["粗网格", { detail: 5 }],
      ["细网格", { detail: 40 }],
      ["拉长椭球", { a: 2.5, b: 0.7, c: 0.7 }],
    ],
  ],
  11: [
    "拖动四个控制点，观察控制多边形与曲线。滑动 t 查看逐层线性插值。",
    "为什么曲线一定经过两个端点，却通常不经过中间两个控制点？",
    [
      ["构造中点", { t: 0.5 }],
      [
        "S 形曲线",
        {
          points: [
            [-2, -1],
            [-1, 2],
            [1, -2],
            [2, 1],
          ],
        },
      ],
      [
        "直线退化",
        {
          points: [
            [-2, -1],
            [-1, -0.5],
            [1, 0.5],
            [2, 1],
          ],
        },
      ],
    ],
  ],
  12: [
    "单击渲染图中的像素，在空间中查看它的射线路径。移动光源，比较反射次数。",
    "一条观察射线如何确定第一个交点？反射射线和阴影射线分别回答什么？",
    [
      ["直接光照", { bounces: 0 }],
      ["一次反射", { bounces: 1 }],
      ["三次反射", { bounces: 3 }],
    ],
  ],
};
const probeLabels = {
  patch: "曲面片",
  surface_uv: "曲面参数 (u, v)",
  surface_world: "精确曲面点 S(u, v)",
  tessellation_error: "三角网格与精确曲面位置误差",
  partial_u: "切向量 ∂S/∂u",
  partial_v: "切向量 ∂S/∂v",
  area_density: "面积密度 |Sᵤ × Sᵥ|",
  mean_curvature: "有向平均曲率 H",
  gaussian_curvature: "高斯曲率 K",
  regular: "正则点",

  incident: "相机射线方向",
  lookup_direction: "环境局部查询方向",
  reflected: "世界反射方向",
  world: "世界交点",
  environment_uv: "环境经纬 UV · v向下",
  cube_face: "立方体面",
  cube_uv: "立方面 UV · v向下",
  row: "数组行",
  col: "数组列",
  pixel: "像素",
  linear: "线性 RGB",
  srgb: "sRGB",
  linear_rgb: "线性 RGB",
  srgb_rgb: "sRGB",
  weights: "重心权重",
  inside: "三角形内",
  sum: "权重和",
  point: "观察点",
  transformed: "变换后",
  normal: "法线",
  depth: "深度",
  uv: "图像坐标 UV",
  uv_correct: "透视校正 UV",
  uv_affine: "仿射 UV",
  color: "颜色",
  correct: "正确结果",
  affine: "仿射结果",
  hit: "命中",
  t: "交点距离",
  visibility: "可见性",
  coverage: "覆盖率",
  position: "位置",
  value: "数值",
  matrix: "变换矩阵",
  determinant: "行列式",
  condition: "条件数",
  barycentric: "重心权重",
  weight_sum: "权重和",
  candidate_faces: "候选三角形",
  depth_passes: "依次通过深度测试",
  clip_vertices: "原三角形齐次 clip 顶点",
  face: "三角形编号",
  interpolated_length: "归一化前法线长度",
  vertex_normals: "三个顶点的法线",
  vertex_colors: "三个顶点的线性 RGB",
  flat_rgb: "Flat 线性 RGB",
  gouraud_rgb: "Gouraud 线性 RGB",
  phong_rgb: "Phong 线性 RGB",
  lod: "实际细节层级 LOD",
  footprint_major: "足迹长轴 / texel",
  footprint_minor: "足迹短轴 / texel",
  tap_count: "长轴查询次数",
  texel_rows: "L0 双线性邻居行",
  texel_cols: "L0 双线性邻居列",
  texel_weights: "L0 双线性权重",
};
function status(message, kind = "ready") {
  inlineDemo.querySelector("#status-text").textContent = message;
  inlineDemo.querySelector("#status-dot").className =
    `status-dot ${kind === "busy" ? "busy" : kind === "error" ? "error" : ""}`;
}
function toast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 3000);
}
function format(value) {
  if (typeof value === "number")
    return Number.isInteger(value)
      ? String(value)
      : Math.abs(value) > 1e5 || (Math.abs(value) < 0.0001 && value !== 0)
        ? value.toExponential(3)
        : String(Number(value.toFixed(5)));
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return "[" + value.map(format).join(", ") + "]";
  if (value === null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
async function json(url, options) {
  const response = await fetch(url, options),
    data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `请求失败 ${response.status}`);
  return data;
}
function persist() {
  try {
    localStorage.setItem(
      `graphic-studio-${state.chapter.id}`,
      JSON.stringify(state.params),
    );
  } catch {}
}
function route(replace = false) {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("chapter", state.chapter.id);
  if (state.document !== "lesson") url.searchParams.set("document", state.document);
  if (chapterCode.open && state.source)
    url.searchParams.set("file", state.source.path);
  history[replace ? "replaceState" : "pushState"]({}, "", url);
}
function buildNavigation() {
  let part = "";
  $("#chapters").replaceChildren();
  for (const chapter of state.catalog) {
    if (chapter.part !== part) {
      part = chapter.part;
      const group = document.createElement("div");
      group.className = "chapter-group";
      group.innerHTML = `<div class="part-label">${escape(part)}</div>`;
      $("#chapters").append(group);
    }
    const b = document.createElement("button");
    b.className = "chapter-button";
    b.dataset.chapter = chapter.id;
    b.innerHTML = `<span class="chapter-number">${chapter.id}</span><span>${escape(chapter.title)}</span><span class="dimension">${chapter.dimension}D</span>`;
    b.onclick = () => selectChapter(chapter.id);
    $("#chapters").lastElementChild.append(b);
  }
}
async function selectChapter(id, { push = true, mode = state.mode, document: readingDocument = "lesson" } = {}) {
  cancelNumericEdit?.();
  setMaximized(false);
  const chapter = state.catalog.find((c) => c.id === id) || state.catalog[0];
  clearTimeout(previewTimer);
  previewTimer = null;
  state.revision++;
  state.queued = null;
  state.chapter = chapter;
  state.result = null;
  state.source = null;
  state.selection = null;
  state.undo = [];
  state.redo = [];
  state.editStart = null;
  syncHistory();
  state.channel = null;
  state.displayedRevision = -1;
  state.rayStep = null;
  comparison.reset();
  state.params = clone(chapter.defaults);
  state.document = readingDocument;
  $("#jump-demo").hidden = readingDocument !== "lesson";
  state.needsFit = true;
  chapterCode.open = false;
  inlineDemo.dataset.dimension = chapter.dimension;
  try {
    const saved = JSON.parse(
      localStorage.getItem(`graphic-studio-${chapter.id}`) || "null",
    );
    if (saved) {
      for (const key of Object.keys(state.params))
        if (key in saved) state.params[key] = saved[key];
      for (const c of chapter.controls) {
        const v = state.params[c.key];
        if (
          (c.type === "number" &&
            (!Number.isFinite(v) || v < c.min || v > c.max)) ||
          (c.type === "choice" && !c.options.some((o) => o.value === v))
        )
          state.params[c.key] = c.default;
      }
    }
  } catch {}
  $$(".chapter-button").forEach((b) =>
    b.classList.toggle("active", b.dataset.chapter === chapter.id && readingDocument === "lesson"),
  );
  $("#sidebar").classList.remove("open");
  $("#chapter-kicker").textContent = `CHAPTER ${chapter.id} / ${chapter.part}`;
  $("#chapter-title").textContent = chapter.title;
  $("#chapter-summary").textContent = chapter.summary;
  document.title = `${chapter.id} · ${chapter.title} — 图形学交互书`;
  const position =
    state.catalog.findIndex((item) => item.id === chapter.id) + 1;
  $("#progress").style.width = `${(position / state.catalog.length) * 100}%`;
  $("#progress-text").textContent =
    `阅读顺序 ${position} / ${state.catalog.length} · 传统图形学`;
  $("#viewport-empty").hidden = false;
  $("#render-image").removeAttribute("src");
  $("#image-probe").hidden = true;
  $("#metrics").replaceChildren();
  $("#channels").replaceChildren();
  $("#probe-values").textContent = "等待渲染";
  $("#image-dimensions").textContent = "";
  $("#render-timing").textContent = "";
  state.viewport?.dispose();
  $("#viewport").replaceChildren();
  const callbacks = {
    onChange: (patch, options) =>
      changeParams(patch, {
        commit: options?.commit !== false,
        cancelled: options?.cancelled === true,
        fromViewport: true,
      }),
    onSelect: selectObject,
    onStatus: (message) => ($("#viewport-hint").textContent = message),
    onProbe: (uv) =>
      changeParams({ probe: uv }, { commit: true, record: false }),
  };
  state.viewport =
    chapter.dimension === 3
      ? new Viewport3D($("#viewport"), callbacks)
      : new Viewport2D($("#viewport"), callbacks);
  state.viewport.setChapter(chapter.id, state.params, {});
  state.viewMode = ["03", "10", "12", "13", "14", "15"].includes(chapter.id)
    ? "camera"
    : "space";
  syncViewMode();
  setPresentation(chapter.dimension === 3 ? "image" : "space");
  setInspector("experiment");
  $$("[data-display]").forEach(
    (input) => (input.checked = input.dataset.display === "grid"),
  );
  state.viewport.setDisplay?.({
    grid: true,
    wireframe: false,
    normals: false,
    frustum: false,
  });
  $("#view-label").textContent =
    chapter.dimension === 3 ? "交互预览" : "拖动并观察";
  if (chapter.dimension === 2)
    $("#view-type").textContent = "ORTHOGRAPHIC / 2D";
  $("#viewport-corner").textContent =
    chapter.dimension === 3
      ? "WORLD SPACE · 自由观察"
      : "CANVAS SPACE · 直接编辑";
  $("#viewport-hint").textContent =
    chapter.dimension === 3
      ? "拖动旋转 · Shift 平移 · 滚轮缩放"
      : "拖动控制点 · 空格平移 · 滚轮缩放";
  $("#selection-status").textContent =
    chapter.dimension === 3 ? "选择物体或光源" : "单击或拖动控制点";
  buildTools();
  buildControls();
  buildSceneTree();
  buildObjectProperties();
  buildExperiment();
  await loadLesson();
  if (state.chapter !== chapter) return;
  if (push) route();
  if (readingDocument === "lesson") queueRender(false);
}
function buildTools() {
  const is3D = state.chapter.dimension === 3,
    tools = is3D
      ? [
          ["orbit", "◉", "观察 · 拖动旋转"],
          ["translate", "↗", "移动 · W"],
          ["rotate", "⟳", "旋转 · E"],
          ["scale", "⤢", "缩放 · R"],
        ]
      : [
          ["select", "↖", "选择与拖动"],
          ["pan", "✥", "平移 · 空格"],
        ];
  $("#tool-buttons").replaceChildren();
  for (const [id, symbol, title] of tools) {
    const b = document.createElement("button");
    b.dataset.tool = id;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.textContent = symbol;
    b.onclick = () => setTool(id);
    $("#tool-buttons").append(b);
  }
  setTool(is3D ? "orbit" : "select");
}
function setTool(tool) {
  const button = $('[data-tool="' + tool + '"]');
  if (!button || button.disabled) return;
  if (
    state.chapter?.dimension === 3 &&
    state.presentation === "image" &&
    tool !== "orbit"
  )
    setPresentation("space");
  state.tool = tool;
  state.viewport?.setTool(tool);
  syncTools();
}
function syncTools() {
  const selection = state.selection;
  const names = {
    orbit: "观察",
    translate: "移动 · W",
    rotate: "旋转 · E",
    scale: "缩放 · R",
  };
  for (const button of $$("[data-tool]")) {
    const tool = button.dataset.tool;
    button.disabled =
      state.chapter.dimension === 3 &&
      tool !== "orbit" &&
      !selection?.edit?.[tool];
    button.classList.toggle("active", tool === state.tool);
    button.setAttribute("aria-pressed", String(tool === state.tool));
    if (state.chapter.dimension === 3) {
      const reason = selection?.reason?.[tool] || "先选择一个支持此变换的对象";
      button.title = button.disabled
        ? `${names[tool]}：${reason}`
        : names[tool];
      button.setAttribute("aria-label", button.title);
    }
  }
}
function selectObject(selection) {
  const metadata = state.result?.geometry?.objects?.find(
    (item) => item.id === selection?.id,
  );
  const previous = state.selection?.id;
  const previousBindings = JSON.stringify([
    state.selection?.edit,
    state.selection?.params,
    state.selection?.reason,
  ]);
  state.selection = selection ? { ...metadata, ...selection } : null;
  const bindingsChanged =
    previousBindings !==
    JSON.stringify([
      state.selection?.edit,
      state.selection?.params,
      state.selection?.reason,
    ]);
  if (selection?.tool) state.tool = selection.tool;
  $$(".scene-object").forEach((b) =>
    b.classList.toggle("active", b.dataset.object === selection?.id),
  );
  $("#selection-status").textContent = selection?.label || "未选择对象";
  syncTools();
  if (
    previous !== selection?.id ||
    bindingsChanged ||
    !state.transformFields.length
  )
    buildObjectProperties();
  else syncObjectProperties();
  if (previous !== selection?.id && selection?.kind === "control")
    setInspector("object");
}
function buildSceneTree() {
  const items =
    state.chapter.dimension === 3
      ? state.result?.geometry?.objects || []
      : (state.result?.handles || []).map((h) => ({
          id: h.id,
          label: h.label,
          kind: h.key === "point" ? "probe" : "point",
        }));
  const controlOpen = $("#scene-tree details")?.open || false;
  const controlItems = items.filter((item) => item.kind === "control");
  $("#scene-tree").replaceChildren();
  let controlGroup;
  if (controlItems.length) {
    controlGroup = document.createElement("details");
    controlGroup.className = "control-group";
    controlGroup.open = controlOpen;
    const summary = document.createElement("summary");
    summary.textContent = `控制网 · ${controlItems.length} 点`;
    controlGroup.append(summary);
  }
  for (const { id, label, kind, edit } of items) {
    const b = document.createElement("button");
    b.className = "scene-object";
    b.dataset.object = id;
    b.classList.toggle("active", id === state.selection?.id);
    const type =
      {
        mesh: "曲面",
        camera: "相机",
        light: "光源",
        probe: "探针",
        point: "控制点",
        control: edit?.translate ? "控制点" : "约束点",
      }[kind] || kind;
    b.innerHTML = `<span aria-hidden="true">${{ mesh: "◇", camera: "▣", light: "☼", probe: "⊙", point: "·", control: "·" }[kind] || "◇"}</span><span class="scene-object-name">${escape(label)}</span><span>${escape(type)}</span>`;
    b.setAttribute("aria-label", `选择${label}`);
    b.onclick = () => {
      if (kind === "control") {
        state.viewport.setDisplay({ controlNet: true });
        if (state.presentation === "image") setPresentation("space");
        else syncPresentationLabels();
      }
      setInspector("object");
      if (state.viewport.selectObject) state.viewport.selectObject(id);
      else if (state.viewport.select) {
        state.viewport.select(
          state.viewport.handles().find((h) => h.id === id),
        );
        state.viewport.draw?.();
      }
    };
    (kind === "control" ? controlGroup : $("#scene-tree")).append(b);
  }
  if (controlGroup) $("#scene-tree").append(controlGroup);
}
// Metadata describes bindings; the editable value always comes from params.
// World-space mesh poses returned by Python are not interchangeable with these
// values (notably camera references, light targets and rotation offsets).
function objectRows(selection) {
  if (!selection?.params) return [];
  const rows = [];
  for (const [property, tool] of [
    ["position", "translate"],
    ["rotation", "rotate"],
    ["scale", "scale"],
  ]) {
    const binding = selection.params[property];
    if (!binding || !selection.edit?.[tool]) continue;
    const uniform = property === "scale" && selection.scaleMode === "uniform";
    const target = binding === "light_target";
    const label = target
      ? "光观察目标"
      : binding === "camera_target"
        ? "相机参考点"
        : binding === "camera_rotation"
          ? "镜头相对转角"
          : {
              position: "位置",
              rotation: "旋转",
              scale: uniform ? "统一半径" : "缩放",
            }[property];
    const fields = (uniform ? [0] : [0, 1, 2]).map((axis) => {
      const key = Array.isArray(binding) ? binding[axis] : binding;
      const vector = !Array.isArray(binding) && !uniform;
      const control = state.chapter.controls.find((item) => item.key === key);
      let [min, max, step] =
        property === "scale"
          ? [0.1, 3, 0.01]
          : property === "rotation" && !target
            ? [-180, 180, 0.1]
            : [-10, 10, 0.01];
      if (control) ({ min, max, step } = control);
      if (key === "light_target" && axis === 1) max = 0;
      if (state.chapter.id === "06" && key === "surface_position" && axis === 2)
        [min, max] = [-2, 2];
      return {
        key,
        axis,
        min,
        max,
        step,
        label: `${label} ${uniform ? "r" : "XYZ"[axis]}`,
        disabled: property === "scale" && selection.scaleAxes?.[axis] === false,
        get: () => (vector ? state.params[key]?.[axis] : state.params[key]),
        patch: (value) => {
          if (!vector) return { [key]: value };
          const values = [...state.params[key]];
          values[axis] = value;
          return { [key]: values };
        },
      };
    });
    rows.push({ label, fields, uniform });
  }
  return rows;
}
function buildObjectProperties() {
  const panel = $("#object-properties");
  panel.replaceChildren();
  state.transformFields = [];
  const selection = state.selection;
  const rows = objectRows(selection);
  panel.hidden =
    !selection || selection.kind === "scene" || state.chapter.dimension !== 3;
  if (panel.hidden) {
    syncObjectProperties();
    return;
  }
  const heading = document.createElement("div");
  heading.className = "object-property-heading";
  heading.textContent = selection.label;
  panel.append(heading);
  if (!rows.length) {
    const note = document.createElement("p");
    note.className = "object-property-note";
    note.textContent =
      selection.reason?.translate || "本章固定此对象，以隔离当前的数学变量。";
    panel.append(note);
  }
  for (const row of rows) {
    const group = document.createElement("div");
    group.className = "transform-row" + (row.uniform ? " uniform" : "");
    const label = document.createElement("div");
    label.className = "transform-row-label";
    label.innerHTML = `<span>${escape(row.label)}</span><span>${row.label.includes("旋转") || row.label.includes("转角") ? "° · XYZ" : row.uniform ? "等比" : ""}</span>`;
    group.append(label);
    for (const field of row.fields) {
      const cell = document.createElement("div");
      cell.className = `axis-field axis-${"xyz"[field.axis]}`;
      const axis = document.createElement("span");
      axis.className = "axis-label";
      axis.textContent = row.uniform ? "r" : "XYZ"[field.axis];
      const button = numericButton(field, field.get, field.patch);
      button.dataset.objectField = `${field.key}:${field.axis}`;
      button.disabled = field.disabled;
      if (field.disabled) {
        button.title = "零厚度平面的 Z 缩放固定为 1";
        button.setAttribute("aria-label", button.title);
      }
      cell.append(axis, button);
      group.append(cell);
      state.transformFields.push({ ...field, button });
    }
    panel.append(group);
  }
  syncObjectProperties();
}
function syncObjectProperties() {
  const bound = new Set();
  for (const field of state.transformFields) {
    field.button.textContent = format(field.get());
    bound.add(field.key);
  }
  for (const row of $$("#controls .control"))
    row.hidden = state.inspector === "object" && bound.has(row.dataset.key);
}
function numericButton(spec, getValue, makePatch) {
  const button = document.createElement("button");
  button.className = "scrub-value";
  button.title = `${spec.label} · 拖动微调，Shift 精调，双击精确输入`;
  button.setAttribute("aria-label", button.title);
  button.textContent = format(getValue());
  let drag = null;
  const stop = (cancel = false) => {
    const previous = drag;
    drag = null;
    if (cancelNumericEdit === cancelDrag) cancelNumericEdit = null;
    if (!previous) return;
    if (button.hasPointerCapture(previous.pointer))
      button.releasePointerCapture(previous.pointer);
    if (previous.moved) changeParams({}, { commit: true, cancelled: cancel });
  };
  const cancelDrag = () => stop(true);
  button.onpointerdown = (event) => {
    if (event.button !== 0 || button.disabled) return;
    cancelNumericEdit?.();
    drag = {
      x: event.clientX,
      value: getValue(),
      moved: false,
      pointer: event.pointerId,
    };
    cancelNumericEdit = cancelDrag;
    button.setPointerCapture(event.pointerId);
  };
  button.onpointermove = (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) > 2) drag.moved = true;
    if (!drag.moved) return;
    const sensitivity =
      Math.max(spec.step, (spec.max - spec.min) / 600) *
      (event.shiftKey ? 0.1 : 1);
    changeParams(makePatch(quantize(drag.value + dx * sensitivity, spec)), {
      commit: false,
    });
  };
  button.onpointerup = () => stop();
  button.onpointercancel = () => stop(true);
  button.onlostpointercapture = () => {
    if (drag) stop(true);
  };
  function precise() {
    if (button.disabled || button.hidden) return;
    stop(true);
    const input = document.createElement("input");
    input.className = "precision-input";
    input.type = "number";
    for (const property of ["min", "max", "step"])
      input[property] = spec[property];
    input.value = getValue();
    input.setAttribute("aria-label", `${spec.label}精确值`);
    button.hidden = true;
    button.after(input);
    input.focus({ preventScroll: true });
    input.select();
    let done = false;
    const finish = (cancel = false) => {
      if (done) return;
      done = true;
      cancelNumericEdit = null;
      const value = Number(input.value);
      if (!cancel && input.value !== "" && Number.isFinite(value))
        changeParams(makePatch(quantize(value, spec)), { commit: true });
      input.remove();
      button.hidden = false;
    };
    cancelNumericEdit = () => finish(true);
    input.onblur = () => finish();
    input.onkeydown = (event) => {
      if (["Enter", "Escape"].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        finish(event.key === "Escape");
        button.focus({ preventScroll: true });
      }
    };
  }
  button.ondblclick = precise;
  button.onkeydown = (event) => {
    if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      const sign = ["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1;
      changeParams(makePatch(quantize(getValue() + sign * spec.step, spec)), {
        commit: true,
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      precise();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stop(true);
    }
  };
  return button;
}
function buildExperiment() {
  const [instruction, question, fallback] = experiments[state.chapter.id];
  const presets = state.chapter.scenePresets?.length
    ? state.chapter.scenePresets.map((item) => [item.label, item.params])
    : fallback;
  $("#experiment-instruction").textContent = instruction;
  $("#experiment-question").textContent = question;
  $("#presets").replaceChildren();
  for (const [label, patch] of presets) {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => changeParams(clone(patch), { commit: true });
    $("#presets").append(b);
  }
}
function quantize(value, c) {
  return Number(
    Math.min(
      c.max,
      Math.max(c.min, c.min + Math.round((value - c.min) / c.step) * c.step),
    ).toFixed(6),
  );
}
function buildControls() {
  $("#controls").replaceChildren();
  const extraControls = document.createElement("details");
  extraControls.className = "control-group";
  const extraTitle = document.createElement("summary");
  extraTitle.textContent =
    state.chapter.id === "14"
      ? "相机与球体"
      : state.chapter.id === "15"
        ? "成像与相机"
        : "管线、相机与光源";
  extraControls.append(extraTitle);
  const seamControls = document.createElement("details");
  seamControls.className = "control-group";
  seamControls.dataset.controlGroup = "seam";
  seamControls.open = true;
  const seamTitle = document.createElement("summary");
  seamTitle.textContent = "曲面接缝";
  seamControls.append(seamTitle);
  for (const c of state.chapter.controls.filter((c) => c.key !== "size")) {
    const row = document.createElement("div");
    row.className = "control";
    row.dataset.key = c.key;
    const label = document.createElement("div");
    label.className = "control-label";
    label.innerHTML = `<span>${escape(c.label)}</span>`;
    row.append(label);
    if (c.type === "choice") {
      const buttons = document.createElement("div");
      buttons.className = "segmented";
      for (const option of c.options) {
        const b = document.createElement("button");
        b.textContent = option.label;
        b.dataset.value = JSON.stringify(option.value);
        b.onclick = () =>
          changeParams({ [c.key]: option.value }, { commit: true });
        buttons.append(b);
      }
      row.append(buttons);
    } else {
      const value = numericButton(
        c,
        () => state.params[c.key],
        (v) => ({ [c.key]: v }),
      );
      label.append(value);
      const range = document.createElement("input");
      range.type = "range";
      range.min = c.min;
      range.max = c.max;
      range.step = c.step;
      range.setAttribute("aria-label", c.label);
      range.oninput = () =>
        changeParams({ [c.key]: Number(range.value) }, { commit: false });
      range.onchange = () =>
        changeParams({ [c.key]: Number(range.value) }, { commit: true });
      range.onkeydown = (event) => {
        if (event.key === "Escape" && state.editStart) {
          event.preventDefault();
          event.stopPropagation();
          changeParams({}, { commit: true, cancelled: true });
        }
      };
      range.onpointercancel = () =>
        changeParams({}, { commit: true, cancelled: true });
      row.append(range);
    }
    const seam =
      state.chapter.id === "15" &&
      ["continuity", "left_span", "right_span", "tangent_scale"].includes(
        c.key,
      );
    const extra =
      (state.chapter.id === "13" &&
        !["divisions", "wave", "fragment"].includes(c.key)) ||
      (state.chapter.id === "14" &&
        ["yaw", "pitch", "distance", "fov", "radius"].includes(c.key)) ||
      (state.chapter.id === "15" &&
        !["mode", "divisions", "curvature_limit"].includes(c.key));
    (seam ? seamControls : extra ? extraControls : $("#controls")).append(row);
  }
  if (seamControls.children.length > 1) $("#controls").append(seamControls);
  if (extraControls.children.length > 1) $("#controls").append(extraControls);
  $("#resolutions").replaceChildren();
  const max = state.chapter.controls.find((c) => c.key === "size").max;
  for (const resolution of [64, 256, 512, 1024, 2048].filter((n) => n <= max)) {
    const b = document.createElement("button");
    b.textContent = resolution;
    b.dataset.resolution = resolution;
    b.onclick = () => changeParams({ size: resolution }, { commit: true });
    $("#resolutions").append(b);
  }
  syncControls();
}
function syncControls() {
  const seam = $('#controls [data-control-group="seam"]');
  if (seam) seam.hidden = state.params.mode !== "pair";
  for (const row of $$("#controls .control")) {
    const c = state.chapter.controls.find((c) => c.key === row.dataset.key),
      value = state.params[c.key],
      range = row.querySelector("input[type=range]");
    if (state.chapter.id === "15" && c.key === "tangent_scale")
      row.hidden = state.params.continuity !== "G1";
    if (range) {
      range.value = value;
      range.style.setProperty(
        "--fill",
        `${((value - c.min) / (c.max - c.min)) * 100}%`,
      );
      row.querySelector(".scrub-value").textContent = format(value);
    } else
      row
        .querySelectorAll("button")
        .forEach((b) =>
          b.classList.toggle("active", JSON.parse(b.dataset.value) === value),
        );
  }
  $$("[data-resolution]").forEach((b) =>
    b.classList.toggle(
      "active",
      Number(b.dataset.resolution) === state.params.size,
    ),
  );
  syncObjectProperties();
}
function syncHistory() {
  $("#undo-edit").disabled = !state.undo.length;
  $("#redo-edit").disabled = !state.redo.length;
}
function changeParams(
  patch,
  {
    commit = true,
    fromViewport = false,
    cancelled = false,
    record = true,
    replace = false,
  } = {},
) {
  const before = clone(state.params);
  if (cancelled) {
    state.params = state.editStart
      ? clone(state.editStart)
      : { ...state.params, ...clone(patch) };
    state.editStart = null;
  } else {
    state.params = replace
      ? clone(patch)
      : { ...state.params, ...clone(patch) };
    if (record) {
      if (!commit && !state.editStart) state.editStart = before;
      if (commit) {
        const start = state.editStart || before;
        if (JSON.stringify(start) !== JSON.stringify(state.params)) {
          state.undo.push(start);
          if (state.undo.length > 80) state.undo.shift();
          state.redo = [];
        }
        state.editStart = null;
      }
    }
  }
  state.revision++;
  syncControls();
  syncHistory();
  if (!fromViewport || cancelled)
    state.viewport.update(state.params, state.result || {});
  if (commit) {
    clearTimeout(previewTimer);
    previewTimer = null;
    persist();
    queueRender(false);
  } else if (!previewTimer) {
    // Throttle live input: continuous dragging must keep producing Python frames.
    previewTimer = setTimeout(() => {
      previewTimer = null;
      queueRender(true);
    }, 75);
  }
}
function travelHistory(direction) {
  const wasEditing = !!state.editStart;
  cancelNumericEdit?.();
  // A viewport gesture owns its preview. Changing tools asks it to restore the
  // authoritative start state before we move through committed edits.
  if (wasEditing) {
    state.viewport.setTool(state.tool);
    if (state.editStart) changeParams({}, { cancelled: true });
    return;
  }
  const from = direction === "undo" ? state.undo : state.redo;
  const to = direction === "undo" ? state.redo : state.undo;
  if (!from.length) return;
  to.push(clone(state.params));
  const params = from.pop();
  changeParams(params, { replace: true, record: false });
  toast(direction === "undo" ? "已撤销" : "已重做");
}
function queueRender(preview) {
  state.queued = {
    chapter: state.chapter.id,
    params: { ...clone(state.params), preview },
    revision: state.revision,
  };
  pump();
}
async function pump() {
  if (state.running || !state.queued) return;
  const job = state.queued;
  state.queued = null;
  state.running = true;
  status(job.params.preview ? "快速预览…" : "Python 正在渲染…", "busy");
  try {
    const result = await json("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapter: job.chapter, params: job.params }),
    });
    const livePreview =
      job.params.preview &&
      state.editStart &&
      job.revision > state.displayedRevision;
    if (
      job.chapter === state.chapter.id &&
      (job.revision === state.revision || livePreview)
    ) {
      state.displayedRevision = job.revision;
      state.result = result;
      state.viewport.update(state.params, result);
      if (state.needsFit) {
        state.viewport.resize();
        state.viewport.resetView();
        syncViewMode();
        state.needsFit = false;
      }
      $("#viewport-empty").hidden = true;
      showImages();
      showMetrics();
      showProbe();
      buildSceneTree();
      const selectedMeta = result.geometry?.objects?.find(
        (item) => item.id === state.selection?.id,
      );
      if (selectedMeta) selectObject({ ...state.selection, ...selectedMeta });
      syncPresentationLabels();
      syncTools();
      syncObjectProperties();
      $("#render-timing").textContent =
        `${Math.round(result.ms)} ms · ${result.images[0]?.width || state.params.size}²`;
      status(
        job.params.preview
          ? "预览已更新 · 松手生成完整图像"
          : "图像已更新 · Python / NumPy",
      );
    }
  } catch (error) {
    if (job.chapter === state.chapter.id && job.revision === state.revision) {
      status(error.message, "error");
      toast(error.message);
      $("#viewport-empty").hidden = true;
    }
  } finally {
    state.running = false;
    if (state.queued) pump();
  }
}
function showImages() {
  const images = state.result.images;
  if (!images.some((i) => i.id === state.channel))
    state.channel = images[0]?.id;
  $("#channels").replaceChildren();
  $("#inline-channels").replaceChildren();
  for (const image of images) {
    const b = document.createElement("button");
    b.textContent = image.label;
    b.classList.toggle("active", image.id === state.channel);
    b.onclick = () => {
      state.channel = image.id;
      showImages();
    };
    (state.chapter.dimension === 2
      ? $("#inline-channels")
      : $("#channels")
    ).append(b);
  }
  const image = images.find((i) => i.id === state.channel);
  if (image) {
    if (state.chapter.dimension === 2)
      state.viewport.update(state.params, { ...state.result, images: [image] });
    $("#render-image").src = image.url;
    $("#render-image").alt =
      `${state.chapter.title}：${image.label}，Python 渲染`;
    $("#image-dimensions").textContent = `${image.width} × ${image.height}`;
    comparison.setFrame(image, images);
    positionImageProbe();
  }
}
function showMetrics() {
  $("#metrics").innerHTML = state.result.metrics
    .slice(0, 4)
    .map(
      (m) =>
        `<span class="metric">${escape(m.label)}<strong>${escape(format(m.value))}</strong></span>`,
    )
    .join("");
}
function showProbe() {
  const probe = state.result.probe || {};
  $("#probe-values").replaceChildren();
  let count = 0;
  for (const [key, value] of Object.entries(probe)) {
    if (key === "segments" || key === "levels") continue;
    if (count++ >= (state.chapter.id === "15" ? 19 : 14)) break;
    const label =
      {
        view: "观察矩阵 V",
        projection: "投影矩阵 P",
        derivative: "曲线切向量",
        ...probeLabels,
      }[key] || key;
    if (Array.isArray(value) && Array.isArray(value[0])) {
      const details = document.createElement("details");
      details.className = "probe-matrix";
      details.innerHTML = `<summary>${escape(label)}</summary><div class="probe-matrix-grid" style="--columns:${value[0].length}">${value
        .flat()
        .map((v) => `<span>${escape(Number(v.toFixed(3)))}</span>`)
        .join("")}</div>`;
      $("#probe-values").append(details);
    } else {
      const row = document.createElement("div");
      row.className = "probe-row";
      row.innerHTML = `<span>${escape(label)}</span><span>${escape(format(value))}</span>`;
      $("#probe-values").append(row);
    }
  }
  if (!count) $("#probe-values").textContent = "单击成像检查一个像素";
  if (probe.segments?.length) showRayPath(probe.segments);
}
function showRayPath(segments) {
  if (state.rayStep >= segments.length) state.rayStep = null;
  state.viewport.setRayStep?.(state.rayStep);
  const section = document.createElement("div");
  section.className = "ray-path";
  section.innerHTML =
    '<div class="ray-path-title">像素的光路</div><div class="ray-path-steps"></div><div class="ray-path-values"></div>';
  const steps = section.querySelector(".ray-path-steps");
  const values = section.querySelector(".ray-path-values");
  const choices = [
    [null, "全部"],
    ...segments.map((s, i) => [i, i === 0 ? "主射线" : `反射 ${i}`]),
  ];
  const update = () => {
    steps
      .querySelectorAll("button")
      .forEach((b, i) =>
        b.setAttribute("aria-pressed", String(choices[i][0] === state.rayStep)),
      );
    const segment = state.rayStep === null ? null : segments[state.rayStep];
    const contribution =
      segment?.contribution ||
      segments.reduce(
        (sum, s) => sum.map((v, i) => v + s.contribution[i]),
        [0, 0, 0],
      );
    const rows = segment
      ? [
          ["命中", ["球 A", "球 B", "地面"][segment.owner] || "环境"],
          ["到达权重", segment.throughput],
          ["镜面系数", segment.reflectivity ?? "—"],
          ["继续权重", segment.continuation_weight ?? 0],
          ["本段 RGB", contribution],
        ]
      : [
          ["路径段数", segments.length],
          ["线性 RGB 合计", contribution],
        ];
    values.innerHTML = rows
      .map(
        ([label, value]) =>
          `<div class="probe-row"><span>${escape(label)}</span><span>${escape(format(value))}</span></div>`,
      )
      .join("");
  };
  for (const [index, label] of choices) {
    const button = document.createElement("button");
    button.textContent = label;
    button.dataset.rayStep = index === null ? "all" : index;
    button.onclick = () => {
      state.rayStep = index;
      state.viewMode = "space";
      syncViewMode();
      state.viewport.setTool("orbit");
      state.viewport.setRayStep?.(index);
      update();
    };
    steps.append(button);
  }
  update();
  $("#probe-values").append(section);
}
async function loadLesson() {
  figureInstances.forEach((figure) => figure.dispose());
  figureInstances = [];
  const revision = ++lessonRevision,
    chapter = state.chapter.id;
  inlineDemo.remove();
  chapterCode.remove();
  $("#lesson").innerHTML = "<p>正在展开本章…</p>";
  try {
    const data = await json(`/api/lesson?chapter=${chapter}&document=${encodeURIComponent(state.document)}`);
    if (revision !== lessonRevision) return;
    $("#lesson").innerHTML = data.html;
    if (state.document !== "lesson") {
      document.title = `${data.toc[0]?.label || "附录"} — 图形学交互书`;
      $("#progress-text").textContent = data.toc[0]?.label || "附录";
    }
    $("#lesson")
      .querySelectorAll(".tex")
      .forEach((el) =>
        window.katex?.render(el.dataset.tex, el, {
          displayMode: el.classList.contains("tex-block"),
          throwOnError: false,
          strict: false,
          trust: false,
        }),
      );
    $("#lesson")
      .querySelectorAll("pre code")
      .forEach((code) => {
        const language = [...code.classList]
          .find((c) => c.startsWith("language-"))
          ?.slice(9);
        if (window.Prism?.languages[language])
          code.innerHTML = Prism.highlight(
            code.textContent,
            Prism.languages[language],
            language,
          );
      });
    const mainSlot = $('#lesson [data-figure="main"]');
    if (mainSlot) mainSlot.replaceWith(inlineDemo, chapterCode);
    else if (state.document === "lesson") $("#lesson").append(inlineDemo, chapterCode);
    else $("#lesson").append(chapterCode);
    const specs = await figureCatalog();
    if (revision !== lessonRevision) return;
    for (const slot of $$("#lesson .figure-slot")) {
      const spec = specs.find((item) => item.id === slot.dataset.figure);
      if (spec)
        figureInstances.push(
          new TeachingFigure(slot, spec, async () => {
            chapterCode.dataset.explicitSource = "true";
            chapterCode.open = true;
            await loadSourceTree();
            await loadSource(spec.sourcePath || "teaching_figures.py");
            const codeLine = chapterCode.querySelector(
              ".code-line:nth-child(" + (spec.sourceLine || 1) + ")",
            );
            if (codeLine) {
              const scroller = chapterCode.querySelector(".code-scroll");
              scroller.scrollTop +=
                codeLine.getBoundingClientRect().top -
                scroller.getBoundingClientRect().top -
                32;
            }
            scrollBook(chapterCode);
            await new Promise(requestAnimationFrame);
            delete chapterCode.dataset.explicitSource;
          }),
        );
    }
    const nav = document.createElement("div");
    nav.className = "reading-nav";
    const index = state.catalog.findIndex((item) => item.id === chapter);
    const previous = state.catalog[index - 1],
      next = state.catalog[index + 1];
    const entries = state.document === "lesson"
      ? [[previous, "← 上一章"], [next || {id: "12", document: "capstone", title: "综合实践"}, next ? "下一章 →" : "综合实践 →"]]
      : [[{id: chapter, title: "返回正文"}, "← 返回正文"], [{id: "01", title: "从头阅读"}, "回到第一章 →"]];
    for (const [entry, label] of entries) {
      const node = document.createElement(entry ? "button" : "span");
      if (entry) {
        node.dataset.next = entry.id;
        if (entry.document) node.dataset.document = entry.document;
        node.textContent = label;
        node.title = entry.title;
      }
      nav.append(node);
    }
    $("#lesson").append(nav);
    nav
      .querySelectorAll("button")
      .forEach((b) => (b.onclick = () => selectChapter(b.dataset.next, {document: b.dataset.document || "lesson"})));
    $("#main").scrollTo({top: 0, behavior: "instant"});
    requestAnimationFrame(() => {
      state.viewport.resize();
      state.viewport.resetView();
    });
  } catch (error) {
    $("#lesson").textContent = error.message;
    status(error.message, "error");
  }
}
async function loadSourceTree() {
  const chapter = state.chapter.id;
  try {
    const groups = await json(`/api/source-tree?chapter=${chapter}`);
    if (chapter !== state.chapter.id) return;
    $("#source-tree").replaceChildren();
    for (const group of groups) {
      const title = document.createElement("div");
      title.className = "file-group";
      title.textContent = group.label;
      $("#source-tree").append(title);
      for (const file of group.files) {
        const b = document.createElement("button");
        b.className = "source-file";
        b.dataset.path = file.path;
        b.title = file.path;
        b.innerHTML = `<span class="file-icon">${file.path.endsWith(".py") ? "PY" : file.path.endsWith(".js") ? "JS" : "◇"}</span>${escape(group.label === "可追溯的基础算法" ? file.chapter.slice(0, 2) + "/" + file.name : file.name)}<span>${file.lines}</span>`;
        b.onclick = () => loadSource(file.path);
        $("#source-tree").append(b);
      }
    }
    const requested = new URL(location.href).searchParams.get("file"),
      files = groups.flatMap((g) => g.files),
      candidate =
        files.find((f) => f.path === (requested || state.source?.path)) ||
        files.find((f) => f.name === "core.py");
    if (requested) await loadSource(requested, false);
    else if (candidate) await loadSource(candidate.path, false);
  } catch (error) {
    status(error.message, "error");
  }
}
// Preserve multi-line syntax tokens while adding accurate line numbers.
function highlightedLines(text, language) {
  const markup = window.Prism?.languages[language]
      ? Prism.highlight(text, Prism.languages[language], language)
      : escape(text),
    template = document.createElement("template");
  template.innerHTML = markup;
  const lines = [""];
  function walk(node, classes = []) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent.split("\n").forEach((part, index) => {
        if (index) lines.push("");
        lines[lines.length - 1] += classes.length
          ? `<span class="${escape(classes.join(" "))}">${escape(part)}</span>`
          : escape(part);
      });
    } else
      for (const child of node.childNodes)
        walk(child, node.classList ? [...classes, ...node.classList] : classes);
  }
  walk(template.content);
  if (lines.at(-1) === "") lines.pop();
  return lines
    .map((line) => `<span class="code-line">${line || " "}</span>`)
    .join("");
}
async function loadSource(path, push = true) {
  const revision = ++sourceRevision;
  try {
    const data = await json("/api/source?path=" + encodeURIComponent(path));
    if (revision !== sourceRevision) return;
    state.source = data;
    $("#source-name").textContent = data.path.split("/").at(-1);
    $("#source-breadcrumb").textContent = data.path;
    $("#source-code").innerHTML = highlightedLines(data.text, data.language);
    $("#source-info").textContent =
      `${data.language.toUpperCase()}  ·  ${data.lineCount} 行  ·  UTF-8`;
    $$(".source-file").forEach((b) =>
      b.classList.toggle("active", b.dataset.path === path),
    );
    $(".code-scroll").scrollTop = 0;
    if (push) route(true);
  } catch (error) {
    status(error.message, "error");
  }
}
function download(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}
function scrollBook(element) {
  const main = $("#main");
  main.scrollTo({
    top:
      main.scrollTop +
      element.getBoundingClientRect().top -
      main.getBoundingClientRect().top -
      24,
    behavior: "smooth",
  });
}
function syncViewMode() {
  const is3D = state.chapter?.dimension === 3;
  $("#scene-navigation").hidden = !is3D;
  if (!is3D) return;
  const result = state.viewport.setViewMode?.(state.viewMode);
  if (result?.mode) state.viewMode = result.mode;
  $$("[data-view-mode]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.viewMode === state.viewMode,
    );
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.viewMode === state.viewMode),
    );
  });
  $("#view-type").textContent =
    state.viewMode === "camera" ? "RENDER CAMERA" : "WORLD SPACE";
}
$$("[data-view-mode]").forEach(
  (button) =>
    (button.onclick = () => {
      state.viewMode = button.dataset.viewMode;
      syncViewMode();
    }),
);
$$("[data-display]").forEach(
  (input) =>
    (input.onchange = () => {
      state.viewport.setDisplay?.(
        Object.fromEntries(
          $$("[data-display]").map((node) => [
            node.dataset.display,
            node.checked,
          ]),
        ),
      );
    }),
);
function resizeEditor() {
  requestAnimationFrame(() => state.viewport?.resize());
}
function setMaximized(expanded) {
  inlineDemo.classList.toggle("demo-maximized", expanded);
  document.body.classList.toggle("editor-expanded", expanded);
  const button = $("#maximize-demo");
  button.setAttribute("aria-expanded", String(expanded));
  button.setAttribute("aria-label", expanded ? "还原书中演示" : "放大演示");
  button.title = expanded ? "还原书中演示 · Esc" : "放大演示";
  button.textContent = expanded ? "↙" : "⛶";
  resizeEditor();
}
$("#maximize-demo").onclick = () =>
  setMaximized(!inlineDemo.classList.contains("demo-maximized"));
function setProperties(open, user = false) {
  if (user) state.panelPreference = open;
  inlineDemo.classList.toggle("properties-collapsed", !open);
  $("#toggle-properties").setAttribute("aria-expanded", String(open));
  $("#toggle-properties").title = open ? "收起检查面板" : "展开检查面板";
  resizeEditor();
}
$("#toggle-properties").onclick = () =>
  setProperties(inlineDemo.classList.contains("properties-collapsed"), true);
function setInspector(tab, reveal = false) {
  state.inspector = tab;
  for (const button of $$("[data-inspector]")) {
    const selected = button.dataset.inspector === tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    $("#panel-" + button.dataset.inspector).hidden = !selected;
  }
  if (reveal) setProperties(true, true);
  syncObjectProperties();
}
$$("[data-inspector]").forEach((button, index, buttons) => {
  button.onclick = () => setInspector(button.dataset.inspector);
  button.onkeydown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? 2
          : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
    buttons[next].focus();
    setInspector(buttons[next].dataset.inspector);
  };
});
function syncPresentationLabels() {
  const controls = state.result?.geometry?.objects?.some(
    (item) => item.kind === "control",
  );
  const space = $('button[data-presentation="space"]');
  space.textContent = controls ? "控制网" : "空间";
  space.title = controls ? "空间预览 · 拖动控制点编辑曲面" : "空间预览";
  if (controls)
    $("#render-image").title =
      "拖动旋转相机，Shift 平移，滚轮缩放；在控制网中编辑点；单击检查像素";
  let toggle = $('[data-display="controlNet"]');
  if (controls && !toggle) {
    const label = document.createElement("label");
    toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.dataset.display = "controlNet";
    toggle.onchange = () =>
      state.viewport.setDisplay({ controlNet: toggle.checked });
    label.append(toggle, document.createTextNode("控制网"));
    $(".display-options > div").append(label);
  }
  if (toggle) {
    if (controls) toggle.checked = state.viewport.display.controlNet;
    else toggle.parentElement.remove();
  }
}
function setPresentation(mode) {
  if (!state.chapter) return;
  state.presentation = state.chapter.dimension === 2 ? "space" : mode;
  inlineDemo.dataset.presentation = state.presentation;
  syncPresentationLabels();
  $(".presentation-modes").hidden = state.chapter.dimension === 2;
  for (const button of $$("button[data-presentation]")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.presentation === state.presentation),
    );
    button.hidden = state.chapter.dimension === 2;
  }
  $("#presentation-note").textContent =
    state.chapter.dimension === 2
      ? "Python · 直接操纵"
      : mode === "image"
        ? "Python / NumPy"
        : mode === "space"
          ? "空间预览"
          : "空间预览 / Python 成像";
  // Reconnecting input must preserve parameters, selection and edit history.
  const touch = matchMedia("(pointer: coarse)").matches;
  const canActivate =
    touch && state.chapter.dimension === 3 && mode === "image";
  const touchButton = $("#image-interaction");
  touchButton.hidden = !canActivate;
  touchButton.textContent = state.imageTouch ? "完成操作" : "操作画面";
  touchButton.setAttribute("aria-pressed", String(state.imageTouch));
  state.viewport?.setImageSurface?.(
    $("#render-image"),
    mode === "image" && (!touch || state.imageTouch),
  );
  if (touch && !state.imageTouch)
    $("#render-image").style.touchAction = "pan-y";
  resizeEditor();
}
$$("button[data-presentation]").forEach(
  (button) =>
    (button.onclick = () => setPresentation(button.dataset.presentation)),
);
$("#image-interaction").onclick = () => {
  state.imageTouch = !state.imageTouch;
  setPresentation(state.presentation);
};
inlineDemo.addEventListener("pointerdown", (event) => {
  if (
    state.imageTouch &&
    !event.target.closest("#render-well, #image-interaction")
  ) {
    state.imageTouch = false;
    setPresentation(state.presentation);
  }
});
const editorResize = new ResizeObserver(([entry]) => {
  if (!entry.contentRect.width) return;
  const compact = entry.contentRect.width < 1000;
  inlineDemo.classList.toggle("is-compact", compact);
  if (state.panelPreference === null) setProperties(!compact);
});
editorResize.observe(inlineDemo);
const divider = $("#scene-divider");
let dividerDrag = null;
function setSceneWidth(percent) {
  percent = Math.min(75, Math.max(25, percent));
  inlineDemo.style.setProperty("--scene-column", `${percent}fr`);
  inlineDemo.style.setProperty("--image-column", `${100 - percent}fr`);
  divider.setAttribute("aria-valuenow", String(Math.round(percent)));
  resizeEditor();
}
divider.onpointerdown = (event) => {
  if (event.button !== 0) return;
  dividerDrag = $(".workspace").getBoundingClientRect();
  divider.setPointerCapture(event.pointerId);
  event.preventDefault();
};
divider.onpointermove = (event) => {
  if (dividerDrag)
    setSceneWidth(
      ((event.clientX - dividerDrag.left) / dividerDrag.width) * 100,
    );
};
divider.onpointerup =
  divider.onpointercancel =
  divider.onlostpointercapture =
    () => {
      dividerDrag = null;
    };
divider.onkeydown = (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  setSceneWidth(
    Number(divider.getAttribute("aria-valuenow")) +
      (event.key === "ArrowRight" ? 3 : -3),
  );
};
$("#undo-edit").onclick = () => travelHistory("undo");
$("#redo-edit").onclick = () => travelHistory("redo");
window.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key === "Escape" &&
      inlineDemo.classList.contains("demo-maximized") &&
      !state.editStart &&
      !cancelNumericEdit &&
      !$("#help-dialog").open &&
      !["INPUT", "TEXTAREA"].includes(event.target.tagName)
    )
      setMaximized(false);
  },
  { capture: true },
);
$("#jump-demo").onclick = () => scrollBook(inlineDemo);
chapterCode.addEventListener("toggle", () => {
  if (chapterCode.open && !chapterCode.dataset.explicitSource) loadSourceTree();
});
function focusView() {
  if (state.viewport.focusSelected) state.viewport.focusSelected();
  else state.viewport.resetView();
}
$("#fit-view").onclick = focusView;
$("#reset-params").onclick = () => {
  cancelNumericEdit?.();
  state.channel = null;
  changeParams(state.chapter.defaults, { commit: true, replace: true });
  state.viewport.resetView();
  toast("已恢复本章初始参数");
};
$("#render-button").onclick = () => {
  clearTimeout(previewTimer);
  previewTimer = null;
  state.revision++;
  queueRender(false);
};
$("#nav-toggle").onclick = () => {
  if (innerWidth <= 720) {
    $("#sidebar").classList.toggle("open");
  } else {
    document.body.classList.toggle("sidebar-collapsed");
    try {
      localStorage.setItem(
        "graphic-sidebar-collapsed",
        document.body.classList.contains("sidebar-collapsed"),
      );
    } catch {}
  }
  const collapsed =
    innerWidth <= 720
      ? !$("#sidebar").classList.contains("open")
      : document.body.classList.contains("sidebar-collapsed");
  $("#nav-toggle").setAttribute("aria-expanded", String(!collapsed));
};
$("#main").addEventListener("pointerdown", () => {
  if (innerWidth <= 720) $("#sidebar").classList.remove("open");
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $("#sidebar").classList.remove("open");
});
$("#help-button").onclick = () => $("#help-dialog").showModal();
$("#close-help").onclick = () => $("#help-dialog").close();
$("#copy-source").onclick = async () => {
  if (!state.source) return;
  try {
    await navigator.clipboard.writeText(state.source.text);
    toast("已复制完整文件");
  } catch {
    toast("浏览器未允许剪贴板，可下载完整文件");
  }
};
$("#download-file").onclick = () => {
  if (!state.source) return;
  const url = URL.createObjectURL(
    new Blob([state.source.text], { type: "text/plain;charset=utf-8" }),
  );
  download(url, state.source.path.split("/").at(-1));
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("#save-image").onclick = () => {
  const image = state.result?.images.find((i) => i.id === state.channel);
  if (image) download(image.url, `graphic-${state.chapter.id}-${image.id}.png`);
};
function positionImageProbe() {
  // The whole demo is briefly detached while a chapter loads.
  const marker = inlineDemo.querySelector("#image-probe");
  if (marker.hidden || !state.params.probe) return;
  const image = inlineDemo
    .querySelector("#render-image")
    .getBoundingClientRect();
  const well = inlineDemo.querySelector("#render-well").getBoundingClientRect();
  const [u, v] = state.params.probe;
  marker.style.left = `${image.left - well.left + u * image.width}px`;
  marker.style.top = `${image.top - well.top + (1 - v) * image.height}px`;
}
const probeResize = new ResizeObserver(() => {
  const well = inlineDemo.querySelector("#render-well");
  const styles = getComputedStyle(well);
  const side = Math.max(
    0,
    Math.min(
      well.clientWidth -
        parseFloat(styles.paddingLeft) -
        parseFloat(styles.paddingRight),
      well.clientHeight -
        parseFloat(styles.paddingTop) -
        parseFloat(styles.paddingBottom),
    ),
  );
  if (side) well.style.setProperty("--render-side", `${Math.floor(side)}px`);
  positionImageProbe();
});
probeResize.observe($("#render-well"));
probeResize.observe($("#render-image"));
$("#render-image").addEventListener("load", positionImageProbe);
$("#render-image").onclick = (e) => {
  if (state.viewport?.imageGestureMoved) return;
  const r = e.target.getBoundingClientRect(),
    uv = [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)),
    ];
  $("#image-probe").hidden = false;
  setInspector("pixel", true);
  state.viewport.pickImage?.(uv);
  changeParams({ probe: uv }, { commit: true, record: false });
  positionImageProbe();
};
window.addEventListener("keydown", (e) => {
  if (
    document.activeElement?.matches(
      "textarea, input:not([type=range]), [contenteditable=true]",
    ) ||
    $("#help-dialog").open ||
    !inlineDemo.contains(document.activeElement)
  )
    return;
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === "z") {
    e.preventDefault();
    travelHistory(e.shiftKey ? "redo" : "undo");
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (key === "f") {
    e.preventDefault();
    focusView();
  }
  if (state.chapter.dimension === 3 && ["w", "e", "r"].includes(key)) {
    e.preventDefault();
    setTool({ w: "translate", e: "rotate", r: "scale" }[key]);
  }
  if (e.key === "Enter" && document.activeElement?.tagName !== "BUTTON") {
    e.preventDefault();
    queueRender(false);
  }
  if (e.key === "Escape") {
    if (cancelNumericEdit) {
      cancelNumericEdit();
      return;
    }
    if (state.editStart) {
      changeParams({}, { cancelled: true });
      return;
    }
    if (inlineDemo.classList.contains("demo-maximized")) setMaximized(false);
    $("#sidebar").classList.remove("open");
    if (inlineDemo.classList.contains("is-compact")) setProperties(false, true);
  }
});
window.addEventListener("popstate", () => {
  const p = new URL(location.href).searchParams;
  selectChapter(p.get("chapter") || "01", { push: false, document: p.get("document") || "lesson" });
});
async function boot() {
  try {
    if (
      localStorage.getItem("graphic-sidebar-collapsed") === "true" &&
      innerWidth > 720
    )
      document.body.classList.add("sidebar-collapsed");
    state.catalog = await json("/api/catalog");
    buildNavigation();
    const p = new URL(location.href).searchParams;
    await selectChapter(p.get("chapter") || "01", { push: false, document: p.get("document") || "lesson" });
    if (p.get("file") || p.get("tab") === "source") {
      chapterCode.open = true;
      scrollBook(chapterCode);
    }
  } catch (error) {
    status("加载失败：" + error.message, "error");
    $("#viewport-empty").textContent = "加载失败，请刷新页面";
  }
}
boot();
