'use client';
import { useEffect, useState } from 'react';

const historyKey = 'scenario-editor-color-history';
const historyEvent = 'scenario-editor-color-history-change';
const validColor = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value);
function readHistory(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(historyKey) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && validColor(value)).slice(0, 8) : [];
  } catch { return []; }
}
function remember(value: string): string[] {
  const history = [value.toLowerCase(), ...readHistory().filter(color => color.toLowerCase() !== value.toLowerCase())].slice(0, 8);
  try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch { /* Recent colors are a convenience and can stay in memory. */ }
  window.dispatchEvent(new CustomEvent(historyEvent, { detail: history }));
  return history;
}
export default function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => {
    setHistory(readHistory());
    const update = (event: Event) => { const colors = (event as CustomEvent<string[]>).detail; if (Array.isArray(colors)) setHistory(colors); };
    const fromOtherTab = (event: StorageEvent) => { if (event.key === historyKey) setHistory(readHistory()); };
    window.addEventListener(historyEvent, update); window.addEventListener('storage', fromOtherTab);
    return () => { window.removeEventListener(historyEvent, update); window.removeEventListener('storage', fromOtherTab); };
  }, []);
  const color = validColor(value) ? value : '#657e6d';
  return <div className="color-picker">
    <label className="color-picker-main">{label}<input aria-label={label} type="color" value={color} onChange={event => onChange(event.currentTarget.value)} onBlur={() => setHistory(remember(color))}/></label>
    <div className="color-history" aria-label={`${label}のカラー履歴`}><span>最近使った色</span>{history.map(recent => <button type="button" key={recent} title={recent} aria-label={`${recent}を選択`} style={{ backgroundColor: recent }} onClick={() => { onChange(recent); setHistory(remember(recent)); }}/>)}</div>
  </div>;
}
