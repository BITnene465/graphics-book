import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chapterText } from './content.ts';
import { resolveChapter } from './catalog.ts';

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

test('第四章在重心坐标之后接入光栅化小节', async () => {
  const loaded: string[] = [];
  const text = await chapterText(resolveChapter('barycentric'), async (path) => {
    loaded.push(path);
    return path.endsWith('/lesson.md') ? '重心坐标' : '光栅化';
  });
  assert.equal(text, '重心坐标\n光栅化');
  assert.ok(loaded[1].endsWith('/04-barycentric/raster-lesson.md'));
});
