/// <reference lib="webworker" />
import { renderStudy } from './render-study.ts';
import type { StudyState } from './scenes.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (
  event: MessageEvent<{ id: number; state: StudyState; quality: 'preview' | 'final' }>,
) => {
  const { id, state, quality } = event.data,
    start = performance.now();
  try {
    if (quality === 'preview' && state.params.shadowSize)
      state.params.shadowSize = Math.min(128, Number(state.params.shadowSize));
    const size =
      quality === 'preview'
        ? Math.min(128, Number(state.params.resolution))
        : Number(state.params.resolution);
    const frame = renderStudy(state, size);
    frame.stats['计算 / ms'] = Math.round(performance.now() - start);
    scope.postMessage({ id, quality, frame }, [
      frame.linear.buffer,
      frame.pixels.buffer,
      frame.depth.buffer,
      frame.owner.buffer,
      frame.world.buffer,
      frame.normal.buffer,
      frame.uv.buffer,
    ]);
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
