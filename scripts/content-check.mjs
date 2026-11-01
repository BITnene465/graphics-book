import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import MarkdownIt from 'markdown-it';
import { katex } from '@mdit/plugin-katex';
import { chapters, chapterKey } from '../src/reader/catalog.ts';
const markdown = new MarkdownIt({ html: true }).use(katex, { throwOnError: false, trust: false });
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.md') ? [`${dir}/${e.name}`] : [],
  );
const issues = [];
if (chapters.some((chapter, i) => chapter.id !== String(i + 1).padStart(2, '0')))
  issues.push('章节编号必须按阅读顺序连续');
const chapterKeys = new Map(chapters.map((chapter) => [chapterKey(chapter), chapter]));
for (const chapter of chapters) {
  const lesson = `content/${chapter.module}/${chapter.slug}/lesson.md`;
  if (!existsSync(lesson)) issues.push(`目录章节缺少正文：${lesson}`);
}
for (const file of walk('content')) {
  const source = readFileSync(file, 'utf8'),
    html = markdown.render(source);
  if (html.includes('katex-error')) issues.push(`${file}: 无法排版的公式`);
  if (/^\$$/m.test(source)) issues.push(`${file}: 独立公式使用双美元符号，避免被当作正文`);
  for (const [alias, term] of [
    ['节点向量', '结点向量'],
    ['光线跟踪', '光线追踪'],
    ['反向运动学', '逆向运动学'],
    ['形式因子', '形状因子'],
    ['半正定', '正半定'],
  ])
    if (source.includes(alias)) issues.push(`${file}: 术语“${alias}”统一为“${term}”`);
  if (/\b(Python|NumPy|Pyodide|ValueError|uv run|np\.)\b|\w+\.py\b|```python/.test(source))
    issues.push(`${file}: 旧运行说明`);
  for (const include of source.matchAll(/\[\[include:([^\]]+)\]\]/g))
    if (!existsSync(resolve(dirname(file), include[1]))) issues.push(`${file}: 缺少 ${include[1]}`);
  const slug = file.match(/content\/[^/]+\/(\d\d-[^/]+)\//)?.[1];
  if (slug && file.endsWith('/lesson.md') && !source.startsWith(`# ${slug.slice(0, 2)} ·`))
    issues.push(`${file}: 标题章号与目录不一致`);
  for (const match of source.matchAll(/\[(?:第\s*)?(\d\d)[^\]]*\]\(\?chapter=([\w-]+)\)/g))
    if (chapterKeys.get(match[2])?.id !== match[1])
      issues.push(`${file}: 章节引用编号 ${match[0]}`);
  const visit = (tokens) => {
    for (const [index, token] of tokens.entries()) {
      if (token.type === 'link_open' || token.type === 'image') {
        const href = token.attrGet(token.type === 'image' ? 'src' : 'href');
        if (!href || /^(https?:|mailto:|#)/.test(href)) continue;
        if (href.startsWith('?')) {
          const q = new URLSearchParams(href.split('#')[0]);
          const chapter = q.get('chapter'),
            appendix = q.get('appendix');
          if (
            (chapter && !chapterKeys.has(chapter)) ||
            (appendix && !['math', 'glossary', 'capstone', 'reading'].includes(appendix))
          )
            issues.push(`${file}: 路由 ${href}`);
          const labelNumber = tokens[index + 1]?.content?.match(/^(?:第\s*)?(\d\d)(?:\s|$)/)?.[1];
          if (chapter && labelNumber && chapterKeys.get(chapter)?.id !== labelNumber)
            issues.push(`${file}: 链接显示第 ${labelNumber} 章，但指向 ${href}`);
          continue;
        }
        const path = href.startsWith('/src/')
          ? resolve('.' + href)
          : href.endsWith('.ts') && slug
            ? resolve('src/chapters', slug, href)
            : resolve(dirname(file), href.split('#')[0]);
        if (!existsSync(path)) issues.push(`${file}: 失效链接 ${href}`);
      }
      if (token.children) visit(token.children);
    }
  };
  visit(markdown.parse(source, {}));
}
if (issues.length) {
  console.error(issues.join('\n'));
  process.exit(1);
}
console.log(
  `教材完整性检查通过：${walk('content').length} 份正文与附录，公式、内部链接、源码链接和 include 有效。`,
);
