import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createProject } from '../domain/project';
import { createNode, filterNodes } from '../domain/graph';
import { createOrganizerFolder, deleteOrganizerFolder, filterNodesByOrganizerFolder, moveNodesToOrganizerFolder } from '../domain/organization';
import { parseSnapshot } from '../domain/schema';
import { openExplorerNode, revealExplorerNode } from '../components/explorer/navigation';
import ExplorerItemButton from '../components/explorer/ExplorerItemButton';
import { explorerPreferencesKey, normalizeExplorerPreferences, readExplorerPreferences, writeExplorerPreferences } from '../components/explorer/preferences';

describe('エクスプローラー表示設定', () => {
  it('壊れた値と削除済みIDを安全な初期値へ戻す', () => {
    const snapshot = createProject();
    const nodeId = createNode(snapshot, { x: 10, y: 20 }, '残すノード');
    const tagId = crypto.randomUUID(); snapshot.tags.push({ id: tagId, name: '重要', color: '#000000' });
    const result = normalizeExplorerPreferences({ width: 9999, selectedNodeId: crypto.randomUUID(), collapsedNodeIds: [nodeId, crypto.randomUUID(), nodeId], scrollTop: -4, query: 17, typeId: crypto.randomUUID(), tagIds: [tagId, crypto.randomUUID()], tagMode: 'unexpected' }, snapshot);
    expect(result).toEqual({ width: 520, selectedNodeId: null, collapsedNodeIds: [nodeId], scrollTop: 0, query: '', typeId: '', tagIds: [tagId], tagMode: 'or', folderFilterId: null, selectedNodeIds: [], savedSearches: [] });
  });
  it('削除済みフォルダーの絞り込みと保存検索参照を解除する', () => { const snapshot = createProject(); const result = normalizeExplorerPreferences({ folderFilterId: crypto.randomUUID(), savedSearches: [{ id: 'folder-search', name: '古いフォルダー', folderFilterId: crypto.randomUUID() }] }, snapshot); expect(result.folderFilterId).toBeNull(); expect(result.savedSearches[0].folderFilterId).toBeNull(); });
  it('矢印移動のフォーカス先となる項目IDを開くボタン自身に付ける', () => {
    const html = renderToStaticMarkup(createElement(ExplorerItemButton, { id: 'scenario-explorer-node-a', icon: '¶', name: '場面A', selected: false, onClick: () => {} }));
    expect(html).toContain('<button type="button" id="scenario-explorer-node-a"');
  });
  it('検索結果を開くと手動の折りたたみ状態を保ち、明示的な表示はフォルダー条件も解除する', () => {
    const snapshot = createProject();
    const parentId = createNode(snapshot, { x: 0, y: 0 }, '親');
    const otherParentId = createNode(snapshot, { x: 0, y: 0 }, '別の親');
    const tagId = crypto.randomUUID(); snapshot.tags.push({ id: tagId, name: 'タグ', color: '#000000' });
    const foldered = createOrganizerFolder(snapshot, 'フォルダーB');
    const base = normalizeExplorerPreferences({ query: '子', typeId: snapshot.nodeTypes[0].id, tagIds: [tagId], folderFilterId: foldered.organizerFolders[0].id, collapsedNodeIds: [parentId, otherParentId] }, foldered);
    const searched = openExplorerNode(base, '子ノード', true, [parentId]);
    expect(searched.selectedNodeId).toBe('子ノード');
    expect(searched.collapsedNodeIds).toEqual([parentId, otherParentId]);
    expect(searched.query).toBe('子');
    expect(searched.folderFilterId).toBe(foldered.organizerFolders[0].id);
    const revealed = revealExplorerNode(searched, [parentId]);
    expect(revealed.query).toBe('');
    expect(revealed.typeId).toBe('');
    expect(revealed.tagIds).toEqual([]);
    expect(revealed.folderFilterId).toBeNull();
    expect(revealed.collapsedNodeIds).toEqual([otherParentId]);
  });
  it('外部からの表示で検索やフォルダー条件が対象を隠す場合は解除して祖先を開く', () => {
    const snapshot = createProject(); const parentId = createNode(snapshot, { x: 0, y: 0 }, '親'); const otherId = createNode(snapshot, { x: 0, y: 0 }, '他');
    const base = normalizeExplorerPreferences({ query: '別の語', folderFilterId: 'folder-b', collapsedNodeIds: [parentId, otherId] }, snapshot);
    const opened = openExplorerNode(base, '子ノード', false, [parentId]);
    expect(opened.selectedNodeId).toBe('子ノード');
    expect(opened.query).toBe('');
    expect(opened.folderFilterId).toBeNull();
    expect(opened.collapsedNodeIds).toEqual([otherId]);
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
  it('1,000ノードを整理フォルダーで絞り込める', () => { const snapshot = createProject(); const ids: string[] = []; for (let index = 0; index < 1000; index++) ids.push(createNode(snapshot, { x: index, y: 0 }, `場面 ${index}`)); const foldered = createOrganizerFolder(snapshot, '一括'); const folder = foldered.organizerFolders[0]; const assigned = moveNodesToOrganizerFolder(foldered, ids.slice(0, 500), folder.id); const started = performance.now(); expect(filterNodesByOrganizerFolder(assigned, new Set(ids), folder.id).size).toBe(500); expect(performance.now() - started).toBeLessThan(1000); });
  it('保存検索のタグとタイプを検証し、削除済みの項目選択を除外する', () => {
    const snapshot = createProject(); const nodeId = crypto.randomUUID(); const typeId = snapshot.nodeTypes[0].id; const tagId = crypto.randomUUID(); snapshot.tags.push({ id: tagId, name: '重要', color: '#000000' });
    const result = normalizeExplorerPreferences({ selectedNodeIds: [nodeId], savedSearches: [{ id: 'saved-1', name: '未完成', query: '準備', typeId, tagIds: [tagId, nodeId], tagMode: 'and' }, { id: 'saved-2', name: '削除済みタイプ', typeId: nodeId, tagIds: [nodeId] }] }, snapshot);
    expect(result.selectedNodeIds).toEqual([]); expect(result.savedSearches).toEqual([{ id: 'saved-1', name: '未完成', query: '準備', typeId, tagIds: [tagId], tagMode: 'and', folderFilterId: null }, { id: 'saved-2', name: '削除済みタイプ', query: '', typeId: '', tagIds: [], tagMode: 'or', folderFilterId: null }]);
  });
  it('整理フォルダーの移動はグラフ座標とアウトライン順から独立し、削除時にデータを保持する', () => {
    const snapshot = createProject(); const first = createNode(snapshot, { x: 11, y: 12 }, '一'); const second = createNode(snapshot, { x: 30, y: 40 }, '二'); snapshot.outline.push({ id: crypto.randomUUID(), parentId: null, nodeId: first, title: '章', order: 7 });
    const root = createOrganizerFolder(snapshot, '準備'); const child = createOrganizerFolder(root, 'NPC', root.organizerFolders[0].id);
    const moved = moveNodesToOrganizerFolder(child, [first, second], child.organizerFolders[1].id);
    expect(moved.organizerFolders[1].nodeIds).toEqual([first, second]); expect(moved.nodes.map(node => node.position)).toEqual(snapshot.nodes.map(node => node.position)); expect(moved.outline).toEqual(snapshot.outline); expect(moved.nodes.map(node => node.parentGroupId)).toEqual([null, null]);
    const deleted = deleteOrganizerFolder(moved, root.organizerFolders[0].id); expect(deleted.organizerFolders[0].parentId).toBeNull(); expect(deleted.organizerFolders[0].nodeIds).toEqual([first, second]); expect(deleted.nodes).toEqual(moved.nodes);
    expect(filterNodesByOrganizerFolder(moved, new Set([first, second]), root.organizerFolders[0].id)).toEqual(new Set([first, second])); expect(filterNodesByOrganizerFolder(moved, new Set([first, second]), '')).toEqual(new Set());
    expect(() => moveNodesToOrganizerFolder(moved, [first], crypto.randomUUID())).toThrow();
  });
  it('子フォルダー削除は入力snapshotを変更せず、所属と兄弟順を保って子を昇格する', () => {
    const snapshot = createProject();
    const nodeA = createNode(snapshot, { x: 10, y: 20 }, '親所属');
    const nodeB = createNode(snapshot, { x: 30, y: 40 }, '削除対象所属');
    const nodeC = createNode(snapshot, { x: 50, y: 60 }, '孫所属');
    const nodeD = createNode(snapshot, { x: 70, y: 80 }, '兄弟所属');
    snapshot.outline.push({ id: crypto.randomUUID(), parentId: null, nodeId: nodeA, title: '章順', order: 8 });
    let folders = createOrganizerFolder(snapshot, '親');
    const parentId = folders.organizerFolders[0].id;
    folders = createOrganizerFolder(folders, '兄弟', null);
    const siblingId = folders.organizerFolders[1].id;
    folders = moveNodesToOrganizerFolder(folders, [nodeA], parentId);
    folders = createOrganizerFolder(folders, '削除対象', parentId);
    const deletedId = folders.organizerFolders.find(item => item.name === '削除対象')!.id;
    folders = moveNodesToOrganizerFolder(folders, [nodeB], deletedId);
    folders = createOrganizerFolder(folders, '孫', deletedId);
    const grandchildId = folders.organizerFolders.find(item => item.name === '孫')!.id;
    folders = moveNodesToOrganizerFolder(folders, [nodeC], grandchildId);
    folders = moveNodesToOrganizerFolder(folders, [nodeD], siblingId);
    const before = structuredClone(folders);

    const deleted = deleteOrganizerFolder(folders, deletedId);

    expect(folders).toEqual(before);
    expect(parseSnapshot(folders)).toEqual(before);
    expect(parseSnapshot(deleted)).toEqual(deleted);
    expect(deleted.organizerFolders.find(item => item.id === parentId)).toMatchObject({ nodeIds: [nodeA, nodeB] });
    expect(deleted.organizerFolders.find(item => item.id === grandchildId)).toMatchObject({ parentId, nodeIds: [nodeC], order: 0 });
    expect(deleted.organizerFolders.find(item => item.id === siblingId)).toMatchObject({ parentId: null, nodeIds: [nodeD], order: 1 });
    expect(deleted.nodes.map(node => node.position)).toEqual(before.nodes.map(node => node.position));
    expect(deleted.nodes.map(node => node.parentGroupId)).toEqual(before.nodes.map(node => node.parentGroupId));
    expect(deleted.outline).toEqual(before.outline);
  });
});
