import { describe, expect, it } from 'vitest';
import { createProject } from '../domain/project';
import { createNode, filterNodes } from '../domain/graph';
import { explorerPreferencesKey, normalizeExplorerPreferences, readExplorerPreferences, writeExplorerPreferences } from '../components/explorer/preferences';

describe('エクスプローラー表示設定', () => {
  it('壊れた値と削除済みIDを安全な初期値へ戻す', () => {
    const snapshot = createProject();
    const nodeId = createNode(snapshot, { x: 10, y: 20 }, '残すノード');
    const tagId = crypto.randomUUID(); snapshot.tags.push({ id: tagId, name: '重要', color: '#000000' });
    const result = normalizeExplorerPreferences({ width: 9999, selectedNodeId: crypto.randomUUID(), collapsedNodeIds: [nodeId, crypto.randomUUID(), nodeId], scrollTop: -4, query: 17, typeId: crypto.randomUUID(), tagIds: [tagId, crypto.randomUUID()], tagMode: 'unexpected' }, snapshot);
    expect(result).toEqual({ width: 520, selectedNodeId: null, collapsedNodeIds: [nodeId], scrollTop: 0, query: '', typeId: '', tagIds: [tagId], tagMode: 'or' });
  });
  it('プロジェクトごとに別キーを使い、保存領域が使えないときも例外にしない', () => {
    expect(explorerPreferencesKey('project-a')).not.toBe(explorerPreferencesKey('project-b'));
    const snapshot = createProject();
    expect(readExplorerPreferences(snapshot.project.id, snapshot).width).toBe(280);
    expect(writeExplorerPreferences(snapshot.project.id, readExplorerPreferences(snapshot.project.id, snapshot))).toBe(false);
  });
  it('1,000ノードから名称一致を検索できる', () => {
    const snapshot = createProject(); const ids: string[] = [];
    for (let index = 0; index < 1000; index++) ids.push(createNode(snapshot, { x: index, y: index }, `シーン ${index}`));
    const started = performance.now();
    const result = filterNodes(snapshot, 'シーン 999', '', [], 'or');
    expect([...result]).toEqual([ids[999]]);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
