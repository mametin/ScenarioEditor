'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, BaseEdge, NodeResizeControl, applyNodeChanges, type NodeProps, type EdgeProps, type NodeChange, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './graph.css';
import { type ScenarioEdge, type Snapshot } from '../../domain/schema';
import { addNodesToGroup, changeGraph, connect, createNode, deleteNodes, duplicateNode, edgeKinds, filterNodes, GraphHistory, groupNodes, moveNodes, reorderNode, resizeNode, ungroup, updateNode } from '../../domain/graph';
import { toFlowEdges, toFlowNodes, type CardNode, type ResizeNodeEnd, type ResizeNodeStart, type ScenarioFlowEdge } from './adapter';
import ColorPicker from '../ColorPicker';
import RichTextEditor from '../editor/RichTextEditor';

function NodeCard({ id, data, selected }: NodeProps<CardNode>) {
  return <div className={`node-card ${data.children ? 'group-card' : ''} ${selected ? 'chosen' : ''} ${data.match ? '' : 'context-node'}`} style={{ '--node-color': data.color } as CSSProperties}>
    {selected && data.resizable && resizeHandles.map(({ position, direction }) => <NodeResizeControl key={position} position={position} resizeDirection={direction} minWidth={data.minWidth} minHeight={data.minHeight} maxWidth={1800} maxHeight={1800} color="var(--accent)" autoScale={false} style={{ width: 8, height: 8, minWidth: 8, minHeight: 8, boxSizing: 'border-box', border: '1px solid var(--paper)', borderRadius: 2 }} onResizeStart={() => data.onResizeStart?.(id)} onResizeEnd={(_, params) => data.onResizeEnd?.(id, params)}/>)}
    <Handle type="target" position={Position.Left} aria-label="接続先" />
    <div className="node-content">
      <div className="node-heading"><small>{data.typeName}</small><strong>{data.title || '無題'}</strong></div>
      {data.preview && <p className="node-preview">{data.preview}</p>}
      {data.tags.length > 0 && <div className="node-tags">{data.tags.join(' · ')}</div>}
    </div>
    <Handle type="source" position={Position.Right} aria-label="接続元" />
  </div>;
}
function FlowEdge({ id, source, target, sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, markerEnd, style, label, data }: EdgeProps<ScenarioFlowEdge>) {
  const lane = data?.lane ?? 0;
  const loop = source === target;
  const cx = (sx + tx) / 2; const cy = (sy + ty) / 2;
  const length = Math.max(1, Math.hypot(tx - sx, ty - sy));
  const bend = lane || (Math.abs(sy - ty) < 10 ? 0 : 25);
  const qx = cx - (ty - sy) / length * bend; const qy = cy + (tx - sx) / length * bend;
  const height = 120 + Math.abs(lane);
  const path = loop ? `M ${sx} ${sy} C ${sx + 90} ${sy - height}, ${tx - 90} ${ty - height}, ${tx} ${ty}` : `M ${sx} ${sy} Q ${qx} ${qy} ${tx} ${ty}`;
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} label={label} labelX={loop ? cx : (sx + 2*qx + tx)/4} labelY={loop ? sy - height * .75 : (sy + 2*qy + ty)/4} labelBgPadding={[6, 4]} labelBgBorderRadius={4} interactionWidth={24} />;
}
const nodeTypes = { scenario: NodeCard }; const edgeTypes = { scenario: FlowEdge };
const resizeHandles = [
  { position: 'top-left', direction: undefined }, { position: 'top', direction: 'vertical' }, { position: 'top-right', direction: undefined },
  { position: 'right', direction: 'horizontal' }, { position: 'bottom-right', direction: undefined }, { position: 'bottom', direction: 'vertical' },
  { position: 'bottom-left', direction: undefined }, { position: 'left', direction: 'horizontal' },
] as const;

function ResizeHandle({ side, width, onResize }: { side: 'left' | 'right'; width: number; onResize: (width: number) => void }) {
  return <div className="pane-resizer" role="separator" aria-label={side === 'left' ? '一覧の幅' : '詳細の幅'} aria-orientation="vertical" aria-valuenow={width} aria-valuemin={200} aria-valuemax={440} tabIndex={0}
    onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onResize(Math.min(440, Math.max(200, width + (e.key === 'ArrowRight' ? 20 : -20) * (side === 'left' ? 1 : -1)))); } }}
    onPointerDown={e => { const element = e.currentTarget; element.setPointerCapture(e.pointerId); const start = e.clientX; const initial = width; const move = (event: PointerEvent) => onResize(Math.min(440, Math.max(200, initial + (event.clientX - start) * (side === 'left' ? 1 : -1)))); const stop = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', stop); element.removeEventListener('pointercancel', stop); }; element.addEventListener('pointermove', move); element.addEventListener('pointerup', stop); element.addEventListener('pointercancel', stop); }} />;
}

export default function GraphEditor({ snapshot, onChange, onWriteNode, onOpenEntity, disabled = false }: { snapshot: Snapshot; onChange: (snapshot: Snapshot) => void; disabled?: boolean; onWriteNode?: (id: string) => void; onOpenEntity?: (id: string) => void }) {
  const latest = useRef(snapshot); latest.current = snapshot;
  const history = useRef(new GraphHistory());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>('pan');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string>();
  const [edgeId, setEdgeId] = useState<string>();
  const [query, setQuery] = useState(''); const [typeFilter, setTypeFilter] = useState(''); const [tagFilter, setTagFilter] = useState<string[]>([]); const [tagMode, setTagMode] = useState<'and' | 'or'>('or');
  const [kinds, setKinds] = useState(new Set<string>(Object.keys(edgeKinds)));
  const [kind, setKind] = useState<ScenarioEdge['kind']>('progression');
  const [connecting, setConnecting] = useState(false); const [sourceId, setSourceId] = useState<string>();
  const [error, setError] = useState(''); const [newTag, setNewTag] = useState('');
  const [left, setLeft] = useState(true); const [right, setRight] = useState(true); const [leftWidth, setLeftWidth] = useState(240); const [rightWidth, setRightWidth] = useState(288);
  const [mobileTab, setMobileTab] = useState('graph');
  const [groupColors, setGroupColors] = useState<Record<string, string>>({});
  const groupColorKey = `scenario-editor-group-colors:${snapshot.project.id}`;
  const flow = useRef<ReactFlowInstance<CardNode, ScenarioFlowEdge> | null>(null);
  const dragging = useRef(false);
  const matches = useMemo(() => filterNodes(snapshot, query, typeFilter, tagFilter, tagMode), [snapshot, query, typeFilter, tagFilter, tagMode]);
  const [nodes, setNodes] = useState<CardNode[]>(() => toFlowNodes(snapshot, matches, selected));
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const resizing = useRef(false);
  const resizeStart = useRef<ResizeNodeStart>(() => {});
  const resizeEnd = useRef<ResizeNodeEnd>(() => {});
  const edges = useMemo(() => toFlowEdges(snapshot, matches, kinds, edgeId), [snapshot, matches, kinds, edgeId]);
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(groupColorKey) ?? '{}');
      const valid = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw).filter(([, color]) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) : {};
      setGroupColors(valid);
    } catch { setGroupColors({}); }
  }, [groupColorKey]);
  const handleResizeStart = useCallback<ResizeNodeStart>(id => resizeStart.current(id), []);
  const handleResizeEnd = useCallback<ResizeNodeEnd>((id, params) => resizeEnd.current(id, params), []);
  useEffect(() => { if (!dragging.current) setNodes(toFlowNodes(snapshot, matches, selected, groupColors, handleResizeStart, handleResizeEnd, !disabled)); }, [snapshot, matches, selected, groupColors, handleResizeStart, handleResizeEnd, disabled]);
  const node = snapshot.nodes.find(n => selected.has(n.id));
  const edge = snapshot.edges.find(e => e.id === edgeId);
  const selectedGroups = snapshot.nodes.filter(item => selected.has(item.id) && snapshot.nodes.some(child => child.parentGroupId === item.id));
  const addTargetGroupId = selectedGroups.length === 1 ? selectedGroups[0].id : undefined;
  const canAddToGroup = !!addTargetGroupId && [...selected].some(id => id !== addTargetGroupId && snapshot.nodes.some(item => item.id === id && item.parentGroupId !== addTargetGroupId));

  function setGroupColor(id: string, color?: string) {
    setGroupColors(current => {
      const next = { ...current };
      if (color) next[id] = color;
      else delete next[id];
      try { localStorage.setItem(groupColorKey, JSON.stringify(next)); } catch { setError('グループ色をこのブラウザに保存できませんでした。'); }
      return next;
    });
  }

  function commit(change: (draft: Snapshot) => void) {
    if (disabled) return;
    try { const before = latest.current; const next = changeGraph(before, change); history.current.record(before); latest.current = next; onChange(next); setError(''); } catch (e) { setError(e instanceof Error ? e.message : '変更できませんでした'); }
  }
  resizeEnd.current = (id, params) => {
    resizing.current = false;
    const target = latest.current.nodes.find(item => item.id === id);
    if (!target) return;
    const parent = target.parentGroupId ? latest.current.nodes.find(item => item.id === target.parentGroupId) : undefined;
    const position = { x: params.x + (parent?.position.x ?? 0), y: params.y + (parent?.position.y ?? 0) };
    commit(draft => resizeNode(draft, id, position, { width: params.width, height: params.height }));
  };
  resizeStart.current = () => { resizing.current = true; };
  function travel(direction: 'undo' | 'redo') {
    if (disabled) return;
    const next = history.current[direction](latest.current);
    if (next) { next.project.updatedAt = new Date().toISOString(); latest.current = next; onChange(next); setSelected(new Set()); setEdgeId(undefined); setSourceId(undefined); setError(''); }
  }
  function selectNode(id: string) {
    setSelected(new Set([id])); setEdgeId(undefined);
    if (connecting) {
      if (!sourceId) setSourceId(id);
      else { commit(d => { connect(d, sourceId, id, kind); }); setSourceId(undefined); setConnecting(false); }
    }
  }
  function addNode() {
    let id = ''; const point = flow.current?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) ?? { x: 80, y: 80 };
    commit(d => { id = createNode(d, point, `ノード ${d.nodes.length + 1}`, typeFilter || d.nodeTypes[0].id); });
    if (id) { setSelected(new Set([id])); setEdgeId(undefined); setQuery(''); setTagFilter([]); }
  }
  function removeSelection() {
    if (edge) { if (confirm('この接続を削除しますか？Undoで戻せます。')) { commit(d => { d.edges = d.edges.filter(e => e.id !== edge.id); }); setEdgeId(undefined); } return; }
    if (!selected.size) return;
    const count = snapshot.edges.filter(e => selected.has(e.sourceId) || selected.has(e.targetId)).length;
    if (confirm(`${selected.size}件のノードと関連する${count}件の接続を削除しますか？子ノードと本文データは保持します。Undoまたは保存履歴から復元できます。`)) { commit(d => deleteNodes(d, selected)); setSelected(new Set()); }
  }
  function patchEdge(patch: Partial<Pick<ScenarioEdge, 'sourceId' | 'targetId' | 'kind' | 'label' | 'condition'>>) { if (edge) commit(d => Object.assign(d.edges.find(e => e.id === edge.id)!, patch)); }
  function finishMove(changes?: NodeChange<CardNode>[]) {
    const all = changes ? applyNodeChanges(changes, nodesRef.current) : nodesRef.current;
    const absolute = (id: string): { x: number; y: number } => { const n = all.find(n => n.id === id)!; if (!n.parentId) return n.position; const p = absolute(n.parentId); return { x: p.x + n.position.x, y: p.y + n.position.y }; };
    const positions = new Map<string, { x: number; y: number }>();
    for (const n of all) { const old = latest.current.nodes.find(x => x.id === n.id); const p = absolute(n.id); if (old && (old.position.x !== p.x || old.position.y !== p.y)) positions.set(n.id, p); }
    dragging.current = false;
    if (positions.size) commit(d => moveNodes(d, positions));
  }
  const onSelectionChange = useCallback(({ nodes: selectedNodes, edges: selectedEdges }: { nodes: CardNode[]; edges: ScenarioFlowEdge[] }) => {
    const next = new Set(selectedNodes.map(n => n.id));
    setSelected(old => old.size === next.size && [...old].every(id => next.has(id)) ? old : next);
    if (selectedEdges[0]) setEdgeId(selectedEdges[0].id);
  }, []);
  const clearFilters = () => { setQuery(''); setTypeFilter(''); setTagFilter([]); setKinds(new Set(Object.keys(edgeKinds))); };
  const childrenByParent = new Map<string | null, typeof snapshot.nodes>();
  for (const item of snapshot.nodes) childrenByParent.set(item.parentGroupId, [...(childrenByParent.get(item.parentGroupId) ?? []), item]);
  const visibleTreeIds = new Set(matches);
  for (const id of matches) { let parentId = snapshot.nodes.find(item => item.id === id)?.parentGroupId; while (parentId) { visibleTreeIds.add(parentId); parentId = snapshot.nodes.find(item => item.id === parentId)?.parentGroupId; } }
  function renderTreeItem(item: Snapshot['nodes'][number], depth: number): ReactNode {
    if (!visibleTreeIds.has(item.id)) return null;
    const children = childrenByParent.get(item.id) ?? [];
    const visibleChildren = children.filter(child => visibleTreeIds.has(child.id));
    const collapsed = collapsedGroups.has(item.id);
    const childCount = children.length;
    const dropClass = dropTarget?.id === item.id ? (dropTarget.before ? ' drop-before' : ' drop-after') : '';
    return <div className="node-tree-item" key={item.id}>
      <div className={`node-list-row${selected.has(item.id) ? ' active' : ''}${dropClass}`} onDragOver={event => {
        event.stopPropagation();
        const draggedId = draggedNodeId ?? event.dataTransfer.getData('text/plain');
        const dragged = snapshot.nodes.find(candidate => candidate.id === draggedId);
        if (!dragged || dragged.id === item.id || dragged.parentGroupId !== item.parentGroupId) return;
        event.preventDefault(); event.dataTransfer.dropEffect = 'move';
        const before = event.clientY < event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2;
        setDropTarget(old => old?.id === item.id && old.before === before ? old : { id: item.id, before });
      }} onDrop={event => {
        event.stopPropagation();
        event.preventDefault();
        const draggedId = draggedNodeId ?? event.dataTransfer.getData('text/plain');
        const dragged = snapshot.nodes.find(candidate => candidate.id === draggedId);
        if (dragged && dragged.parentGroupId === item.parentGroupId) {
          const rect = event.currentTarget.getBoundingClientRect();
          const before = event.clientY < rect.top + rect.height / 2;
          commit(draft => reorderNode(draft, dragged.id, item.id, before));
        }
        setDropTarget(null); setDraggedNodeId(undefined);
      }}>
        <div className="node-tree-row" style={{ paddingLeft: `${depth * 16}px` }}>
          {childCount > 0 ? <button type="button" className="tree-toggle" aria-label={`${item.title || '無題'}の子ノードを${collapsed ? '展開' : '折りたたむ'}`} aria-expanded={!collapsed} onClick={() => setCollapsedGroups(old => { const next = new Set(old); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}>{collapsed ? '▸' : '▾'}</button> : <span className="tree-toggle-spacer"/>}
          <input type="checkbox" aria-label={`${item.title || '無題'}を選択`} checked={selected.has(item.id)} onChange={event => { setEdgeId(undefined); setSelected(old => { const next = new Set(old); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; }); }}/>
          <button type="button" className="node-drag-grip" draggable={!disabled} aria-label={`${item.title || '無題'}を並べ替え`} title="ドラッグして同じ階層内で並べ替え" onClick={event => event.stopPropagation()} onDragStart={event => { if (disabled) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); setDraggedNodeId(item.id); setDropTarget(null); }} onDragEnd={() => { setDropTarget(null); setDraggedNodeId(undefined); }}>⠿</button>
          <button className="node-list-title" onClick={() => selectNode(item.id)}><span>{item.title || '無題'}</span><small>{snapshot.nodeTypes.find(type => type.id === item.typeId)?.name}</small></button>
        </div>
      </div>
      {!collapsed && visibleChildren.map(child => renderTreeItem(child, depth + 1))}
    </div>;
  }
  return <section className={`graph-workbench mobile-${mobileTab} ${connecting ? 'is-connecting' : ''} ${interactionMode === 'pan' ? 'is-pan-mode' : 'is-select-mode'}`} style={{ '--left-width': left ? `${leftWidth}px` : '0px', '--right-width': right ? `${rightWidth}px` : '0px' } as CSSProperties}
    onKeyDown={e => { if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')) return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); travel(e.shiftKey ? 'redo' : 'undo'); } }}>
    <div className="graph-toolbar"><div><span className="eyebrow">SCENARIO MAP</span><strong>{snapshot.project.title || '無題のシナリオ'}</strong></div><div className="graph-actions"><button disabled={disabled} className="primary" onClick={addNode}>＋ ノード</button><button disabled={!history.current.canUndo || disabled} onClick={() => travel('undo')}>↶ Undo</button><button disabled={!history.current.canRedo || disabled} onClick={() => travel('redo')}>↷ Redo</button><div className="graph-interaction-switch" role="group" aria-label="グラフ操作モード"><button type="button" aria-pressed={interactionMode === 'pan'} onClick={() => setInteractionMode('pan')}>✋ 手のひら</button><button type="button" aria-pressed={interactionMode === 'select'} onClick={() => setInteractionMode('select')}>↖ 選択</button></div><button onClick={() => setLeft(!left)} aria-pressed={left}>一覧</button><button onClick={() => setRight(!right)} aria-pressed={right}>詳細</button></div></div>
    <nav className="graph-mobile-tabs" aria-label="グラフの画面">{[['list','ノード一覧'],['graph','グラフ'],['details','編集']].map(([id,label]) => <button key={id} aria-pressed={mobileTab === id} onClick={() => setMobileTab(id)}>{label}</button>)}</nav>
    {error && <div className="graph-error" role="alert">{error}</div>}
    <div className="graph-panes">
      <aside className={`graph-list ${left ? '' : 'pane-collapsed'}`}>
        <h2>ノード <span>{matches.size} / {snapshot.nodes.length}</span></h2>
        <label>検索<input value={query} onChange={e => setQuery(e.target.value)} placeholder="タイトル・本文を検索" /></label>
        <label>タイプ<select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="">すべてのタイプ</option>{snapshot.nodeTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        {snapshot.tags.length > 0 && <fieldset><legend>タグで絞り込み</legend><select aria-label="タグの検索条件" value={tagMode} onChange={e => setTagMode(e.target.value as 'and' | 'or')}><option value="or">OR：いずれか</option><option value="and">AND：すべて</option></select>{snapshot.tags.map(t => <label className="check" key={t.id}><input type="checkbox" checked={tagFilter.includes(t.id)} onChange={e => setTagFilter(e.target.checked ? [...tagFilter,t.id] : tagFilter.filter(id => id !== t.id))}/>{t.name}</label>)}</fieldset>}
        <button className="wide" onClick={clearFilters}>絞り込みを解除</button>
        <div className="graph-node-list">{(childrenByParent.get(null) ?? []).filter(item => visibleTreeIds.has(item.id)).map(item => renderTreeItem(item, 0))}</div>
        {!matches.size && <p className="muted">ノードがありません。作成するか、絞り込みを解除してください。</p>}
        <button className="wide" disabled={!selected.size || disabled} onClick={() => { let id = ''; commit(d => { id = groupNodes(d, selected); }); if (id) setSelected(new Set([id])); }}>選択ノードをグループ化</button>
        <button className="wide" disabled={!canAddToGroup || disabled} title="既存グループと追加するノードを選択してください" onClick={() => { if (!addTargetGroupId) return; commit(d => addNodesToGroup(d, addTargetGroupId, selected)); setSelected(new Set([addTargetGroupId])); }}>選択ノードを既存グループに追加</button>
        <fieldset><legend>接続の表示</legend>{Object.entries(edgeKinds).map(([id,label]) => <label className="check" key={id}><input type="checkbox" checked={kinds.has(id)} onChange={e => setKinds(old => { const next = new Set(old); if (e.target.checked) next.add(id); else next.delete(id); return next; })}/>{label}</label>)}</fieldset>
        <details><summary>接続一覧（{snapshot.edges.length}）</summary>{snapshot.edges.map(e => <button className="connection-row" key={e.id} onClick={() => { setEdgeId(e.id); setSelected(new Set()); setMobileTab('details'); }}>{snapshot.nodes.find(n => n.id === e.sourceId)?.title} → {snapshot.nodes.find(n => n.id === e.targetId)?.title}<small>{edgeKinds[e.kind]} · {e.label || 'ラベルなし'}</small></button>)}</details>
      </aside>
      {left && <ResizeHandle side="left" width={leftWidth} onResize={setLeftWidth}/>}
      <div className="graph-center">
        <div className="connection-tools"><label>新規接続<select aria-label="新規接続の種類" value={kind} disabled={disabled} onChange={e => setKind(e.target.value as ScenarioEdge['kind'])}>{Object.entries(edgeKinds).map(([id,label]) => <option value={id} key={id}>{label}</option>)}</select></label><button disabled={disabled} aria-pressed={connecting} onClick={() => { setConnecting(!connecting); setSourceId(undefined); }}>{connecting ? '接続モードを終了' : '接続モードを開始'}</button><span role="status">{connecting ? sourceId ? '接続先を選ぶか、接続点をドラッグ' : '接続元を選ぶか、接続点をドラッグ' : '接続モードを開始すると接続点が表示されます'}</span></div>
        <div className="flow-canvas" aria-label="シナリオグラフ">
          <ReactFlow<CardNode, ScenarioFlowEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={instance => { flow.current = instance; }} fitView minZoom={0.15} maxZoom={2} deleteKeyCode={null} panOnDrag={interactionMode === 'pan'} nodesDraggable={!disabled && interactionMode === 'select'} nodesConnectable={!disabled && interactionMode === 'select'} connectOnClick selectionOnDrag={interactionMode === 'select'} selectionKeyCode="Shift" multiSelectionKeyCode={['Control','Meta']} onSelectionChange={onSelectionChange}
            onNodesChange={changes => { setNodes(old => { const next = applyNodeChanges(changes, old); nodesRef.current = next; return next; }); if (changes.some(c => c.type === 'position' && c.position && c.dragging === undefined) && !dragging.current && !resizing.current) finishMove(changes); }}
            onNodeDragStart={() => { dragging.current = true; }} onNodeDragStop={(_, moved, movedNodes) => finishMove((movedNodes.length ? movedNodes : [moved]).map(n => ({ type: 'position' as const, id: n.id, position: n.position })))}
            onNodeClick={(_, n) => { if (connecting) selectNode(n.id); else { setEdgeId(undefined); if (!selected.has(n.id)) setSelected(new Set([n.id])); } }}
            onEdgeClick={(_, e) => { setEdgeId(e.id); setSelected(new Set()); }}
            onConnect={connection => { commit(d => { connect(d, connection.source, connection.target, kind); }); setConnecting(false); setSourceId(undefined); }}
            onPaneClick={() => { if (!connecting) { setSelected(new Set()); setEdgeId(undefined); } }}
            ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': '拡大', 'controls.zoomOut.ariaLabel': '縮小', 'controls.fitView.ariaLabel': '全体を表示', 'controls.interactive.ariaLabel': '操作を切り替え' }}>
            <Background color="#c9d3c8" gap={22}/><Controls/><MiniMap pannable zoomable nodeColor={n => n.data.color as string} ariaLabel="グラフ全体図"/>
          </ReactFlow>
          {snapshot.nodes.length === 0 && <div className="graph-empty"><span>◈</span><h2>物語を、つないでいく。</h2><p>最初のノードを作成しましょう。</p><button className="primary" onClick={addNode}>＋ 最初のノード</button></div>}
        </div><div className="canvas-caption"><span>{snapshot.nodes.length} ノード · {snapshot.edges.length} 接続</span><span>Shift＋ドラッグで複数選択 · Ctrl/⌘＋Zで戻す</span></div>
      </div>
      {right && <ResizeHandle side="right" width={rightWidth} onResize={setRightWidth}/>}
      <aside className={`graph-inspector ${right ? '' : 'pane-collapsed'}`}><div className="eyebrow">INSPECTOR</div>
        {edge ? <><h2>接続を編集</h2><label>接続元<select value={edge.sourceId} disabled={disabled} onChange={e => patchEdge({ sourceId: e.target.value })}>{snapshot.nodes.map(n => <option key={n.id} value={n.id}>{n.title || '無題'}</option>)}</select></label><label>接続先<select value={edge.targetId} disabled={disabled} onChange={e => patchEdge({ targetId: e.target.value })}>{snapshot.nodes.map(n => <option key={n.id} value={n.id}>{n.title || '無題'}</option>)}</select></label><label>種類<select value={edge.kind} disabled={disabled} onChange={e => patchEdge({ kind: e.target.value as ScenarioEdge['kind'] })}>{Object.entries(edgeKinds).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>ラベル<input value={edge.label} disabled={disabled} onChange={e => patchEdge({ label: e.target.value })}/></label><label>条件テキスト<textarea value={edge.condition} disabled={disabled} onChange={e => patchEdge({ condition: e.target.value })}/></label><p className="muted">条件の自動評価は行いません。</p><button className="danger wide" disabled={disabled} onClick={removeSelection}>接続を削除</button></> : node ? <><h2>ノードを編集</h2><p className="muted">選択中のノードは、四隅または辺の中央をドラッグしてサイズを変更できます。</p>{selected.size > 1 && <p>{selected.size}件選択中 · 項目編集は先頭のノード</p>}<label>ノードタイトル<input value={node.title} disabled={disabled} onChange={e => commit(d => updateNode(d, node.id, { title: e.target.value }))}/></label><label>ノードタイプ<select value={node.typeId} disabled={disabled} onChange={e => commit(d => updateNode(d, node.id, { typeId: e.target.value }))}>{snapshot.nodeTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <details className="graph-body-edit"><summary>本文をグラフ上で編集</summary><RichTextEditor key={node.documentId} snapshot={snapshot} documentId={node.documentId} onChange={onChange} onOpenEntity={onOpenEntity} onOpenNode={id => selectNode(id)} disabled={disabled}/></details>
          {snapshot.nodes.some(item => item.parentGroupId === node.id) && <div className="group-color-setting"><ColorPicker label="グループ色" value={groupColors[node.id] ?? snapshot.nodeTypes.find(t => t.id === node.typeId)?.color ?? '#657e6d'} onChange={color => setGroupColor(node.id, color)}/><p className="muted">この色はプロジェクトごとにこのブラウザへ保存されます。</p><button type="button" onClick={() => setGroupColor(node.id)}>タイプ色に戻す</button></div>}
          <fieldset><legend>タグ</legend>{snapshot.tags.map(t => <label className="check" key={t.id}><input type="checkbox" checked={node.tagIds.includes(t.id)} disabled={disabled} onChange={e => commit(d => updateNode(d, node.id, { tagIds: e.target.checked ? [...node.tagIds,t.id] : node.tagIds.filter(id => id !== t.id) }))}/>{t.name}</label>)}<div className="new-tag"><input aria-label="新しいタグ名" value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="タグ名"/><button disabled={!newTag.trim() || disabled} onClick={() => { commit(d => { const tag = d.tags.find(t => t.name === newTag.trim()) ?? { id: crypto.randomUUID(), name: newTag.trim(), color: '#657e6d' }; if (!d.tags.some(t => t.id === tag.id)) d.tags.push(tag); const n = d.nodes.find(n => n.id === node.id)!; if (!n.tagIds.includes(tag.id)) n.tagIds.push(tag.id); }); setNewTag(''); }}>追加</button></div></fieldset>
          <div className="coordinate-fields">{(['x','y'] as const).map(axis => <label key={axis}>{axis.toUpperCase()}<input type="number" aria-label={`${axis.toUpperCase()}座標`} value={Math.round(node.position[axis] * 100)/100} disabled={disabled} onChange={e => { const value = e.target.valueAsNumber; if (Number.isFinite(value)) commit(d => moveNodes(d, new Map([[node.id, { ...node.position, [axis]: value }]]))); }}/></label>)}</div>
          <button className="wide" disabled={disabled} onClick={() => { let id = ''; commit(d => { id = duplicateNode(d, node.id); }); if (id) setSelected(new Set([id])); }}>ノードを複製（本文もコピー）</button>
          {snapshot.nodes.some(n => n.parentGroupId === node.id) && <button className="wide" disabled={disabled} onClick={() => commit(d => ungroup(d, node.id))}>グループを解除（親ノードは保持）</button>}
          {node.parentGroupId && <button className="wide" disabled={disabled} onClick={() => commit(d => { d.nodes.find(n => n.id === node.id)!.parentGroupId = null; })}>グループから外す</button>}
          <button className="danger wide" disabled={disabled} onClick={removeSelection}>選択ノードを削除</button>
          <div className="phase-note"><button className="wide" onClick={() => onWriteNode?.(node.id)}>本文・カスタムフィールドを編集</button></div>
        </> : <div className="inspector-empty"><h2>物語の一片を選択</h2><p>ノードや接続を選ぶと、ここで編集できます。</p><p>チェックボックスで複数のノードを選択してグループ化できます。</p></div>}
      </aside>
    </div>
  </section>;
}

