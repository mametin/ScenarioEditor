import type { Snapshot } from '../domain/schema';
import { ProjectRepository } from './database';
export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';
/** Single writer. Changes arriving during an in-flight save remain pending. */
export class Autosave {
  private pending?: Snapshot;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  status: SaveStatus = 'saved';
  constructor(private repo: ProjectRepository, public revision: number, private notify: (status: SaveStatus, error?: string) => void, private delay = 500) {}
  private set(status: SaveStatus, error?: string) { this.status = status; this.notify(status, error); }
  get dirty() { return !!this.pending || !!this.running; }
  enqueue(snapshot: Snapshot) { this.pending = structuredClone(snapshot); clearTimeout(this.timer); this.set('pending'); this.timer = setTimeout(() => { void this.flush(); }, this.delay); }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    this.running = this.drain();
    try { await this.running; } finally { this.running = undefined; }
  }
  private async drain() {
    while (this.pending) {
      const candidate = this.pending; this.pending = undefined; this.set('saving');
      try { const saved = await this.repo.save(candidate, this.revision); this.revision = saved.revision; }
      catch (error) { this.pending ??= candidate; this.set('error', error instanceof Error ? error.message : '保存に失敗しました'); return; }
    }
    this.set('saved');
  }
}
