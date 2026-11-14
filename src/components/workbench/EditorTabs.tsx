'use client';
import type { EditorTab } from './session';
import { editorTargetKey } from './session';

export default function EditorTabs({ tabs, activeKey, titleFor, canBack, canForward, onBack, onForward, onActivate, onClose, onTogglePin }: {
  tabs: EditorTab[];
  activeKey: string | null;
  titleFor: (tab: EditorTab) => string;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onActivate: (tab: EditorTab) => void;
  onClose: (tab: EditorTab) => void;
  onTogglePin: (tab: EditorTab) => void;
}) {
  if (!tabs.length) return null;
  return <nav className="editor-tabs" aria-label="開いている項目">
    <div className="editor-history-controls"><button type="button" aria-label="前の項目へ戻る" title="前の項目へ戻る" disabled={!canBack} onClick={onBack}>←</button><button type="button" aria-label="次の項目へ進む" title="次の項目へ進む" disabled={!canForward} onClick={onForward}>→</button></div>
    <div className="editor-tabs-list">{tabs.map(tab => {
      const key = editorTargetKey(tab);
      const title = titleFor(tab);
      return <div className={`editor-tab${activeKey === key ? ' is-active' : ''}${tab.pinned ? ' is-pinned' : ' is-preview'}`} key={key}>
        <button type="button" className="editor-tab-open" aria-current={activeKey === key ? 'page' : undefined} title={`${title}${tab.pinned ? ' · 固定' : ' · プレビュー'}`} onClick={() => onActivate(tab)}><span aria-hidden="true">{tab.kind === 'node' ? '¶' : '◈'}</span><span className="editor-tab-title">{title}</span></button>
        <button type="button" className="editor-tab-pin" aria-label={tab.pinned ? `${title}の固定を解除` : `${title}をタブに固定`} title={tab.pinned ? '固定を解除' : 'タブに固定'} onClick={() => onTogglePin(tab)}>{tab.pinned ? '◆' : '◇'}</button>
        <button type="button" className="editor-tab-close" aria-label={`${title}を閉じる`} title="閉じる" onClick={() => onClose(tab)}>×</button>
      </div>;
    })}</div>
  </nav>;
}
