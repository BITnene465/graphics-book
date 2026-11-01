const paths: Record<string, string> = {
  source: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18',
  undo: 'M9 5 4 10l5 5M4 10h9a6 6 0 0 1 0 12',
  redo: 'm15 5 5 5-5 5m5-5h-9a6 6 0 0 0 0 12',
  reset: 'M4 10a8 8 0 1 1 1 9M4 3v7h7',
  full: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  save: 'M12 2v13m-5-5 5 5 5-5M4 17v5h16v-5',
  move: 'M12 2v20M2 12h20M8 6l4-4 4 4m-8 12 4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4',
  rotate: 'M20 8a8 8 0 1 0 0 8m0-14v6h-6',
  scale: 'M3 3h7v7H3zM14 3h7v7m-7 11h7v-7m-9-2 9-9',
  frame: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z',
};
export const icon = (name: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tool-icon"><path d="${paths[name === 'fullscreen' ? 'full' : name] ?? paths.frame}"/></svg>`;
