/** 一次拖动记一份快照；撤销后开始新操作会丢弃旧的重做分支。 */
export class EditHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  remember(value: T): void {
    this.past.push(structuredClone(value));
    if (this.past.length > 40) this.past.shift();
    this.future = [];
  }
  undo(current: T): T | undefined {
    const value = this.past.pop();
    if (value !== undefined) this.future.push(structuredClone(current));
    return value;
  }
  redo(current: T): T | undefined {
    const value = this.future.pop();
    if (value !== undefined) this.past.push(structuredClone(current));
    return value;
  }
}
