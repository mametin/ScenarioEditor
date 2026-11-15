'use client';
import type { MouseEvent, ReactNode } from 'react';

export default function ExplorerItemButton({ icon, name, detail, selected, onClick, title, trailing, className = '', id }: { icon: string; name: string; detail?: string; selected: boolean; onClick: (event: MouseEvent<HTMLButtonElement>) => void; title?: string; trailing?: ReactNode; className?: string; id?: string }) {
  return <button type="button" id={id} className={`explorer-item-button ${className}`} aria-pressed={selected} title={title ?? `${name}${detail ? ` · ${detail}` : ''}`} onClick={onClick}>
    <span className="explorer-node-icon" aria-hidden="true">{icon}</span>
    <span className="explorer-node-text"><span className="explorer-node-name">{name}</span>{detail && <small>{detail}</small>}</span>
    {trailing}
  </button>;
}
