'use client';
import { useMemo, useRef, useState } from 'react';
import { resolveReference } from '../domain/project';
import type { Snapshot } from '../domain/schema';
import type { DriveCredential } from '../storage/google-drive';
import { askAssistant } from '../storage/ai-client';
import './ai-assistant.css';

type Selection = { documentId: string; updatedAt: string; from: number; to: number; text: string; safeForReplacement: boolean };
type ProposalSource = { documentId: string; updatedAt: string; from: number; to: number; acceptedAsSelection: boolean; safeForReplacement: boolean; before: string };
const taskPresets = {
  polish: 'この文章を自然な日本語に推敲してください。意味と設定は変えず、修正文だけを提示してください。',
  proofread: '誤字、脱字、表記揺れを確認し、該当箇所と修正候補を示してください。',
  summarize: '送信したシーンと資料だけをもとに、要点を短く要約してください。',
  consult: '指定した設定資料を根拠に、依頼内容へ回答してください。不明な点は推測と分けてください。',
  continuity: '送信した本文と指定資料の範囲で、人物設定や時系列の矛盾候補を指摘してください。断定せず根拠も示してください。',
  custom: '',
} as const;

function contentText(items: Snapshot['documents'][number]['content'], snapshot: Snapshot): string {
  return items.map(item => {
    if (item.kind === 'text') return item.text;
    if (item.kind === 'entity') return resolveReference(item.reference, snapshot).text;
    if (item.kind === 'nodeLink') return snapshot.nodes.some(node => node.id === item.nodeId) ? item.text : `${item.text}（参照切れ）`;
    if (item.style === 'divider') return '\n---\n';
    const children = contentText(item.children, snapshot);
    if (item.style === 'bulletList' || item.style === 'orderedList') return `\n${children}\n`;
    if (item.style === 'listItem') return `・${children}\n`;
    return `\n${children}\n`;
  }).join('').replace(/\n{3,}/g, '\n\n').trim();
}

export default function AIAssistantPanel({ snapshot, selectedNodeId, selection, credential, canApplySelection, onClose }: { snapshot: Snapshot; selectedNodeId?: string; selection?: Selection; credential?: DriveCredential; canApplySelection: boolean; onClose: () => void }) {
  const node = snapshot.nodes.find(item => item.id === selectedNodeId);
  const scene = node ? snapshot.documents.find(document => document.id === node.documentId) : undefined;
  const sceneText = scene ? contentText(scene.content, snapshot) : '';
  const [taskMode, setTaskMode] = useState<keyof typeof taskPresets>('polish');
  const [task, setTask] = useState<string>(taskPresets.polish);
  const [includeSelection, setIncludeSelection] = useState(!!selection?.text);
  const [includeScene, setIncludeScene] = useState(!!scene);
  const [entityIds, setEntityIds] = useState<string[]>([]);
  const [proposal, setProposal] = useState('');
  const [source, setSource] = useState<ProposalSource>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState<string>();
  const abort = useRef<AbortController | undefined>(undefined);
  const references = useMemo(() => entityIds.flatMap(id => {
    const entity = snapshot.entities.find(item => item.id === id);
    if (!entity) return [];
    const document = snapshot.documents.find(item => item.id === entity.descriptionDocumentId);
    return [{ name: entity.name, content: document ? contentText(document.content, snapshot) : '' }];
  }), [entityIds, snapshot]);
  const endpoint = process.env.NEXT_PUBLIC_AI_API_URL?.trim();
  const targetSelection = includeSelection && selection?.text ? selection : undefined;
  const selectedText = targetSelection?.text ?? '';
  const stale = !!source && source.acceptedAsSelection && (!targetSelection || targetSelection.documentId !== source.documentId || targetSelection.updatedAt !== source.updatedAt || snapshot.documents.find(document => document.id === source.documentId)?.updatedAt !== source.updatedAt);

  async function submit() {
    setError(''); setProposal(''); setSource(undefined); setUsage(undefined);
    if (!endpoint) { setError('AIサーバーURLが未設定です。設定手順を確認してください。'); return; }
    if (!credential || credential.expiresAt <= Date.now()) { setError('Googleアカウントへ接続してください。'); return; }
    if (!includeSelection && !includeScene && entityIds.length === 0) { setError('送信する本文または設定資料を選んでください。'); return; }
    const contextChars = (includeSelection ? selectedText.length : 0) + (includeScene ? sceneText.length : 0) + references.reduce((sum, item) => sum + item.name.length + item.content.length, 0);
    const targetLabels = [includeSelection && selectedText ? '選択範囲' : '', includeScene && node ? `シーン「${node.title}」` : '', ...references.map(item => `資料「${item.name}」`)].filter(Boolean);
    if (!window.confirm(`次の内容をAIサービスへ送信します。\n\n対象: ${targetLabels.join('、')}\n本文・資料: 約${contextChars.toLocaleString()}文字\n\n作品全体は送信しません。送信してよいですか？`)) return;
    const controller = new AbortController(); abort.current = controller; setBusy(true);
    try {
      const result = await askAssistant(endpoint, credential.accessToken, { task, selection: includeSelection ? selectedText : '', currentScene: includeScene ? sceneText : '', references }, controller.signal);
      setProposal(result.text); setUsage(`${result.usage?.inputTokens ?? '—'} / ${result.usage?.outputTokens ?? '—'} tokens`);
      const selectedSourceDoc = targetSelection ? snapshot.documents.find(document => document.id === targetSelection.documentId) : scene;
      if (selectedSourceDoc) setSource({ documentId: selectedSourceDoc.id, updatedAt: selectedSourceDoc.updatedAt, from: targetSelection?.from ?? 0, to: targetSelection?.to ?? 0, acceptedAsSelection: !!targetSelection && targetSelection.text.length > 0, safeForReplacement: targetSelection?.safeForReplacement ?? false, before: targetSelection?.text ?? sceneText });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'AIへ接続できませんでした。');
    } finally { setBusy(false); abort.current = undefined; }
  }

  function applySelection() {
    if (!proposal || !source?.acceptedAsSelection || !source.safeForReplacement || stale || !targetSelection || !canApplySelection) return;
    window.dispatchEvent(new CustomEvent('scenario-editor-ai-apply', { detail: { documentId: source.documentId, updatedAt: source.updatedAt, from: source.from, to: source.to, text: proposal } }));
    setProposal(''); setSource(undefined);
  }

  return <aside className="ai-assistant" aria-label="AIアシスタント">
    <header><div><small>WRITING ASSISTANT</small><h2>AIアシスタント</h2></div><button type="button" aria-label="AIパネルを閉じる" onClick={onClose}>×</button></header>
    <div className="ai-assistant__body">
      {!endpoint && <p className="ai-assistant__note">AIサーバーの接続先を設定すると利用できます。</p>}
      {!credential && <p className="ai-assistant__note">Google DriveメニューからGoogleアカウントへ接続してください。AI利用者の確認にも同じ接続を使います。</p>}
      <label className="ai-assistant__task">支援内容<select value={taskMode} onChange={event => { const mode = event.target.value as keyof typeof taskPresets; setTaskMode(mode); setTask(taskPresets[mode]); }}><option value="polish">選択文・シーンを推敲</option><option value="proofread">誤字・表記揺れを確認</option><option value="summarize">現在のシーンを要約</option><option value="consult">指定資料を参照して相談</option><option value="continuity">設定・時系列の矛盾候補</option><option value="custom">自由に依頼を書く</option></select><textarea aria-label="依頼内容" value={task} maxLength={2_000} onChange={event => { setTaskMode('custom'); setTask(event.target.value); }} rows={3}/></label>
      <fieldset><legend>送信する内容</legend>
        <label><input type="checkbox" checked={includeSelection && !!selection?.text} disabled={!selection?.text || busy} onChange={event => setIncludeSelection(event.target.checked)}/> 選択範囲 {selection?.text ? `(${selection.text.length.toLocaleString()}字)` : '（執筆本文で文字を選択すると利用できます）'}</label>
        <label><input type="checkbox" checked={includeScene && !!scene} disabled={!scene || busy} onChange={event => setIncludeScene(event.target.checked)}/> 現在のシーン {node ? `「${node.title}」(${sceneText.length.toLocaleString()}字)` : '（執筆画面でノードを開いてください）'}</label>
        {snapshot.entities.length > 0 && <details><summary>設定資料を追加（{entityIds.length}件）</summary><small>一度に最大12件まで</small><div className="ai-assistant__entities">{snapshot.entities.map(entity => <label key={entity.id}><input type="checkbox" checked={entityIds.includes(entity.id)} disabled={busy || (!entityIds.includes(entity.id) && entityIds.length >= 12)} onChange={event => setEntityIds(current => event.target.checked ? [...current, entity.id] : current.filter(id => id !== entity.id))}/>{entity.name}</label>)}</div></details>}
      </fieldset>
      <p className="ai-assistant__privacy">送信前に対象を確認します。会話はこの画面だけに保持し、作品や履歴へ保存しません。AIサービス側のデータ保持条件は設定文書を確認してください。</p>
      {error && <p className="ai-assistant__error" role="alert">{error}</p>}
      <button className="ai-assistant__submit" type="button" disabled={busy || !task.trim()} onClick={() => void submit()}>{busy ? 'AIへ問い合わせ中…' : '内容を確認して相談'}</button>
      {busy && <button type="button" onClick={() => abort.current?.abort()}>キャンセル</button>}
      {proposal && <section className="ai-assistant__proposal"><h3>提案</h3>{usage && <small>使用量: {usage}</small>}{stale && <p className="ai-assistant__error">提案後に本文が変わったため、適用できません。内容をコピーしてください。</p>}<details><summary>変更前を確認</summary><pre>{source?.before}</pre></details><pre>{proposal}</pre>{source?.acceptedAsSelection && source.safeForReplacement && canApplySelection && <button disabled={stale} onClick={applySelection}>選択範囲へ適用（Undoで戻せます）</button>}{source?.acceptedAsSelection && !source.safeForReplacement && <p>書式・段落・内部参照を含む範囲のため、自動適用を無効にしています。</p>}<button onClick={() => void navigator.clipboard.writeText(proposal).catch(() => setError('クリップボードへコピーできませんでした。'))}>提案をコピー</button><button onClick={() => { setProposal(''); setSource(undefined); }}>破棄</button></section>}
    </div>
  </aside>;
}
