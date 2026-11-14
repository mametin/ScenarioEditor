'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Node, mergeAttributes, getSchema } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { parseSnapshot, type EntityReference, type Snapshot } from '../../domain/schema';
import { resolveReference } from '../../domain/project';
import { fromEditorJSON, normalizeContent, toEditorJSON } from './adapter';
import { recoveryKey, persistRecovery } from './recovery';
import { hideEntityHover, showEntityHover } from '../entities/entity-hover';
import './editor.css';

export type ScenarioEditorProps = { snapshot: Snapshot; documentId: string; onChange: (snapshot: Snapshot) => void; onOpenEntity?: (id: string) => void; onOpenNode?: (id: string) => void; disabled?: boolean };
export default function ScenarioEditor(props: ScenarioEditorProps) { return <EditorInstance key={props.documentId} {...props}/>; }
function EditorInstance(props: ScenarioEditorProps) {
  const latest = useRef(props); latest.current = props;
  const refreshViews = useRef(new Set<() => void>());
  const failedUpdate = useRef(false);
  const [recovery, setRecovery] = useState<string | null>(null);
  const rescueKey = recoveryKey(props.snapshot.project.id, props.documentId);
  useEffect(() => {
    try { setRecovery(sessionStorage.getItem(rescueKey)); } catch { setError('救出用原稿の読み込みに失敗しました。ブラウザの保存領域を確認してください。'); }
    const before = (event: BeforeUnloadEvent) => { if (failedUpdate.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before);
  }, [rescueKey]);
  const [error, setError] = useState(''); const [entityId, setEntityId] = useState(''); const [mode, setMode] = useState<'auto' | 'alias' | 'fixed'>('auto'); const [aliasId, setAliasId] = useState(''); const [fixed, setFixed] = useState(''); const [nodeId, setNodeId] = useState('');
  const document = props.snapshot.documents.find(d => d.id === props.documentId);
  const extensions = useMemo(() => {
    const block = (name: string, label: string) => Node.create({ name, group: 'block', content: 'block+', defining: true, parseHTML: () => [{ tag: `section[data-scenario-block="${name}"]` }], renderHTML: ({ HTMLAttributes }) => ['section', mergeAttributes(HTMLAttributes, { 'data-scenario-block': name, 'aria-label': label }), 0] });
    const referenceNode = (name: string) => Node.create({
      name, group: 'inline', inline: true, atom: true,
      addAttributes: () => name === 'entityReference' ? { reference: { default: null } } : { nodeId: { default: '' }, text: { default: '' } },
      parseHTML: () => [], renderHTML: () => ['span', { 'data-reference': name }, '参照'],
      addNodeView: () => ({ node }) => {
        const dom = window.document.createElement('button'); dom.type = 'button'; dom.className = 'inline-reference'; dom.contentEditable = 'false';
        const render = () => {
          if (name === 'entityReference') { const result = resolveReference(node.attrs.reference, latest.current.snapshot); dom.textContent = result.text; dom.classList.toggle('broken', result.broken); dom.title = ''; dom.setAttribute('aria-label', `${result.text}の設定資料詳細`); dom.setAttribute('aria-haspopup', 'dialog'); }
          else { dom.textContent = node.attrs.text; dom.classList.toggle('broken', !latest.current.snapshot.nodes.some(n => n.id === node.attrs.nodeId)); dom.title = '参照ノードを開く'; }
        };
        dom.onclick = () => name === 'entityReference' ? latest.current.onOpenEntity?.(node.attrs.reference.entityId) : latest.current.onOpenNode?.(node.attrs.nodeId);
        if (name === 'entityReference') {
          dom.onmouseenter = () => showEntityHover(node.attrs.reference.entityId, dom);
          dom.onmouseleave = () => hideEntityHover(node.attrs.reference.entityId);
          dom.onfocus = () => showEntityHover(node.attrs.reference.entityId, dom);
          dom.onblur = () => hideEntityHover(node.attrs.reference.entityId);
        }
        refreshViews.current.add(render); render();
        return { dom, stopEvent: () => true, destroy: () => { refreshViews.current.delete(render); } };
      },
    });
    return [StarterKit.configure({ code: false, codeBlock: false, strike: false, link: false, underline: false, trailingNode: false }), block('readAloud', '読み上げ'), block('kp', 'KP専用情報'), referenceNode('entityReference'), referenceNode('nodeReference')];
  }, []);
  function safeContent() {
    const content = document?.content ?? [];
    if (!content.length) return { json: { type: 'doc', content: [{ type: 'paragraph' }] }, error: '' };
    try {
      const json = toEditorJSON(content); const parsed = getSchema(extensions).nodeFromJSON(json); parsed.check();
      if (JSON.stringify(normalizeContent(fromEditorJSON(parsed.toJSON()))) !== JSON.stringify(normalizeContent(content))) throw new Error('本文を変換すると構造が変わります');
      return { json, error: '' };
    } catch (e) { return { json: { type: 'doc', content: [{ type: 'paragraph' }] }, error: `${e instanceof Error ? e.message : '本文形式の不一致'}。元データを保護するため編集を停止しました。JSONバックアップをご利用ください。` }; }
  }
  const prepared = safeContent();
  const editor = useEditor({ extensions, immediatelyRender: false, content: prepared.json, editable: !props.disabled && !prepared.error,
    editorProps: { attributes: { 'aria-label': 'シナリオ本文', class: 'scenario-prose' } },
    onUpdate: ({ editor }) => {
      try {
        const next = structuredClone(latest.current.snapshot); const doc = next.documents.find(d => d.id === latest.current.documentId); if (!doc) throw new Error('本文が見つかりません');
        doc.content = fromEditorJSON(editor.getJSON()); doc.updatedAt = new Date().toISOString(); next.project.updatedAt = doc.updatedAt; latest.current.onChange(parseSnapshot(next));
        if (failedUpdate.current) { try { sessionStorage.removeItem(rescueKey); setRecovery(null); } catch { setError('本文は更新されましたが救出用原稿を削除できませんでした。'); failedUpdate.current = false; return; } }
        failedUpdate.current = false; setError('');
      } catch (e) {
        failedUpdate.current = true; const message = e instanceof Error ? e.message : '本文を保存できませんでした';
        try { setRecovery(persistRecovery(sessionStorage, rescueKey, editor.getJSON())); setError(`${message}。このタブの救出用保存領域に退避しました。`); }
        catch { setError(`${message}。救出用保存領域への退避にも失敗しました。画面を切り替えずJSONをダウンロードしてください。`); }
      }
    },
  });
  useEffect(() => { editor?.setEditable(!props.disabled && !prepared.error); }, [editor, props.disabled, prepared.error]);
  useEffect(() => { for (const render of refreshViews.current) render(); if (!editor || !document || failedUpdate.current || prepared.error) return; try { const own = fromEditorJSON(editor.getJSON()); if (JSON.stringify(normalizeContent(own)) !== JSON.stringify(normalizeContent(document.content))) editor.commands.setContent(prepared.json, { emitUpdate: false }); } catch (e) { setError(e instanceof Error ? e.message : '本文を読み込めません'); } }, [editor, document, props.snapshot]);
  if (!document) return <p role="alert">本文が見つかりません。</p>;
  if (prepared.error) return <p role="alert" className="editor-error">{prepared.error}</p>;
  const entity = props.snapshot.entities.find(e => e.id === entityId);
  function rescueDraft() { if (!editor) return; const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'tiptap-rescue', documentId: props.documentId, content: editor.getJSON() }, null, 2)], { type: 'application/json' })); const link = window.document.createElement('a'); link.href = url; link.download = `editor-rescue-${props.documentId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function downloadRecovery() { if (!recovery) return; const url = URL.createObjectURL(new Blob([recovery], { type: 'application/json' })); const link = window.document.createElement('a'); link.href = url; link.download = `recovered-${props.documentId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function insertReference() { let reference: EntityReference; if (mode === 'alias') { if (!aliasId) return; reference = { entityId, mode, aliasId }; } else if (mode === 'fixed') reference = { entityId, mode, text: fixed }; else reference = { entityId, mode }; editor?.chain().focus().insertContent({ type: 'entityReference', attrs: { reference } }).run(); }
  return <section className="scenario-editor"><div className="editor-tools" aria-label="本文の書式">
    <select aria-label="見出し" defaultValue="0" disabled={!editor || props.disabled} onChange={e => { const level = Number(e.target.value); if (level) editor?.chain().focus().setHeading({ level: level as 1|2|3|4|5|6 }).run(); else editor?.chain().focus().setParagraph().run(); }}><option value="0">本文</option>{[1,2,3,4,5,6].map(n => <option key={n} value={n}>見出し {n}</option>)}</select>
    <button disabled={!editor || props.disabled} onClick={() => editor?.chain().focus().toggleBold().run()}>太字</button><button disabled={!editor || props.disabled} onClick={() => editor?.chain().focus().toggleItalic().run()}>斜体</button>
    <button disabled={!editor || props.disabled} onClick={() => editor?.chain().focus().toggleBulletList().run()}>箇条書き</button><button disabled={!editor || props.disabled} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>番号</button><button disabled={!editor || props.disabled} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>引用</button><button disabled={!editor || props.disabled} onClick={() => editor?.chain().focus().setHorizontalRule().run()}>区切り線</button>
    <button disabled={!editor || props.disabled} onClick={() => editor?.chain().focus().toggleWrap('readAloud').run()}>読み上げ</button><button disabled={!editor || props.disabled} onClick={() => editor?.chain().focus().toggleWrap('kp').run()}>KP情報</button><button disabled={!editor || props.disabled} onClick={() => editor?.chain().focus().undo().run()}>Undo</button><button disabled={!editor || props.disabled} onClick={() => editor?.chain().focus().redo().run()}>Redo</button>
  </div>{recovery && <div role="status" className="editor-error">以前の保存エラーから救出した原稿があります。元の本文には自動反映しません。<button onClick={downloadRecovery}>救出原稿をダウンロード</button><small>このタブを閉じる前にダウンロードしてください。通常のプロジェクトJSONとは形式が異なります。</small></div>}{error && <div role="alert" className="editor-error">{error} 編集中の本文はエディタに保持されています。画面を切り替える前に退避してください。<button onClick={rescueDraft}>編集中の本文を救出用JSONで退避</button><small>救出用JSONは通常のプロジェクト取り込みとは形式が異なります。</small></div>}<EditorContent editor={editor}/>
    <details className="reference-tools"><summary>設定資料・ノードへの参照を挿入</summary><label>設定資料<select value={entityId} onChange={e => { setEntityId(e.target.value); setAliasId(''); }}><option value="">選択してください</option>{props.snapshot.entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label>表記<select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="auto">正式名称に追従</option><option value="alias">別名に追従</option><option value="fixed">固定文字列</option></select></label>{mode === 'alias' && <label>別名<select value={aliasId} onChange={e => setAliasId(e.target.value)}><option value="">選択してください</option>{entity?.aliases.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}{mode === 'fixed' && <label>固定表記<input value={fixed} onChange={e => setFixed(e.target.value)}/></label>}<button disabled={!editor || !entity || props.disabled || (mode === 'alias' && !aliasId)} onClick={insertReference}>設定資料参照を挿入</button>
    <label>内部リンク<select value={nodeId} onChange={e => setNodeId(e.target.value)}><option value="">ノードを選択</option>{props.snapshot.nodes.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label><button disabled={!editor || !nodeId || props.disabled} onClick={() => editor?.chain().focus().insertContent({ type: 'nodeReference', attrs: { nodeId, text: props.snapshot.nodes.find(n => n.id === nodeId)?.title || '無題' } }).run()}>ノード参照を挿入</button></details>
  </section>;
}
