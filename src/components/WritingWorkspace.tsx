'use client';
import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Snapshot } from '../domain/schema';
import { changeGraph, createNode, reorderNode, updateNode } from '../domain/graph';
import RichTextEditor from './editor/RichTextEditor';
import CustomFields from './types/CustomFields';
import './writing.css';

export default function WritingWorkspace({ snapshot, onChange, onOpenEntity, selectedNodeId }: { snapshot: Snapshot; onChange: (data: Snapshot) => void; onOpenEntity: (id: string) => void; selectedNodeId?: string }) {
  const [selected, setSelected] = useState(selectedNodeId ?? snapshot.nodes[0]?.id);
  const [focus, setFocus] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'list'|'editor'>('editor');
  const [listWidth, setListWidth] = useState(280);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [draggedNodeId, setDraggedNodeId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null);
  const node = snapshot.nodes.find(n => n.id === selected);
  const childrenByParent = new Map<string | null, typeof snapshot.nodes>();
  for (const item of snapshot.nodes) childrenByParent.set(item.parentGroupId, [...(childrenByParent.get(item.parentGroupId) ?? []), item]);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const initialWidth = listWidth;
    const move = (pointer: PointerEvent) => setListWidth(Math.min(520, Math.max(200, initialWidth + pointer.clientX - startX)));
    const stop = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', stop);
      element.removeEventListener('pointercancel', stop);
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', stop);
    element.addEventListener('pointercancel', stop);
  }

  function renderTreeItem(item: Snapshot['nodes'][number], depth: number): ReactNode {
    const children = childrenByParent.get(item.id) ?? [];
    const collapsed = collapsedGroups.has(item.id);
    const dropClass = dropTarget?.id === item.id ? (dropTarget.before ? ' drop-before' : ' drop-after') : '';
    return <div className="writing-tree-item" key={item.id}>
      <div className={`writing-node-row${selected === item.id ? ' active' : ''}${dropClass}`} onDragOver={event => {
        event.stopPropagation();
        const sourceId = draggedNodeId ?? event.dataTransfer.getData('text/plain');
        const source = snapshot.nodes.find(candidate => candidate.id === sourceId);
        if (!source || source.id === item.id || source.parentGroupId !== item.parentGroupId) return;
        event.preventDefault(); event.dataTransfer.dropEffect = 'move';
        const rect = event.currentTarget.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        setDropTarget(old => old?.id === item.id && old.before === before ? old : { id: item.id, before });
      }} onDrop={event => {
        event.stopPropagation(); event.preventDefault();
        const sourceId = draggedNodeId ?? event.dataTransfer.getData('text/plain');
        const source = snapshot.nodes.find(candidate => candidate.id === sourceId);
        if (source && source.parentGroupId === item.parentGroupId) {
          const rect = event.currentTarget.getBoundingClientRect();
          const before = event.clientY < rect.top + rect.height / 2;
          onChange(changeGraph(snapshot, draft => reorderNode(draft, source.id, item.id, before)));
        }
        setDropTarget(null); setDraggedNodeId(undefined);
      }}>
        <div className="writing-tree-row" style={{ paddingLeft: `${depth * 18}px` }}>
          {children.length > 0 ? <button type="button" className="writing-tree-toggle" aria-label={`${item.title || '無題'}の子ノードを${collapsed ? '展開' : '折りたたむ'}`} aria-expanded={!collapsed} onClick={() => setCollapsedGroups(old => { const next = new Set(old); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}>{collapsed ? '▸' : '▾'}</button> : <span className="writing-tree-spacer"/>}
          <button type="button" className="writing-node-grip" draggable aria-label={`${item.title || '無題'}を並べ替え`} title="同じ階層内でドラッグして並べ替え" onClick={event => event.stopPropagation()} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); setDraggedNodeId(item.id); setDropTarget(null); }} onDragEnd={() => { setDropTarget(null); setDraggedNodeId(undefined); }}>⠿</button>
          <button className="writing-node" aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setMobilePanel('editor'); }}><span>{item.title || '無題'}</span></button>
        </div>
      </div>
      {!collapsed && children.map(child => renderTreeItem(child, depth + 1))}
    </div>;
  }

  return <section className={`writing-workspace ${focus ? 'writing-focus' : ''}`} style={{ '--writing-list-width': `${listWidth}px` } as CSSProperties}>
    <nav className="writing-mobile-tabs"><button aria-pressed={mobilePanel==='editor'} onClick={()=>setMobilePanel('editor')}>本文</button><button aria-pressed={mobilePanel==='list'} onClick={()=>setMobilePanel('list')}>ノード一覧</button></nav>
    <aside className={mobilePanel==='list'?'mobile-active':''}>
      <h2>執筆するノード</h2>
      <button className="writing-create-node" onClick={() => { let id = ''; onChange(changeGraph(snapshot, d => { id = createNode(d, { x: 80, y: 80 }); })); setSelected(id); setMobilePanel('editor'); }}>＋ ノードを作成</button>
      <div className="writing-node-tree">{(childrenByParent.get(null) ?? []).map(item => renderTreeItem(item, 0))}</div>
    </aside>
    <div className="writing-list-resizer" role="separator" aria-label="執筆ノード一覧の幅" aria-orientation="vertical" aria-valuenow={listWidth} aria-valuemin={200} aria-valuemax={520} tabIndex={0}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setListWidth(width => Math.min(520, Math.max(200, width + (event.key === 'ArrowRight' ? 20 : -20)))); } }}
      onPointerDown={startResize}/>
    <div className={`writing-page ${mobilePanel==='list'?'mobile-hidden':''}`}><button onClick={() => setFocus(!focus)}>{focus ? '一覧を表示' : '集中執筆'}</button>{node ? <><label>ノードタイトル<input value={node.title} onChange={e => onChange(changeGraph(snapshot, d => updateNode(d, node.id, { title: e.target.value })))}/></label><RichTextEditor key={node.documentId} snapshot={snapshot} documentId={node.documentId} onChange={onChange} onOpenEntity={onOpenEntity} onOpenNode={setSelected}/><CustomFields snapshot={snapshot} nodeId={node.id} onChange={onChange} onOpenEntity={onOpenEntity} onOpenNode={setSelected}/></> : <p>ノードを選択するか、新しく作成してください。</p>}</div>
  </section>;
}
