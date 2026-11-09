import { MarkerType, type Node, type Edge } from '@xyflow/react';
import { type Content, type Snapshot } from '../../domain/schema';
import { resolveReference } from '../../domain/project';

export type ResizeNodeEnd = (id: string, params: { x: number; y: number; width: number; height: number }) => void;
export type ResizeNodeStart = (id: string) => void;
export type CardNode = Node<{ title: string; preview: string; typeName: string; color: string; tags: string[]; children: number; match: boolean; minWidth: number; minHeight: number; resizable: boolean; onResizeStart?: ResizeNodeStart; onResizeEnd?: ResizeNodeEnd }, 'scenario'>;
export type ScenarioFlowEdge = Edge<{ lane: number }, 'scenario'>;
export const edgeColors = { progression: '#52745e', conditional: '#b57d37', reference: '#628aa5', dependency: '#92739c' };
function plainText(content: Content[], snapshot: Snapshot): string {
  return content.map(item => {
    if (item.kind === 'text') return item.text;
    if (item.kind === 'entity') return resolveReference(item.reference, snapshot).text;
    if (item.kind === 'nodeLink') return item.text;
    return plainText(item.children, snapshot);
  }).join('');
}
function previewText(content: Content[], snapshot: Snapshot): string {
  const text = content.map(item => item.kind === 'block' ? plainText(item.children, snapshot) : plainText([item], snapshot)).filter(Boolean).join(' ');
  return text.replace(/\s+/g, ' ').trim();
}
export function toFlowNodes(data: Snapshot, matches: Set<string>, selected: Set<string>, groupColors: Record<string, string> = {}, onResizeStart?: ResizeNodeStart, onResizeEnd?: ResizeNodeEnd, resizable = true): CardNode[] {
  const byId = new Map(data.nodes.map(n => [n.id, n]));
  const included = new Set(matches);
  for (const id of matches) { let parent = byId.get(id)?.parentGroupId; while (parent) { included.add(parent); parent = byId.get(parent)?.parentGroupId; } }
  const depth = (id: string): number => { const parent = byId.get(id)?.parentGroupId; return parent ? depth(parent) + 1 : 0; };
  const sizes = new Map<string, { width: number; height: number }>();
  const minimums = new Map<string, { width: number; height: number }>();
  for (const n of [...data.nodes].sort((a,b) => depth(b.id) - depth(a.id))) {
    const children = data.nodes.filter(c => c.parentGroupId === n.id);
    const doc = data.documents.find(d => d.id === n.documentId);
    const preview = doc ? previewText(doc.content, data) : '';
    const previewLines = Math.min(4, Math.ceil(Array.from(preview).length / 12));
    const ownHeight = Math.max(100, 72 + previewLines * 20 + (n.tagIds.length ? 18 : 0));
    const minimum = { width: children.length ? Math.max(260, ...children.map(c => c.position.x - n.position.x + (sizes.get(c.id)?.width ?? 260) + 32)) : 160, height: children.length ? Math.max(ownHeight, ...children.map(c => c.position.y - n.position.y + (sizes.get(c.id)?.height ?? 100) + 32)) : ownHeight };
    minimums.set(n.id, minimum);
    sizes.set(n.id, { width: Math.max(minimum.width, n.size?.width ?? 260), height: Math.max(minimum.height, n.size?.height ?? ownHeight) });
  }
  return [...data.nodes].sort((a,b) => depth(a.id) - depth(b.id)).map(n => {
    const parent = n.parentGroupId ? byId.get(n.parentGroupId) : undefined;
    const type = data.nodeTypes.find(t => t.id === n.typeId)!;
    const children = data.nodes.filter(c => c.parentGroupId === n.id).length;
    const doc = data.documents.find(d => d.id === n.documentId);
    return { id: n.id, type: 'scenario', position: parent ? { x: n.position.x - parent.position.x, y: n.position.y - parent.position.y } : { ...n.position }, parentId: parent?.id, selected: selected.has(n.id), hidden: !included.has(n.id), style: sizes.get(n.id), data: { title: n.title, preview: doc ? previewText(doc.content, data) : '', typeName: type.name, color: children > 0 ? groupColors[n.id] ?? type.color : type.color, tags: n.tagIds.map(id => data.tags.find(t => t.id === id)?.name ?? ''), children, match: matches.has(n.id), minWidth: minimums.get(n.id)!.width, minHeight: minimums.get(n.id)!.height, resizable, onResizeStart, onResizeEnd } };
  });
}
export function toFlowEdges(data: Snapshot, matches: Set<string>, kinds: Set<string>, selectedId?: string): ScenarioFlowEdge[] {
  const pairs = new Map<string, string[]>();
  for (const edge of data.edges) { const key = [edge.sourceId, edge.targetId].sort().join(':'); pairs.set(key, [...(pairs.get(key) ?? []), edge.id]); }
  return data.edges.map(e => {
    const pair = pairs.get([e.sourceId, e.targetId].sort().join(':'))!;
    const offset = e.sourceId === e.targetId ? pair.indexOf(e.id) * 40 : (pair.indexOf(e.id) - (pair.length - 1) / 2) * 56 * (e.sourceId > e.targetId ? -1 : 1);
    return { id: e.id, source: e.sourceId, target: e.targetId, type: 'scenario', label: e.label, selected: e.id === selectedId, hidden: !matches.has(e.sourceId) || !matches.has(e.targetId) || !kinds.has(e.kind), markerEnd: { type: MarkerType.ArrowClosed, color: edgeColors[e.kind] }, style: { stroke: edgeColors[e.kind], strokeWidth: e.id === selectedId ? 3 : 1.8, strokeDasharray: e.kind === 'reference' ? '4 5' : e.kind === 'dependency' ? '10 4' : undefined }, data: { lane: offset }, ariaLabel: `${e.label || '接続'} (${e.kind})` };
  });
}
