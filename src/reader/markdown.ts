import MarkdownIt from 'markdown-it';
import { katex } from '@mdit/plugin-katex';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight(code, language) {
    const grammar = Prism.languages[language];
    return grammar ? Prism.highlight(code, grammar, language) : '';
  },
}).use(katex, { throwOnError: false, trust: false });

/** 章节内容随静态站点发布；占位标记连接正文与真正运行的演示。 */
export function renderMarkdown(source: string): string {
  return markdown.render(
    source.replace(
      /^\[\[demo:([\w-]+)\]\]$/gm,
      (_, id: string) => `<div class="figure-slot" data-figure="${id}"></div>`,
    ),
  );
}
