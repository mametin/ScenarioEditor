import { MarkerType, type Node, type Edge } from '@xyflow/react';
import { type Snapshot } from '../../domain/schema';

export type CardNode = Node<{ title: string; typeName: string; color: string; tags: string[]; children: number; match: boolean }, 'scenario'>;
export type ScenarioFlowEdge = Edge<{ lane: number }, 'scenario'>;
export const edgeColors = { progression: '#52745e', conditional: '#b57d37', reference: '#628aa5', dependency: '#92739c' };
export function toFlowNodes(data: Snapshot, matches: Set<string>, selected: Set<string>): CardNode[] {
  const byId = new Map(data.nodes.map(n => [n.id, n]));
  const included = new Set(matches);
  for (const id of matches) { let parent = byId.get(id)?.parentGroupId; while (parent) { included.add(parent); parent = byId.get(parent)?.parentGroupId; } }
  const depth = (id: string): number => { const parent = byId.get(id)?.parentGroupId; return parent ? depth(parent) + 1 : 0; };
  const sizes = new Map<string, { width: number; height: number }>();
  for (const n of [...data.nodes].sort((a,b) => depth(b.id) - depth(a.id))) {
    const children = data.nodes.filter(c => c.parentGroupId === n.id);
    sizes.set(n.id, { width: Math.max(220, ...children.map(c => c.position.x - n.position.x + (sizes.get(c.id)?.width ?? 220) + 32)), height: Math.max(100, ...children.map(c => c.position.y - n.position.y + (sizes.get(c.id)?.height ?? 100) + 32)) });
  }
  return [...data.nodes].sort((a,b) => depth(a.id) - depth(b.id)).map(n => {
    const parent = n.parentGroupId ? byId.get(n.parentGroupId) : undefined;
    const type = data.nodeTypes.find(t => t.id === n.typeId)!;
    const children = data.nodes.filter(c => c.parentGroupId === n.id).length;
    return { id: n.id, type: 'scenario', position: parent ? { x: n.position.x - parent.position.x, y: n.position.y - parent.position.y } : { ...n.position }, parentId: parent?.id, selected: selected.has(n.id), hidden: !included.has(n.id), dragHandle: '.node-heading', style: sizes.get(n.id), data: { title: n.title, typeName: type.name, color: type.color, tags: n.tagIds.map(id => data.tags.find(t => t.id === id)?.name ?? ''), children, match: matches.has(n.id) } };
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
