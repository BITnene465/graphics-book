// Canvas is an interaction preview. Python remains the source of rendered pixels.
const ACCENT = '#6d8dff';
const COLORS = ['#ef786e', '#5bd5a5', '#79a5ff', '#cf9bee'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const copy = value => JSON.parse(JSON.stringify(value));
const validPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const cross = (a, b, p) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const encode = x => Math.round(255*(x <= .0031308 ? 12.92*x : 1.055*x**(1/2.4)-.055));
const rgb = color => `rgb(${color.map(x => encode(clamp(x, 0, 1))).join(',')})`;
const multiply = (a, b) => a.map(row => b[0].map((_, j) => row.reduce((sum, x, k) => sum+x*b[k][j], 0)));

function transformMatrix(p) {
  const angle = (p.angle ?? 0)*Math.PI/180, c = Math.cos(angle), s = Math.sin(angle);
  const matrices = {
    T: [[1, 0, p.tx ?? 0], [0, 1, p.ty ?? 0], [0, 0, 1]],
    R: [[c, -s, 0], [s, c, 0], [0, 0, 1]],
    S: [[p.sx ?? 1, 0, 0], [0, p.sy ?? 1, 0], [0, 0, 1]],
  };
  let matrix = [[1,0,0], [0,1,0], [0,0,1]];
  for (const key of p.order ?? 'TRS') matrix = multiply(matrix, matrices[key]);
  return multiply(matrix, [[1, p.shear ?? 0, 0], [0, 1, 0], [0, 0, 1]]);
}

function levelsAt(points, t) {
  const levels = [points];
  while (levels.at(-1).length > 1) {
    const previous = levels.at(-1);
    levels.push(previous.slice(0, -1).map((p, i) => p.map((x, j) => (1-t)*x+t*previous[i+1][j])));
  }
  return levels;
}

export class Viewport2D {
  constructor(container, {onChange, onSelect, onStatus, onProbe} = {}) {
    this.container = container;
    this.callbacks = {onChange, onSelect, onStatus, onProbe};
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'viewport-2d';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-label', '二维图形视口。拖动控制点，方向键微调，空格拖动平移，滚轮缩放，双击适配。');
    Object.assign(this.canvas.style, {display:'block', width:'100%', height:'100%', touchAction:'none', userSelect:'none', outline:'none', background:'#11151b'});
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.params = {}; this.result = {}; this.chapter = '';
    this.bounds = [-3,3,-3,3]; this.center = [0,0]; this.scale = 60;
    this.width = 1; this.height = 1; this.tool = 'select';
    this.selected = null; this.hover = null; this.gesture = null; this.space = false;
    this.frame = 0; this.disposed = false; this.fitPending = true;
    this.image = null; this.imageURL = null; this.imageInfo = null; this.imageParams = null; this.loadingImage = null;
    this.lastProbe = null; this.listeners = []; this.triangleCache = null;
    this.listen(this.canvas, 'pointerdown', e => this.pointerDown(e));
    this.listen(this.canvas, 'pointermove', e => this.pointerMove(e));
    this.listen(this.canvas, 'pointerup', e => this.pointerEnd(e));
    this.listen(this.canvas, 'pointercancel', e => this.cancelGesture(e));
    this.listen(this.canvas, 'lostpointercapture', e => this.pointerEnd(e));
    this.listen(this.canvas, 'pointerleave', () => { if (!this.gesture) { this.hover = null; this.cursor(); this.requestDraw(); } });
    this.listen(this.canvas, 'wheel', e => this.wheel(e), {passive:false});
    this.listen(this.canvas, 'dblclick', e => { e.preventDefault(); this.resetView(); });
    this.listen(this.canvas, 'keydown', e => this.keyDown(e));
    this.listen(this.canvas, 'keyup', e => { if (e.code === 'Space') { this.space = false; this.cursor(); } });
    this.listen(this.canvas, 'blur', () => { this.space = false; this.cursor(); });
    this.listen(window, 'blur', () => { this.space = false; this.pointerEnd(); });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  listen(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    this.listeners.push(() => target.removeEventListener(type, callback, options));
  }

  setChapter(chapter, params = {}, result = {}) {
    this.pointerEnd();
    this.chapter = String(typeof chapter === 'object' ? chapter.id : chapter).padStart(2, '0');
    this.params = {...(typeof chapter === 'object' ? chapter.defaults : {}), ...params};
    this.result = {}; this.selected = null; this.hover = null; this.lastProbe = null;
    this.image = null; this.imageURL = null; this.imageInfo = null; this.imageParams = null; this.triangleCache = null;
    this.update(this.params, result);
    this.resetView();
  }

  update(params = {}, result) {
    if (this.disposed) return;
    const pending = this.gesture?.patch;
    this.params = {...this.params, ...params, ...pending};
    if (result) this.result = result;
    const fallback = this.chapter === '01' ? [0,1,0,1] : this.chapter === '08' ? [-this.params.size/2,this.params.size/2,-this.params.size/2,this.params.size/2] : [-3,3,-3,3];
    const bounds = this.result.bounds ?? fallback;
    if (bounds.length === 4 && bounds.every(Number.isFinite) && bounds[1] > bounds[0] && bounds[3] > bounds[2]) this.bounds = [...bounds];
    const source = this.result.image ?? this.result.images?.[0];
    const info = typeof source === 'string' ? {url:source} : source;
    if (info?.url && info.url !== this.imageURL) {
      this.imageURL = info.url;
      const imageParams = copy(this.result.params ?? this.params);
      const image = new Image();
      this.loadingImage = image;
      image.onload = () => {
        if (this.disposed || this.imageURL !== info.url) return;
        this.image = image;
        this.imageParams = imageParams;
        this.imageInfo = {width:info.width ?? image.naturalWidth, height:info.height ?? image.naturalHeight};
        this.requestDraw();
      };
      image.onerror = () => { if (!this.disposed && this.imageURL === info.url) this.status('图像暂时无法显示'); };
      image.src = info.url;
    }
    this.requestDraw();
  }

  setTool(tool) { this.cancelGesture(); this.tool = tool === 'pan' ? 'pan' : 'select'; this.cursor(); }

  resetView() {
    let [xmin,xmax,ymin,ymax] = this.bounds;
    if (['02','04','11'].includes(this.chapter)) {
      let points = this.handles().map(h => [h.x,h.y]);
      if (this.chapter === '02') points.push(...this.transformScene().house);
      for (const [x,y] of points) { xmin=Math.min(xmin,x); xmax=Math.max(xmax,x); ymin=Math.min(ymin,y); ymax=Math.max(ymax,y); }
    }
    this.center = [(xmin+xmax)/2, (ymin+ymax)/2];
    this.scale = .82*Math.min(this.width/(xmax-xmin), this.height/(ymax-ymin));
    this.fitScale = this.scale;
    this.fitPending = this.width <= 1 || this.height <= 1;
    this.status('拖动控制点 · 滚轮缩放 · 空格平移');
    this.requestDraw();
  }

  resize() {
    if (this.disposed) return;
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const width = rect.width, height = rect.height;
    const ratio = Math.min(width/this.width, height/this.height);
    this.width = width; this.height = height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width*this.dpr); this.canvas.height = Math.round(height*this.dpr);
    if (this.fitPending) this.resetView();
    else { this.scale *= ratio; this.fitScale *= ratio; this.requestDraw(); }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    for (const remove of this.listeners) remove();
    if (this.loadingImage) this.loadingImage.onload = this.loadingImage.onerror = null;
    this.canvas.remove(); this.image = null; this.gesture = null;
  }

  screen([x,y]) { return [this.width/2+(x-this.center[0])*this.scale, this.height/2-(y-this.center[1])*this.scale]; }
  world([x,y]) { return [this.center[0]+(x-this.width/2)/this.scale, this.center[1]-(y-this.height/2)/this.scale]; }
  position(event) { const r = this.canvas.getBoundingClientRect(); return [event.clientX-r.left,event.clientY-r.top]; }
  status(text) { if (text !== this.lastStatus) { this.lastStatus = text; this.callbacks.onStatus?.(text); } }
  cursor() { this.canvas.style.cursor = this.gesture?.kind === 'pan' ? 'grabbing' : this.space || this.tool === 'pan' ? 'grab' : this.hover ? 'move' : 'crosshair'; }

  handles() {
    let handles = this.result.handles ?? [];
    if (!handles.length) {
      const keys = this.chapter === '04' ? ['vertices','point'] : this.chapter === '11' ? ['points'] : ['point'];
      handles = keys.flatMap(key => {
        const points = key === 'point' ? [this.params.point] : this.params[key] ?? [];
        return points.filter(validPoint).map((p,index) => ({id:`${key}:${index}`, key, index, label:key === 'vertices' ? 'ABC'[index] : key === 'points' ? `P${index}` : 'P', x:p[0], y:p[1]}));
      });
    }
    return handles.map(h => {
      const p = h.key === 'point' ? this.params.point : this.params[h.key]?.[h.index];
      return validPoint(p) ? {...h,x:p[0],y:p[1]} : h;
    }).filter(h => Number.isFinite(h.x) && Number.isFinite(h.y));
  }

  hit(position, radius = 15) {
    let hit = null, distance = radius;
    for (const h of this.handles()) {
      const p = this.screen([h.x,h.y]), d = Math.hypot(p[0]-position[0],p[1]-position[1]);
      if (d <= distance) { hit = h; distance = d; }
    }
    return hit;
  }

  select(handle) {
    this.selected = handle?.id ?? null;
    if (handle) this.callbacks.onSelect?.({id:handle.id,label:handle.label,kind:handle.key === 'vertices' ? 'vertex' : handle.key === 'points' ? 'control-point' : 'point'});
    this.requestDraw();
  }

  uv(point) {
    const [a,b,c,d] = this.bounds;
    if (point[0] < a || point[0] > b || point[1] < c || point[1] > d) return null;
    return [clamp((point[0]-a)/(b-a),0,1),clamp((point[1]-c)/(d-c),0,1)];
  }

  emitPoint(handle, point, commit) {
    const limit = this.chapter === '08' ? (this.params.size ?? 512)/2 : 20;
    point = point.map(x => clamp(x,this.chapter === '01' ? 0 : -limit,this.chapter === '01' ? 1 : limit));
    const patch = handle.key === 'point' ? {point} : {[handle.key]:this.params[handle.key].map((p,i) => i === handle.index ? point : [...p])};
    Object.assign(this.params, patch);
    if (this.gesture) { this.gesture.patch = patch; this.gesture.changed = true; }
    this.callbacks.onChange?.(copy(patch),{commit});
    if (['01','08'].includes(this.chapter)) {
      const uv = this.uv(point);
      if (uv) { this.lastProbe = uv; this.callbacks.onProbe?.([...uv]); }
    }
    this.requestDraw();
  }

  pointerDown(event) {
    if (this.gesture || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault(); this.canvas.focus({preventScroll:true});
    const position = this.position(event), point = this.world(position);
    const pan = this.tool === 'pan' || this.space || event.button === 1;
    let handle = pan ? null : this.hit(position,event.pointerType === 'touch' ? 24 : 15);
    if (!pan && !handle && ['01','04','08'].includes(this.chapter) && (this.chapter === '04' || this.uv(point))) handle = this.handles().find(h => h.key === 'point');
    this.gesture = {id:event.pointerId,kind:pan ? 'pan' : handle ? 'handle' : 'click',start:position,center:[...this.center],params:copy(this.params),probe:copy(this.lastProbe),handle,offset:handle && this.hit(position,event.pointerType === 'touch' ? 24 : 15) ? [handle.x-point[0],handle.y-point[1]] : [0,0]};
    this.canvas.setPointerCapture(event.pointerId);
    if (handle) {
      this.select(handle);
      if (!this.hit(position,event.pointerType === 'touch' ? 24 : 15)) this.emitPoint(handle,point,false);
    } else if (!pan) {
      this.select(null);
      const uv = this.uv(point);
      if (uv && this.image) { this.lastProbe = uv; this.callbacks.onProbe?.(uv); }
    }
    this.cursor();
  }

  pointerMove(event) {
    const position = this.position(event), point = this.world(position);
    const g = this.gesture;
    if (g && g.id !== event.pointerId) return;
    if (g?.kind === 'pan') {
      this.center = [g.center[0]-(position[0]-g.start[0])/this.scale,g.center[1]+(position[1]-g.start[1])/this.scale];
      this.requestDraw();
    } else if (g?.kind === 'handle') {
      this.emitPoint(g.handle,[point[0]+g.offset[0],point[1]+g.offset[1]],false);
      this.status(`${g.handle.label} · 拖动预览`);
    } else {
      this.hover = this.hit(position)?.id ?? null;
      this.status(this.hover ? `${this.handles().find(h => h.id === this.hover).label} · 拖动编辑，方向键微调` : `x ${point[0].toFixed(3)}   y ${point[1].toFixed(3)}`);
      this.cursor(); this.requestDraw();
    }
  }

  pointerEnd(event) {
    const g = this.gesture;
    if (!g || (event && g.id !== event.pointerId)) return;
    this.gesture = null;
    if (this.canvas.hasPointerCapture?.(g.id)) this.canvas.releasePointerCapture(g.id);
    if (g.changed && g.patch) this.callbacks.onChange?.(copy(g.patch),{commit:true});
    this.status('拖动控制点 · 滚轮缩放 · 空格平移');
    this.cursor(); this.requestDraw();
  }

  cancelGesture(event) {
    const g = this.gesture;
    if (!g || (event && g.id !== event.pointerId)) return;
    // Clear first: releasing capture must not turn cancellation into a commit.
    this.gesture = null;
    this.params = copy(g.params); this.center = [...g.center]; this.lastProbe = copy(g.probe);
    if (this.canvas.hasPointerCapture?.(g.id)) this.canvas.releasePointerCapture(g.id);
    if (g.changed && g.patch) {
      const patch = Object.fromEntries(Object.keys(g.patch).map(key => [key,copy(g.params[key])]));
      if (['01','08'].includes(this.chapter)) {
        const probe = g.params.probe ?? g.probe ?? this.uv(g.params.point);
        if (probe) { patch.probe = [...probe]; this.params.probe = [...probe]; this.lastProbe = [...probe]; }
      }
      this.callbacks.onChange?.(patch,{commit:true,cancelled:true});
    }
    this.status('已取消本次拖动'); this.cursor(); this.requestDraw();
  }

  wheel(event) {
    event.preventDefault();
    const position = this.position(event), before = this.world(position);
    const delta = event.deltaY*(event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1);
    const scale = clamp(this.scale*Math.exp(clamp(-delta*.0015,-1.2,1.2)),Math.max(.001,this.fitScale/30),Math.max(1e4,this.fitScale*512));
    this.scale = scale;
    this.center = [before[0]-(position[0]-this.width/2)/scale,before[1]+(position[1]-this.height/2)/scale];
    this.status(`视图 ${(100*this.scale/this.fitScale).toFixed(0)}% · 输出分辨率不变`);
    this.requestDraw();
  }

  keyDown(event) {
    if (event.code === 'Space') { event.preventDefault(); this.space = true; this.cursor(); return; }
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (this.gesture) this.cancelGesture(); else this.select(null);
      return;
    }
    if (event.key.toLowerCase() === 'f' || event.key === 'Home') { event.preventDefault(); this.resetView(); return; }
    const move = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
    const handle = this.handles().find(h => h.id === this.selected);
    if (!move || !handle) return;
    event.preventDefault();
    const step = (['01','08'].includes(this.chapter) ? (this.bounds[1]-this.bounds[0])/(this.params.size ?? 512) : 1/this.scale)*(event.shiftKey ? 10 : 1);
    this.emitPoint(handle,[handle.x+move[0]*step,handle.y+move[1]*step],true);
  }

  requestDraw() {
    if (!this.frame && !this.disposed) this.frame = requestAnimationFrame(() => { this.frame = 0; if (!this.disposed) this.draw(); });
  }

  path(points, color, width = 1.5, dash = [], fill = null) {
    if (!points.length) return;
    const ctx = this.ctx; ctx.beginPath();
    points.forEach((p,i) => { const [x,y] = this.screen(p); i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); });
    if (fill) { ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  }

  dot(point, color, radius = 4, label = '') {
    const [x,y] = this.screen(point), ctx = this.ctx;
    ctx.beginPath(); ctx.arc(x,y,radius,0,2*Math.PI); ctx.fillStyle = color; ctx.fill();
    if (label) { ctx.font = '12px ui-monospace, monospace'; ctx.fillStyle = color; ctx.fillText(label,x+11,y-11); }
  }

  grid() {
    const ctx = this.ctx, low = this.world([0,this.height]), high = this.world([this.width,0]);
    const exponent = 10**Math.floor(Math.log10(75/this.scale));
    const major = [1,2,5,10].map(x => x*exponent).find(x => x*this.scale >= 60), minor = major/5;
    const lines = (step,color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
      for (let x=Math.ceil(low[0]/step)*step; x<=high[0]; x+=step) { const sx=this.screen([x,0])[0]; ctx.moveTo(sx,0); ctx.lineTo(sx,this.height); }
      for (let y=Math.ceil(low[1]/step)*step; y<=high[1]; y+=step) { const sy=this.screen([0,y])[1]; ctx.moveTo(0,sy); ctx.lineTo(this.width,sy); }
      ctx.stroke();
    };
    if (minor*this.scale >= 8) lines(minor,'#1a202a');
    lines(major,'#252e3b');
    const zero = this.screen([0,0]);
    ctx.strokeStyle='#475365'; ctx.beginPath(); ctx.moveTo(zero[0],0); ctx.lineTo(zero[0],this.height); ctx.moveTo(0,zero[1]); ctx.lineTo(this.width,zero[1]); ctx.stroke();
    ctx.fillStyle='#748092'; ctx.font='11px ui-monospace, monospace';
    const format = x => Math.abs(x) < major*.001 ? '0' : Number(x.toPrecision(5)).toString();
    for (let x=Math.ceil(low[0]/major)*major; x<=high[0]; x+=major) ctx.fillText(format(x),this.screen([x,0])[0]+5,clamp(zero[1]+17,17,this.height-38));
    for (let y=Math.ceil(low[1]/major)*major; y<=high[1]; y+=major) if (Math.abs(y)>major*.001) ctx.fillText(format(y),clamp(zero[0]+7,7,this.width-50),this.screen([0,y])[1]-6);
  }

  drawImage() {
    if (!this.image) return;
    const [a,b,c,d] = this.bounds, top = this.screen([a,d]);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.image,top[0],top[1],(b-a)*this.scale,(d-c)*this.scale);
    this.ctx.strokeStyle='#3a4556'; this.ctx.lineWidth=1;
    this.ctx.strokeRect(top[0],top[1],(b-a)*this.scale,(d-c)*this.scale);
  }

  pixelOverlay() {
    const ctx=this.ctx,[a,b,c,d]=this.bounds,w=this.imageInfo?.width ?? this.params.size ?? 512,h=this.imageInfo?.height ?? w;
    const dx=(b-a)/w,dy=(d-c)/h,spacing=Math.min(dx,dy)*this.scale;
    const low=this.world([0,this.height]),high=this.world([this.width,0]);
    if (spacing>=8) {
      const alpha=Math.min(.32,(spacing-7)/60);
      ctx.strokeStyle=`rgba(190,205,235,${alpha})`;ctx.lineWidth=1;ctx.beginPath();
      for(let i=Math.max(0,Math.ceil((low[0]-a)/dx));i<=Math.min(w,Math.floor((high[0]-a)/dx));i++) {
        const start=this.screen([a+i*dx,c]),end=this.screen([a+i*dx,d]);ctx.moveTo(...start);ctx.lineTo(...end);
      }
      for(let j=Math.max(0,Math.ceil((low[1]-c)/dy));j<=Math.min(h,Math.floor((high[1]-c)/dy));j++) {
        const start=this.screen([a,c+j*dy]),end=this.screen([b,c+j*dy]);ctx.moveTo(...start);ctx.lineTo(...end);
      }
      ctx.stroke();
    }
    const uv=['01','08'].includes(this.chapter) ? this.uv(this.params.point ?? this.center) : this.lastProbe;
    if (!uv) return;
    // Match studio_render._probe even exactly on a horizontal pixel boundary.
    const i=Math.min(w-1,Math.floor(uv[0]*w)),row=Math.min(h-1,Math.floor((1-uv[1])*h)),j=h-1-row;
    const top=this.screen([a+i*dx,c+(j+1)*dy]),center=[a+(i+.5)*dx,c+(j+.5)*dy];
    ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.strokeRect(top[0],top[1],dx*this.scale,dy*this.scale);
    this.dot(center,ACCENT,3);
    if(spacing>=22) this.dot(center,'#fff',1.5,`[${h-1-j}, ${i}]`);
  }

  transformScene() {
    const matrix=transformMatrix(this.params),apply=p=>matrix.slice(0,2).map(row=>row[0]*p[0]+row[1]*p[1]+row[2]);
    const original=[[-1,-1],[1,-1],[1,.4],[0,1.25],[-1,.4],[-1,-1]];
    return {original,house:original.map(apply),apply};
  }

  drawTransform() {
    const {original,house,apply}=this.transformScene();
    for(let t=-1.5;t<=1.5;t+=.5) {
      this.path([apply([t,-1.5]),apply([t,1.5])],'#29423f',1);
      this.path([apply([-1.5,t]),apply([1.5,t])],'#29423f',1);
    }
    this.path(original,'#748298',1.5,[5,5],'rgba(135,150,170,.035)');
    this.path(house,'#68d9b0',2.4,[],'rgba(66,180,136,.12)');
    const origin=apply([0,0]);
    for(const [axis,color,label] of [[[1,0],COLORS[2],"eₓ′"],[[0,1],COLORS[1],"eᵧ′"]]) {
      const end=apply(axis);this.path([origin,end],color,2);this.dot(end,color,3,label);
    }
    if(validPoint(this.params.point)) {
      const p=this.params.point,q=apply(p);this.path([p,q],'#8491a5',1,[3,5]);
      this.dot(q,'#6be2b8',6,'Mp');
    }
  }

  drawTriangle() {
    const vertices=this.params.vertices;
    if(!vertices?.every(validPoint) || vertices.length!==3) return;
    const point=this.params.point ?? [0,0],area=cross(...vertices);
    // A bounded raster preview keeps dragging responsive. The final pixel image is Python's.
    const preview=Boolean(this.gesture?.changed) || !this.image || JSON.stringify(vertices)!==JSON.stringify(this.imageParams?.vertices) || this.params.mode!==this.imageParams?.mode;
    if(!preview) this.drawImage();
    else if(Math.abs(area)>1e-12) {
      const screen=vertices.map(p=>this.screen(p));
      const left=Math.max(0,Math.floor(Math.min(...screen.map(p=>p[0])))),top=Math.max(0,Math.floor(Math.min(...screen.map(p=>p[1]))));
      const width=Math.min(this.width,Math.ceil(Math.max(...screen.map(p=>p[0]))))-left,height=Math.min(this.height,Math.ceil(Math.max(...screen.map(p=>p[1]))))-top;
      if(width>0 && height>0) {
        const key=JSON.stringify([vertices,this.params.mode,this.center,this.scale,this.width,this.height]);
        if(this.triangleCache?.key!==key) {
          const canvas=document.createElement('canvas');canvas.width=Math.min(240,width);canvas.height=Math.min(240,height);
          const context=canvas.getContext('2d'),pixels=context.createImageData(canvas.width,canvas.height);
          const colors=this.params.mode==='weights' ? [[1,0,0],[0,1,0],[0,0,1]] : [[.95,.13,.065],[.035,.65,.23],[.065,.22,.95]];
          for(let j=0;j<canvas.height;j++)for(let i=0;i<canvas.width;i++) {
            const p=this.world([left+(i+.5)*width/canvas.width,top+(j+.5)*height/canvas.height]);
            const weights=[cross(vertices[1],vertices[2],p)/area,cross(vertices[2],vertices[0],p)/area,cross(vertices[0],vertices[1],p)/area];
            if(weights.some(x=>x<0))continue;
            const offset=4*(j*canvas.width+i);
            for(let k=0;k<3;k++)pixels.data[offset+k]=encode(this.params.mode==='coverage' ? [.16,.66,.4][k] : weights.reduce((sum,w,n)=>sum+w*colors[n][k],0));
            pixels.data[offset+3]=255;
          }
          context.putImageData(pixels,0,0);this.triangleCache={key,canvas};
        }
        this.ctx.imageSmoothingEnabled=true;this.ctx.drawImage(this.triangleCache.canvas,left,top,width,height);
      }
    }
    this.path([...vertices,vertices[0]],'#bbc8df',1.8);
    for(let i=0;i<3;i++)this.path([point,vertices[(i+1)%3],vertices[(i+2)%3],point],COLORS[i]+'70',1,[],COLORS[i]+'13');
    if(Math.abs(area)>1e-12) {
      const weights=[cross(vertices[1],vertices[2],point)/area,cross(vertices[2],vertices[0],point)/area,cross(vertices[0],vertices[1],point)/area];
      this.annotation=`λ (${weights.map(x=>x.toFixed(3)).join(', ')})  ·  ${weights.every(x=>x>=-1e-10)?'内部 / 边界':'外部'}`;
    } else this.annotation='三点共线 · 无唯一重心坐标';
  }

  drawBezier() {
    const points=this.params.points;
    if(points?.length!==4 || !points.every(validPoint))return;
    this.path(points,'#738196',1.5,[5,5]);
    const p=points.map(point=>this.screen(point)),ctx=this.ctx;
    ctx.beginPath();ctx.moveTo(...p[0]);ctx.bezierCurveTo(...p[1],...p[2],...p[3]);ctx.lineWidth=3;ctx.strokeStyle='#78deb8';ctx.stroke();
    const levels=levelsAt(points,clamp(this.params.t ?? .4,0,1));
    levels.slice(1,3).forEach((level,i)=>{const color=i===0?'#eab66f':'#82adff';this.path(level,color,1.6);for(const point of level)this.dot(point,color,3.5);});
    const point=levels[3][0],derivative=levels[2][1].map((x,j)=>3*(x-levels[2][0][j])),speed=Math.hypot(...derivative);
    this.dot(point,'#fff',6,'C(t)');
    if(speed>1e-10)this.path([point,point.map((x,j)=>x+derivative[j]/speed*38/this.scale)],'#fff',1.5);
    this.annotation=`t = ${(this.params.t ?? .4).toFixed(3)}  ·  ‖C′‖ = ${speed.toFixed(3)}`;
  }

  drawHandles() {
    const ctx=this.ctx;
    for(const h of this.handles()) {
      const [x,y]=this.screen([h.x,h.y]),active=h.id===this.selected,hover=h.id===this.hover;
      const color=h.key==='point'?ACCENT:COLORS[h.index%COLORS.length];
      if(active||hover) {ctx.beginPath();ctx.arc(x,y,active?15:12,0,Math.PI*2);ctx.fillStyle=color+'25';ctx.fill();ctx.strokeStyle=color+'70';ctx.lineWidth=1;ctx.stroke();}
      ctx.beginPath();ctx.arc(x,y,active?6.5:5.5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#11151b';ctx.lineWidth=2;ctx.stroke();
      ctx.font='500 13px system-ui, sans-serif';ctx.fillStyle=active?'#f4f7ff':'#ccd6e8';ctx.strokeStyle='#11151b';ctx.lineWidth=4;ctx.lineJoin='round';
      ctx.strokeText(h.label,x+13,y-12);ctx.fillText(h.label,x+13,y-12);
    }
  }

  draw() {
    const ctx=this.ctx;ctx.setTransform(this.dpr||1,0,0,this.dpr||1,0,0);ctx.clearRect(0,0,this.width,this.height);
    ctx.fillStyle='#11151b';ctx.fillRect(0,0,this.width,this.height);this.annotation='';this.grid();
    if(this.chapter==='02')this.drawTransform();
    else if(this.chapter==='04')this.drawTriangle();
    else if(this.chapter==='11')this.drawBezier();
    else {this.drawImage();this.pixelOverlay();for(const path of this.result.paths??[])this.path(path.points,rgb(path.color??[.2,.72,.52]),2);}
    this.drawHandles();
    ctx.font='12px ui-monospace, monospace';
    const label=this.annotation||(['01','08'].includes(this.chapter)?`${this.imageInfo?.width??this.params.size??'—'} × ${this.imageInfo?.height??this.params.size??'—'} 输出像素 · 缩放只改变视图`:'2D · 世界坐标');
    ctx.fillStyle='rgba(17,21,27,.9)';ctx.fillRect(12,this.height-35,Math.min(this.width-24,ctx.measureText(label).width+20),25);
    ctx.fillStyle='#aab8cf';ctx.fillText(label,22,this.height-18);
    if(this.gesture?.changed) {ctx.fillStyle=ACCENT;ctx.fillText('即时预览',18,24);}
  }
}
