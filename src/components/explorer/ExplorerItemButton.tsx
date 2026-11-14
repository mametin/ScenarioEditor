'use client';
import type { ReactNode } from 'react';

export default function ExplorerItemButton({ icon, name, detail, selected, onClick, title, trailing, className = '' }: { icon: string; name: string; detail?: string; selected: boolean; onClick: () => void; title?: string; trailing?: ReactNode; className?: string }) {
  return <button type="button" className={`explorer-item-button ${className}`} aria-pressed={selected} title={title ?? `${name}${detail ? ` · ${detail}` : ''}`} onClick={onClick}>
    <span className="explorer-node-icon" aria-hidden="true">{icon}</span>
    <span className="explorer-node-text"><span className="explorer-node-name">{name}</span>{detail && <small>{detail}</small>}</span>
    {trailing}
  </button>;
}
