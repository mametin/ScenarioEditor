import { parseSnapshot, type Snapshot, type FieldDefinition, FieldValueSchema } from './schema';
import type { z } from 'zod';
export type FieldValue = z.infer<typeof FieldValueSchema>;
export const fieldLabels: Record<FieldDefinition['kind'], string> = { text: '一行テキスト', richText: 'リッチテキスト', number: '数値', boolean: '真偽値', singleSelect: '単一選択', multiSelect: '複数選択', date: '日付', entityReference: '設定資料参照', nodeReference: 'ノード参照' };
export function editTypes(snapshot: Snapshot, operation: (draft: Snapshot) => void) { const draft = structuredClone(snapshot); operation(draft); draft.project.updatedAt = new Date().toISOString(); return parseSnapshot(draft); }
export function addType(draft: Snapshot, name: string) { const id = crypto.randomUUID(); draft.nodeTypes.push({ id, name, icon: '◇', color: '#657e6d', fields: [] }); return id; }
export function addField(draft: Snapshot, typeId: string, kind: FieldDefinition['kind'], name: string) { const type = draft.nodeTypes.find(t => t.id === typeId); if (!type) throw new Error('タイプが見つかりません'); const id = crypto.randomUUID(); type.fields.push({ id, name, kind, hidden: false, options: [] }); return id; }
export function fieldUsage(draft: Snapshot, fieldId: string) { return [...draft.nodes, ...draft.entities].filter(item => Object.hasOwn(item.fields, fieldId)).length; }
/** Permanently remove a field definition and its values. Rich text documents are
 * collected only when no other object still points to them. */
export function deleteField(draft: Snapshot, typeId: string, fieldId: string) {
  const type = draft.nodeTypes.find(t => t.id === typeId);
  if (!type) throw new Error('タイプが見つかりません');
  const index = type.fields.findIndex(f => f.id === fieldId);
  if (index < 0) throw new Error('フィールドが見つかりません');
  type.fields.splice(index, 1);
  const removedDocuments = new Set<string>();
  for (const item of [...draft.nodes, ...draft.entities]) {
    const value = item.fields[fieldId];
    if (value?.kind === 'richText') removedDocuments.add(value.documentId);
    delete item.fields[fieldId];
  }
  for (const documentId of removedDocuments) {
    const stillUsed = draft.nodes.some(n => n.documentId === documentId) || draft.entities.some(e => e.descriptionDocumentId === documentId) || [...draft.nodes, ...draft.entities].some(item => Object.values(item.fields).some(value => value.kind === 'richText' && value.documentId === documentId));
    if (!stillUsed) draft.documents = draft.documents.filter(doc => doc.id !== documentId);
  }
}
/** Remove a type after callers have confirmed its effects. Nodes are reassigned
 * to a remaining type; values for the removed type's fields are deleted. */
export function deleteType(draft: Snapshot, typeId: string) {
  if (draft.nodeTypes.length <= 1) throw new Error('最後のタイプは削除できません');
  const index = draft.nodeTypes.findIndex(t => t.id === typeId);
  if (index < 0) throw new Error('タイプが見つかりません');
  const removed = draft.nodeTypes[index];
  const fallback = draft.nodeTypes.find(t => t.id !== typeId)!;
  const fieldIds = new Set(removed.fields.map(field => field.id));
  const removedDocuments = new Set<string>();
  for (const node of draft.nodes.filter(n => n.typeId === typeId)) {
    node.typeId = fallback.id;
    node.updatedAt = new Date().toISOString();
    for (const fieldId of fieldIds) {
      const value = node.fields[fieldId];
      if (value?.kind === 'richText') removedDocuments.add(value.documentId);
      delete node.fields[fieldId];
    }
  }
  for (const entity of draft.entities) for (const fieldId of fieldIds) {
    const value = entity.fields[fieldId];
    if (value?.kind === 'richText') removedDocuments.add(value.documentId);
    delete entity.fields[fieldId];
  }
  draft.nodeTypes.splice(index, 1);
  for (const documentId of removedDocuments) {
    const stillUsed = draft.nodes.some(n => n.documentId === documentId) || draft.entities.some(e => e.descriptionDocumentId === documentId) || [...draft.nodes, ...draft.entities].some(item => Object.values(item.fields).some(value => value.kind === 'richText' && value.documentId === documentId));
    if (!stillUsed) draft.documents = draft.documents.filter(doc => doc.id !== documentId);
  }
  return fallback.id;
}
/** Archive the definition as hidden, retaining its ID, options and every value. */
export function archiveField(draft: Snapshot, typeId: string, fieldId: string) { const field = draft.nodeTypes.find(t => t.id === typeId)?.fields.find(f => f.id === fieldId); if (!field) throw new Error('フィールドが見つかりません'); field.hidden = true; }
export function reorderField(draft: Snapshot, typeId: string, fieldId: string, direction: -1 | 1) { const fields = draft.nodeTypes.find(t => t.id === typeId)?.fields; if (!fields) return; const i = fields.findIndex(f => f.id === fieldId); const j = i + direction; if (i >= 0 && j >= 0 && j < fields.length) [fields[i], fields[j]] = [fields[j], fields[i]]; }
export function setField(draft: Snapshot, nodeId: string, fieldId: string, value: FieldValue) { const node = draft.nodes.find(n => n.id === nodeId); if (!node) throw new Error('ノードが見つかりません'); const definition = draft.nodeTypes.find(t => t.id === node.typeId)?.fields.find(f => f.id === fieldId); if (!definition || definition.kind !== value.kind) throw new Error('フィールドの型が一致しません'); node.fields[fieldId] = FieldValueSchema.parse(value); node.updatedAt = new Date().toISOString(); }
export function createFieldDocument(draft: Snapshot, nodeId: string, fieldId: string) { const now = new Date().toISOString(); const id = crypto.randomUUID(); draft.documents.push({ id, createdAt: now, updatedAt: now, content: [] }); setField(draft, nodeId, fieldId, { kind: 'richText', documentId: id }); return id; }
export function setEntityField(draft: Snapshot, entityId: string, fieldId: string, value: FieldValue) { const entity = draft.entities.find(e => e.id === entityId); if (!entity) throw new Error('設定資料が見つかりません'); const definition = draft.nodeTypes.flatMap(t => t.fields).find(f => f.id === fieldId); if (!definition || definition.kind !== value.kind) throw new Error('フィールドの型が一致しません'); entity.fields[fieldId] = FieldValueSchema.parse(value); entity.updatedAt = new Date().toISOString(); }
export function createEntityFieldDocument(draft: Snapshot, entityId: string, fieldId: string) { const now = new Date().toISOString(); const id = crypto.randomUUID(); draft.documents.push({ id, createdAt: now, updatedAt: now, content: [] }); setEntityField(draft, entityId, fieldId, { kind: 'richText', documentId: id }); return id; }
