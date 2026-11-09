import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject, resolveReference } from '../domain/project';
import { parseSnapshot, type Snapshot } from '../domain/schema';
import { ConflictError, ProjectRepository, ScenarioDatabase } from '../storage/database';
import { Autosave } from '../storage/autosave';
const databases: ScenarioDatabase[] = [];
function repository() { const db = new ScenarioDatabase(crypto.randomUUID()); databases.push(db); return new ProjectRepository(db); }
afterEach(async () => { vi.useRealTimers(); await Promise.all(databases.splice(0).map(db => db.delete())); });
function fixture() {
  const p = createProject(); const now = new Date().toISOString(); const docId = crypto.randomUUID(); const nodeId = crypto.randomUUID();
  p.documents.push({ id: docId, createdAt: now, updatedAt: now, content: [{ kind: 'block', style: 'paragraph', children: [{ kind: 'text', text: '日本語の本文', marks: [] }] }] });
  p.nodes.push({ id: nodeId, createdAt: now, updatedAt: now, typeId: p.nodeTypes[0].id, title: '導入', documentId: docId, position: { x: 12, y: 30 }, parentGroupId: null, fields: {}, tagIds: [] });
  return p;
}
describe('保存モデル', () => {
  it('初期タイプと独立したモデルを往復する', () => { const p = fixture(); expect(parseSnapshot(JSON.parse(JSON.stringify(p)))).toEqual(p); expect(p.nodeTypes.map(t => t.name)).toEqual(['本文','イベント','情報','設定資料']); });
  it('未知の版・未知の項目・重複IDを拒否する', () => { const p = fixture(); expect(() => parseSnapshot({ ...p, schemaVersion: 3 })).toThrow(); expect(() => parseSnapshot({ ...p, extra: true })).toThrow(); p.nodes.push(p.nodes[0]); expect(() => parseSnapshot(p)).toThrow('ID'); });
  it('参照切れエッジと階層循環を拒否する', () => { const p = fixture(); p.edges.push({ id: crypto.randomUUID(), sourceId: p.nodes[0].id, targetId: crypto.randomUUID(), kind: 'progression', label: '', condition: '' }); expect(() => parseSnapshot(p)).toThrow('接続先'); p.edges = []; p.nodes[0].parentGroupId = p.nodes[0].id; expect(() => parseSnapshot(p)).toThrow('循環'); });
  it('循環エッジ・多重エッジ・重複アウトライン参照を許可する', () => { const p = fixture(); for (let i=0;i<2;i++) { p.edges.push({ id: crypto.randomUUID(), sourceId: p.nodes[0].id, targetId: p.nodes[0].id, kind: 'reference', label: '', condition: '' }); p.outline.push({ id: crypto.randomUUID(), parentId: null, nodeId: p.nodes[0].id, title: '', order: i }); } expect(parseSnapshot(p)).toEqual(p); });
  it('タイプ変更で既存フィールド値を捨てない', () => { const p = fixture(); const fieldId = crypto.randomUUID(); p.nodes[0].fields[fieldId] = { kind: 'text', value: '旧タイプの情報' }; p.nodes[0].typeId = p.nodeTypes[1].id; expect(parseSnapshot(p).nodes[0].fields[fieldId]).toEqual({ kind: 'text', value: '旧タイプの情報' }); });
  it('グラフ座標とアウトライン順序が独立している', () => { const p = fixture(); p.outline.push({ id: crypto.randomUUID(), parentId: null, nodeId: p.nodes[0].id, title: '', order: 0 }); p.nodes[0].position.x = 999; expect(p.outline[0].order).toBe(0); p.outline[0].order = 10; expect(p.nodes[0].position.x).toBe(999); });
});
describe('ID参照', () => {
  it('正式名・別名は追従、固定表記は維持、削除は警告', () => { const p = fixture(); const entity = { id: crypto.randomUUID(), createdAt: p.project.createdAt, updatedAt: p.project.updatedAt, category: 'NPC', name: '旧名', aliases: [{ id: crypto.randomUUID(), name: '旧別名' }], descriptionDocumentId: p.documents[0].id, fields: {}, tagIds: [] }; p.entities.push(entity); entity.name = '新名'; entity.aliases[0].name = '新別名'; expect(resolveReference({ entityId: entity.id, mode: 'auto' }, p).text).toBe('新名'); expect(resolveReference({ entityId: entity.id, mode: 'alias', aliasId: entity.aliases[0].id }, p).text).toBe('新別名'); const ref = { entityId: entity.id, mode: 'fixed' as const, text: '固定名' }; expect(resolveReference(ref, p)).toEqual({ text: '固定名', broken: false }); entity.aliases = []; expect(resolveReference({ entityId: entity.id, mode: 'alias', aliasId: crypto.randomUUID() }, p).broken).toBe(true); p.entities = []; expect(resolveReference(ref, p)).toEqual({ text: '固定名', broken: true }); });
});
describe('IndexedDB保存', () => {
  it('再接続後も保存データを復元する', async () => { const repo = repository(); const p = fixture(); await repo.save(p, 0); repo.db.close(); await repo.db.open(); expect((await repo.load(p.project.id))?.snapshot).toEqual(p); });
  it('競合時に既存データを上書きしない', async () => { const repo = repository(); const p = fixture(); await repo.save(p, 0); const outcomes = await Promise.allSettled([repo.save({ ...p, project: { ...p.project, title: 'A' } }, 1), repo.save({ ...p, project: { ...p.project, title: 'B' } }, 1)]); expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1); expect(outcomes.find(x => x.status === 'rejected')).toMatchObject({ reason: expect.any(ConflictError) }); expect((await repo.load(p.project.id))?.revision).toBe(2); });
  it('削除後のノードを履歴から復元し、直前の状態も残す', async () => { const repo = repository(); const p = fixture(); await repo.save(p, 0); await repo.save({ ...p, nodes: [] }, 1); const restored = await repo.restore(p.project.id, 1, 2); expect(restored.snapshot.nodes).toHaveLength(1); expect((await repo.revisions(p.project.id)).map(r => r.revision)).toEqual([2,1]); });
  it('不正データ保存が既存状態を壊さない', async () => { const repo = repository(); const p = fixture(); await repo.save(p, 0); await expect(repo.save({ ...p, schemaVersion: 3 } as unknown as Snapshot, 1)).rejects.toThrow(); expect((await repo.load(p.project.id))?.revision).toBe(1); });
  it('書き込み途中の障害で履歴もロールバックする', async () => { const repo = repository(); const p = fixture(); await repo.save(p, 0); const hook = () => { throw new Error('quota'); }; repo.db.projects.hook('updating', hook); await expect(repo.save(p, 1)).rejects.toThrow('quota'); repo.db.projects.hook('updating').unsubscribe(hook); expect(await repo.revisions(p.project.id)).toHaveLength(0); expect((await repo.load(p.project.id))?.revision).toBe(1); });
});
describe('自動保存', () => {
  it('短時間の連続編集をまとめる', async () => { vi.useFakeTimers(); const repo = repository(); const spy = vi.spyOn(repo, 'save').mockImplementation(async p => ({ id: p.project.id, snapshot: p, revision: 1, savedAt: new Date().toISOString() })); const p = fixture(); const saver = new Autosave(repo, 0, () => {}); saver.enqueue(p); saver.enqueue({ ...p, project: { ...p.project, title: '最終入力' } }); await vi.advanceTimersByTimeAsync(501); expect(spy).toHaveBeenCalledTimes(1); expect(spy.mock.calls[0][0].project.title).toBe('最終入力'); expect(saver.dirty).toBe(false); });
  it('保存失敗で未保存データを保持し、再試行する', async () => { const repo = repository(); const spy = vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('容量不足')); const saver = new Autosave(repo, 0, () => {}); const p = fixture(); saver.enqueue(p); await saver.flush(); expect(saver.status).toBe('error'); expect(saver.dirty).toBe(true); spy.mockRestore(); await saver.flush(); expect(saver.status).toBe('saved'); expect((await repo.load(p.project.id))?.snapshot).toEqual(p); });
  it('保存中に届いた編集も順番に保存する', async () => { const repo = repository(); const original = repo.save.bind(repo); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); vi.spyOn(repo, 'save').mockImplementationOnce(async (p, r) => { await gate; return original(p, r); }); const p = fixture(); const saver = new Autosave(repo, 0, () => {}); saver.enqueue(p); const first = saver.flush(); saver.enqueue({ ...p, project: { ...p.project, title: '最新' } }); release(); await first; expect((await repo.load(p.project.id))?.snapshot.project.title).toBe('最新'); expect(saver.revision).toBe(2); });
});
