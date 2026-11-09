import Dexie, { type Table } from 'dexie';
import { parseSnapshot, type Snapshot } from '../domain/schema';
export type Stored = { id: string; revision: number; savedAt: string; snapshot: Snapshot };
export class ScenarioDatabase extends Dexie {
  projects!: Table<Stored, string>;
  history!: Table<Stored, [string, number]>;
  constructor(name = 'trpg-scenario-editor') { super(name); this.version(1).stores({ projects: 'id, savedAt', history: '[id+revision], id' }); }
}
export class ConflictError extends Error { constructor() { super('別のタブで更新されています。未保存JSONを退避し、再読み込みしてください。'); } }
export class ProjectRepository {
  constructor(readonly db: ScenarioDatabase) {}
  async list() { return (await this.db.projects.toArray()).map(row => ({ ...row, snapshot: parseSnapshot(row.snapshot) })); }
  async load(id: string) { const row = await this.db.projects.get(id); return row ? { ...row, snapshot: parseSnapshot(row.snapshot) } : undefined; }
  async save(raw: Snapshot, expectedRevision: number): Promise<Stored> {
    const snapshot = parseSnapshot(raw);
    return this.db.transaction('rw', this.db.projects, this.db.history, async () => {
      const old = await this.db.projects.get(snapshot.project.id);
      if ((old?.revision ?? 0) !== expectedRevision) throw new ConflictError();
      const next = { id: snapshot.project.id, revision: expectedRevision + 1, savedAt: new Date().toISOString(), snapshot };
      if (old) await this.db.history.put(old);
      await this.db.projects.put(next);
      return next;
    });
  }
  async revisions(id: string) { return (await this.db.history.where('id').equals(id).toArray()).sort((a,b) => b.revision - a.revision); }
  async restore(id: string, revision: number, expectedRevision: number) {
    const old = await this.db.history.get([id, revision]);
    if (!old) throw new Error('履歴が見つかりません');
    return this.save(parseSnapshot(old.snapshot), expectedRevision);
  }
}
