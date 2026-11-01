import 'katex/dist/katex.min.css';
import './reader.css';
import './experiment.css';
import './camera-study.css';
import './figure-view.css';
import './scene-view.css';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import { chapters, appendices, chapterHref, resolveChapter } from './catalog.ts';
import type { Chapter } from './catalog.ts';
import { renderMarkdown } from './markdown.ts';
import { chapterText } from './content.ts';
import { CameraStudy } from './camera-study.ts';
import type { CameraSnapshot } from './camera-study.ts';
import { FigureView } from './figure-view.ts';
import type { FigureSnapshot } from './figure-view.ts';
import type { SceneSnapshot } from './scene-view.ts';
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
type Mounted = { id: string; view: { dispose(): void; snapshot(): unknown } };
type Position = { top: number; anchor?: string; offset?: number };
type Reading = { position: Position; demos: Record<string, unknown> };
const saved = new Map<string, Reading>();
let current: Chapter = chapters[0],
  mounted: Mounted[] = [],
  route = '',
  sections: HTMLElement[] = [];
let sourcePath = '',
  sourceText = '',
  navigation = 0,
  sourceNavigation = 0,
  scrollFrame = 0,
  saveTimer = 0;
let outlineMode = false,
  navigationBeforeFocus = true;
let positionRequest = 0;

function readSaved(key: string): Reading | undefined {
  if (saved.has(key)) return saved.get(key);
  try {
    return JSON.parse(sessionStorage.getItem('graphics-reading-v3:' + key) || 'null') ?? undefined;
  } catch {
    return undefined;
  }
}
function position(): Position {
  const main = $('#main'),
    top = main.getBoundingClientRect().top;
  const anchor = [...$('#lesson').querySelectorAll<HTMLElement>(':scope > [id]')]
    .filter((el) => el.getBoundingClientRect().top <= top + 32)
    .at(-1);
  return {
    top: main.scrollTop,
    anchor: anchor?.id,
    offset: anchor ? anchor.getBoundingClientRect().top - top : undefined,
  };
}
function saveReading(updateHistory = true): void {
  if (!route || $('#main').hasAttribute('aria-busy')) return;
  const reading = {
    position: position(),
    demos: Object.fromEntries(mounted.map(({ id, view }) => [id, view.snapshot()])),
  };
  saved.set(route, reading);
  try {
    sessionStorage.setItem('graphics-reading-v3:' + route, JSON.stringify(reading));
  } catch {
    /* Storage may be unavailable in private browsing. */
  }
  if (updateHistory) history.replaceState({ position: reading.position }, '', location.href);
}
function restorePosition(at?: Position): void {
  const main = $('#main'),
    anchor = at?.anchor && document.getElementById(at.anchor);
  main.scrollTop = anchor
    ? main.scrollTop +
      anchor.getBoundingClientRect().top -
      main.getBoundingClientRect().top -
      (at.offset ?? 0)
    : (at?.top ?? 0);
}
async function placeReading(at?: Position, hash = ''): Promise<void> {
  const request = ++positionRequest;
  const place = () =>
    hash
      ? document
          .getElementById(decodeURIComponent(hash))
          ?.scrollIntoView({ block: 'start', behavior: 'instant' })
      : restorePosition(at);
  place();
  // 视口附近的图解在下一帧初始化；再次对齐锚点，避免布局变化挪走阅读位置。
  for (let i = 0; i < 3; i++) {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (request !== positionRequest) return;
    place();
  }
}
function setNavigation(open: boolean): void {
  document.body.classList.toggle('navigation-collapsed', !open);
  $('#toggle-navigation').setAttribute('aria-expanded', String(open));
  $('#navigation').toggleAttribute('inert', !open);
  $('#navigation-scrim').hidden = !open || innerWidth >= 900;
  if (open) revealDirectory();
  else if ($('#navigation').contains(document.activeElement)) $('#toggle-navigation').focus();
}
function revealDirectory(): void {
  const active = $(outlineMode ? '#section-list' : '#chapter-list').querySelector('.active');
  const group = active?.closest('details');
  if (group) group.open = true;
  active?.scrollIntoView({ block: 'nearest' });
}
function setOutline(active: boolean, open = false): void {
  outlineMode = active;
  $('#chapter-list').hidden = active;
  $('#section-list').hidden = !active;
  $('#outline-heading').hidden = !active;
  for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-directory]')) {
    const selected = (tab.dataset.directory === 'section') === active;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  if (open) setNavigation(true);
  else revealDirectory();
}
function readingProgress(): void {
  const main = $('#main'),
    top = main.getBoundingClientRect().top;
  const progress = main.scrollTop / Math.max(1, main.scrollHeight - main.clientHeight);
  $('#reading-fill').style.width = `${100 * progress}%`;
  $('#top-progress').style.width = `${100 * progress}%`;
  const active = sections.filter((el) => el.getBoundingClientRect().top <= top + 100).at(-1);
  $('#section-context').textContent = active?.textContent ?? '本章导读';
  for (const link of $('#section-list').querySelectorAll<HTMLAnchorElement>('a')) {
    const selected = link.dataset.section === active?.id;
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
function buildOutline(label: string): void {
  sections = [...$('#lesson').querySelectorAll<HTMLElement>(':scope > h2')];
  const used = new Set<string>();
  for (const [index, heading] of sections.entries()) {
    const base = heading
      .textContent!.trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-|-$/g, '');
    heading.id ||= used.has(base) ? `${base}-${index}` : base || `section-${index + 1}`;
    used.add(heading.id);
    heading.tabIndex = -1;
  }
  for (const figure of $('#lesson').querySelectorAll<HTMLElement>('[data-figure]'))
    figure.id = 'demo-' + figure.dataset.figure;
  $('#outline-heading').textContent = label;
  $('#section-list').replaceChildren(
    ...sections.map((heading) => {
      const link = document.createElement('a');
      link.href = route + '#' + encodeURIComponent(heading.id);
      link.dataset.section = heading.id;
      const number = document.createElement('span'),
        title = document.createElement('span');
      const sectionNumber = heading.textContent!.match(/^(\d+)\s*[.·、]/)?.[1];
      number.textContent = sectionNumber ? sectionNumber.padStart(2, '0') : '·';
      title.textContent = heading.textContent!.replace(/^\d+\s*[.·、]\s*/, '');
      link.append(number, title);
      return link;
    }),
  );
  setOutline(outlineMode);
}
function pageHeading(label: string, part: string, number?: string): void {
  const heading = $('#lesson > h1');
  if (number) heading.textContent = heading.textContent!.replace(/^\d\d\s*·\s*/, '');
  const meta = document.createElement('div');
  meta.className = 'chapter-meta';
  meta.textContent = number ? `第 ${number} 章 / ${chapters.length}　·　${part}` : part;
  heading.before(meta);
  const tools = document.createElement('div');
  tools.className = 'chapter-tools';
  const outline = document.createElement('button');
  outline.textContent = `${sections.length} 个小节 · 本章目录`;
  outline.onclick = () => setOutline(true, true);
  tools.append(outline);
  const firstDemo = $('#lesson').querySelector<HTMLElement>('[data-figure]');
  if (firstDemo) {
    const demo = document.createElement('a');
    demo.href = route + '#' + firstDemo.id;
    demo.textContent = `${$('#lesson').querySelectorAll('[data-figure]').length} 个交互演示 ↓`;
    tools.append(demo);
  }
  heading.after(tools);
  $('#chapter-context').textContent = label;
}
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
function chapterFooter(): void {
  const source = document.createElement('button');
  source.className = 'chapter-source';
  source.textContent = '〈/〉 阅读本章完整 TypeScript 源码';
  source.onclick = () => void showSource('');
  $('#lesson').append(source);
  const index = chapters.indexOf(current),
    nav = document.createElement('footer');
  nav.className = 'chapter-navigation';
  for (const [target, direction] of [
    [chapters[index - 1], '上一章'],
    [chapters[index + 1], '下一章'],
  ] as const) {
    const link = document.createElement('a');
    if (!target && index === 0) {
      nav.append(document.createElement('span'));
      continue;
    }
    link.href = target ? chapterHref(target) : '?appendix=capstone';
    const label = document.createElement('small'),
      title = document.createElement('strong');
    label.textContent = direction === '上一章' ? '← 上一章' : target ? '下一章 →' : '继续实践 →';
    title.textContent = target ? `${target.id}　${target.title}` : '一幅图像，两次可见性计算';
    link.append(label, title);
    nav.append(link);
  }
  $('#lesson').append(nav);
}
async function navigate(query: string, push = true, historyPosition?: Position): Promise<void> {
  saveReading(push);
  const [search, hash = ''] = query.split('#'),
    params = new URLSearchParams(search);
  const appendix = appendices.find((a) => a.id === params.get('appendix')),
    entry = resolveChapter(params.get('chapter'));
  const nextRoute = appendix ? `?appendix=${appendix.id}` : chapterHref(entry);
  const url = location.pathname + nextRoute + (hash ? '#' + hash : '');
  if (push) history.pushState({}, '', url);
  else if (location.pathname + location.search + location.hash !== url)
    history.replaceState(history.state, '', url);
  if (nextRoute === route && !$('#main').hasAttribute('aria-busy')) {
    void placeReading(
      historyPosition ?? (push ? { top: 0 } : readSaved(route)?.position),
      historyPosition ? '' : hash,
    );
    if (innerWidth < 900) setNavigation(false);
    return;
  }
  const version = ++navigation,
    reading = readSaved(nextRoute);
  clearTimeout(saveTimer);
  mounted.forEach(({ view }) => view.dispose());
  mounted = [];
  $('#main').setAttribute('aria-busy', 'true');
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
        mounted.push({
          id: 'main',
          view: new SceneView(
            $('#lesson [data-figure]'),
            '10',
            (path) => void showSource(path),
            capstoneSpec(),
            reading?.demos.main as SceneSnapshot | undefined,
          ),
        });
      }
    } else {
      const [lesson, figures] = await Promise.all([
        chapterText(entry, (path) => contents[path]()),
        chapterFigures(entry.slug),
      ]);
      const SceneView = sceneChapters.has(entry.id)
        ? (await import('./scene-view.ts')).SceneView
        : null;
      if (version !== navigation) return;
      current = entry;
      $('#lesson').innerHTML = renderMarkdown(lesson);
      for (const slot of $('#lesson').querySelectorAll<HTMLElement>('[data-figure]')) {
        const id = slot.dataset.figure!,
          state = reading?.demos[id];
        const view =
          id === 'camera-framing'
            ? new CameraStudy(
                slot,
                () => void showSource(`/src/chapters/${entry.slug}/framing.ts`),
                state as CameraSnapshot | undefined,
              )
            : id === 'main' && SceneView
              ? new SceneView(
                  slot,
                  entry.id,
                  (path) => void showSource(path),
                  undefined,
                  state as SceneSnapshot | undefined,
                )
              : figures.has(id)
                ? new FigureView(
                    slot,
                    figures.get(id)!,
                    (path) => void showSource(path),
                    state as FigureSnapshot | undefined,
                  )
                : null;
        if (!view) throw new Error(`演示未注册：${entry.id}/${id}`);
        mounted.push({ id, view });
      }
      chapterFooter();
    }
    route = nextRoute;
    const label = appendix?.title ?? `${entry.id} · ${entry.title}`;
    document.title = `${label} — 从像素到光线`;
    buildOutline(label);
    pageHeading(label, appendix ? '附录与综合实践' : entry.part, appendix ? undefined : entry.id);
    $('#reading-label').textContent = appendix
      ? '附录 · ' + appendix.title
      : `第 ${entry.id} / ${chapters.length} 章 · ${entry.part}`;
    for (const link of $('#chapter-list').querySelectorAll<HTMLAnchorElement>('[data-chapter]')) {
      const active = !appendix && link.dataset.chapter === entry.id;
      link.classList.toggle('active', active);
      if (active) {
        link.setAttribute('aria-current', 'page');
        const part = link.closest('details');
        if (part) part.open = true;
      } else link.removeAttribute('aria-current');
    }
    for (const link of $('#appendix-list').querySelectorAll<HTMLAnchorElement>('a'))
      link.classList.toggle('active', link.dataset.appendix === appendix?.id);
    if (innerWidth < 900) setNavigation(false);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (version !== navigation) return;
    await placeReading(historyPosition ?? reading?.position, historyPosition ? '' : hash);
    readingProgress();
  } catch (error) {
    if (version !== navigation) return;
    const message = document.createElement('p');
    message.className = 'reader-error';
    message.textContent = `页面加载失败：${error instanceof Error ? error.message : String(error)}`;
    $('#lesson').replaceChildren(message);
    console.error(error);
  } finally {
    if (version === navigation) $('#main').removeAttribute('aria-busy');
  }
}

let part = '';
let group: HTMLDetailsElement;
for (const entry of chapters) {
  if (entry.part !== part) {
    group = document.createElement('details');
    group.className = 'book-part';
    const heading = document.createElement('summary');
    heading.textContent = part = entry.part;
    group.append(heading);
    $('#chapter-list').append(group);
  }
  const link = document.createElement('a');
  link.dataset.chapter = entry.id;
  link.href = chapterHref(entry);
  link.innerHTML = `<span>${entry.id}</span><strong>${entry.title}</strong>`;
  group!.append(link);
}
for (const appendix of appendices) {
  const link = document.createElement('a');
  link.textContent = appendix.title;
  link.dataset.appendix = appendix.id;
  link.href = `?appendix=${appendix.id}`;
  $('#appendix-list').append(link);
}
for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-directory]')) {
  tab.onclick = () => setOutline(tab.dataset.directory === 'section');
  tab.onkeydown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const active = event.key === 'Home' ? false : event.key === 'End' ? true : !outlineMode;
    setOutline(active);
    $<HTMLButtonElement>(`[data-directory="${active ? 'section' : 'book'}"]`).focus();
  };
}
$('#toggle-navigation').onclick = () =>
  setNavigation(document.body.classList.contains('navigation-collapsed'));
$('#navigation-scrim').onclick = () => setNavigation(false);
$('#section-jump').onclick = () => setOutline(true, true);
$('#focus-reading').onclick = () => {
  const at = position();
  const focus = document.body.classList.toggle('reading-focus');
  if (focus) {
    navigationBeforeFocus = !document.body.classList.contains('navigation-collapsed');
    setNavigation(false);
  } else setNavigation(navigationBeforeFocus && innerWidth >= 900);
  $('#focus-reading').setAttribute('aria-pressed', String(focus));
  $('#focus-reading').textContent = focus ? '退出专注' : '专注阅读';
  void placeReading(at);
};
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-font]'))
  button.onclick = () => setFont(Number(button.dataset.font));
function setFont(size: number): void {
  const at = route ? position() : undefined;
  const font = [16, 18, 20].includes(size) ? size : 16;
  document.documentElement.style.setProperty('--reading-size', font + 'px');
  document
    .querySelectorAll<HTMLButtonElement>('[data-font]')
    .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.font) === font)));
  try {
    localStorage.setItem('graphics-reading-font', String(font));
  } catch {
    /* Optional preference. */
  }
  if (at) void placeReading(at);
}
try {
  setFont(Number(localStorage.getItem('graphics-reading-font')));
} catch {
  setFont(16);
}
setNavigation(innerWidth >= 900);
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
    if (!scrollFrame)
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        readingProgress();
      });
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveReading(), 350);
  },
  { passive: true },
);
document.addEventListener('click', (event) => {
  if (!(event.target as Element).closest('.type-settings'))
    $<HTMLDetailsElement>('.type-settings').open = false;
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const href = link.getAttribute('href')!;
  if (href.startsWith('?') || href.startsWith('#')) {
    event.preventDefault();
    void navigate(href.startsWith('#') ? route + href : href);
  } else if (href.endsWith('.ts')) {
    const path = href.startsWith('/src/') ? href : `/src/chapters/${current.slug}/${href}`;
    if (path in sources) {
      event.preventDefault();
      void showSource(path);
    }
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && innerWidth < 900) setNavigation(false);
});
for (const event of ['pointerdown', 'wheel', 'keydown'] as const)
  document.addEventListener(
    event,
    () => {
      positionRequest++;
    },
    { passive: true, capture: true },
  );
window.addEventListener('pagehide', () => saveReading());
window.addEventListener(
  'popstate',
  (event) => void navigate(location.search + location.hash, false, event.state?.position),
);
history.scrollRestoration = 'manual';
matchMedia('(max-width: 899px)').addEventListener('change', (event) => {
  if (event.matches) setNavigation(false);
});
void navigate(
  (location.search || '?chapter=pixels') + location.hash,
  false,
  history.state?.position,
);
