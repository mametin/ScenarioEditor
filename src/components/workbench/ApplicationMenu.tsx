'use client';
import { useEffect, useRef, useState } from 'react';
import './application-menu.css';

export type ApplicationMenuGroup = {
  label: string;
  items: { label: string; action: () => void; disabled?: boolean; checked?: boolean; shortcut?: string }[];
};

export default function ApplicationMenu({ groups }: { groups: ApplicationMenuGroup[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const initialItem = useRef<'first' | 'last'>('first');
  useEffect(() => {
    if (open === null) return;
    const items = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    (initialItem.current === 'last' ? items?.[items.length - 1] : items?.[0])?.focus();
    initialItem.current = 'first';
  }, [open]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(null);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  function close(restoreFocus = true) {
    if (restoreFocus && open !== null) triggers.current[open]?.focus();
    setOpen(null);
  }
  return <nav ref={root} className="application-menu" aria-label="アプリケーションメニュー" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(null);
  }}>
    {groups.map((group, index) => <div className="application-menu-group" key={group.label}>
      <button ref={element => { triggers.current[index] = element; }} type="button" className="application-menu-trigger"
        id={`application-menu-trigger-${index}`} aria-haspopup="menu" aria-expanded={open === index}
        aria-controls={open === index ? `application-menu-panel-${index}` : undefined}
        onClick={() => setOpen(current => current === index ? null : index)} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); initialItem.current = event.key === 'ArrowUp' ? 'last' : 'first'; setOpen(index);
          } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault(); triggers.current[(index + (event.key === 'ArrowRight' ? 1 : groups.length - 1)) % groups.length]?.focus();
          }
        }}>{group.label}</button>
      {open === index && <div ref={panel} id={`application-menu-panel-${index}`} className="application-menu-panel" role="menu" aria-labelledby={`application-menu-trigger-${index}`} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
          items[next]?.focus();
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault(); setOpen((index + (event.key === 'ArrowRight' ? 1 : groups.length - 1)) % groups.length);
        } else if (event.key === 'Tab') {
          // Return to the trigger before the browser advances to the next focusable control.
          close();
        }
      }}>
        {group.items.map(item => <button type="button" key={item.label} role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={item.checked}
          disabled={item.disabled} tabIndex={-1} onClick={() => { close(); item.action(); }}>
          <span className="application-menu-check" aria-hidden="true">{item.checked ? '✓' : ''}</span><span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}
        </button>)}
      </div>}
    </div>)}
  </nav>;
}
