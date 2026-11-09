import { parseSnapshot, type OutlineItem, type Snapshot } from './schema';

export type OutlineEntry = OutlineItem & { depth: number };
export function orderedOutline(snapshot: Snapshot): OutlineEntry[] {
  const children = new Map<string | null, OutlineItem[]>();
  for (const item of snapshot.outline) {
    const key = item.parentId;
    const group = children.get(key) ?? []; group.push(item); children.set(key, group);
  }
  for (const items of children.values()) items.sort((a,b) => a.order - b.order || a.id.localeCompare(b.id));
  const result: OutlineEntry[] = []; const visited = new Set<string>();
  function walk(parentId: string | null, depth: number) {
    for (const item of children.get(parentId) ?? []) {
      if (visited.has(item.id)) throw new Error('アウトラインが循環しています');
      visited.add(item.id); result.push({ ...item, depth }); walk(item.id, depth + 1);
    }
  }
  walk(null, 0);
  if (visited.size !== snapshot.outline.length) throw new Error('アウトラインに到達できない項目があります');
  return result;
}
export function addOutlineItem(snapshot: Snapshot, parentId: string | null, title: string, nodeId: string | null = null): Snapshot {
  if (parentId && !snapshot.outline.some(item => item.id === parentId)) throw new Error('親の章が見つかりません');
  if (nodeId && !snapshot.nodes.some(node => node.id === nodeId)) throw new Error('ノードが見つかりません');
  const sibling = snapshot.outline.filter(item => item.parentId === parentId);
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  return parseSnapshot({ ...snapshot, project: { ...snapshot.project, updatedAt: now }, outline: [...snapshot.outline, { id, parentId, title, nodeId, order: sibling.length }] });
}
export function moveOutlineItem(snapshot: Snapshot, id: string, direction: -1 | 1): Snapshot {
  const item = snapshot.outline.find(entry => entry.id === id); if (!item) throw new Error('項目が見つかりません');
  const siblings = snapshot.outline.filter(entry => entry.parentId === item.parentId).sort((a,b) => a.order - b.order);
  const index = siblings.findIndex(entry => entry.id === id); const other = siblings[index + direction]; if (!other) return snapshot;
  const order = item.order; item.order = other.order; other.order = order;
  // Compact sibling positions to prevent order collisions after imports/edits.
  siblings.sort((a,b) => a.order - b.order).forEach((entry, i) => { entry.order = i; });
  return parseSnapshot({ ...snapshot, project: { ...snapshot.project, updatedAt: new Date().toISOString() } });
}
export function removeOutlineItem(snapshot: Snapshot, id: string): Snapshot {
  if (!snapshot.outline.some(item => item.id === id)) return snapshot;
  // Promote child sections in place. Node data and graph coordinates are untouched.
  const item = snapshot.outline.find(entry => entry.id === id)!;
  const outline = snapshot.outline.filter(entry => entry.id !== id).map(entry => entry.parentId === id ? { ...entry, parentId: item.parentId } : entry);
  return parseSnapshot({ ...snapshot, outline, project: { ...snapshot.project, updatedAt: new Date().toISOString() } });
}
