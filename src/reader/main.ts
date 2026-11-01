import 'katex/dist/katex.min.css';
import './reader.css';
import './camera-study.css';
import './figure-view.css';
import './scene-view.css';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import { chapters, appendices } from './catalog.ts';
import type { Chapter } from './catalog.ts';
import { renderMarkdown } from './markdown.ts';
import { CameraStudy } from './camera-study.ts';
import { FigureView } from './figure-view.ts';
import { chapterFigures } from '../figures/catalog.ts';
import { sceneChapters } from '../render/scenes.ts';
import framingSource from '../chapters/03-camera/framing.ts?raw';

const contents = import.meta.glob<string>('/content/**/*.md', { query: '?raw', import: 'default' });
const sources: Record<string, () => Promise<string>> = {
  ...import.meta.glob<string>(['/src/**/*.ts', '!/src/chapters/03-camera/framing.ts'], {
    query: '?raw',
    import: 'default',
  }),
  '/src/chapters/03-camera/framing.ts': async () => framingSource,
};
const $ = <T extends Element = HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;
let current: Chapter = chapters[0],
  mounted: { dispose(): void }[] = [],
  sourcePath = '',
  sourceText = '',
  navigation = 0,
  sourceNavigation = 0;

async function showSource(path: string): Promise<void> {
  const version = ++sourceNavigation;
  const directory =
    path in sources ? path.slice(0, path.lastIndexOf('/') + 1) : `/src/chapters/${current.slug}/`;
  const files = Object.keys(sources).filter((p) => p.startsWith(directory));
  sourcePath = path in sources ? path : files.find((p) => p.endsWith('/core.ts'))!;
  if (!files.includes(sourcePath)) files.unshift(sourcePath);
  const text = await sources[sourcePath]();
  if (version !== sourceNavigation) return;
  sourceText = text;
  $('#source-title').textContent = sourcePath.replace('/src/', '');
  $('#source-code').innerHTML = Prism.highlight(text, Prism.languages.typescript, 'typescript');
  $('#source-tabs').replaceChildren(
    ...files.map((p) => {
      const button = document.createElement('button');
      button.textContent = p.split('/').at(-1)!;
      button.classList.toggle('active', p === sourcePath);
      button.onclick = () => void showSource(p);
      return button;
    }),
  );
  $('#source-dialog pre').scrollTop = 0;
  if (!$<HTMLDialogElement>('#source-dialog').open)
    $<HTMLDialogElement>('#source-dialog').showModal();
}

async function lessonSource(chapter: Chapter): Promise<string> {
  const prefix = `/content/foundations/${chapter.slug}/`;
  let text = await contents[`${prefix}lesson.md`]();
  for (const match of [...text.matchAll(/^\[\[include:([\w-]+\.md)\]\]$/gm)])
    text = text.replace(match[0], await contents[prefix + match[1]]());
  if (chapter.id === '04') text += '\n' + (await contents[prefix + 'raster-lesson.md']());
  return text;
}

function finishNavigation(title: string, label: string): void {
  document.title = `${title} — 从像素到光线`;
  $('#reading-label').textContent = label;
  $('#reading-fill').style.width = '0%';
  const search = new URLSearchParams(location.search);
  $('#chapter-list')
    .querySelectorAll<HTMLButtonElement>('[data-chapter]')
    .forEach((b) => {
      const active = !search.has('appendix') && b.dataset.chapter === current.id;
      b.classList.toggle('active', active);
      b.setAttribute('aria-current', active ? 'page' : 'false');
    });
  $('#appendix-list')
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((b) => {
      const active = b.dataset.appendix === search.get('appendix');
      b.classList.toggle('active', active);
      b.setAttribute('aria-current', active ? 'page' : 'false');
    });
  $('#main').scrollTo({ top: 0, behavior: 'instant' });
  if (location.hash)
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  if (innerWidth < 900) document.body.classList.add('navigation-collapsed');
  $('#toggle-navigation').setAttribute(
    'aria-expanded',
    String(!document.body.classList.contains('navigation-collapsed')),
  );
}

async function navigate(query: string, push = true): Promise<void> {
  const version = ++navigation;
  mounted.forEach((d) => d.dispose());
  mounted = [];
  if (push) history.pushState({}, '', `${location.pathname}${query}`);
  const params = new URLSearchParams(query.split('#')[0]);
  const appendix = appendices.find((a) => a.id === params.get('appendix'));
  try {
    if (appendix) {
      const lesson = await contents[appendix.file]();
      if (version !== navigation) return;
      $('#lesson').innerHTML = renderMarkdown(lesson);
      if (appendix.id === 'capstone') {
        const [{ SceneView }, { capstoneSpec }] = await Promise.all([
          import('./scene-view.ts'),
          import('../capstone/core.ts'),
        ]);
        if (version !== navigation) return;
        mounted.push(
          new SceneView(
            $('#lesson [data-figure]'),
            '09',
            (path) => void showSource(path),
            capstoneSpec(),
          ),
        );
      }
      finishNavigation(appendix.title, '附录 · ' + appendix.title);
      return;
    }
    current = chapters.find((c) => c.id === params.get('chapter')) || chapters[0];
    const [lesson, figures] = await Promise.all([
      lessonSource(current),
      chapterFigures(current.slug),
    ]);
    const SceneView = sceneChapters.has(current.id)
      ? (await import('./scene-view.ts')).SceneView
      : null;
    if (version !== navigation) return;
    $('#lesson').innerHTML = renderMarkdown(lesson);
    $('#lesson')
      .querySelectorAll<HTMLElement>('[data-figure]')
      .forEach((slot) => {
        const id = slot.dataset.figure!;
        if (id === 'camera-framing')
          mounted.push(
            new CameraStudy(
              slot,
              () => void showSource(`/src/chapters/${current.slug}/framing.ts`),
            ),
          );
        else if (id === 'main' && SceneView)
          mounted.push(new SceneView(slot, current.id, (path) => void showSource(path)));
        else if (figures.has(id))
          mounted.push(new FigureView(slot, figures.get(id)!, (path) => void showSource(path)));
        else throw new Error(`演示未注册：${current.id}/${id}`);
      });
    const source = document.createElement('button');
    source.className = 'chapter-source';
    source.textContent = '〈/〉 阅读本章完整 TypeScript 源码';
    source.onclick = () => void showSource('');
    $('#lesson').append(source);
    const index = chapters.indexOf(current),
      nav = document.createElement('footer');
    nav.className = 'chapter-navigation';
    for (const [target, label] of [
      [chapters[index - 1], '← 上一章'],
      [chapters[index + 1], '下一章 →'],
    ] as const) {
      const b = document.createElement('button');
      b.textContent = target
        ? `${label} · ${target.title}`
        : index === chapters.length - 1
          ? '综合实践 →'
          : '从像素到光线';
      b.disabled = !target && index === 0;
      b.onclick = () => void navigate(target ? `?chapter=${target.id}` : '?appendix=capstone');
      nav.append(b);
    }
    $('#lesson').append(nav);
    finishNavigation(
      `${current.id} · ${current.title}`,
      `阅读顺序 ${index + 1} / ${chapters.length} · 传统图形学`,
    );
  } catch (error) {
    if (version !== navigation) return;
    const message = document.createElement('p');
    message.className = 'reader-error';
    message.textContent = `页面加载失败：${error instanceof Error ? error.message : String(error)}`;
    $('#lesson').replaceChildren(message);
    console.error(error);
  }
}

let part = '';
for (const entry of chapters) {
  if (entry.part !== part) {
    const heading = document.createElement('h2');
    heading.textContent = entry.part;
    $('#chapter-list').append(heading);
    part = entry.part;
  }
  const button = document.createElement('button');
  button.dataset.chapter = entry.id;
  button.innerHTML = `<span>${entry.id}</span><strong>${entry.title}</strong><small>${entry.kind}</small>`;
  button.onclick = () => void navigate(`?chapter=${entry.id}`);
  $('#chapter-list').append(button);
}
for (const appendix of appendices) {
  const b = document.createElement('button');
  b.textContent = appendix.title;
  b.dataset.appendix = appendix.id;
  b.onclick = () => void navigate(`?appendix=${appendix.id}`);
  $('#appendix-list').append(b);
}
$('#toggle-navigation').onclick = () => {
  const hidden = document.body.classList.toggle('navigation-collapsed');
  $('#toggle-navigation').setAttribute('aria-expanded', String(!hidden));
};
$('#jump-demo').onclick = () =>
  $('#lesson [data-figure]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
$('#close-source').onclick = () => $<HTMLDialogElement>('#source-dialog').close();
$('#download-source').onclick = () => {
  const url = URL.createObjectURL(new Blob([sourceText], { type: 'text/typescript' })),
    a = document.createElement('a');
  a.href = url;
  a.download = sourcePath.split('/').at(-1)!;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
$('#main').addEventListener(
  'scroll',
  () => {
    const el = $('#main');
    $('#reading-fill').style.width =
      `${(100 * el.scrollTop) / Math.max(1, el.scrollHeight - el.clientHeight)}%`;
  },
  { passive: true },
);
document.addEventListener('click', (event) => {
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const href = link.getAttribute('href')!;
  if (href.startsWith('?')) {
    event.preventDefault();
    void navigate(href);
    return;
  }
  if (href.endsWith('.ts')) {
    const path = href.startsWith('/src/') ? href : `/src/chapters/${current.slug}/${href}`;
    if (path in sources) {
      event.preventDefault();
      void showSource(path);
    }
  }
});
window.addEventListener('popstate', () => void navigate(location.search + location.hash, false));
void navigate(location.search || '?chapter=01', false);
