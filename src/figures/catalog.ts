import type { FigureSpec } from './spec.ts';
const modules = import.meta.glob<{ figures: FigureSpec[]; main?: FigureSpec }>(
  '/src/chapters/*/figures.ts',
);
export async function chapterFigures(slug: string): Promise<Map<string, FigureSpec>> {
  const load = modules[`/src/chapters/${slug}/figures.ts`];
  if (!load) return new Map();
  const module = await load(),
    entries = [...module.figures, ...(module.main ? [module.main] : [])];
  return new Map(entries.map((figure) => [figure.id, figure]));
}
