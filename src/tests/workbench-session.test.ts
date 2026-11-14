import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../domain/project';
import { createNode } from '../domain/graph';
import { closeEditorTab, editorTargetKey, openEditorTab, pinEditorTab, readEditorTabs, type EditorTabsState } from '../components/workbench/session';

function fixture() {
  const snapshot = createProject('作業タブ');
  const first = createNode(snapshot, { x: 0, y: 0 }, '導入');
  const second = createNode(snapshot, { x: 100, y: 0 }, '探索');
  return { snapshot, first, second };
}

afterEach(() => vi.unstubAllGlobals());

describe('執筆タブと移動履歴', () => {
  it('未固定のプレビュータブを置き換え、固定タブは保持する', () => {
    const { first, second } = fixture();
    let state: EditorTabsState = { tabs: [], activeKey: null };
    state = openEditorTab(state, { kind: 'node', id: first }, true);
    state = openEditorTab(state, { kind: 'node', id: second });
    expect(state.tabs.map(tab => [tab.id, tab.pinned])).toEqual([[first, true], [second, false]]);
    const third = crypto.randomUUID();
    state = openEditorTab(state, { kind: 'entity', id: third });
    expect(state.tabs.map(tab => tab.id)).toEqual([first, third]);
    expect(state.activeKey).toBe(`entity:${third}`);
  });

  it('タブの固定を切り替え、閉じたとき次のタブを選ぶ', () => {
    const { first, second } = fixture();
    let state: EditorTabsState = { tabs: [], activeKey: null };
    state = openEditorTab(state, { kind: 'node', id: first });
    state = pinEditorTab(state, `node:${first}`);
    state = openEditorTab(state, { kind: 'node', id: second });
    state = closeEditorTab(state, `node:${second}`);
    expect(state.activeKey).toBe(`node:${first}`);
    expect(state.tabs).toHaveLength(1);
  });

  it('読み込み時に削除済みIDや壊れたタブを除く', () => {
    const { snapshot, first } = fixture();
    const store = new Map([[`scenario-editor-tabs:${snapshot.project.id}`, JSON.stringify({ tabs: [
      { kind: 'node', id: first, pinned: true },
      { kind: 'node', id: 'deleted-node', pinned: false },
      { kind: 'unknown', id: 'broken', pinned: false },
    ], activeKey: 'node:deleted-node' })]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null });
    const restored = readEditorTabs(snapshot.project.id, snapshot);
    expect(restored.tabs).toEqual([{ kind: 'node', id: first, pinned: true }]);
    expect(restored.activeKey).toBe(editorTargetKey(restored.tabs[0]));
  });

  it('保存領域が利用できなくても空の状態へ安全に戻る', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(readEditorTabs('project', fixture().snapshot)).toEqual({ tabs: [], activeKey: null });
  });
});
