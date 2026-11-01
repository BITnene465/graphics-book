// Compare two actual Python images. The divider never computes or alters pixels.
export class RenderComparison {
  constructor(well, image, toggle, freeze) {
    this.well = well;
    this.image = image;
    this.toggle = toggle;
    this.freeze = freeze;
    this.position = 0.5;
    this.enabled = false;
    this.pinned = null;
    this.layer = document.createElement("div");
    this.layer.className = "render-comparison";
    this.layer.hidden = true;
    this.reference = document.createElement("img");
    this.reference.draggable = false;
    this.divider = document.createElement("button");
    this.divider.className = "comparison-divider";
    this.divider.textContent = "↔";
    this.divider.setAttribute("role", "slider");
    this.divider.setAttribute("aria-label", "A/B 对照分界");
    this.divider.setAttribute("aria-valuemin", "0");
    this.divider.setAttribute("aria-valuemax", "100");
    this.leftLabel = document.createElement("span");
    this.leftLabel.className = "comparison-label comparison-a";
    this.rightLabel = document.createElement("span");
    this.rightLabel.className = "comparison-label comparison-b";
    this.layer.append(
      this.reference,
      this.divider,
      this.leftLabel,
      this.rightLabel,
    );
    well.append(this.layer);
    toggle.onclick = () => {
      this.enabled = !this.enabled;
      this.update();
    };
    freeze.onclick = () => {
      if (this.pinned) this.pinned = null;
      else if (this.current) {
        this.pinned = { ...this.current };
        this.enabled = true;
      }
      this.update();
    };
    this.divider.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.drag = true;
      this.divider.setPointerCapture(e.pointerId);
    };
    this.divider.onpointermove = (e) => {
      if (!this.drag) return;
      const r = this.layer.getBoundingClientRect();
      this.position = Math.min(
        0.97,
        Math.max(0.03, (e.clientX - r.left) / r.width),
      );
      this.layout();
    };
    this.divider.onpointerup = this.divider.onpointercancel = () =>
      (this.drag = false);
    this.divider.onkeydown = (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      this.position =
        e.key === "Home"
          ? 0.03
          : e.key === "End"
            ? 0.97
            : Math.min(
                0.97,
                Math.max(
                  0.03,
                  this.position + (e.key === "ArrowRight" ? 0.025 : -0.025),
                ),
              );
      this.layout();
    };
    this.image.addEventListener("load", () => this.layout());
    this.resize = new ResizeObserver(() => this.layout());
    this.resize.observe(well);
  }
  reset() {
    this.pinned = null;
    this.enabled = false;
    this.current = null;
    this.images = [];
    this.position = 0.5;
    this.update();
  }
  setFrame(current, images) {
    this.current = current;
    this.images = images;
    this.update();
  }
  update() {
    const other =
      this.pinned ||
      this.images?.find(
        (i) =>
          i.id !== this.current?.id &&
          i.width === this.current?.width &&
          i.height === this.current?.height,
      );
    const active = !!(this.current && other && this.enabled);
    this.layer.hidden = !active;
    this.toggle.disabled = !other;
    this.toggle.setAttribute("aria-pressed", String(active));
    this.freeze.disabled = !this.current;
    this.freeze.textContent = this.pinned ? "清除 A" : "定格 A";
    this.freeze.setAttribute("aria-pressed", String(!!this.pinned));
    if (active) {
      this.reference.src = other.url;
      this.reference.alt = "Python 对照图：" + other.label;
      this.leftLabel.textContent =
        "A · " + (this.pinned ? "已定格" : other.label);
      this.rightLabel.textContent = "B · " + this.current.label;
    }
    this.layout();
  }
  layout() {
    if (this.layer.hidden) return;
    const r = this.image.getBoundingClientRect(),
      parent = this.well.getBoundingClientRect();
    Object.assign(this.layer.style, {
      left: r.left - parent.left + "px",
      top: r.top - parent.top + "px",
      width: r.width + "px",
      height: r.height + "px",
    });
    this.reference.style.clipPath = `inset(0 ${(1 - this.position) * 100}% 0 0)`;
    this.divider.style.left = this.position * 100 + "%";
    this.divider.setAttribute(
      "aria-valuenow",
      String(Math.round(this.position * 100)),
    );
  }
}
