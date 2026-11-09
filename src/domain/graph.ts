import { parseSnapshot, type Content, type ScenarioEdge, type ScenarioNode, type Snapshot } from './schema';
import { resolveReference } from './project';

export const edgeKinds = { progression: '進行', conditional: '条件分岐', reference: '参照', dependency: '依存' } as const;
export type Point = { x: number; y: number };
export function changeGraph(source: Snapshot, change: (draft: Snapshot) => void): Snapshot {
  const draft = structuredClone(source);
  change(draft);
  draft.project.updatedAt = new Date().toISOString();
  return parseSnapshot(draft);
}
export function createNode(draft: Snapshot, position: Point, title = '新しいノード', typeId = draft.nodeTypes[0].id): string {
  const id = crypto.randomUUID(); const documentId = crypto.randomUUID(); const now = new Date().toISOString();
  draft.documents.push({ id: documentId, createdAt: now, updatedAt: now, content: [] });
  draft.nodes.push({ id, title, typeId, documentId, fields: {}, tagIds: [], position, parentGroupId: null, createdAt: now, updatedAt: now });
  return id;
}
export function updateNode(draft: Snapshot, id: string, patch: Partial<Pick<ScenarioNode, 'title' | 'typeId' | 'tagIds'>>) {
  const node = draft.nodes.find(n => n.id === id); if (!node) throw new Error('ノードが見つかりません');
  Object.assign(node, patch, { updatedAt: new Date().toISOString() });
}
export function descendants(data: Snapshot, id: string): Set<string> {
  const ids = new Set<string>(); const queue = [id];
  while (queue.length) { const parent = queue.shift(); for (const node of data.nodes) if (node.parentGroupId === parent && !ids.has(node.id)) { ids.add(node.id); queue.push(node.id); } }
  return ids;
}
/** Domain coordinates are always absolute; no renderer-specific relative coordinates are stored. */
export function moveNodes(draft: Snapshot, positions: Map<string, Point>) {
  const original = new Map(draft.nodes.map(n => [n.id, { ...n.position }]));
  for (const node of draft.nodes) {
    let ancestor: ScenarioNode | undefined = node; let position: Point | undefined;
    while (ancestor) {
      const target = positions.get(ancestor.id);
      if (target) { const old = original.get(ancestor.id)!; position = { x: node.position.x + target.x - old.x, y: node.position.y + target.y - old.y }; break; }
      ancestor = draft.nodes.find(n => n.id === ancestor!.parentGroupId);
    }
    if (position) { node.position = position; node.updatedAt = new Date().toISOString(); }
  }
}
/** Reorder a node among siblings in the tree list without changing group membership or graph coordinates. */
export function reorderNode(draft: Snapshot, sourceId: string, targetId: string, before: boolean) {
  if (sourceId === targetId) return;
  const source = draft.nodes.find(node => node.id === sourceId);
  const target = draft.nodes.find(node => node.id === targetId);
  if (!source || !target) throw new Error('並べ替えるノードが見つかりません');
  if (source.parentGroupId !== target.parentGroupId) throw new Error('ノードは同じ階層内で並べ替えてください');
  const siblings = draft.nodes.filter(node => node.parentGroupId === source.parentGroupId);
  const orderedIds = siblings.filter(node => node.id !== sourceId).map(node => node.id);
  const targetIndex = orderedIds.indexOf(targetId);
  orderedIds.splice(targetIndex + (before ? 0 : 1), 0, sourceId);
  const ordered = new Map(orderedIds.map((id, index) => [id, index]));
  const siblingPositions = new Map(siblings.map((node, index) => [node.id, index]));
  const replacements = [...siblings].sort((a, b) => ordered.get(a.id)! - ordered.get(b.id)!);
  let replacementIndex = 0;
  draft.nodes = draft.nodes.map(node => siblingPositions.has(node.id) ? replacements[replacementIndex++] : node);
}
export function resizeNode(draft: Snapshot, id: string, position: Point, size: { width: number; height: number }) {
  const node = draft.nodes.find(n => n.id === id);
  if (!node) throw new Error('ノードが見つかりません');
  node.position = { ...position };
  node.size = { width: size.width, height: size.height };
  node.updatedAt = new Date().toISOString();
}
export function duplicateNode(draft: Snapshot, id: string): string {
  const source = draft.nodes.find(n => n.id === id); if (!source) throw new Error('ノードが見つかりません');
  const now = new Date().toISOString(); const copy = structuredClone(source); copy.id = crypto.randomUUID(); copy.title += '（コピー）'; copy.position = { x: copy.position.x + 36, y: copy.position.y + 36 }; copy.createdAt = now; copy.updatedAt = now;
  const docs = new Map<string, string>();
  const cloneDocument = (documentId: string) => {
    if (docs.has(documentId)) return docs.get(documentId)!;
    const doc = draft.documents.find(d => d.id === documentId); if (!doc) throw new Error('本文が見つかりません');
    const newId = crypto.randomUUID(); docs.set(documentId, newId); draft.documents.push({ ...structuredClone(doc), id: newId, createdAt: now, updatedAt: now }); return newId;
  };
  copy.documentId = cloneDocument(source.documentId);
  for (const field of Object.values(copy.fields)) if (field.kind === 'richText') field.documentId = cloneDocument(field.documentId);
  draft.nodes.push(copy); return copy.id;
}
export function deleteNodes(draft: Snapshot, ids: Set<string>) {
  const parentById = new Map(draft.nodes.map(n => [n.id, n.parentGroupId]));
  draft.nodes = draft.nodes.filter(n => !ids.has(n.id));
  for (const node of draft.nodes) {
    while (node.parentGroupId && ids.has(node.parentGroupId)) node.parentGroupId = parentById.get(node.parentGroupId) ?? null;
  }
  draft.edges = draft.edges.filter(e => !ids.has(e.sourceId) && !ids.has(e.targetId));
  // Keep headings and ordering; only remove the deleted node association.
  for (const item of draft.outline) if (item.nodeId && ids.has(item.nodeId)) item.nodeId = null;
  // Documents are retained, including possibly shared/custom-field documents.
}
export function connect(draft: Snapshot, sourceId: string, targetId: string, kind: ScenarioEdge['kind']): string {
  const id = crypto.randomUUID(); draft.edges.push({ id, sourceId, targetId, kind, label: '', condition: '' }); return id;
}
export function groupNodes(draft: Snapshot, ids: Set<string>): string {
  const chosen = draft.nodes.filter(n => ids.has(n.id));
  if (!chosen.length) throw new Error('ノードを選択してください');
  if (chosen.some(n => n.parentGroupId !== chosen[0].parentGroupId)) throw new Error('同じ階層のノードを選択してください');
  const parentId = chosen[0].parentGroupId;
  const id = createNode(draft, { x: Math.min(...chosen.map(n => n.position.x)) - 32, y: Math.min(...chosen.map(n => n.position.y)) - 78 }, 'グループ');
  draft.nodes.find(n => n.id === id)!.parentGroupId = parentId;
  for (const node of chosen) node.parentGroupId = id;
  return id;
}
/** Add selected nodes to an existing group without changing their absolute
 * positions. If both a parent group and one of its descendants are selected,
 * only the parent is moved so their existing nesting remains intact. */
export function addNodesToGroup(draft: Snapshot, groupId: string, ids: Set<string>) {
  const group = draft.nodes.find(n => n.id === groupId);
  if (!group) throw new Error('追加先のグループが見つかりません');
  const selectedIds = new Set([...ids].filter(id => id !== groupId));
  const moving = draft.nodes.filter(node => selectedIds.has(node.id) && ![...selectedIds].some(otherId => otherId !== node.id && descendants(draft, otherId).has(node.id)));
  if (!moving.length) throw new Error('グループに追加するノードを選択してください');
  for (const node of moving) {
    if (descendants(draft, node.id).has(groupId)) throw new Error('自分自身または子孫のグループには追加できません');
  }
  const now = new Date().toISOString();
  for (const node of moving) { node.parentGroupId = groupId; node.updatedAt = now; }
}
export function ungroup(draft: Snapshot, id: string) {
  const group = draft.nodes.find(n => n.id === id); if (!group) return;
  for (const node of draft.nodes) if (node.parentGroupId === id) node.parentGroupId = group.parentGroupId;
  // Retain the group node's own title, document and connections.
}
function contentText(content: Content[], data: Snapshot): string {
  return content.map(c => c.kind === 'text' || c.kind === 'nodeLink' ? c.text : c.kind === 'entity' ? resolveReference(c.reference, data).text : contentText(c.children, data)).join(' ');
}
export function filterNodes(data: Snapshot, query: string, typeId: string, tagIds: string[], mode: 'and' | 'or'): Set<string> {
  const words = query.trim().toLocaleLowerCase();
  const docs = new Map(data.documents.map(d => [d.id, contentText(d.content, data)]));
  return new Set(data.nodes.filter(n => (!typeId || n.typeId === typeId) && (!words || `${n.title} ${docs.get(n.documentId) ?? ''}`.toLocaleLowerCase().includes(words)) && (!tagIds.length || (mode === 'and' ? tagIds.every(t => n.tagIds.includes(t)) : tagIds.some(t => n.tagIds.includes(t))))).map(n => n.id));
}

/** Session-only history. Persistence history in IndexedDB remains independent. */
export class GraphHistory {
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  record(before: Snapshot) { this.past.push(structuredClone(before)); if (this.past.length > 100) this.past.shift(); this.future = []; }
  private restore(current: Snapshot, saved: Snapshot): Snapshot { return { ...current, nodes: saved.nodes, edges: saved.edges, documents: saved.documents, tags: saved.tags, outline: saved.outline }; }
  undo(current: Snapshot): Snapshot | undefined { const previous = this.past.pop(); if (!previous) return; this.future.push(structuredClone(current)); return this.restore(current, previous); }
  redo(current: Snapshot): Snapshot | undefined { const next = this.future.pop(); if (!next) return; this.past.push(structuredClone(current)); return this.restore(current, next); }
}
