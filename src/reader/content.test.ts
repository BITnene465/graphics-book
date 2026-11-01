import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chapterText } from './content.ts';
import { chapters, resolveChapter } from './catalog.ts';

test('扩展正文保持原文，块公式的双美元符号不会变为行内公式', async () => {
  const chapter = resolveChapter('texture-functions');
  const prefix = `/content/foundations/${chapter.slug}/`;
  const loaded: string[] = [];
  const text = await chapterText(chapter, async (path) => {
    const source = await readFile('.' + path, 'utf8');
    if (path !== prefix + 'lesson.md') loaded.push(source);
    return source;
  });
  assert.equal(loaded.length, 2);
  for (const source of loaded) assert.ok(text.includes(source));
  assert.ok(!text.includes('[[include:'));
  assert.ok(text.includes('$$\n\\begin{aligned}'));
});

test('基础补写嵌入正文后，小节编号连续且没有遗留的 include', async () => {
  for (const chapter of chapters) {
    const text = await chapterText(chapter, (path) => readFile('.' + path, 'utf8'));
    assert.ok(!text.includes('[[include:'));
    const numbers = [...text.matchAll(/^## (\d+)[. ·]/gm)].map((m) => Number(m[1]));
    assert.deepEqual(
      numbers,
      numbers.map((_, i) => i + 1),
      chapter.slug,
    );
  }
  const text = await chapterText(resolveChapter('bezier'), (path) => readFile('.' + path, 'utf8'));
  assert.ok(text.indexOf('[[demo:hermite-tangents]]') < text.indexOf('[[demo:spline-join]]'));
  assert.ok(text.indexOf('[[demo:bspline-local]]') < text.indexOf('[[demo:deboor-steps]]'));
  assert.ok(text.indexOf('[[demo:deboor-steps]]') < text.indexOf('[[demo:rational-arc]]'));
  assert.ok(
    text.indexOf('[[demo:polynomial-interpolation]]') < text.indexOf('[[demo:casteljau-steps]]'),
  );
  assert.ok(text.indexOf('[[demo:bezier-tangent]]') < text.indexOf('[[demo:curve-curvature]]'));
  assert.ok(text.indexOf('[[demo:curve-torsion]]') < text.indexOf('[[demo:hermite-tangents]]'));
});

test('正文循环 include 给出错误，不无限递归', async () => {
  await assert.rejects(
    () => chapterText(resolveChapter('bezier'), async () => '[[include:lesson.md]]'),
    /循环引用/,
  );
});
