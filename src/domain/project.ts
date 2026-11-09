import { type Snapshot, type EntityReference } from './schema';
export function createProject(title = '無題のシナリオ'): Snapshot {
  const now = new Date().toISOString(); const projectId = crypto.randomUUID();
  return { schemaVersion: 1, project: { id: projectId, title, description: '', createdAt: now, updatedAt: now }, nodes: [], documents: [], edges: [], nodeTypes: ['本文','イベント','情報','設定資料'].map((name, i) => ({ id: crypto.randomUUID(), name, icon: ['¶','◆','◈','▤'][i], color: ['#657e6d','#a6774f','#66859c','#9180a4'][i], fields: [] })), entities: [], tags: [], outline: [], sync: { projectId, status: 'notConfigured', baseCommitSha: null, lastSyncedAt: null, lastSyncedRevision: null } };
}
export function resolveReference(ref: EntityReference, data: Snapshot): { text: string; broken: boolean } {
  const entity = data.entities.find(e => e.id === ref.entityId);
  if (ref.mode === 'fixed') return { text: ref.text, broken: !entity };
  if (!entity) return { text: '［削除された設定資料］', broken: true };
  if (ref.mode === 'auto') return { text: entity.name, broken: false };
  const alias = entity.aliases.find(a => a.id === ref.aliasId);
  return { text: alias?.name ?? '［削除された別名］', broken: !alias };
}
