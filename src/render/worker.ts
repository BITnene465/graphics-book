/// <reference lib="webworker" />
import { renderStudy } from './render-study.ts';
import type { StudyState } from './scenes.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<{ id: number; state: StudyState }>) => {
  const { id, state } = event.data,
    start = performance.now();
  try {
    const frame = renderStudy(state);
    frame.stats['计算 / ms'] = Math.round(performance.now() - start);
    scope.postMessage({ id, frame }, [
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
