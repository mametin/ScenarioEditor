'use client';
import { useState } from 'react';
import type { Snapshot } from '../../domain/schema';
import { editTypes } from '../../domain/types';
import ColorPicker from '../ColorPicker';
import './types.css';

export default function TagManager({ snapshot, onChange }: { snapshot: Snapshot; onChange: (s: Snapshot) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [tagId, setTagId] = useState('');
  function change(operation: (draft: Snapshot) => void) { onChange(editTypes(snapshot, operation)); }
  return <section className="tag-manager">
    <h2>タグ管理</h2>
    <button onClick={() => change(d => { d.tags.push({ id: crypto.randomUUID(), name: '新しいタグ', color: '#657e6d' }); })}>＋ タグ</button>
    {snapshot.tags.map(tag => <div className="tag-row" key={tag.id}>
      <input aria-label="タグ名" value={tag.name} onChange={e => change(d => { d.tags.find(x => x.id === tag.id)!.name = e.target.value; })}/>
      <ColorPicker label={`${tag.name}の色`} value={tag.color} onChange={color => change(d => { d.tags.find(x => x.id === tag.id)!.color = color; })}/>
      <button onClick={() => { if (confirm('タグとノード・設定資料への付与を削除しますか？保存履歴から復元できます。')) change(d => { d.tags = d.tags.filter(x => x.id !== tag.id); for (const item of [...d.nodes, ...d.entities]) item.tagIds = item.tagIds.filter(id => id !== tag.id); }); }}>削除</button>
    </div>)}
    <h3>ノードのタグを一括変更</h3>
    {snapshot.nodes.map(node => <label key={node.id}><input type="checkbox" checked={selected.includes(node.id)} onChange={e => setSelected(e.target.checked ? [...selected, node.id] : selected.filter(id => id !== node.id))}/>{node.title || '無題'}</label>)}
    <select aria-label="一括変更するタグ" value={tagId} onChange={e => setTagId(e.target.value)}><option value="">タグを選択</option>{snapshot.tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select>
    <div className="type-toolbar"><button disabled={!snapshot.tags.some(tag => tag.id === tagId) || !selected.length} onClick={() => change(d => { for (const node of d.nodes) if (selected.includes(node.id) && !node.tagIds.includes(tagId)) node.tagIds.push(tagId); })}>選択ノードに追加</button><button disabled={!tagId || !selected.length} onClick={() => change(d => { for (const node of d.nodes) if (selected.includes(node.id)) node.tagIds = node.tagIds.filter(id => id !== tagId); })}>選択ノードから解除</button></div>
  </section>;
}
