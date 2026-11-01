import type { Chapter } from './catalog.ts';

/** 拼接章节小节，保留公式中的 $$ 和源码中的所有字面字符。 */
export async function chapterText(
  chapter: Chapter,
  load: (path: string) => Promise<string>,
): Promise<string> {
  const prefix = `/content/${chapter.module}/${chapter.slug}/`;
  const expand = async (file: string, ancestors: string[]): Promise<string> => {
    if (ancestors.includes(file))
      throw new Error(`正文循环引用：${[...ancestors, file].join(' → ')}`);
    let text = await load(prefix + file);
    for (const match of [...text.matchAll(/^\[\[include:([\w-]+\.md)\]\]$/gm)]) {
      const section = await expand(match[1], [...ancestors, file]);
      text = text.replace(match[0], () => section);
    }
    return text;
  };
  return expand('lesson.md', []);
}
