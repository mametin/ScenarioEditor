'use client';
import { useState } from 'react';
import type { Snapshot } from '../domain/schema';
import { changeGraph, createNode, updateNode } from '../domain/graph';
import RichTextEditor from './editor/RichTextEditor';
import CustomFields from './types/CustomFields';
import './writing.css';

export default function WritingWorkspace({ snapshot, onChange, onOpenEntity, selectedNodeId }: { snapshot: Snapshot; onChange: (data: Snapshot) => void; onOpenEntity: (id: string) => void; selectedNodeId?: string }) {
  const [selected, setSelected] = useState(selectedNodeId ?? snapshot.nodes[0]?.id);
  const [focus, setFocus] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'list'|'editor'>('editor');
  const node = snapshot.nodes.find(n => n.id === selected);
  return <section className={`writing-workspace ${focus ? 'writing-focus' : ''}`}>
    <nav className="writing-mobile-tabs"><button aria-pressed={mobilePanel==='editor'} onClick={()=>setMobilePanel('editor')}>本文</button><button aria-pressed={mobilePanel==='list'} onClick={()=>setMobilePanel('list')}>ノード一覧</button></nav>
    <aside className={mobilePanel==='list'?'mobile-active':''}><h2>執筆するノード</h2><button onClick={() => { let id = ''; onChange(changeGraph(snapshot, d => { id = createNode(d, { x: 80, y: 80 }); })); setSelected(id); setMobilePanel('editor'); }}>＋ ノードを作成</button>{snapshot.nodes.map(n => <button className="writing-node" aria-pressed={selected === n.id} key={n.id} onClick={() => {setSelected(n.id);setMobilePanel('editor');}}>{n.title || '無題'}</button>)}</aside>
    <div className={`writing-page ${mobilePanel==='list'?'mobile-hidden':''}`}><button onClick={() => setFocus(!focus)}>{focus ? '一覧を表示' : '集中執筆'}</button>{node ? <><label>ノードタイトル<input value={node.title} onChange={e => onChange(changeGraph(snapshot, d => updateNode(d, node.id, { title: e.target.value })))}/></label><RichTextEditor key={node.documentId} snapshot={snapshot} documentId={node.documentId} onChange={onChange} onOpenEntity={onOpenEntity} onOpenNode={setSelected}/><CustomFields snapshot={snapshot} nodeId={node.id} onChange={onChange} onOpenEntity={onOpenEntity} onOpenNode={setSelected}/></> : <p>ノードを選択するか、新しく作成してください。</p>}</div>
  </section>;
}


