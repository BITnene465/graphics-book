import * as THREE from 'three';
import type { Vec3 } from '../math/vector.ts';
import { axisColors, stageColor } from './visual-style.ts';

/** 辅助坐标不参与教学渲染，只为操作提供尺度和方向。 */
export function makeGuides(floor: number): THREE.Group {
  const group = new THREE.Group();
  const grid = new THREE.GridHelper(20, 40, '#52637b', '#344359');
  grid.position.y = floor;
  grid.material.transparent = true;
  grid.material.opacity = 0.36;
  group.add(grid);
  for (let axis = 0; axis < 3; axis++) {
    const direction = new THREE.Vector3().setComponent(axis, 1);
    const material = new THREE.MeshBasicMaterial({ color: axisColors[axis], toneMapped: false });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2, 10), material);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 16), material);
    const rotation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction,
    );
    shaft.quaternion.copy(rotation);
    tip.quaternion.copy(rotation);
    shaft.position.copy(direction).multiplyScalar(1);
    tip.position.copy(direction).multiplyScalar(2.09);
    group.add(shaft, tip);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const context = canvas.getContext('2d')!;
    context.font = 'italic 56px Georgia';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 9;
    context.strokeStyle = stageColor;
    context.strokeText('xyz'[axis], 48, 48);
    context.fillStyle = axisColors[axis];
    context.fillText('xyz'[axis], 48, 48);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, depthTest: false, toneMapped: false }),
    );
    label.position.copy(direction).multiplyScalar(2.38);
    label.scale.setScalar(0.38);
    group.add(label);
  }
  return group;
}

/** 小型视角罗盘。世界轴只乘相机旋转的逆，不包含透视或平移。 */
export class ViewCompass {
  private svg: SVGSVGElement;
  private tips: { node: SVGGElement; direction: THREE.Vector3; line: SVGLineElement }[] = [];
  constructor(host: HTMLElement, choose: (direction?: Vec3) => void, signal: AbortSignal) {
    const ns = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(ns, 'svg');
    this.svg.classList.add('scene-compass');
    this.svg.setAttribute('viewBox', '0 0 112 112');
    this.svg.setAttribute('aria-label', '视角导航');
    this.svg.innerHTML =
      '<circle cx="56" cy="56" r="16" class="compass-center" data-axis="home" tabindex="0" role="button" aria-label="恢复原始视角"><title>原始视角</title></circle>';
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [-1, 1]) {
        const direction = new THREE.Vector3().setComponent(axis, sign);
        const node = document.createElementNS(ns, 'g'),
          line = document.createElementNS(ns, 'line');
        const key = 'xyz'[axis] + (sign > 0 ? '+' : '-');
        line.setAttribute('x1', '56');
        line.setAttribute('y1', '56');
        line.setAttribute('stroke', axisColors[axis]);
        line.setAttribute('stroke-width', sign > 0 ? '1.8' : '1');
        this.svg.prepend(line);
        node.dataset.axis = key;
        node.tabIndex = 0;
        node.setAttribute('role', 'button');
        node.setAttribute('aria-label', '沿 ' + key + ' 轴观察');
        node.innerHTML =
          '<circle r="' +
          (sign > 0 ? 11 : 6) +
          '" fill="' +
          (sign > 0 ? axisColors[axis] : stageColor) +
          '" stroke="' +
          axisColors[axis] +
          '"/>' +
          (sign > 0
            ? '<text text-anchor="middle" dominant-baseline="central">' + 'XYZ'[axis] + '</text>'
            : '');
        this.svg.append(node);
        this.tips.push({ node, direction, line });
      }
    const activate = (target: EventTarget | null) => {
      const key = (target as Element).closest<SVGElement>('[data-axis]')?.dataset.axis;
      if (!key) return;
      const tip = this.tips.find((t) => t.node.dataset.axis === key);
      choose(tip ? (tip.direction.toArray() as Vec3) : undefined);
    };
    this.svg.addEventListener('click', (event) => activate(event.target), { signal });
    this.svg.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate(event.target);
        }
      },
      { signal },
    );
    host.append(this.svg);
  }
  update(camera: THREE.Camera): void {
    const inverse = camera.quaternion.clone().invert();
    for (const { node, line, direction } of this.tips) {
      const projected = direction.clone().applyQuaternion(inverse);
      const x = 56 + 35 * projected.x,
        y = 56 - 35 * projected.y;
      node.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
      node.style.opacity = projected.z < -0.1 ? '0.45' : '1';
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', String(y));
      line.style.opacity = projected.z < -0.1 ? '0.3' : '0.8';
      node.dataset.depth = String(projected.z);
    }
    for (const { node } of [...this.tips].sort(
      (a, b) => Number(a.node.dataset.depth) - Number(b.node.dataset.depth),
    ))
      this.svg.append(node);
  }
}
