import type { Content, ScenarioEntity, ScenarioNode, Snapshot } from './schema';
import type { EntityReference } from './schema';
import { orderedOutline } from './outline';

export type PreflightIssue = { id: string; severity: 'error' | 'warning'; message: string; nodeId?: string; entityId?: string };

function hasContent(content: Content[]): boolean {
  return content.some(item => item.kind === 'text' ? !!item.text.trim() : item.kind === 'block' ? hasContent(item.children) : true);
}
function referenceIsBroken(reference: EntityReference, entities: Map<string, ScenarioEntity>): boolean {
  const entity = entities.get(reference.entityId);
  if (reference.mode === 'fixed') return !entity;
  if (!entity) return true;
  return reference.mode === 'alias' && !entity.aliases.some(alias => alias.id === reference.aliasId);
}
function scanContent(content: Content[], nodeIds: Set<string>, entities: Map<string, ScenarioEntity>, owner: { nodeId?: string; entityId?: string }, add: (issue: PreflightIssue) => void) {
  for (const item of content) {
    if (item.kind === 'entity') {
      if (referenceIsBroken(item.reference, entities)) add({ id: `entity-ref:${owner.nodeId ?? owner.entityId}:${item.reference.entityId}`, severity: 'error', message: '本文中にリンク切れの設定資料参照があります。', ...owner });
    } else if (item.kind === 'nodeLink') {
      if (!nodeIds.has(item.nodeId)) add({ id: `node-ref:${owner.nodeId ?? owner.entityId}:${item.nodeId}`, severity: 'error', message: '本文中にリンク切れのノード参照があります。', ...owner });
    } else if (item.kind === 'block') scanContent(item.children, nodeIds, entities, owner, add);
  }
}
function scanFields(fields: Record<string, unknown>, nodeIds: Set<string>, entities: Map<string, ScenarioEntity>, documents: Map<string, Content[]>, owner: { nodeId?: string; entityId?: string }, add: (issue: PreflightIssue) => void) {
  for (const value of Object.values(fields) as { kind?: string; reference?: EntityReference; nodeId?: string; documentId?: string }[]) {
    if (value.kind === 'entityReference' && value.reference && referenceIsBroken(value.reference, entities)) add({ id: `field-entity-ref:${owner.nodeId ?? owner.entityId}:${value.reference.entityId}`, severity: 'error', message: 'カスタム項目にリンク切れの設定資料参照があります。', ...owner });
    if (value.kind === 'nodeReference' && value.nodeId && !nodeIds.has(value.nodeId)) add({ id: `field-node-ref:${owner.nodeId ?? owner.entityId}:${value.nodeId}`, severity: 'error', message: 'カスタム項目にリンク切れのノード参照があります。', ...owner });
    if (value.kind === 'richText' && value.documentId) scanContent(documents.get(value.documentId) ?? [], nodeIds, entities, owner, add);
  }
}
export function inspectScenario(snapshot: Snapshot): PreflightIssue[] {
  const issuesById = new Map<string, PreflightIssue>();
  const add = (issue: PreflightIssue) => issuesById.set(issue.id, issue);
  const nodeIds = new Set(snapshot.nodes.map(node => node.id));
  const entities = new Map(snapshot.entities.map(entity => [entity.id, entity]));
  const documents = new Map(snapshot.documents.map(document => [document.id, document.content]));
  const outlinedNodeIds = new Set<string>();
  for (const item of snapshot.outline) if (item.nodeId) outlinedNodeIds.add(item.nodeId);
  if (snapshot.outline.length) for (const node of snapshot.nodes) if (!outlinedNodeIds.has(node.id)) add({ id: `unplaced:${node.id}`, severity: 'warning', message: 'アウトライン未配置のため、通常の全文出力から除外されます。', nodeId: node.id });
  for (const node of snapshot.nodes) {
    if (!node.title.trim()) add({ id: `title:${node.id}`, severity: 'warning', message: 'ノードのタイトルが空です。', nodeId: node.id });
    const body = documents.get(node.documentId) ?? [];
    if (!hasContent(body)) add({ id: `body:${node.id}`, severity: 'warning', message: '本文が空です。', nodeId: node.id });
    if (node.productionStatus === 'review') add({ id: `review:${node.id}`, severity: 'warning', message: '制作状態が「要確認」です。', nodeId: node.id });
    scanContent(body, nodeIds, entities, { nodeId: node.id }, add);
    scanFields(node.fields, nodeIds, entities, documents, { nodeId: node.id }, add);
  }
  for (const entity of snapshot.entities) {
    scanContent(documents.get(entity.descriptionDocumentId) ?? [], nodeIds, entities, { entityId: entity.id }, add);
    scanFields(entity.fields, nodeIds, entities, documents, { entityId: entity.id }, add);
  }
  const outline = orderedOutline(snapshot);
  const parentIds = new Set(outline.map(item => item.parentId).filter((id): id is string => !!id));
  for (const item of outline) if (!item.title.trim() && !item.nodeId && !parentIds.has(item.id)) add({ id: `empty-outline:${item.id}`, severity: 'warning', message: 'タイトル・ノード・子項目のないアウトライン項目です。' });
  return [...issuesById.values()];
}
