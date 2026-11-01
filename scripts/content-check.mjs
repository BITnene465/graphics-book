import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import MarkdownIt from 'markdown-it';
import { katex } from '@mdit/plugin-katex';
const markdown = new MarkdownIt({ html: true }).use(katex, { throwOnError: false, trust: false });
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.md') ? [`${dir}/${e.name}`] : [],
  );
const issues = [];
for (const file of walk('content')) {
  const source = readFileSync(file, 'utf8'),
    html = markdown.render(source);
  if (html.includes('katex-error')) issues.push(`${file}: 无法排版的公式`);
  if (/\b(Python|NumPy|Pyodide|ValueError|uv run|np\.)\b|\w+\.py\b|```python/.test(source))
    issues.push(`${file}: 旧运行说明`);
  for (const include of source.matchAll(/\[\[include:([^\]]+)\]\]/g))
    if (!existsSync(resolve(dirname(file), include[1]))) issues.push(`${file}: 缺少 ${include[1]}`);
  const slug = file.match(/foundations\/(\d\d-[^/]+)\//)?.[1];
  const visit = (tokens) => {
    for (const token of tokens) {
      if (token.type === 'link_open' || token.type === 'image') {
        const href = token.attrGet(token.type === 'image' ? 'src' : 'href');
        if (!href || /^(https?:|mailto:|#)/.test(href)) continue;
        if (href.startsWith('?')) {
          const q = new URLSearchParams(href.split('#')[0]);
          const chapter = q.get('chapter'),
            appendix = q.get('appendix');
          if (
            (chapter && !/^(0[1-9]|1[0-5])$/.test(chapter)) ||
            (appendix && !['math', 'glossary', 'capstone', 'reading'].includes(appendix))
          )
            issues.push(`${file}: 路由 ${href}`);
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
