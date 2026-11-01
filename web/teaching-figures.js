// Transport and SVG presentation only. All geometric construction is in teaching_figures.py.
const NS = "http://www.w3.org/2000/svg";
const svgNode = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, value);
  return node;
};
const button = (label, title, action) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.onclick = action;
  return b;
};
let catalogPromise;
export function figureCatalog() {
  return (catalogPromise ||= fetch("/api/figures").then((r) => r.json()));
}
export class TeachingFigure {
  constructor(host, spec, onSource) {
    this.host = host;
    this.spec = spec;
    this.params = structuredClone(spec.defaults);
    this.progress = spec.initialProgress ?? 1;
    this.version = 0;
    this.playing = false;
    this.visible = false;
    this.history = [];
    this.future = [];
    this.disposed = false;
    this.view = { zoom: 1, x: 0, y: 0 };
    this.panelViews = new Map();
    this.handleNodes = new Map();
    this.pointers = new Map();
    this.selectedHandle = null;
    host.className = "teaching-figure";
    host.dataset.figure = spec.id;
    host.tabIndex = 0;
    host.setAttribute("aria-label", spec.title);
    const header = document.createElement("div");
    header.className = "figure-heading";
    const title = document.createElement("h3");
    title.textContent = spec.title;
    const mark = document.createElement("span");
    mark.className = "figure-number";
    mark.textContent = "动态推导";
    const actions = document.createElement("div");
    actions.className = "figure-actions";
    actions.append(
      button("⤢", "适配视图 · F（保留参数）", () => this.resetView()),
      button("↓", "导出当前数学图 · SVG", () => this.exportSvg()),
      button("〈/〉", "查看 Python 构造代码", onSource),
    );
    header.append(mark, title, actions);
    this.svg = svgNode("svg", {
      viewBox: "0 0 800 440",
      role: "img",
      "aria-label": spec.title,
      tabindex: 0,
    });
    this.svg.classList.add("math-stage");
    this.art = svgNode("g");
    this.handleLayer = svgNode("g");
    this.svg.append(this.art, this.handleLayer);
    const touchBar = document.createElement("div");
    touchBar.className = "figure-touch-bar";
    const touchButton = button("操作图形", "切换触屏图形操作", () => {
      this.touchActive = !this.touchActive;
      if (!this.touchActive) this.cancelDrag();
      host.classList.toggle("touch-active", this.touchActive);
      touchButton.textContent = this.touchActive ? "完成操作" : "操作图形";
      touchButton.setAttribute("aria-pressed", String(this.touchActive));
    });
    touchButton.setAttribute("aria-pressed", "false");
    touchBar.append(touchButton);
    this.equation = document.createElement("div");
    this.equation.className = "figure-equation";
    this.values = document.createElement("div");
    this.values.className = "figure-values";
    this.readout = document.createElement("details");
    this.readout.className = "figure-readout";
    const readoutTitle = document.createElement("summary");
    readoutTitle.textContent = "数值检验";
    this.readout.append(readoutTitle, this.values);
    const transport = document.createElement("div");
    transport.className = "figure-transport";
    this.playButton = button("▶", "播放 / 暂停 · 轻按空格", () =>
      this.toggle(),
    );
    this.timeline = document.createElement("input");
    this.timeline.type = "range";
    this.timeline.min = 0;
    this.timeline.max = 1;
    this.timeline.step = 0.001;
    this.timeline.value = 1;
    this.timeline.setAttribute("aria-label", "构造进度");
    this.timeline.oninput = () => {
      this.pause();
      this.progress = +this.timeline.value;
      this.request();
    };
    this.timeLabel = document.createElement("output");
    this.timeLabel.textContent = "100%";
    transport.append(
      this.playButton,
      button("‹", "后退一步", () => this.step(-0.1)),
      this.timeline,
      button("›", "前进一步", () => this.step(0.1)),
      this.timeLabel,
      button("↺", "重置参数与构造进度（保留视图）", () => {
        this.remember();
        this.params = structuredClone(spec.defaults);
        this.progress = spec.initialProgress ?? 1;
        this.pause();
        this.syncControls();
        this.request();
      }),
    );
    if (spec.animated === false) {
      actions.append(transport.lastElementChild);
      transport.hidden = true;
      mark.textContent = "Python 实验";
    }
    const controls = document.createElement("div");
    controls.className = "figure-controls";
    this.controls = [];
    this.controlGroups = [];
    for (const c of spec.controls) {
      const group = document.createElement("div");
      group.className = "figure-control";
      const label = document.createElement("span");
      label.textContent = c.label;
      group.append(label);
      if (c.options) {
        for (const option of c.options) {
          const b = button(
            typeof option.value === "boolean"
              ? option.value
                ? "是"
                : "否"
              : option.label,
            c.label + " " + option.label,
            () => {
              this.remember();
              this.params[c.key] = option.value;
              this.pause();
              this.syncControls();
              this.request();
            },
          );
          group.append(b);
          this.controls.push({ key: c.key, node: b, value: option.value });
        }
      } else {
        const r = document.createElement("input");
        r.type = "range";
        r.min = c.min;
        r.max = c.max;
        r.step = c.step;
        r.setAttribute("aria-label", c.label);
        const out = document.createElement("output");
        r.onpointerdown = () => this.remember();
        r.onkeydown = (e) => {
          if (e.key.startsWith("Arrow")) this.remember();
        };
        r.oninput = () => {
          this.params[c.key] = +r.value;
          this.pause();
          this.syncControls();
          this.request();
        };
        group.append(r, out);
        this.controls.push({ key: c.key, node: r, out });
      }
      controls.append(group);
      this.controlGroups.push({ node: group, when: c.when });
    }
    host.replaceChildren(
      header,
      touchBar,
      this.svg,
      this.equation,
      transport,
      controls,
      this.readout,
    );
    this.svg.addEventListener("pointerdown", (e) => this.pointerDown(e));
    this.svg.addEventListener("pointermove", (e) => this.pointerMove(e));
    this.svg.addEventListener("pointerup", (e) => this.pointerUp(e));
    this.svg.addEventListener("pointercancel", () => this.cancelDrag());
    this.svg.addEventListener("wheel", (e) => this.wheel(e), {
      passive: false,
    });
    this.svg.addEventListener("contextmenu", (e) => e.preventDefault());
    this.onKeyDown = (e) => {
      if (e.target.closest("input, button, textarea, select")) return;
      if (e.code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) this.spaceUsed = false;
        this.spacePressed = true;
        this.svg.classList.add("can-pan");
      }
      if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        this.resetView();
      }
      if (e.key === "Escape" && this.pointers.size) {
        e.preventDefault();
        this.cancelDrag();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.stopPropagation();
        this.undo(e.shiftKey);
      }
    };
    this.onKeyUp = (e) => {
      if (e.code !== "Space" || !this.spacePressed) return;
      e.preventDefault();
      this.spacePressed = false;
      this.svg.classList.remove("can-pan");
      if (!this.spaceUsed) this.toggle();
    };
    this.onBlur = () => {
      this.spacePressed = false;
      this.svg.classList.remove("can-pan");
      if (this.pointers.size) this.cancelDrag();
    };
    host.addEventListener("keydown", this.onKeyDown);
    host.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.observer = new IntersectionObserver(
      (entries) => {
        this.visible = entries[0].isIntersecting;
        if (this.visible) {
          if (!this.frame) this.request();
        } else this.pause();
      },
      { rootMargin: "220px" },
    );
    this.observer.observe(host);
    this.onVisibility = () => {
      if (document.hidden) this.pause();
    };
    document.addEventListener("visibilitychange", this.onVisibility);
    this.resizeObserver = new ResizeObserver(() => {
      const width = this.svg.clientWidth;
      if (width !== this.resizeWidth && this.pointers.size) this.cancelDrag();
      this.resizeWidth = width;
      if (this.frame && !this.disposed) this.draw(this.frame);
    });
    this.resizeObserver.observe(this.svg);
    this.syncControls();
  }
  remember() {
    this.history.push(structuredClone(this.params));
    if (this.history.length > 30) this.history.shift();
    this.future = [];
  }
  undo(redo = false) {
    const from = redo ? this.future : this.history,
      to = redo ? this.history : this.future;
    if (!from.length) return;
    to.push(structuredClone(this.params));
    this.params = from.pop();
    this.pause();
    this.syncControls();
    this.request();
  }
  syncControls() {
    for (const group of this.controlGroups) {
      group.node.hidden = group.when
        ? Object.entries(group.when).some(
            ([key, value]) => this.params[key] !== value,
          )
        : false;
    }
    for (const c of this.controls) {
      if (c.out) {
        c.node.value = this.params[c.key];
        c.out.textContent = String(
          Number(Number(this.params[c.key]).toFixed(4)),
        );
      } else c.node.classList.toggle("active", this.params[c.key] === c.value);
    }
  }
  step(delta) {
    this.pause();
    this.progress = Math.max(0, Math.min(1, this.progress + delta));
    this.request();
  }
  pause() {
    this.playing = false;
    this.playButton.textContent = "▶";
    cancelAnimationFrame(this.raf);
  }
  toggle() {
    if (this.spec.animated === false) return;
    if (this.playing) return this.pause();
    if (this.progress >= 1) this.progress = 0;
    this.playing = true;
    this.playButton.textContent = "Ⅱ";
    this.lastTime = performance.now();
    this.tick();
  }
  tick() {
    if (!this.playing || this.disposed) return;
    const now = performance.now();
    this.progress = Math.min(1, this.progress + (now - this.lastTime) / 6000);
    this.lastTime = now;
    if (
      !this.lastRequest ||
      now - this.lastRequest >= 1000 / 30 ||
      this.progress >= 1
    ) {
      this.lastRequest = now;
      this.request();
    }
    if (this.progress >= 1) this.pause();
    else this.raf = requestAnimationFrame(() => this.tick());
  }
  request() {
    this.version++;
    this.pending = true;
    this.pump();
  }
  async pump() {
    if (this.busy || !this.pending || this.disposed) return;
    this.busy = true;
    this.pending = false;
    const version = this.version;
    this.abort = new AbortController();
    try {
      const response = await fetch("/api/figure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: this.spec.id,
          params: this.params,
          progress: this.progress,
        }),
        signal: this.abort.signal,
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (this.disposed) return;
      // Requests are serialized: every completed Python frame is newer than the
      // displayed one. Dropping intermediate drag frames would freeze the figure
      // until pointerup on a slow connection. Only input handles are optimistic;
      // geometry, equations, and numerical results always come from Python.
      this.frame = data;
      this.frameVersion = version;
      this.baseBounds ||= [...data.bounds];
      this.draw(data);
      this.host.removeAttribute("data-error");
    } catch (error) {
      if (error.name !== "AbortError") {
        this.pause();
        this.values.textContent = error.message;
        this.readout.open = true;
        this.host.dataset.error = "true";
      }
    } finally {
      this.busy = false;
      if (this.pending && !this.disposed) this.pump();
    }
  }
  // Python declares semantic panels; presentation alone changes with available
  // width. Bounds are held stable during edits, so dragging never chases auto-fit.
  layout(frame) {
    const width = Math.max(1, this.svg.clientWidth);
    this.stacked = width < 620 && frame.panels?.length > 1;
    this.labelScale = frame.panels?.length
      ? 800 / width
      : width < 540
        ? Math.min(1.8, 640 / Math.max(300, width))
        : 1;
    this.layouts = new Map();
    let y = 0;
    if (this.stacked) {
      for (let i = 0; i < frame.panels.length; ) {
        const columns = frame.panels[i].columns || 1;
        const row = [];
        while (
          row.length < columns &&
          i < frame.panels.length &&
          (frame.panels[i].columns || 1) === columns
        )
          row.push(frame.panels[i++]);
        const cellWidth = 800 / columns;
        const padding = (columns === 1 ? 18 : 12) * this.labelScale;
        const cells = row.map((panel) => {
          if (!this.panelViews.has(panel.key))
            this.panelViews.set(panel.key, {
              bounds: [...panel.bounds],
              view: { zoom: 1, x: 0, y: 0 },
            });
          const saved = this.panelViews.get(panel.key);
          const [a, b, c, d] = saved.bounds;
          const height = Math.max(
            100 * this.labelScale,
            Math.min(
              380 * this.labelScale,
              ((cellWidth - 2 * padding) * (d - c)) / (b - a) + 2 * padding,
            ),
          );
          return { panel, saved, height };
        });
        const height = Math.max(...cells.map((cell) => cell.height));
        for (const [column, { panel, saved }] of cells.entries()) {
          const [a, b, c, d] = saved.bounds;
          this.layouts.set(panel.key, {
            ...saved,
            center: [cellWidth * (column + 0.5), y + height / 2],
            left: cellWidth * column,
            right: cellWidth * (column + 1),
            top: y,
            bottom: y + height,
            scale: Math.min(
              (cellWidth - 2 * padding) / (b - a),
              (height - 2 * padding) / (d - c),
            ),
          });
        }
        y += height;
      }
    }
    const [a, b, c, d] = this.baseBounds || frame.bounds;
    this.stageHeight = this.stacked
      ? y
      : frame.panels?.length
        ? Math.max(440, Math.min(660, (728 * (d - c)) / (b - a) + 80))
        : 440;
    this.svg.setAttribute("viewBox", `0 0 800 ${this.stageHeight}`);
    this.svg.classList.toggle("is-stacked", this.stacked);
    this.svg.classList.toggle("has-panels", !!frame.panels?.length);
    this.svg.style.aspectRatio = `800 / ${this.stageHeight}`;
    this.host.dataset.layout = this.stacked ? "stacked" : "overview";
  }
  panelLayout(key) {
    return (
      this.layouts?.get(key) || {
        bounds: this.baseBounds || this.frame.bounds,
        center: [400, this.stageHeight / 2],
        left: 0,
        right: 800,
        top: 0,
        bottom: this.stageHeight,
        scale: this.baseScale(),
        view: this.view,
      }
    );
  }
  panelAt(point) {
    if (!this.stacked) return null;
    return (
      [...this.layouts].find(
        ([, p]) =>
          point.y >= p.top &&
          point.y <= p.bottom &&
          point.x >= p.left &&
          point.x <= p.right,
      )?.[0] ?? null
    );
  }
  project(point, panel) {
    const {
      bounds: [a, b, c, d],
      center,
      scale,
      view,
    } = this.panelLayout(panel);
    return [
      center[0] + view.x + (point[0] - (a + b) / 2) * scale * view.zoom,
      center[1] + view.y - (point[1] - (c + d) / 2) * scale * view.zoom,
    ];
  }
  baseScale() {
    const [a, b, c, d] = this.baseBounds || this.frame.bounds;
    return Math.min(728 / (b - a), ((this.stageHeight || 440) - 80) / (d - c));
  }
  screenPoint(e) {
    const matrix = this.svg.getScreenCTM();
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
  }
  unproject(e, panel) {
    const q = this.screenPoint(e);
    const {
      bounds: [a, b, c, d],
      center,
      scale,
      view,
    } = this.panelLayout(panel);
    return [
      (q.x - center[0] - view.x) / (scale * view.zoom) + (a + b) / 2,
      (center[1] + view.y - q.y) / (scale * view.zoom) + (c + d) / 2,
    ];
  }
  resetView() {
    if (!this.frame) return;
    if (this.pointers.size) this.cancelDrag();
    this.baseBounds = [...this.frame.bounds];
    this.view = { zoom: 1, x: 0, y: 0 };
    this.panelViews.clear();
    this.draw(this.frame);
  }
  zoomAt(point, factor, panel = this.panelAt(point)) {
    if (this.drag) this.cancelDrag();
    const { center, view } = this.panelLayout(panel);
    const zoom = Math.max(0.5, Math.min(10, view.zoom * factor));
    const ratio = zoom / view.zoom;
    view.x = point.x - center[0] - (point.x - center[0] - view.x) * ratio;
    view.y = point.y - center[1] - (point.y - center[1] - view.y) * ratio;
    view.zoom = zoom;
    this.draw(this.frame);
  }
  wheel(e) {
    if (!this.frame) return;
    // Ordinary wheel scrolling belongs to the book. Modifier+wheel zooms the
    // mathematical view, like a document editor; trackpad pinch emits ctrlKey.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta =
      e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 440 : 1);
    this.zoomAt(
      this.screenPoint(e),
      Math.exp(-Math.max(-160, Math.min(160, delta)) * 0.003),
    );
  }
  exportSvg() {
    if (!this.frame) return;
    const svg = this.svg.cloneNode(true);
    svg.setAttribute("xmlns", NS);
    svg.setAttribute("width", "1600");
    svg.setAttribute("height", String(this.stageHeight * 2));
    svg.removeAttribute("tabindex");
    svg.classList.remove("math-stage");
    svg.querySelectorAll(".math-handle").forEach((node) => node.remove());
    const title = svgNode("title");
    title.textContent = this.spec.title;
    const style = svgNode("style");
    style.textContent =
      "text{font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;font-weight:400;paint-order:stroke;stroke:#101923;stroke-width:3px;stroke-linejoin:round}";
    svg.prepend(
      title,
      style,
      svgNode("rect", {
        width: 800,
        height: this.stageHeight,
        fill: "#101923",
      }),
    );
    const data = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(
      new Blob([data], { type: "image/svg+xml;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${this.spec.id}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  draw(frame) {
    this.layout(frame);
    const labelScale = this.labelScale;
    const fragment = document.createDocumentFragment();
    const panelGroups = new Map();
    if (this.stacked) {
      const defs = svgNode("defs");
      fragment.append(defs);
      for (const [key, layout] of this.layouts) {
        const clipId = `${this.spec.id}-${key}-clip`;
        const clip = svgNode("clipPath", { id: clipId });
        clip.append(
          svgNode("rect", {
            x: layout.left,
            y: layout.top,
            width: layout.right - layout.left,
            height: layout.bottom - layout.top,
          }),
        );
        defs.append(clip);
        const group = svgNode("g", {
          "clip-path": `url(#${clipId})`,
          "data-panel": key,
        });
        fragment.append(group);
        panelGroups.set(key, group);
        if (layout.top)
          fragment.append(
            svgNode("line", {
              x1: layout.left + 12 * labelScale,
              x2: layout.right - 12 * labelScale,
              y1: layout.top,
              y2: layout.top,
              stroke: "#293747",
              "stroke-width": labelScale,
            }),
          );
      }
    }
    for (const item of frame.items) {
      const layout = this.panelLayout(item.panel);
      const scale = layout.scale * layout.view.zoom;
      const project = (point) => this.project(point, item.panel);
      let node;
      const common = { opacity: item.opacity ?? 1 };
      if (item.kind === "line" || item.kind === "polygon") {
        node = svgNode(item.kind === "line" ? "polyline" : "polygon", {
          ...common,
          points: item.points.map((q) => project(q).join(",")).join(" "),
          fill: item.kind === "polygon" ? item.color : "none",
          stroke: item.kind === "line" ? item.color : "none",
          "stroke-width": (item.width || 1.4) * (this.stacked ? labelScale : 1),
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
        });
        if (item.dash) node.setAttribute("stroke-dasharray", "5 6");
      } else if (item.kind === "image") {
        const [x, y] = project([item.at[0], item.at[1] + item.size[1]]);
        node = svgNode("image", {
          ...common,
          x,
          y,
          width: item.size[0] * scale,
          height: item.size[1] * scale,
          href: item.url,
          preserveAspectRatio: "none",
          style: item.pixelated ? "image-rendering:pixelated" : "",
        });
      } else if (item.kind === "circle") {
        const [cx, cy] = project(item.at);
        node = svgNode("circle", {
          ...common,
          cx,
          cy,
          r: Math.max(
            2.2 * (this.stacked ? labelScale : 1),
            item.radius * scale,
          ),
          fill: item.color,
        });
      } else {
        const [x, y] = project(item.at);
        node = svgNode("text", {
          ...common,
          x,
          y,
          fill: item.color,
          "font-size": Math.max(12, item.size || 14) * labelScale,
        });
        node.textContent = item.text;
      }
      (panelGroups.get(item.panel) || fragment).append(node);
    }
    this.art.replaceChildren(fragment);
    // Keep control nodes stable across Python frames. Focus and held arrow keys
    // survive a redraw; only node positions and values change.
    const activeKeys = new Set();
    for (const [index, h] of frame.handles.entries()) {
      const key = this.handleId(h);
      activeKeys.add(key);
      let g = this.handleNodes.get(key);
      if (!g) {
        g = svgNode("g", { tabindex: 0, role: "slider" });
        g.classList.add("math-handle");
        g.append(
          svgNode("circle", { class: "handle-hit", fill: "transparent" }),
          svgNode("circle", {
            class: "handle-dot",
            fill: "#111e2c",
            stroke: h.color || "#ffdc80",
            "stroke-width": 1.8,
          }),
          svgNode("text", {
            class: "handle-label",
            fill: h.color || "#ffdc80",
            "font-size": 12,
          }),
          svgNode("text", {
            class: "handle-coordinate",
            fill: "#edf4fc",
            "font-size": 12,
          }),
        );
        g.addEventListener("keydown", (e) => this.handleKey(e, g));
        g.addEventListener("focus", () => {
          this.selectedHandle = key;
          this.refreshHandles();
        });
        this.handleNodes.set(key, g);
        this.handleLayer.append(g);
      }
      if (this.stacked)
        g.setAttribute("clip-path", `url(#${this.spec.id}-${h.panel}-clip)`);
      else g.removeAttribute("clip-path");
      g.handle = h;
      g.dataset.handle = index;
      g.dataset.handleKey = key;
      g.setAttribute("aria-label", h.label || h.key);
      this.positionHandle(g, h, labelScale);
    }
    for (const [key, g] of this.handleNodes) {
      if (activeKeys.has(key)) continue;
      if (document.activeElement === g) this.svg.focus({ preventScroll: true });
      g.remove();
      this.handleNodes.delete(key);
    }
    if (this.formula !== frame.formula) {
      this.formula = frame.formula;
      window.katex?.render(frame.formula, this.equation, {
        throwOnError: false,
        displayMode: true,
        strict: false,
      });
    }
    this.timeline.value = frame.progress;
    this.timeLabel.textContent = Math.round(frame.progress * 100) + "%";
    this.values.replaceChildren(
      ...Object.entries(frame.values).map(([key, value]) => {
        const cell = document.createElement("span");
        const name = document.createElement("span");
        name.textContent = key;
        const number = document.createElement("strong");
        number.textContent = Array.isArray(value)
          ? JSON.stringify(value)
          : value === null
            ? "—"
            : typeof value === "boolean"
              ? value
                ? "是"
                : "否"
              : String(value);
        cell.append(name, number);
        return cell;
      }),
    );
  }
  handleId(h) {
    return h.id ?? `${h.key}:${h.index ?? "scalar"}`;
  }
  inputValue(h) {
    return h.index == null ? this.params[h.key] : this.params[h.key][h.index];
  }
  inputPoint(h) {
    // This only maps the editable input coordinates. Noneditable coordinates,
    // including computed positions on a curve, remain from the Python frame.
    const current = this.inputValue(h);
    const at = [...h.at];
    for (const axis of h.axes) {
      const value = Array.isArray(current)
        ? current[h.components?.[axis] ?? axis]
        : current;
      at[axis] = h.mapping
        ? value * h.mapping.scale[axis] + h.mapping.offset[axis]
        : value;
    }
    return at;
  }
  positionHandle(g, h, labelScale = 1) {
    const point = this.inputPoint(h);
    const [x, y] = this.project(point, h.panel);
    const layout = this.panelLayout(h.panel);
    const key = this.handleId(h);
    const dragging =
      this.drag?.kind === "handle" && this.handleId(this.drag.handle) === key;
    const selected = h.select
      ? Object.entries(h.select).every(
          ([name, value]) => this.params[name] === value,
        )
      : this.selectedHandle === key;
    g.classList.toggle("is-selected", selected);
    g.classList.toggle("is-dragging", dragging);
    for (const c of g.querySelectorAll("circle")) {
      c.setAttribute("cx", x);
      c.setAttribute("cy", y);
      c.setAttribute(
        "r",
        (c.classList.contains("handle-hit") ? 19 : 6) * labelScale,
      );
    }
    const text = g.querySelector(".handle-label");
    text.setAttribute(
      "x",
      Math.max(layout.left + 12, Math.min(layout.right - 50, x + 13)),
    );
    text.setAttribute(
      "y",
      Math.max(layout.top + 18 * labelScale, y - 13 * labelScale),
    );
    text.setAttribute("font-size", 13 * labelScale);
    text.textContent = h.label || h.key;
    const value = this.inputValue(h);
    const formatted = (Array.isArray(value) ? value : [value])
      .map((v) => Number(v.toFixed(3)).toString())
      .join(", ");
    const coordinate = g.querySelector(".handle-coordinate");
    coordinate.setAttribute(
      "x",
      Math.max(layout.left + 12, Math.min(layout.right - 150, x + 13)),
    );
    coordinate.setAttribute(
      "y",
      Math.min(layout.bottom - 17 * labelScale, y + 23 * labelScale),
    );
    coordinate.setAttribute("font-size", 12 * labelScale);
    coordinate.textContent = Array.isArray(value)
      ? `(${formatted})`
      : formatted;
    g.setAttribute("aria-valuetext", formatted);
  }
  refreshHandles() {
    if (!this.frame) return;
    const labelScale = this.labelScale || 1;
    for (const g of this.handleNodes.values())
      this.positionHandle(g, g.handle, labelScale);
  }
  handleKey(e, g) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
      return;
    e.preventDefault();
    e.stopPropagation();
    const h = g.handle;
    const axis = e.key === "ArrowLeft" || e.key === "ArrowRight" ? 0 : 1;
    if (!h.axes.includes(axis)) return;
    if (!e.repeat) this.remember();
    const point = this.inputPoint(h);
    // Keyboard changes are in parameter units, independent of zoom and any
    // display mapping. Shift gives one tenth of the ordinary step.
    point[axis] +=
      (e.key === "ArrowLeft" || e.key === "ArrowDown" ? -0.04 : 0.04) *
      (e.shiftKey ? 0.1 : 1) *
      (h.mapping?.scale[axis] ?? 1);
    this.selectedHandle = this.handleId(h);
    this.setHandle(h, point);
  }
  pointerDown(e) {
    if (
      !this.frame ||
      e.button > 1 ||
      (e.pointerType === "touch" && !this.touchActive)
    )
      return;
    e.preventDefault();
    this.pointers.set(e.pointerId, this.screenPoint(e));
    this.svg.setPointerCapture(e.pointerId);
    if (this.pointers.size === 2) {
      // A second touch changes the gesture to view navigation. The first point's
      // last committed input is retained; pinch never modifies mathematical data.
      this.drag = null;
      this.beginPinch();
      this.svg.classList.add("is-panning");
      this.refreshHandles();
      return;
    }
    const node = e.target.closest("[data-handle]");
    if (node && e.button === 0 && !this.spacePressed) {
      node.focus({ preventScroll: true });
      this.pause();
      this.remember();
      this.drag = {
        kind: "handle",
        pointerId: e.pointerId,
        handle: structuredClone(node.handle),
        before: structuredClone(this.params),
        last: this.unproject(e, node.handle.panel),
      };
      this.selectedHandle = this.handleId(node.handle);
    } else {
      this.svg.focus({ preventScroll: true });
      const panel = this.panelAt(this.screenPoint(e));
      this.drag = {
        kind: "pan",
        panel,
        pointerId: e.pointerId,
        start: this.screenPoint(e),
        before: { ...this.panelLayout(panel).view },
      };
      this.spaceUsed = this.spacePressed;
      this.svg.classList.add("is-panning");
    }
    this.refreshHandles();
  }
  beginPinch() {
    const [a, b] = [...this.pointers.values()];
    const panel = this.pinch?.panel ?? this.panelAt(a);
    this.pinch = {
      panel,
      before: this.pinch?.before ?? { ...this.panelLayout(panel).view },
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }
  pointerMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    e.preventDefault();
    this.pointers.set(e.pointerId, this.screenPoint(e));
    if (this.pointers.size >= 2) {
      const previous = this.pinch;
      this.beginPinch();
      const view = this.panelLayout(previous.panel).view;
      view.x += this.pinch.center.x - previous.center.x;
      view.y += this.pinch.center.y - previous.center.y;
      this.zoomAt(
        this.pinch.center,
        this.pinch.distance / previous.distance,
        previous.panel,
      );
      return;
    }
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
    if (this.drag.kind === "pan") {
      const q = this.screenPoint(e);
      const view = this.panelLayout(this.drag.panel).view;
      view.x = this.drag.before.x + q.x - this.drag.start.x;
      view.y = this.drag.before.y + q.y - this.drag.start.y;
      this.draw(this.frame);
    } else {
      const point = this.unproject(e, this.drag.handle.panel);
      const gain = e.shiftKey ? 0.1 : 1;
      const input = this.inputPoint(this.drag.handle);
      this.setHandle(
        this.drag.handle,
        point.map((v, axis) => input[axis] + (v - this.drag.last[axis]) * gain),
      );
      this.drag.last = point;
    }
  }
  pointerUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.svg.hasPointerCapture(e.pointerId))
      this.svg.releasePointerCapture(e.pointerId);
    this.drag = null;
    this.pinch = null;
    this.svg.classList.remove("is-panning");
    if (this.pointers.size >= 2) {
      this.beginPinch();
      this.svg.classList.add("is-panning");
    } else if (this.pointers.size === 1) {
      const [pointerId, start] = [...this.pointers.entries()][0];
      const panel = this.panelAt(start);
      this.drag = {
        kind: "pan",
        pointerId,
        start,
        panel,
        before: { ...this.panelLayout(panel).view },
      };
      this.svg.classList.add("is-panning");
    }
    this.refreshHandles();
  }
  setHandle(h, point) {
    // A handle may select the mathematical quantity explained by linked panels.
    if (h.select) Object.assign(this.params, h.select);
    if (h.mapping)
      point = point.map(
        (v, i) => (v - h.mapping.offset[i]) / h.mapping.scale[i],
      );
    if (h.limits)
      point = [
        Math.max(h.limits[0], Math.min(h.limits[1], point[0])),
        Math.max(h.limits[2], Math.min(h.limits[3], point[1])),
      ];
    const current = this.inputValue(h);
    let next = Array.isArray(current) ? [...current] : current;
    if (Array.isArray(next)) {
      for (const axis of h.axes)
        next[h.components?.[axis] ?? axis] = point[axis];
    } else next = point[h.axes[0]];
    if (h.index == null) this.params[h.key] = next;
    else this.params[h.key][h.index] = next;
    if (this.spec.id !== "casteljau-steps") this.progress = 1;
    this.pause();
    this.syncControls();
    this.refreshHandles();
    this.request();
  }
  cancelDrag() {
    if (this.drag?.kind === "handle") {
      this.params = this.drag.before;
      this.history.pop();
      this.syncControls();
      this.request();
    } else if (this.drag?.kind === "pan") {
      Object.assign(this.panelLayout(this.drag.panel).view, this.drag.before);
    } else if (this.pinch) {
      Object.assign(this.panelLayout(this.pinch.panel).view, this.pinch.before);
    }
    for (const id of this.pointers.keys()) {
      if (this.svg.hasPointerCapture(id)) this.svg.releasePointerCapture(id);
    }
    this.pointers.clear();
    this.drag = null;
    this.pinch = null;
    this.svg.classList.remove("is-panning");
    if (this.frame) this.draw(this.frame);
  }
  dispose() {
    this.disposed = true;
    this.pause();
    this.abort?.abort();
    this.observer.disconnect();
    this.resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("blur", this.onBlur);
    this.host.removeEventListener("keydown", this.onKeyDown);
    this.host.removeEventListener("keyup", this.onKeyUp);
  }
}
