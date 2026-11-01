import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import katex from 'katex';
import type { FigureSpec } from './spec.ts';
import { cameraFrame, defaults } from '../chapters/03-camera/scene.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directories = (await readdir(path.join(root, 'src/chapters'))).sort();
const specs: FigureSpec[] = [];
for (const directory of directories) {
  const module = (await import(
    pathToFileURL(path.join(root, 'src/chapters', directory, 'figures.ts')).href
  )) as { figures: FigureSpec[]; main?: FigureSpec };
  specs.push(...module.figures, ...(module.main ? [module.main] : []));
}
test('教材的聚焦演示均有实际计算实现，编号没有重复', async () => {
  const ids = specs.filter((s) => s.id !== 'main').map((s) => s.id);
  ids.push('camera-framing');
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 64, '基础补写的聚焦演示不能丢失');
  const files = await readdir(path.join(root, 'content/foundations'), { recursive: true });
  for (const file of files.filter((f) => f.endsWith('.md'))) {
    const text = await readFile(path.join(root, 'content/foundations', file), 'utf8');
    for (const match of text.matchAll(/\[\[demo:([\w-]+)\]\]/g))
      if (match[1] !== 'main') assert.ok(ids.includes(match[1]), `${file}: ${match[1]} 未实现`);
  }
});
for (const spec of specs)
  test(`${spec.chapter}/${spec.id} 默认帧与中间帧的几何、像素和公式有效`, () => {
    for (const progress of [0, 0.37, 1]) {
      const params = structuredClone(spec.defaults),
        before = JSON.stringify(params),
        frame = spec.compute(params, progress);
      assert.equal(JSON.stringify(params), before, '演示计算不能修改输入');
      assert.ok(frame.items.length > 0, '演示不能是空帧');
      for (const item of frame.items) {
        const coordinates = 'points' in item ? item.points.flat() : item.at;
        assert.ok(coordinates.every(Number.isFinite), `${item.kind} 有非有限坐标`);
        if (item.kind === 'raster') assert.equal(item.data.length, item.width * item.height * 4);
      }
      if (frame.formula)
        assert.doesNotThrow(() =>
          katex.renderToString(frame.formula, { throwOnError: true, strict: 'error' }),
        );
    }
  });
test('相机特制样章仍由纯 TypeScript 场景计算驱动', () => {
  const frame = cameraFrame(defaults);
  assert.ok(frame.items.length > 20);
  assert.ok(frame.values.ratio > 0 && frame.values.ratio < 1);
});

test('参数面板承诺的范围与选项都能生成有限图形', () => {
  for (const spec of specs)
    for (const control of spec.controls) {
      const values =
        'options' in control
          ? control.options.map((option) => option.value)
          : [control.min, control.max];
      for (const value of values) {
        const params = structuredClone(spec.defaults);
        params[control.key] = value;
        const frame = spec.compute(params, 0.5);
        for (const item of frame.items)
          assert.ok(
            ('points' in item ? item.points.flat() : item.at).every(Number.isFinite),
            `${spec.id}/${control.key}=${value}`,
          );
      }
    }
});
