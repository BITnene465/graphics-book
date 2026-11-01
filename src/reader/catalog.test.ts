import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { chapters, chapterKey, chapterHref, resolveChapter } from './catalog.ts';

test('阅读顺序、章号与源码目录一致', () => {
  assert.deepEqual(
    chapters.map((c) => c.id),
    Array.from({ length: chapters.length }, (_, i) => String(i + 1).padStart(2, '0')),
  );
  assert.deepEqual(
    chapters.map((c) => c.slug),
    readdirSync(new URL('../chapters', import.meta.url)).sort(),
  );
  assert.equal(new Set(chapters.map(chapterKey)).size, chapters.length);
});
test('每章稳定链接解析回同一章', () => {
  for (const chapter of chapters) {
    assert.equal(resolveChapter(new URLSearchParams(chapterHref(chapter)).get('chapter')), chapter);
    assert.equal(resolveChapter(chapter.slug), chapter);
  }
});
test('旧数字书签保留原主题，而非误跳到新章号', () => {
  assert.equal(chapterKey(resolveChapter('07')), 'textures');
  assert.equal(resolveChapter('07').id, '08');
  assert.equal(resolveChapter('08').id, '05');
  assert.equal(resolveChapter('12').id, '15');
  assert.equal(resolveChapter('15').id, '14');
  assert.equal(resolveChapter('16').id, '16');
  assert.equal(resolveChapter('unknown').id, '01');
});
