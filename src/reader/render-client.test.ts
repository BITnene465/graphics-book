import test from 'node:test';
import assert from 'node:assert/strict';
import { StudyRenderer } from './render-client.ts';
import { studySpec } from '../render/scenes.ts';
import type { StudyState } from '../render/scenes.ts';
import type { StudyOutput } from '../render/render-study.ts';

type Job = { id: number; quality: 'preview' | 'final'; state: StudyState };
class ControlledWorker {
  static instances: ControlledWorker[] = [];
  jobs: Job[] = [];
  terminated = false;
  onmessage?: (event: { data: Job & { frame: StudyOutput } }) => void;
  onerror?: (event: { message: string }) => void;
  constructor() {
    ControlledWorker.instances.push(this);
  }
  postMessage(job: Job) {
    this.jobs.push(structuredClone(job));
  }
  terminate() {
    this.terminated = true;
  }
  reply(job: Job) {
    this.onmessage?.({ data: { ...job, frame: { width: job.id } as StudyOutput } });
  }
}
const waitForSettling = () => new Promise((resolve) => setTimeout(resolve, 290));
function fixture() {
  const originalWorker = globalThis.Worker,
    originalWindow = globalThis.window;
  globalThis.Worker = ControlledWorker as unknown as typeof Worker;
  globalThis.window = { setTimeout } as unknown as Window & typeof globalThis;
  ControlledWorker.instances = [];
  const frames: { id: number; quality: string; current: boolean }[] = [];
  const renderer = new StudyRenderer(
    (frame, quality, current) => frames.push({ id: frame.width, quality, current }),
    (message) => assert.fail(message),
  );
  return {
    renderer,
    frames,
    cleanup() {
      renderer.dispose();
      globalThis.Worker = originalWorker;
      globalThis.window = originalWindow;
    },
  };
}
test('连续输入仍显示短预览，最终任务只使用最新参数', async () => {
  const { renderer, frames, cleanup } = fixture();
  try {
    const state = studySpec('15').state;
    renderer.update(state);
    const worker = ControlledWorker.instances[0];
    state.params.mirrorA = 0.1;
    renderer.update(state);
    worker.reply(worker.jobs[0]);
    assert.deepEqual(frames[0], { id: 1, quality: 'preview', current: false });
    assert.equal(worker.jobs[1].state.params.mirrorA, 0.1);
    await waitForSettling();
    worker.reply(worker.jobs[1]);
    assert.equal(worker.jobs[2].quality, 'final');
    assert.equal(worker.jobs[2].state.params.mirrorA, 0.1);
    worker.reply(worker.jobs[2]);
    assert.deepEqual(frames.at(-1), { id: 2, quality: 'final', current: true });
    assert.equal(worker.jobs.length, 3);
  } finally {
    cleanup();
  }
});
test('新操作中止旧完整成像，迟到结果不能覆盖新预览', async () => {
  const { renderer, frames, cleanup } = fixture();
  try {
    const state = studySpec('15').state;
    renderer.update(state);
    const old = ControlledWorker.instances[0];
    old.reply(old.jobs[0]);
    await waitForSettling();
    assert.equal(old.jobs[1].quality, 'final');
    state.params.mirrorA = 0.9;
    renderer.update(state);
    assert.equal(old.terminated, true);
    old.reply(old.jobs[1]);
    old.onerror?.({ message: '旧任务迟到的错误' });
    assert.equal(frames.length, 1);
    const current = ControlledWorker.instances[1];
    current.reply(current.jobs[0]);
    assert.deepEqual(frames.at(-1), { id: 2, quality: 'preview', current: true });
    renderer.dispose();
    assert.equal(current.terminated, true);
  } finally {
    cleanup();
  }
});
