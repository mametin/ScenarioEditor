'use client';
import type { Content, Snapshot } from '../../domain/schema';
import { resolveReference } from '../../domain/project';

function contentText(content: Content[], snapshot: Snapshot): string {
  return content.map(item => {
    if (item.kind === 'text') return item.text;
    if (item.kind === 'entity') return resolveReference(item.reference, snapshot).text;
    if (item.kind === 'nodeLink') return snapshot.nodes.find(node => node.id === item.nodeId)?.title ?? item.text;
    if (item.style === 'divider') return '────────';
    const nested = contentText(item.children, snapshot);
    if (item.style === 'listItem') return `• ${nested}\n`;
    if (item.style === 'readAloud') return `読み上げ：${nested}\n\n`;
    if (item.style === 'kp') return `KP：${nested}\n\n`;
    return `${nested}\n\n`;
  }).join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export default function PinnedReferencePanel({ snapshot, entityId, onOpen, onClose }: { snapshot: Snapshot; entityId: string | null; onOpen: (id: string) => void; onClose: () => void }) {
  const entity = entityId ? snapshot.entities.find(item => item.id === entityId) : undefined;
  if (!entity) return null;
  const document = snapshot.documents.find(item => item.id === entity.descriptionDocumentId);
  const description = document ? contentText(document.content, snapshot) : '';
  return <aside className="pinned-reference" aria-label="固定した設定資料">
    <header><div><small>固定した資料</small><h2>{entity.name || '無名'}</h2></div><button type="button" aria-label="資料パネルを閉じる" title="閉じる" onClick={onClose}>×</button></header>
    <p className="pinned-reference-category">{entity.category}</p>
    {entity.aliases.length > 0 && <p className="pinned-reference-aliases">別名：{entity.aliases.map(alias => alias.name).join('、')}</p>}
    {entity.tagIds.length > 0 && <p className="pinned-reference-tags">{entity.tagIds.map(id => snapshot.tags.find(tag => tag.id === id)?.name).filter(Boolean).join(' · ')}</p>}
    <div className="pinned-reference-description">{description || '説明はまだありません。'}</div>
    <button type="button" className="pinned-reference-open" onClick={() => onOpen(entity.id)}>設定資料を開く</button>
  </aside>;
}
