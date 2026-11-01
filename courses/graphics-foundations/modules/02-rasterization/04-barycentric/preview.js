// 拖动时的即时预览。只有面积比和显示处理；松手后 core.py 独立校验。
// Bokeh 的拖动事件在浏览器连续触发，Python 默认只收到最终状态。
const d = points.data;
if (d.x.length !== 4 || d.y.length !== 4) return;
// 吸附由 Python 在松手后提交；不要在增量拖动中反复改写点的位置。
const [A, B, C, P] = d.x.map((x, i) => [x, d.y[i]]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const ab = sub(B, A), ac = sub(C, A), ap = sub(P, A);
const scale = Math.max(...ab.map(Math.abs), ...ac.map(Math.abs));
const D = cross(ab, ac);
const normalizedAB = ab.map(n => n / scale), normalizedAC = ac.map(n => n / scale);
const normalizedAP = ap.map(n => n / scale);
const denominator = cross(normalizedAB, normalizedAC);
outline.data = {x: [A[0], B[0], C[0], A[0]], y: [A[1], B[1], C[1], A[1]]};
regions.data = {
    xs: [[P[0], B[0], C[0]], [P[0], C[0], A[0]], [P[0], A[0], B[0]]],
    ys: [[P[1], B[1], C[1]], [P[1], C[1], A[1]], [P[1], A[1], B[1]]],
    color: ['#d46150', '#449b68', '#507cbb']
};
cell.data = {x: [Math.floor(P[0]) + .5], y: [Math.floor(P[1]) + .5]};
cell_view.visible = snap.active;
const fmt = (n) => (Math.abs(n) < 0.0005 ? 0 : n).toFixed(3);
const pointText = `P = (${fmt(P[0])}, ${fmt(P[1])})`;
const invalid = !Number.isFinite(denominator) || !scale || Math.abs(denominator) <= 32 * Number.EPSILON;
if (invalid) {
    readout.text = `<div class="readout"><div class="top"><span class="eyebrow">LIVE / 当前探针</span><span class="state error">三角形退化</span></div><div class="point">${pointText}</div><p>三个顶点共线或重合，总面积为零或过小。面积比在这里不能稳定计算。</p><p class="muted">拖动任意顶点离开直线，或选择「内部点」恢复。</p></div>`;
    return;
}
// P−A = λB(B−A) + λC(C−A)，与 core.py 保持同一个公式。
const wb = cross(normalizedAP, normalizedAC) / denominator;
const wc = cross(normalizedAB, normalizedAP) / denominator;
const w = [1 - wb - wc, wb, wc];
const inside = w.every(n => n >= -1e-9 && n <= 1 + 1e-9);
const boundary = inside && w.some(n => Math.abs(n) < 1e-9);
const colors = ['#c85646', '#3c8e5d', '#4675b1'];
const labels = ['A', 'B', 'C'];
const weights = w.map((n, i) => `<div class="weight" style="--ink:${colors[i]}"><div class="label">λ<sub>${labels[i]}</sub></div><div class="value">${fmt(n)}</div></div>`).join('');
const areas = w.map((n, i) => `<tr><td>S(${['PBC', 'PCA', 'PAB'][i]}) / S(ABC)</td><td>${fmt(n * D / 2)} / ${fmt(D / 2)}</td></tr>`).join('');
const encode = n => { n = Math.max(0, Math.min(1, n)); return n <= .0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - .055; };
const rgb = w.map(n => Math.round(encode(n) * 255));
const fill = inside ? `rgb(${rgb.join(',')})` : 'repeating-linear-gradient(45deg,#f0f0eb,#f0f0eb 5px,#fff 5px,#fff 10px)';
const rebuilt = [0, 1].map(j => w[0] * A[j] + w[1] * B[j] + w[2] * C[j]);
const centered = P.every(n => Math.abs(n - Math.floor(n) - .5) < 1e-9);
const mode = !snap.active ? '自由探针 · 连续坐标' : centered
    ? `像素索引 (${Math.floor(P[0])}, ${Math.floor(P[1])}) · 中心采样`
    : '拖动预览 · 松手后吸附到像素中心';
readout.text = `<div class="readout">
  <div class="top"><span class="eyebrow">LIVE / 当前探针</span><span class="state ${inside ? '' : 'outside'}">${boundary ? '边界上' : inside ? '三角形内部' : '三角形外部'}</span></div>
  <div class="point">${pointText}</div>
  <div class="weights">${weights}</div>
  <div class="equation">λA + λB + λC = ${fmt(w.reduce((a, b) => a + b, 0))}<br>λA·A + λB·B + λC·C = (${fmt(rebuilt[0])}, ${fmt(rebuilt[1])})</div>
  <table class="area-table">${areas}</table>
  <div class="mix"><div class="swatch" style="background:${fill}"></div><div><div>${inside ? '插值颜色' : '不覆盖此点'}</div><div class="muted">线性 RGB (${w.map(fmt).join(', ')})</div><div class="muted">${inside ? `显示 sRGB (${rgb.join(', ')})` : '负权重保留，外部点不输出颜色'}</div></div></div>
  <div class="status-line">${mode}</div>
</div>`;
