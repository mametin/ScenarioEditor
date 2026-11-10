'use client';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

export type PanelPosition = { x: number; y: number };

export default function FloatingPanel({ title, position, onPositionChange, onClose, onActivate, zIndex, className = '', children }: {
  title: string;
  position: PanelPosition;
  onPositionChange: (position: PanelPosition) => void;
  onClose: () => void;
  onActivate: () => void;
  zIndex: number;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button,input,select,textarea,[contenteditable="true"]')) return;
    event.preventDefault(); onActivate();
    const startX = event.clientX, startY = event.clientY;
    const initial = position;
    const move = (pointer: PointerEvent) => {
      const rect = panelRef.current?.getBoundingClientRect();
      const maxX = Math.max(8, window.innerWidth - (rect?.width ?? 280) - 8);
      const maxY = Math.max(8, window.innerHeight - 48);
      onPositionChange({ x: Math.max(8, Math.min(maxX, initial.x + pointer.clientX - startX)), y: Math.max(8, Math.min(maxY, initial.y + pointer.clientY - startY)) });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      cleanupRef.current = null;
    };
    cleanupRef.current?.(); cleanupRef.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  return <section ref={panelRef} className={`graph-floating-panel ${className}`} style={{ left: position.x, top: position.y, zIndex }} onPointerDown={onActivate}>
    <header className="graph-floating-panel__header" onPointerDown={startDrag}><strong>{title}</strong><button type="button" aria-label={`${title}を閉じる`} onClick={onClose}>×</button></header>
    <div className="graph-floating-panel__body">{children}</div>
  </section>;
}
