'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot, Content } from '../../domain/schema';
import { ENTITY_HOVER_EVENT, type EntityHoverDetail } from './entity-hover';
import './entity-hover.css';

function textOf(content: Content[], snapshot: Snapshot): string {
  return content.map(item => {
    if (item.kind === 'text' || item.kind === 'nodeLink') return item.text;
    if (item.kind === 'entity') {
      const entity = snapshot.entities.find(candidate => candidate.id === item.reference.entityId);
      return entity?.name ?? '（削除された設定資料）';
    }
    if (item.style === 'divider') return '';
    return textOf(item.children, snapshot);
  }).join(' ').replace(/\s+/g, ' ').trim();
}

export default function EntityHoverCard({ snapshot, onOpen }: { snapshot: Snapshot; onOpen: (id: string) => void }) {
  const [shown, setShown] = useState<{ id: string; left: number; top: number; pinned: boolean }>();
  const timer = useRef<number | undefined>(undefined);
  const entity = useMemo(() => snapshot.entities.find(item => item.id === shown?.id), [snapshot, shown?.id]);
  const description = useMemo(() => {
    if (!entity) return '';
    const doc = snapshot.documents.find(item => item.id === entity.descriptionDocumentId);
    return doc ? textOf(doc.content, snapshot) : '';
  }, [entity, snapshot]);

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<EntityHoverDetail>).detail;
      if (detail.action === 'hide') {
        if (shown?.id !== detail.entityId || shown.pinned) return;
        timer.current = window.setTimeout(() => setShown(undefined), 180);
        return;
      }
      if (timer.current) window.clearTimeout(timer.current);
      setShown({ id: detail.entityId, left: detail.left ?? 0, top: detail.top ?? 0, pinned: Boolean(detail.pinned) });
    };
    window.addEventListener(ENTITY_HOVER_EVENT, handle);
    return () => { window.removeEventListener(ENTITY_HOVER_EVENT, handle); if (timer.current) window.clearTimeout(timer.current); };
  }, [shown]);

  if (!shown) return null;
  const width = Math.min(360, window.innerWidth - 24);
  const left = Math.max(12, Math.min(shown.left, window.innerWidth - width - 12));
  const top = Math.max(12, Math.min(shown.top + 8, window.innerHeight - 300));
  return <aside className="entity-hover-card" role="dialog" aria-label="設定資料の詳細" style={{ left, top, width }} onPointerEnter={() => { if (timer.current) window.clearTimeout(timer.current); }} onPointerLeave={() => { if (!shown.pinned) timer.current = window.setTimeout(() => setShown(undefined), 180); }}>
    <div className="entity-hover-heading"><div><span>{entity?.category ?? 'リンク切れ'}</span><strong>{entity?.name ?? '設定資料が見つかりません'}</strong></div><button type="button" aria-label="詳細を閉じる" onClick={() => setShown(undefined)}>×</button></div>
    {entity ? <>
      {entity.aliases.length > 0 && <p className="entity-hover-aliases"><b>別名</b> {entity.aliases.map(alias => alias.name).join('、')}</p>}
      <p className="entity-hover-description">{description || '説明はありません。'}</p>
      <button type="button" className="entity-hover-open" onClick={() => { setShown(undefined); onOpen(entity.id); }}>設定資料を開く ↗</button>
    </> : <p className="entity-hover-description">参照先が削除されたか、このプロジェクトに存在しません。</p>}
  </aside>;
}
