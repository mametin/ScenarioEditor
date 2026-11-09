'use client';
import { useState } from 'react';
import type { Snapshot } from '../domain/schema';
import { changeGraph, createNode, reorderNode, updateNode } from '../domain/graph';
import RichTextEditor from './editor/RichTextEditor';
import CustomFields from './types/CustomFields';
import './writing.css';

export default function WritingWorkspace({ snapshot, onChange, onOpenEntity, selectedNodeId }: { snapshot: Snapshot; onChange: (data: Snapshot) => void; onOpenEntity: (id: string) => void; selectedNodeId?: string }) {
  const [selected, setSelected] = useState(selectedNodeId ?? snapshot.nodes[0]?.id);
  const [focus, setFocus] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'list'|'editor'>('editor');
  const [draggedNodeId, setDraggedNodeId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null);
  const node = snapshot.nodes.find(n => n.id === selected);
  function nodeDepth(id: string) { let depth = 0; let parentId = snapshot.nodes.find(item => item.id === id)?.parentGroupId; while (parentId) { depth++; parentId = snapshot.nodes.find(item => item.id === parentId)?.parentGroupId; } return depth; }
  return <section className={`writing-workspace ${focus ? 'writing-focus' : ''}`}>
    <nav className="writing-mobile-tabs"><button aria-pressed={mobilePanel==='editor'} onClick={()=>setMobilePanel('editor')}>本文</button><button aria-pressed={mobilePanel==='list'} onClick={()=>setMobilePanel('list')}>ノード一覧</button></nav>
    <aside className={mobilePanel==='list'?'mobile-active':''}><h2>執筆するノード</h2><button onClick={() => { let id = ''; onChange(changeGraph(snapshot, d => { id = createNode(d, { x: 80, y: 80 }); })); setSelected(id); setMobilePanel('editor'); }}>＋ ノードを作成</button>{snapshot.nodes.map(n => { const depth = nodeDepth(n.id); const dropClass = dropTarget?.id === n.id ? (dropTarget.before ? ' drop-before' : ' drop-after') : ''; return <div key={n.id} className={`writing-node-row${dropClass}`} style={{ marginLeft: `${depth * 14}px` }} onDragOver={event => { event.stopPropagation(); const sourceId = draggedNodeId ?? event.dataTransfer.getData('text/plain'); const source = snapshot.nodes.find(item => item.id === sourceId); if (!source || source.id === n.id || source.parentGroupId !== n.parentGroupId) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; const rect = event.currentTarget.getBoundingClientRect(); const before = event.clientY < rect.top + rect.height / 2; setDropTarget(old => old?.id === n.id && old.before === before ? old : { id: n.id, before }); }} onDrop={event => { event.stopPropagation(); event.preventDefault(); const sourceId = draggedNodeId ?? event.dataTransfer.getData('text/plain'); const source = snapshot.nodes.find(item => item.id === sourceId); if (source && source.parentGroupId === n.parentGroupId) { const rect = event.currentTarget.getBoundingClientRect(); const before = event.clientY < rect.top + rect.height / 2; onChange(changeGraph(snapshot, draft => reorderNode(draft, source.id, n.id, before))); } setDropTarget(null); setDraggedNodeId(undefined); }}>
      <button type="button" className="writing-node-grip" draggable aria-label={`${n.title || '無題'}を並べ替え`} title="同じ階層内でドラッグして並べ替え" onClick={event => event.stopPropagation()} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', n.id); setDraggedNodeId(n.id); setDropTarget(null); }} onDragEnd={() => { setDropTarget(null); setDraggedNodeId(undefined); }}>⠿</button><button className="writing-node" aria-pressed={selected === n.id} onClick={() => {setSelected(n.id);setMobilePanel('editor');}}><span>{n.parentGroupId ? '↳ ' : ''}{n.title || '無題'}</span></button>
    </div>; })}</aside>
    <div className={`writing-page ${mobilePanel==='list'?'mobile-hidden':''}`}><button onClick={() => setFocus(!focus)}>{focus ? '一覧を表示' : '集中執筆'}</button>{node ? <><label>ノードタイトル<input value={node.title} onChange={e => onChange(changeGraph(snapshot, d => updateNode(d, node.id, { title: e.target.value })))}/></label><RichTextEditor key={node.documentId} snapshot={snapshot} documentId={node.documentId} onChange={onChange} onOpenEntity={onOpenEntity} onOpenNode={setSelected}/><CustomFields snapshot={snapshot} nodeId={node.id} onChange={onChange} onOpenEntity={onOpenEntity} onOpenNode={setSelected}/></> : <p>ノードを選択するか、新しく作成してください。</p>}</div>
  </section>;
}


