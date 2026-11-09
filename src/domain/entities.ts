import { parseSnapshot, type Snapshot, type ScenarioEntity, type EntityReference, type Content } from './schema';
import { resolveReference } from './project';
export const entityCategories = ['NPC', '場所', '用語', 'アイテム'];
export function changeEntities(source: Snapshot, change: (draft: Snapshot) => void): Snapshot { const draft = structuredClone(source); change(draft); draft.project.updatedAt = new Date().toISOString(); return parseSnapshot(draft); }
export function createEntity(draft: Snapshot, category = 'NPC'): string {
  const id = crypto.randomUUID(), documentId = crypto.randomUUID(), now = new Date().toISOString();
  draft.documents.push({ id: documentId, createdAt: now, updatedAt: now, content: [] });
  draft.entities.push({ id, category, name: '新しい設定資料', aliases: [], descriptionDocumentId: documentId, fields: {}, tagIds: [], createdAt: now, updatedAt: now }); return id;
}
export function updateEntity(draft: Snapshot, id: string, patch: Partial<Pick<ScenarioEntity, 'name' | 'category' | 'aliases' | 'tagIds'>>) { const e = draft.entities.find(e => e.id === id); if (!e) throw new Error('設定資料が見つかりません'); Object.assign(e, patch, { updatedAt: new Date().toISOString() }); }
/** Retain documents and ID references so missing targets can be diagnosed and restored. */
export function deleteEntity(draft: Snapshot, id: string) { draft.entities = draft.entities.filter(e => e.id !== id); }
export type ReferenceUsage = { key: string; ownerKind: 'node' | 'entity' | 'document'; ownerId: string; ownerName: string; documentId?: string; reference: EntityReference; broken: boolean; text: string };
export function entityUsages(data: Snapshot, entityId?: string): ReferenceUsage[] {
  const result: ReferenceUsage[] = [];
  const add = (reference: EntityReference, owner: Omit<ReferenceUsage, 'reference' | 'broken' | 'text'>) => { if (!entityId || reference.entityId === entityId) result.push({ ...owner, reference, ...resolveReference(reference, data) }); };
  for (const doc of data.documents) {
    const owners: Omit<ReferenceUsage, 'reference' | 'broken' | 'text' | 'key'>[] = [];
    for (const n of data.nodes) if (n.documentId === doc.id || Object.values(n.fields).some(f => f.kind === 'richText' && f.documentId === doc.id)) owners.push({ ownerKind: 'node', ownerId: n.id, ownerName: n.title || '無題', documentId: doc.id });
    for (const e of data.entities) if (e.descriptionDocumentId === doc.id || Object.values(e.fields).some(f => f.kind === 'richText' && f.documentId === doc.id)) owners.push({ ownerKind: 'entity', ownerId: e.id, ownerName: e.name || '無名', documentId: doc.id });
    if (!owners.length) owners.push({ ownerKind: 'document', ownerId: doc.id, ownerName: '保持された本文', documentId: doc.id });
    const visit = (content: Content[], path: string) => content.forEach((c, i) => { if (c.kind === 'entity') for (const owner of owners) add(c.reference, { ...owner, key: `${owner.ownerId}:${doc.id}:${path}.${i}` }); else if (c.kind === 'block') visit(c.children, `${path}.${i}`); });
    visit(doc.content, 'content');
  }
  for (const [kind, items] of [['node', data.nodes], ['entity', data.entities]] as const) for (const item of items) for (const [fieldId, field] of Object.entries(item.fields)) if (field.kind === 'entityReference') add(field.reference, { key: `${item.id}:field:${fieldId}`, ownerKind: kind, ownerId: item.id, ownerName: 'title' in item ? item.title : item.name });
  return result;
}
