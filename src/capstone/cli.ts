/** 无浏览器的命令行入口。PPM 只需十行左右的写出逻辑，便于检查每个字节。 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { capstoneSpec, renderCapstone, inspectCapstone } from './core.ts';
import { renderStudy } from '../render/render-study.ts';
const args = process.argv.slice(2);
function option(key: string, fallback: string): string {
  const i = args.indexOf(key);
  return i < 0 ? fallback : (args[i + 1] ?? fallback);
}
const size = Number(option('--size', '384')),
  samples = Number(option('--samples', '1'));
const output = resolve(option('--out', 'outputs/capstone'));
const state = capstoneSpec().state;
const image = renderCapstone(state, size, samples),
  rgb = Buffer.alloc(size * size * 3);
for (let i = 0; i < size * size; i++)
  for (let c = 0; c < 3; c++) rgb[3 * i + c] = image.pixels[4 * i + c];
mkdirSync(output, { recursive: true });
writeFileSync(
  resolve(output, 'image.ppm'),
  Buffer.concat([Buffer.from(`P6\n${size} ${size}\n255\n`), rgb]),
);
const frame = renderStudy(state, size);
let pixel = frame.owner.findIndex((owner) => owner >= 0);
if (args.includes('--row') || args.includes('--col'))
  pixel =
    Number(option('--row', String(Math.floor(size / 2)))) * size +
    Number(option('--col', String(Math.floor(size / 2))));
const probe = inspectCapstone(state, frame, Math.floor(pixel / size), pixel % size);
writeFileSync(
  resolve(output, 'pixel.json'),
  JSON.stringify({ samplesPerAxis: samples, probeUsesPixelCenter: true, ...probe }, null, 2) + '\n',
);
console.log(
  `已输出 ${size} × ${size} 图像（${samples ** 2} 样本/像素）：${output}/image.ppm\n中心样本的可见性与阴影查询：${output}/pixel.json`,
);
