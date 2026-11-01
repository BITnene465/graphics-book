import type { Chapter } from './catalog.ts';

/** 拼接章节小节，保留公式中的 $$ 和源码中的所有字面字符。 */
export async function chapterText(
  chapter: Chapter,
  load: (path: string) => Promise<string>,
): Promise<string> {
  const prefix = `/content/foundations/${chapter.slug}/`;
  let text = await load(`${prefix}lesson.md`);
  for (const match of [...text.matchAll(/^\[\[include:([\w-]+\.md)\]\]$/gm)]) {
    const section = await load(prefix + match[1]);
    text = text.replace(match[0], () => section);
  }
  if (chapter.id === '04') text += '\n' + (await load(prefix + 'raster-lesson.md'));
  return text;
}
