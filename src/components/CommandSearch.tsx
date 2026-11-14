'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { searchScenario, type ScenarioSearchResult } from '../domain/search';
import type { Snapshot } from '../domain/schema';

export default function CommandSearch({ snapshot, onClose, onOpen }: {
  snapshot: Snapshot;
  onClose: () => void;
  onOpen: (result: Pick<ScenarioSearchResult, 'kind' | 'id'>) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const results = useMemo(() => searchScenario(snapshot, query), [snapshot, query]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);
  useEffect(() => { setActiveIndex(0); }, [query]);

  function choose(result: ScenarioSearchResult | undefined) {
    if (!result) return;
    onOpen({ kind: result.kind, id: result.id });
  }

  return <div className="command-search-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="command-search" role="dialog" aria-modal="true" aria-labelledby="command-search-title" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      else if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setActiveIndex(index => (index + 1) % results.length); }
      else if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setActiveIndex(index => (index - 1 + results.length) % results.length); }
      else if (event.key === 'Enter') { event.preventDefault(); choose(results[activeIndex]); }
      else if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('input,button:not(:disabled)');
        if (!focusable?.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <h2 id="command-search-title">プロジェクト内を検索</h2>
      <input ref={inputRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ノード本文・設定資料・タグを検索" aria-label="プロジェクト内を検索" />
      <div className="command-search-results" role="listbox" aria-label="検索結果">
        {!query.trim() ? <p className="command-search-hint">ノード名、本文、設定資料、別名、タグを検索できます。</p> : results.length === 0 ? <p className="command-search-hint">一致する項目がありません。</p> : results.map((result, index) => <button type="button" role="option" aria-selected={index === activeIndex} className="command-search-result" key={`${result.kind}:${result.id}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(result)}>
          <span className="command-search-result__icon" aria-hidden="true">{result.kind === 'node' ? '¶' : '◈'}</span>
          <span className="command-search-result__body"><strong>{result.title}</strong><small>{result.context}</small>{result.excerpt && <span className="command-search-result__excerpt">{result.excerpt}</span>}</span>
          <kbd>Enter</kbd>
        </button>)}
      </div>
      <footer><span>↑↓ 移動</span><span>Enter 開く</span><span>Esc 閉じる</span></footer>
    </section>
  </div>;
}
