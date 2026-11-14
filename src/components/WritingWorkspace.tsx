'use client';
import { useEffect, useState } from 'react';
import type { Snapshot } from '../domain/schema';
import { changeGraph, createNode, reorderNode, updateNode } from '../domain/graph';
import RichTextEditor from './editor/RichTextEditor';
import CustomFields from './types/CustomFields';
import ScenarioExplorer, { useExplorerPreferences } from './explorer/ScenarioExplorer';
import './writing.css';

export default function WritingWorkspace({ snapshot, onChange, onOpenEntity, selectedNodeId }: { snapshot: Snapshot; onChange: (data: Snapshot) => void; onOpenEntity: (id: string) => void; selectedNodeId?: string }) {
  const { preferences, setPreferences } = useExplorerPreferences(snapshot.project.id, snapshot);
  const [focus, setFocus] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'list'|'editor'>('editor');
  const selected = selectedNodeId && snapshot.nodes.some(node => node.id === selectedNodeId) ? selectedNodeId : preferences.selectedNodeId ?? snapshot.nodes[0]?.id;
  const node = snapshot.nodes.find(item => item.id === selected);

  useEffect(() => {
    if (selectedNodeId && snapshot.nodes.some(item => item.id === selectedNodeId) && selectedNodeId !== preferences.selectedNodeId) {
      setPreferences(current => ({ ...current, selectedNodeId }));
    }
  }, [selectedNodeId, snapshot.nodes, preferences.selectedNodeId, setPreferences]);
  useEffect(() => {
    if (!preferences.selectedNodeId && snapshot.nodes[0]) setPreferences(current => ({ ...current, selectedNodeId: snapshot.nodes[0].id }));
  }, [preferences.selectedNodeId, snapshot.nodes, setPreferences]);

  function openNode(id: string) {
    setPreferences(current => ({ ...current, selectedNodeId: id }));
    setMobilePanel('editor');
  }
  function create() {
    let id = '';
    onChange(changeGraph(snapshot, draft => { id = createNode(draft, { x: 80, y: 80 }); }));
    if (id) { openNode(id); setMobilePanel('editor'); }
  }
  function reorder(sourceId: string, targetId: string, before: boolean) {
    onChange(changeGraph(snapshot, draft => reorderNode(draft, sourceId, targetId, before)));
  }
  const explorer = <ScenarioExplorer snapshot={snapshot} preferences={preferences} setPreferences={setPreferences} onOpenNode={openNode} onCreateNode={create} onRenameNode={(id, title) => onChange(changeGraph(snapshot, draft => updateNode(draft, id, { title })))} onReorder={reorder} className={mobilePanel === 'list' ? 'mobile-active' : ''} title="執筆するノード"/>;

  return <section className={`writing-workspace ${focus ? 'writing-focus' : ''}`} style={{ '--writing-list-width': `${preferences.width}px` } as React.CSSProperties}>
    <nav className="writing-mobile-tabs" aria-label="執筆画面"><button aria-pressed={mobilePanel==='editor'} onClick={()=>setMobilePanel('editor')}>本文</button><button aria-pressed={mobilePanel==='list'} onClick={()=>setMobilePanel('list')}>ノード一覧</button></nav>
    {explorer}
    <div className={`writing-page ${mobilePanel==='list'?'mobile-hidden':''}`}><button type="button" onClick={() => setFocus(!focus)}>{focus ? '一覧を表示' : '集中執筆'}</button>{node ? <><label>ノードタイトル<input value={node.title} onChange={e => onChange(changeGraph(snapshot, d => updateNode(d, node.id, { title: e.target.value })))}/></label><RichTextEditor key={node.documentId} snapshot={snapshot} documentId={node.documentId} onChange={onChange} onOpenEntity={onOpenEntity} onOpenNode={openNode}/><CustomFields snapshot={snapshot} nodeId={node.id} onChange={onChange} onOpenEntity={onOpenEntity} onOpenNode={openNode}/></> : <p>{snapshot.nodes.length ? 'ノードを選択してください。' : 'ノードを作成して執筆を始めてください。'}</p>}</div>
  </section>;
}
