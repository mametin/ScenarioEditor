import { parseSnapshot, type ScenarioNode, type Snapshot } from './schema';
import { resolveReference } from './project';

type Point = { x: number; y: number };
type Size = { width: number; height: number };
type ContainerLayout = { positions: Map<string, Point>; width: number; height: number };

function documentText(items: Snapshot['documents'][number]['content'], snapshot: Snapshot): string {
  return items.map(item => {
    if (item.kind === 'text' || item.kind === 'nodeLink') return item.text;
    if (item.kind === 'entity') return resolveReference(item.reference, snapshot).text;
    if (item.style === 'divider') return '';
    return documentText(item.children, snapshot);
  }).join(' ');
}

function layersFor(ids: string[], links: Array<[string, string]>): Map<string, number> {
  const order = new Map(ids.map((id, index) => [id, index]));
  const adjacency = new Map(ids.map(id => [id, new Set<string>()]));
  for (const [source, target] of links) if (source !== target) adjacency.get(source)?.add(target);

  let sequence = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  function visit(id: string) {
    index.set(id, sequence); low.set(id, sequence); sequence++;
    stack.push(id); onStack.add(id);
    for (const target of adjacency.get(id) ?? []) {
      if (!index.has(target)) { visit(target); low.set(id, Math.min(low.get(id)!, low.get(target)!)); }
      else if (onStack.has(target)) low.set(id, Math.min(low.get(id)!, index.get(target)!));
    }
    if (low.get(id) !== index.get(id)) return;
    const component: string[] = [];
    while (stack.length) {
      const member = stack.pop()!; onStack.delete(member); component.push(member);
      if (member === id) break;
    }
    components.push(component);
  }
  ids.forEach(id => { if (!index.has(id)) visit(id); });

  const componentOf = new Map<string, number>();
  components.forEach((component, componentId) => component.forEach(id => componentOf.set(id, componentId)));
  const outgoing = components.map(() => new Set<number>());
  const indegree = components.map(() => 0);
  for (const [source, target] of links) {
    const from = componentOf.get(source); const to = componentOf.get(target);
    if (from === undefined || to === undefined || from === to || outgoing[from].has(to)) continue;
    outgoing[from].add(to); indegree[to]++;
  }
  const componentOrder = components.map(component => Math.min(...component.map(id => order.get(id) ?? 0)));
  const rank = components.map(() => 0);
  const ready = components.map((_, id) => id).filter(id => indegree[id] === 0).sort((a, b) => componentOrder[a] - componentOrder[b]);
  while (ready.length) {
    const from = ready.shift()!;
    for (const to of outgoing[from]) {
      rank[to] = Math.max(rank[to], rank[from] + 1);
      indegree[to]--;
      if (indegree[to] === 0) { ready.push(to); ready.sort((a, b) => componentOrder[a] - componentOrder[b]); }
    }
  }
  const result = new Map<string, number>();
  components.forEach((component, componentId) => component.forEach(id => result.set(id, rank[componentId])));
  return result;
}

/** Arrange siblings into left-to-right relationship layers while keeping group children relative to their parent. */
export function autoArrangeGraph(snapshot: Snapshot): Snapshot {
  const data = structuredClone(snapshot);
  const byId = new Map(data.nodes.map(node => [node.id, node]));
  const children = new Map<string | null, ScenarioNode[]>();
  for (const node of data.nodes) children.set(node.parentGroupId, [...(children.get(node.parentGroupId) ?? []), node]);
  const sizes = new Map<string, Size>();
  const layouts = new Map<string | null, ContainerLayout>();
  const now = new Date().toISOString();

  function ownHeight(node: ScenarioNode) {
    const document = data.documents.find(item => item.id === node.documentId);
    const length = document ? Array.from(documentText(document.content, data).trim()).length : 0;
    const previewLines = Math.min(4, Math.ceil(length / 12));
    return Math.max(128, 100 + previewLines * 26 + (node.tagIds.length ? 28 : 0));
  }

  function immediateChild(nodeId: string, parentId: string | null): string | undefined {
    let node = byId.get(nodeId);
    if (!node) return undefined;
    while (node.parentGroupId !== parentId) {
      if (!node.parentGroupId) return undefined;
      node = byId.get(node.parentGroupId);
      if (!node) return undefined;
    }
    return node.id;
  }

  function measureNode(node: ScenarioNode): Size {
    if (sizes.has(node.id)) return sizes.get(node.id)!;
    const own = ownHeight(node);
    const nested = children.get(node.id) ?? [];
    if (!nested.length) {
      const size = { width: Math.max(260, node.size?.width ?? 0), height: Math.max(own, node.size?.height ?? 0) };
      sizes.set(node.id, size); return size;
    }
    const content = measureContainer(node.id);
    const size = {
      width: Math.max(260, node.size?.width ?? 0, content.width + 32),
      height: Math.max(own, node.size?.height ?? 0, content.height + 24),
    };
    sizes.set(node.id, size); return size;
  }

  function measureContainer(parentId: string | null): ContainerLayout {
    const siblings = children.get(parentId) ?? [];
    const gapX = parentId ? 88 : 120;
    const gapY = parentId ? 28 : 48;
    const startX = parentId ? 40 : 72;
    const startY = parentId ? 68 : 72;
    const itemSizes = new Map(siblings.map(node => [node.id, measureNode(node)]));
    const links = new Set<string>();
    const mapped: Array<[string, string]> = [];
    for (const edge of data.edges) {
      const source = immediateChild(edge.sourceId, parentId);
      const target = immediateChild(edge.targetId, parentId);
      if (!source || !target || source === target) continue;
      const key = `${source}:${target}`;
      if (!links.has(key)) { links.add(key); mapped.push([source, target]); }
    }

    const positions = new Map<string, Point>();
    if (!mapped.length) {
      const columns = Math.max(1, Math.ceil(Math.sqrt(siblings.length)));
      const widths = Array.from({ length: Math.min(columns, siblings.length) }, () => 0);
      const rows = Math.ceil(siblings.length / columns);
      const heights = Array.from({ length: rows }, () => 0);
      siblings.forEach((node, index) => {
        const column = index % columns; const row = Math.floor(index / columns); const size = itemSizes.get(node.id)!;
        widths[column] = Math.max(widths[column], size.width); heights[row] = Math.max(heights[row], size.height);
      });
      const columnX: number[] = []; let nextX = startX;
      widths.forEach(width => { columnX.push(nextX); nextX += width + gapX; });
      const rowY: number[] = []; let nextY = startY;
      heights.forEach(height => { rowY.push(nextY); nextY += height + gapY; });
      siblings.forEach((node, index) => positions.set(node.id, { x: columnX[index % columns], y: rowY[Math.floor(index / columns)] }));
      const layout = { positions, width: nextX - gapX + 32, height: nextY - gapY + 32 };
      layouts.set(parentId, layout); return layout;
    }

    const rank = layersFor(siblings.map(node => node.id), mapped);
    const maxRank = Math.max(0, ...rank.values());
    const columns = Array.from({ length: maxRank + 1 }, () => [] as ScenarioNode[]);
    siblings.forEach(node => columns[rank.get(node.id) ?? 0].push(node));
    const columnWidths = columns.map(column => Math.max(0, ...column.map(node => itemSizes.get(node.id)!.width)));
    const columnHeights = columns.map(column => column.reduce((sum, node, index) => sum + itemSizes.get(node.id)!.height + (index ? gapY : 0), 0));
    const tallest = Math.max(0, ...columnHeights);
    let x = startX;
    columns.forEach((column, columnIndex) => {
      let y = startY + (tallest - columnHeights[columnIndex]) / 2;
      for (const node of column) {
        positions.set(node.id, { x, y });
        y += itemSizes.get(node.id)!.height + gapY;
      }
      x += columnWidths[columnIndex] + gapX;
    });
    const layout = { positions, width: x - gapX + 32, height: startY + tallest + 32 };
    layouts.set(parentId, layout); return layout;
  }

  measureContainer(null);
  function applyPositions(parentId: string | null, parentPosition: Point = { x: 0, y: 0 }) {
    const layout = layouts.get(parentId);
    if (!layout) return;
    for (const node of children.get(parentId) ?? []) {
      const offset = layout.positions.get(node.id)!;
      const position = { x: parentPosition.x + offset.x, y: parentPosition.y + offset.y };
      if (node.position.x !== position.x || node.position.y !== position.y) { node.position = position; node.updatedAt = now; }
      applyPositions(node.id, node.position);
    }
  }
  applyPositions(null);
  data.project.updatedAt = now;
  return parseSnapshot(data);
}
