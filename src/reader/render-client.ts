import type { StudyState } from '../render/scenes.ts';
import type { StudyOutput } from '../render/render-study.ts';

export type RenderQuality = 'preview' | 'final';
type Job = { id: number; quality: RenderQuality };

/** 一次只计算一帧。拖动时追踪最新输入，停下后补齐最终分辨率。 */
export class StudyRenderer {
  private worker?: Worker;
  private state?: StudyState;
  private version = 0;
  private active?: Job;
  private previewVersion = -1;
  private finalVersion = -1;
  private settled = false;
  private timer = 0;
  private disposed = false;
  private onFrame: (frame: StudyOutput, quality: RenderQuality, current: boolean) => void;
  private onError: (message: string) => void;

  constructor(
    onFrame: (frame: StudyOutput, quality: RenderQuality, current: boolean) => void,
    onError: (message: string) => void,
  ) {
    this.onFrame = onFrame;
    this.onError = onError;
  }

  update(state: StudyState): void {
    if (this.disposed) return;
    this.state = structuredClone(state);
    this.version++;
    this.settled = false;
    clearTimeout(this.timer);
    // 高质量计算可很长，新的操作优先。短预览则允许完成，以保持连续反馈。
    if (this.active?.quality === 'final') this.stopWorker();
    this.timer = window.setTimeout(() => {
      this.settled = true;
      this.pump();
    }, 260);
    this.pump();
  }

  private pump(): void {
    if (!this.state || this.active || this.disposed) return;
    const quality: RenderQuality = this.settled ? 'final' : 'preview';
    if ((quality === 'preview' ? this.previewVersion : this.finalVersion) === this.version) return;
    if (!this.worker) {
      const worker = (this.worker = new Worker(new URL('../render/worker.ts', import.meta.url), {
        type: 'module',
      }));
      worker.onmessage = (event: MessageEvent<Job & { frame?: StudyOutput; error?: string }>) => {
        if (this.worker !== worker || !this.active || event.data.id !== this.active.id) return;
        const job = this.active;
        this.active = undefined;
        if (event.data.error) {
          if (job.id === this.version) {
            this.finalVersion = this.previewVersion = job.id;
            this.onError(event.data.error);
          }
        } else {
          if (job.quality === 'preview') this.previewVersion = job.id;
          else this.finalVersion = job.id;
          if (job.quality === 'preview' || job.id === this.version)
            this.onFrame(event.data.frame!, job.quality, job.id === this.version);
        }
        this.pump();
      };
      worker.onerror = (event) => {
        if (this.worker !== worker) return;
        this.onError(event.message || '渲染失败');
        this.finalVersion = this.previewVersion = this.version;
        this.stopWorker();
      };
    }
    this.active = { id: this.version, quality };
    this.worker.postMessage({ ...this.active, state: this.state });
  }

  private stopWorker(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.active = undefined;
  }
  cancel(): void {
    clearTimeout(this.timer);
    this.stopWorker();
  }
  dispose(): void {
    this.disposed = true;
    this.cancel();
  }
}
