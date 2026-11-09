'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, BaseEdge, applyNodeChanges, type NodeProps, type EdgeProps, type NodeChange, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './graph.css';
import { type ScenarioEdge, type Snapshot } from '../../domain/schema';
import { changeGraph, connect, createNode, deleteNodes, duplicateNode, edgeKinds, filterNodes, GraphHistory, groupNodes, moveNodes, ungroup, updateNode } from '../../domain/graph';
import { toFlowEdges, toFlowNodes, type CardNode, type ScenarioFlowEdge } from './adapter';

function NodeCard({ data, selected }: NodeProps<CardNode>) {
  return <div className={`node-card ${data.children ? 'group-card' : ''} ${selected ? 'chosen' : ''} ${data.match ? '' : 'context-node'}`} style={{ '--node-color': data.color } as CSSProperties}>
    <Handle type="target" position={Position.Left} aria-label="接続先" />
    <div className="node-heading"><small>{data.typeName}{data.children > 0 && ` · グループ ${data.children}`}</small><strong>{data.title || '無題'}</strong></div>
    {data.tags.length > 0 && <div className="node-tags">{data.tags.join(' · ')}</div>}
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

function ResizeHandle({ side, width, onResize }: { side: 'left' | 'right'; width: number; onResize: (width: number) => void }) {
  return <div className="pane-resizer" role="separator" aria-label={side === 'left' ? '一覧の幅' : '詳細の幅'} aria-orientation="vertical" aria-valuenow={width} aria-valuemin={200} aria-valuemax={440} tabIndex={0}
    onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onResize(Math.min(440, Math.max(200, width + (e.key === 'ArrowRight' ? 20 : -20) * (side === 'left' ? 1 : -1)))); } }}
    onPointerDown={e => { const element = e.currentTarget; element.setPointerCapture(e.pointerId); const start = e.clientX; const initial = width; const move = (event: PointerEvent) => onResize(Math.min(440, Math.max(200, initial + (event.clientX - start) * (side === 'left' ? 1 : -1)))); const stop = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', stop); element.removeEventListener('pointercancel', stop); }; element.addEventListener('pointermove', move); element.addEventListener('pointerup', stop); element.addEventListener('pointercancel', stop); }} />;
}

export default function GraphEditor({ snapshot, onChange, onWriteNode, disabled = false }: { snapshot: Snapshot; onChange: (snapshot: Snapshot) => void; disabled?: boolean; onWriteNode?: (id: string) => void }) {
  const latest = useRef(snapshot); latest.current = snapshot;
  const history = useRef(new GraphHistory());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edgeId, setEdgeId] = useState<string>();
  const [query, setQuery] = useState(''); const [typeFilter, setTypeFilter] = useState(''); const [tagFilter, setTagFilter] = useState<string[]>([]); const [tagMode, setTagMode] = useState<'and' | 'or'>('or');
  const [kinds, setKinds] = useState(new Set<string>(Object.keys(edgeKinds)));
  const [kind, setKind] = useState<ScenarioEdge['kind']>('progression');
  const [connecting, setConnecting] = useState(false); const [sourceId, setSourceId] = useState<string>();
  const [error, setError] = useState(''); const [newTag, setNewTag] = useState('');
  const [left, setLeft] = useState(true); const [right, setRight] = useState(true); const [leftWidth, setLeftWidth] = useState(240); const [rightWidth, setRightWidth] = useState(288);
  const [mobileTab, setMobileTab] = useState('graph');
  const flow = useRef<ReactFlowInstance<CardNode, ScenarioFlowEdge> | null>(null);
  const dragging = useRef(false);
  const matches = useMemo(() => filterNodes(snapshot, query, typeFilter, tagFilter, tagMode), [snapshot, query, typeFilter, tagFilter, tagMode]);
  const [nodes, setNodes] = useState<CardNode[]>(() => toFlowNodes(snapshot, matches, selected));
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edges = useMemo(() => toFlowEdges(snapshot, matches, kinds, edgeId), [snapshot, matches, kinds, edgeId]);
  useEffect(() => { if (!dragging.current) setNodes(toFlowNodes(snapshot, matches, selected)); }, [snapshot, matches, selected]);
  const node = snapshot.nodes.find(n => selected.has(n.id));
  const edge = snapshot.edges.find(e => e.id === edgeId);

  function commit(change: (draft: Snapshot) => void) {
    if (disabled) return;
    try { const before = latest.current; const next = changeGraph(before, change); history.current.record(before); latest.current = next; onChange(next); setError(''); } catch (e) { setError(e instanceof Error ? e.message : '変更できませんでした'); }
  }
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
  return <section className={`graph-workbench mobile-${mobileTab}`} style={{ '--left-width': left ? `${leftWidth}px` : '0px', '--right-width': right ? `${rightWidth}px` : '0px' } as CSSProperties}
    onKeyDown={e => { if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')) return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); travel(e.shiftKey ? 'redo' : 'undo'); } }}>
    <div className="graph-toolbar"><div><span className="eyebrow">SCENARIO MAP</span><strong>{snapshot.project.title || '無題のシナリオ'}</strong></div><div className="graph-actions"><button disabled={disabled} className="primary" onClick={addNode}>＋ ノード</button><button disabled={!history.current.canUndo || disabled} onClick={() => travel('undo')}>↶ Undo</button><button disabled={!history.current.canRedo || disabled} onClick={() => travel('redo')}>↷ Redo</button><button onClick={() => setLeft(!left)} aria-pressed={left}>一覧</button><button onClick={() => setRight(!right)} aria-pressed={right}>詳細</button></div></div>
    <nav className="graph-mobile-tabs" aria-label="グラフの画面">{[['list','ノード一覧'],['graph','グラフ'],['details','編集']].map(([id,label]) => <button key={id} aria-pressed={mobileTab === id} onClick={() => setMobileTab(id)}>{label}</button>)}</nav>
    {error && <div className="graph-error" role="alert">{error}</div>}
    <div className="graph-panes">
      <aside className={`graph-list ${left ? '' : 'pane-collapsed'}`}>
        <h2>ノード <span>{matches.size} / {snapshot.nodes.length}</span></h2>
        <label>検索<input value={query} onChange={e => setQuery(e.target.value)} placeholder="タイトル・本文を検索" /></label>
        <label>タイプ<select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="">すべてのタイプ</option>{snapshot.nodeTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        {snapshot.tags.length > 0 && <fieldset><legend>タグで絞り込み</legend><select aria-label="タグの検索条件" value={tagMode} onChange={e => setTagMode(e.target.value as 'and' | 'or')}><option value="or">OR：いずれか</option><option value="and">AND：すべて</option></select>{snapshot.tags.map(t => <label className="check" key={t.id}><input type="checkbox" checked={tagFilter.includes(t.id)} onChange={e => setTagFilter(e.target.checked ? [...tagFilter,t.id] : tagFilter.filter(id => id !== t.id))}/>{t.name}</label>)}</fieldset>}
        <button className="wide" onClick={clearFilters}>絞り込みを解除</button>
        <div className="graph-node-list">{snapshot.nodes.filter(n => matches.has(n.id)).map(n => <div className={selected.has(n.id) ? 'node-list-row active' : 'node-list-row'} key={n.id}><input type="checkbox" aria-label={`${n.title || '無題'}を選択`} checked={selected.has(n.id)} onChange={e => { setEdgeId(undefined); setSelected(old => { const next = new Set(old); if (e.target.checked) next.add(n.id); else next.delete(n.id); return next; }); }}/><button onClick={() => selectNode(n.id)}><span>{n.parentGroupId ? '↳ ' : ''}{n.title || '無題'}</span><small>{snapshot.nodeTypes.find(t => t.id === n.typeId)?.name}</small></button></div>)}</div>
        {!matches.size && <p className="muted">ノードがありません。作成するか、絞り込みを解除してください。</p>}
        <button className="wide" disabled={!selected.size || disabled} onClick={() => { let id = ''; commit(d => { id = groupNodes(d, selected); }); if (id) setSelected(new Set([id])); }}>選択ノードをグループ化</button>
        <fieldset><legend>接続の表示</legend>{Object.entries(edgeKinds).map(([id,label]) => <label className="check" key={id}><input type="checkbox" checked={kinds.has(id)} onChange={e => setKinds(old => { const next = new Set(old); if (e.target.checked) next.add(id); else next.delete(id); return next; })}/>{label}</label>)}</fieldset>
        <details><summary>接続一覧（{snapshot.edges.length}）</summary>{snapshot.edges.map(e => <button className="connection-row" key={e.id} onClick={() => { setEdgeId(e.id); setSelected(new Set()); setMobileTab('details'); }}>{snapshot.nodes.find(n => n.id === e.sourceId)?.title} → {snapshot.nodes.find(n => n.id === e.targetId)?.title}<small>{edgeKinds[e.kind]} · {e.label || 'ラベルなし'}</small></button>)}</details>
      </aside>
      {left && <ResizeHandle side="left" width={leftWidth} onResize={setLeftWidth}/>}
      <div className="graph-center">
        <div className="connection-tools"><label>新規接続<select aria-label="新規接続の種類" value={kind} onChange={e => setKind(e.target.value as ScenarioEdge['kind'])}>{Object.entries(edgeKinds).map(([id,label]) => <option value={id} key={id}>{label}</option>)}</select></label><button aria-pressed={connecting} onClick={() => { setConnecting(!connecting); setSourceId(undefined); }}>{connecting ? '接続をキャンセル' : '2つのノードを選んで接続'}</button><span role="status">{connecting ? sourceId ? '次に接続先を選択（同じノードも可）' : '接続元を選択してください' : '端の丸をドラッグして接続'}</span></div>
        <div className="flow-canvas" aria-label="シナリオグラフ">
          <ReactFlow<CardNode, ScenarioFlowEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={instance => { flow.current = instance; }} fitView minZoom={0.15} maxZoom={2} deleteKeyCode={null} nodesDraggable={!disabled} nodesConnectable={!disabled} connectOnClick selectionOnDrag selectionKeyCode="Shift" multiSelectionKeyCode={['Control','Meta']} onSelectionChange={onSelectionChange}
            onNodesChange={changes => { setNodes(old => { const next = applyNodeChanges(changes, old); nodesRef.current = next; return next; }); if (changes.some(c => c.type === 'position' && c.position && c.dragging === undefined) && !dragging.current) finishMove(changes); }}
            onNodeDragStart={() => { dragging.current = true; }} onNodeDragStop={(_, moved, movedNodes) => finishMove((movedNodes.length ? movedNodes : [moved]).map(n => ({ type: 'position' as const, id: n.id, position: n.position })))}
            onNodeClick={(_, n) => { if (connecting) selectNode(n.id); else { setEdgeId(undefined); if (!selected.has(n.id)) setSelected(new Set([n.id])); } }}
            onEdgeClick={(_, e) => { setEdgeId(e.id); setSelected(new Set()); }}
            onConnect={connection => commit(d => { connect(d, connection.source, connection.target, kind); })}
            onPaneClick={() => { if (!connecting) { setSelected(new Set()); setEdgeId(undefined); } }}
            ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': '拡大', 'controls.zoomOut.ariaLabel': '縮小', 'controls.fitView.ariaLabel': '全体を表示', 'controls.interactive.ariaLabel': '操作を切り替え' }}>
            <Background color="#c9d3c8" gap={22}/><Controls/><MiniMap pannable zoomable nodeColor={n => n.data.color as string} ariaLabel="グラフ全体図"/>
          </ReactFlow>
          {snapshot.nodes.length === 0 && <div className="graph-empty"><span>◈</span><h2>物語を、つないでいく。</h2><p>最初のノードを作成しましょう。</p><button className="primary" onClick={addNode}>＋ 最初のノード</button></div>}
        </div><div className="canvas-caption"><span>{snapshot.nodes.length} ノード · {snapshot.edges.length} 接続</span><span>Shift＋ドラッグで複数選択 · Ctrl/⌘＋Zで戻す</span></div>
      </div>
      {right && <ResizeHandle side="right" width={rightWidth} onResize={setRightWidth}/>}
      <aside className={`graph-inspector ${right ? '' : 'pane-collapsed'}`}><div className="eyebrow">INSPECTOR</div>
        {edge ? <><h2>接続を編集</h2><label>接続元<select value={edge.sourceId} disabled={disabled} onChange={e => patchEdge({ sourceId: e.target.value })}>{snapshot.nodes.map(n => <option key={n.id} value={n.id}>{n.title || '無題'}</option>)}</select></label><label>接続先<select value={edge.targetId} disabled={disabled} onChange={e => patchEdge({ targetId: e.target.value })}>{snapshot.nodes.map(n => <option key={n.id} value={n.id}>{n.title || '無題'}</option>)}</select></label><label>種類<select value={edge.kind} disabled={disabled} onChange={e => patchEdge({ kind: e.target.value as ScenarioEdge['kind'] })}>{Object.entries(edgeKinds).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>ラベル<input value={edge.label} disabled={disabled} onChange={e => patchEdge({ label: e.target.value })}/></label><label>条件テキスト<textarea value={edge.condition} disabled={disabled} onChange={e => patchEdge({ condition: e.target.value })}/></label><p className="muted">条件の自動評価は行いません。</p><button className="danger wide" disabled={disabled} onClick={removeSelection}>接続を削除</button></> : node ? <><h2>ノードを編集</h2>{selected.size > 1 && <p>{selected.size}件選択中 · 項目編集は先頭のノード</p>}<label>ノードタイトル<input value={node.title} disabled={disabled} onChange={e => commit(d => updateNode(d, node.id, { title: e.target.value }))}/></label><label>ノードタイプ<select value={node.typeId} disabled={disabled} onChange={e => commit(d => updateNode(d, node.id, { typeId: e.target.value }))}>{snapshot.nodeTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
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

