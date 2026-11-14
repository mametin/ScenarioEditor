'use client';
import { useState } from 'react';
import { parseSnapshot, type Snapshot } from '../../domain/schema';
import ColorPicker from '../ColorPicker';

export default function ConnectionTypeManager({ snapshot, onChange }: { snapshot: Snapshot; onChange: (s: Snapshot) => void }) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string>();
  const [replacementId, setReplacementId] = useState('');
  const [error, setError] = useState('');
  function change(operation: (draft: Snapshot) => void) {
    try {
      const draft = structuredClone(snapshot);
      operation(draft);
      draft.project.updatedAt = new Date().toISOString();
      onChange(parseSnapshot(draft));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : '変更できませんでした'); }
  }
  function addType() {
    const type = { id: crypto.randomUUID(), name: '新しい接続', color: '#64748b' };
    change(d => d.edgeTypes.push(type));
  }
  function requestDelete(id: string) {
    const target = snapshot.edgeTypes.find(type => type.id === id);
    if (!target || snapshot.edgeTypes.length <= 1) return;
    const replacement = snapshot.edgeTypes.find(type => type.id !== id);
    const usage = snapshot.edges.filter(edge => edge.kind === id).length;
    if (usage === 0 && confirm(`接続タイプ「${target.name}」を削除しますか？`)) {
      change(d => { d.edgeTypes = d.edgeTypes.filter(type => type.id !== id); });
      return;
    }
    setPendingDeleteId(id);
    setReplacementId(replacement?.id ?? '');
  }
  function deleteType(id: string) {
    const usage = snapshot.edges.filter(edge => edge.kind === id).length;
    const target = snapshot.edgeTypes.find(type => type.id === id);
    const replacement = snapshot.edgeTypes.find(type => type.id === replacementId && type.id !== id);
    if (!target || !replacement) return;
    if (!confirm(`「${target.name}」を削除し、使用中の接続 ${usage} 件を「${replacement.name}」へ変更しますか？`)) return;
    change(d => {
      for (const edge of d.edges) if (edge.kind === id) edge.kind = replacement.id;
      d.edgeTypes = d.edgeTypes.filter(type => type.id !== id);
    });
    setPendingDeleteId(undefined);
  }
  return <section className="type-manager connection-type-manager">
    <h2>接続タイプ</h2>
    <p>接続の名称と色はグラフの線・矢印に反映されます。削除するタイプを使用中の接続は、別のタイプへ付け替えられます。</p>
    {error && <p role="alert">{error}</p>}
    <div className="connection-type-list">{snapshot.edgeTypes.map(type => {
      const usage = snapshot.edges.filter(edge => edge.kind === type.id).length;
      const deleting = pendingDeleteId === type.id;
      return <fieldset key={type.id} className="connection-type-row">
        <legend>{type.name || '名称未設定'}</legend>
        <label>名称<input value={type.name} onChange={e => change(d => { d.edgeTypes.find(item => item.id === type.id)!.name = e.target.value; })}/></label>
        <ColorPicker label="表示色" value={type.color} onChange={color => change(d => { d.edgeTypes.find(item => item.id === type.id)!.color = color; })}/>
        <span className="muted">使用中 {usage} 件</span>
        {!deleting ? <button className="danger" disabled={snapshot.edgeTypes.length <= 1} onClick={() => requestDelete(type.id)}>削除</button> : <div className="connection-type-delete">
          <label>付け替え先<select value={replacementId} onChange={e => setReplacementId(e.target.value)}>{snapshot.edgeTypes.filter(item => item.id !== type.id).map(item => <option key={item.id} value={item.id}>{item.name || '名称未設定'}</option>)}</select></label>
          <button className="danger" onClick={() => deleteType(type.id)}>削除して付け替え</button>
          <button onClick={() => setPendingDeleteId(undefined)}>キャンセル</button>
        </div>}
      </fieldset>;
    })}</div>
    <button onClick={addType}>＋ 接続タイプ</button>
  </section>;
}
