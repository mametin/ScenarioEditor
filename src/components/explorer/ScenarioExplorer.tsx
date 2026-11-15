'use client';
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { Snapshot } from '../../domain/schema';
import { filterNodes } from '../../domain/graph';
import { filterNodesByOrganizerFolder } from '../../domain/organization';
import { normalizeExplorerPreferences, readExplorerPreferences, writeExplorerPreferences, type ExplorerPreferences } from './preferences';
import ExplorerItemButton from './ExplorerItemButton';
import './explorer.css';

export function useExplorerPreferences(projectId: string, snapshot: Snapshot) {
  const [preferences, setPreferences] = useState<ExplorerPreferences>(() => readExplorerPreferences(projectId, snapshot));
  const preferencesRef = useRef(preferences); preferencesRef.current = preferences;
  useEffect(() => { setPreferences(readExplorerPreferences(projectId, snapshot)); }, [projectId]);
  useEffect(() => {
    const safe = normalizeExplorerPreferences(preferences, snapshot);
    if (JSON.stringify(safe) !== JSON.stringify(preferences)) setPreferences(safe);
  }, [snapshot.nodes, snapshot.nodeTypes, snapshot.tags, snapshot.organizerFolders]);
  useEffect(() => { const timer = window.setTimeout(() => writeExplorerPreferences(projectId, preferences), 120); return () => window.clearTimeout(timer); }, [projectId, preferences]);
  useEffect(() => () => { writeExplorerPreferences(projectId, preferencesRef.current); }, [projectId]);
  return { preferences, setPreferences };
}

type Props = {
  snapshot: Snapshot;
  preferences: ExplorerPreferences;
  setPreferences: Dispatch<SetStateAction<ExplorerPreferences>>;
  selectedIds?: Set<string>;
  onOpenNode: (id: string) => void;
  onToggleNode?: (id: string, selected: boolean) => void;
  onCreateNode: () => void;
  onRenameNode: (id: string, title: string) => void;
  onReorder: (sourceId: string, targetId: string, before: boolean) => void;
  onBulkTag?: (ids: string[], tagId: string, action: 'add' | 'remove') => void;
  onBulkMove?: (ids: string[], parentId: string | null) => void;
  onCreateFolder?: (name: string, parentId: string | null) => void;
  onRenameFolder?: (id: string, name: string) => void;
  onDeleteFolder?: (id: string) => void;
  onBulkFolderMove?: (ids: string[], folderId: string | null) => void;
  children?: ReactNode;
  disabled?: boolean;
  title?: string;
  className?: string;
};

export default function ScenarioExplorer({ snapshot, preferences, setPreferences, selectedIds, onOpenNode, onToggleNode, onCreateNode, onRenameNode, onReorder, onBulkTag, onBulkMove, onCreateFolder, onRenameFolder, onDeleteFolder, onBulkFolderMove, children: extraContent, disabled = false, title = 'シーン', className = '' }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const initialSelection = useRef(preferences.selectedNodeId);
  const dragId = useRef<string | undefined>(undefined);
  const scrollSaveTimer = useRef<number | undefined>(undefined);
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null);
  const [tagQuery, setTagQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string>();
  const [renameDraft, setRenameDraft] = useState('');
  const [savedSearchName, setSavedSearchName] = useState('');
  const [bulkTagId, setBulkTagId] = useState('');
  const [bulkTagAction, setBulkTagAction] = useState<'add' | 'remove'>('add');
  const [moveTargetId, setMoveTargetId] = useState('');
  const [folderTargetId, setFolderTargetId] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const filtersActive = !!preferences.query.trim() || !!preferences.typeId || preferences.tagIds.length > 0 || preferences.folderFilterId !== null;
  const matches = useMemo(() => {
    const matching = filterNodes(snapshot, preferences.query, preferences.typeId, preferences.tagIds, preferences.tagMode);
    return filterNodesByOrganizerFolder(snapshot, matching, preferences.folderFilterId);
  }, [snapshot, preferences.query, preferences.typeId, preferences.tagIds, preferences.tagMode, preferences.folderFilterId]);
  const { childMap, nodeMap } = useMemo(() => {
    const childMap = new Map<string | null, Snapshot['nodes']>();
    const nodeMap = new Map(snapshot.nodes.map(node => [node.id, node]));
    for (const node of snapshot.nodes) {
      const siblings = childMap.get(node.parentGroupId);
      if (siblings) siblings.push(node); else childMap.set(node.parentGroupId, [node]);
    }
    return { childMap, nodeMap };
  }, [snapshot.nodes]);
  const visibleIds = useMemo(() => {
    const visible = new Set(matches);
    for (const id of matches) {
      let parentId = nodeMap.get(id)?.parentGroupId ?? null;
      while (parentId && !visible.has(parentId)) {
        visible.add(parentId);
        parentId = nodeMap.get(parentId)?.parentGroupId ?? null;
      }
    }
    return visible;
  }, [matches, nodeMap]);
  const searchableTagList = snapshot.tags.filter(tag => tag.name.toLocaleLowerCase().includes(tagQuery.toLocaleLowerCase()));
  const activeSelection = onToggleNode ? (selectedIds ?? new Set<string>()) : new Set(preferences.selectedNodeIds);
  const visibleOrder = useMemo(() => {
    const ids: string[] = [];
    const visit = (node: Snapshot['nodes'][number]) => {
      if (!visibleIds.has(node.id)) return;
      ids.push(node.id);
      const collapsed = !filtersActive && preferences.collapsedNodeIds.includes(node.id);
      if (!collapsed) for (const child of childMap.get(node.id) ?? []) visit(child);
    };
    for (const root of childMap.get(null) ?? []) visit(root);
    return ids;
  }, [childMap, visibleIds, filtersActive, preferences.collapsedNodeIds]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = preferences.scrollTop;
  }, []);
  useEffect(() => {
    if (!preferences.selectedNodeId || preferences.selectedNodeId === initialSelection.current || !nodeMap.has(preferences.selectedNodeId)) return;
    initialSelection.current = preferences.selectedNodeId;
    const id = preferences.selectedNodeId;
    const ancestors: string[] = [];
    let parentId = nodeMap.get(id)?.parentGroupId ?? null;
    while (parentId) { ancestors.push(parentId); parentId = nodeMap.get(parentId)?.parentGroupId ?? null; }
    if (!matches.has(id)) patch({ query: '', typeId: '', tagIds: [], folderFilterId: null, collapsedNodeIds: preferences.collapsedNodeIds.filter(value => !ancestors.includes(value)) });
    else patch({ collapsedNodeIds: preferences.collapsedNodeIds.filter(value => !ancestors.includes(value)) });
    requestAnimationFrame(() => document.getElementById(`scenario-explorer-node-${id}`)?.scrollIntoView({ block: 'nearest' }));
  }, [preferences.selectedNodeId, matches, nodeMap]);

  function patch(update: Partial<ExplorerPreferences> | ((current: ExplorerPreferences) => ExplorerPreferences)) {
    setPreferences(current => typeof update === 'function' ? update(current) : { ...current, ...update });
  }
  function openNode(id: string) {
    const ancestors: string[] = []; let parentId = nodeMap.get(id)?.parentGroupId ?? null;
    while (parentId) { ancestors.push(parentId); parentId = nodeMap.get(parentId)?.parentGroupId ?? null; }
    patch(current => ({ ...current, selectedNodeId: id, selectedNodeIds: [], ...(matches.has(id) ? {} : { query: '', typeId: '', tagIds: [], folderFilterId: null }), collapsedNodeIds: current.collapsedNodeIds.filter(value => !ancestors.includes(value)) }));
    onOpenNode(id);
  }
  function toggleNodeSelection(id: string) {
    const nextSelected = !activeSelection.has(id);
    setBulkMessage('');
    if (onToggleNode) onToggleNode(id, nextSelected);
    else patch(current => ({ ...current, selectedNodeIds: nextSelected ? [...new Set([...current.selectedNodeIds, id])] : current.selectedNodeIds.filter(selectedId => selectedId !== id) }));
    if (nextSelected) patch({ selectedNodeId: id });
  }
  function revealNode(id: string) {
    const ancestors: string[] = [];
    let parentId = nodeMap.get(id)?.parentGroupId ?? null;
    while (parentId) { ancestors.push(parentId); parentId = nodeMap.get(parentId)?.parentGroupId ?? null; }
    patch(current => ({ ...current, collapsedNodeIds: current.collapsedNodeIds.filter(value => !ancestors.includes(value)), query: '', typeId: '', tagIds: [] }));
    requestAnimationFrame(() => document.getElementById(`scenario-explorer-node-${id}`)?.scrollIntoView({ block: 'nearest' }));
  }
  function toggleCollapsed(id: string) {
    patch(current => ({ ...current, collapsedNodeIds: current.collapsedNodeIds.includes(id) ? current.collapsedNodeIds.filter(value => value !== id) : [...current.collapsedNodeIds, id] }));
  }
  function focusIndex(id: string, offset: number) {
    const index = visibleOrder.indexOf(id);
    const next = visibleOrder[Math.max(0, Math.min(visibleOrder.length - 1, index + offset))];
    if (next) document.getElementById(`scenario-explorer-node-${next}`)?.focus();
  }
  function saveRename(event: React.FormEvent) {
    event.preventDefault();
    if (!renamingId) return;
    onRenameNode(renamingId, renameDraft);
    setRenamingId(undefined);
  }
  function handleTreeKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-explorer-node-id]');
    const id = row?.dataset.explorerNodeId;
    if (!id) return;
    const node = nodeMap.get(id);
    const hasChildren = (childMap.get(id)?.length ?? 0) > 0;
    const collapsed = !filtersActive && preferences.collapsedNodeIds.includes(id);
    if ((event.ctrlKey || event.metaKey) && event.key === ' ') { event.preventDefault(); toggleNodeSelection(id); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); focusIndex(id, event.key === 'ArrowDown' ? 1 : -1); }
    else if (event.key === 'ArrowRight' && hasChildren) {
      event.preventDefault();
      if (collapsed) toggleCollapsed(id); else { const child = (childMap.get(id) ?? []).find(item => visibleIds.has(item.id)); if (child) document.getElementById(`scenario-explorer-node-${child.id}`)?.focus(); }
    } else if (event.key === 'ArrowLeft') {
      if (hasChildren && !collapsed) { event.preventDefault(); toggleCollapsed(id); }
      else if (node?.parentGroupId) { event.preventDefault(); document.getElementById(`scenario-explorer-node-${node.parentGroupId}`)?.focus(); }
    }
  }
  function renderNode(node: Snapshot['nodes'][number], depth: number): ReactNode {
    if (!visibleIds.has(node.id)) return null;
    const siblings = childMap.get(node.parentGroupId) ?? [];
    const siblingIndex = siblings.findIndex(item => item.id === node.id);
    const nodeChildren = childMap.get(node.id) ?? [];
    const isSelected = onToggleNode ? activeSelection.has(node.id) : activeSelection.size ? activeSelection.has(node.id) : preferences.selectedNodeId === node.id;
    const isCollapsed = !filtersActive && preferences.collapsedNodeIds.includes(node.id);
    const type = snapshot.nodeTypes.find(item => item.id === node.typeId);
    const dropClass = dropTarget?.id === node.id ? (dropTarget.before ? ' explorer-drop-before' : ' explorer-drop-after') : '';
    return <div className="explorer-tree-item" key={node.id}>
      <div className={`explorer-row${isSelected ? ' is-selected' : ''}${dropClass}`} role="treeitem" aria-level={depth + 1} aria-selected={isSelected} aria-expanded={nodeChildren.length ? !isCollapsed : undefined} data-explorer-node-id={node.id} onDragOver={event => {
        event.stopPropagation();
        const sourceId = dragId.current ?? event.dataTransfer.getData('text/plain');
        const source = nodeMap.get(sourceId);
        if (!source || source.id === node.id || source.parentGroupId !== node.parentGroupId) return;
        event.preventDefault(); event.dataTransfer.dropEffect = 'move';
        const rect = event.currentTarget.getBoundingClientRect(); const before = event.clientY < rect.top + rect.height / 2;
        setDropTarget(old => old?.id === node.id && old.before === before ? old : { id: node.id, before });
      }} onDrop={event => {
        event.stopPropagation();
        const sourceId = dragId.current ?? event.dataTransfer.getData('text/plain'); const source = nodeMap.get(sourceId);
        if (!source || source.parentGroupId !== node.parentGroupId) return;
        event.preventDefault(); onReorder(sourceId, node.id, event.clientY < event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2); dragId.current = undefined; setDropTarget(null);
      }}>
        {nodeChildren.length > 0 ? <button className="explorer-disclosure" type="button" tabIndex={-1} aria-label={`${node.title || '無題'}を${isCollapsed ? '展開' : '折りたたむ'}`} aria-expanded={!isCollapsed} onClick={() => toggleCollapsed(node.id)}>{isCollapsed && !filtersActive ? '▸' : '▾'}</button> : <span className="explorer-disclosure-spacer"/>}
        {renamingId === node.id ? <form className="explorer-rename" onSubmit={saveRename}><input autoFocus aria-label="新しいノード名" value={renameDraft} onChange={event => setRenameDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); if (event.key === 'Escape') setRenamingId(undefined); }}/><button type="submit">保存</button><button type="button" onClick={() => setRenamingId(undefined)}>取消</button></form> : <>
          <div id={`scenario-explorer-node-${node.id}`} className="explorer-drag-target" tabIndex={-1} draggable={!disabled} onDragStart={event => { if (disabled) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', node.id); dragId.current = node.id; }} onDragEnd={() => { dragId.current = undefined; setDropTarget(null); }}>
            <ExplorerItemButton icon={nodeChildren.length ? '▰' : type?.icon || '¶'} name={node.title || '無題'} detail={type?.name ?? 'タイプ未設定'} selected={isSelected} title={`${node.title || '無題'} · ${type?.name ?? ''} · ${node.productionStatus === 'ready' ? '完成' : node.productionStatus === 'review' ? '要確認' : '下書き'} · Ctrl/⌘クリックで複数選択`} onClick={event => { if (event.ctrlKey || event.metaKey) toggleNodeSelection(node.id); else openNode(node.id); }} trailing={<><small className={`explorer-production-status status-${node.productionStatus}`}>{node.productionStatus === 'ready' ? '完成' : node.productionStatus === 'review' ? '要確認' : '下書き'}</small>{nodeChildren.length > 0 && <small className="explorer-child-count">{nodeChildren.length}</small>}</>}/>
          </div>
          <details className="explorer-row-menu"><summary aria-label={`${node.title || '無題'}の操作`} title="項目の操作">⋯</summary><div className="explorer-row-menu__items">
          <button type="button" disabled={disabled} onClick={() => toggleNodeSelection(node.id)}>{activeSelection.has(node.id) ? '選択を解除' : '複数選択に追加'}</button>
          <button type="button" disabled={disabled} onClick={() => { setRenamingId(node.id); setRenameDraft(node.title); }}>名前を変更</button>
          <button type="button" disabled={siblingIndex === 0 || disabled} onClick={() => onReorder(node.id, siblings[siblingIndex - 1]!.id, true)}>上へ移動</button>
          <button type="button" disabled={siblingIndex === siblings.length - 1 || disabled} onClick={() => onReorder(node.id, siblings[siblingIndex + 1]!.id, false)}>下へ移動</button>
          <button type="button" onClick={() => revealNode(node.id)}>一覧で表示</button>
          </div></details>
        </>}
      </div>
      {nodeChildren.length > 0 && !isCollapsed && <div role="group">{nodeChildren.map(child => renderNode(child, depth + 1))}</div>}
    </div>;
  }
  const clearFilters = () => patch({ query: '', typeId: '', tagIds: [], folderFilterId: null });
  function saveSearch() {
    const name = savedSearchName.trim(); if (!name) return;
    patch(current => ({ ...current, savedSearches: [{ id: crypto.randomUUID(), name, query: current.query, typeId: current.typeId, tagIds: current.tagIds, tagMode: current.tagMode, folderFilterId: current.folderFilterId }, ...current.savedSearches].slice(0, 30) }));
    setSavedSearchName('');
  }
  function applySavedSearch(id: string) {
    const search = preferences.savedSearches.find(item => item.id === id); if (!search) return;
    patch({ query: search.query, typeId: search.typeId, tagIds: search.tagIds, tagMode: search.tagMode, folderFilterId: search.folderFilterId });
  }
  const bulkIds = [...activeSelection].filter(id => nodeMap.has(id));
  function canMoveInto(nodeId: string) {
    if (activeSelection.has(nodeId)) return false;
    let currentId: string | null = nodeId;
    while (currentId) { if (activeSelection.has(currentId)) return false; currentId = nodeMap.get(currentId)?.parentGroupId ?? null; }
    return true;
  }
  function clearSelection() {
    if (onToggleNode) for (const id of bulkIds) onToggleNode(id, false);
    else patch({ selectedNodeIds: [] });
  }
  function bulkTag() { if (!bulkTagId || !bulkIds.length) return; try { onBulkTag?.(bulkIds, bulkTagId, bulkTagAction); setBulkMessage(`${bulkIds.length}件のタグを更新しました。`); clearSelection(); } catch (error) { setBulkMessage(error instanceof Error ? error.message : 'タグを更新できませんでした。'); } }
  function bulkMove() { if (!bulkIds.length) return; try { onBulkMove?.(bulkIds, moveTargetId || null); setBulkMessage(`${bulkIds.length}件の所属グループを更新しました。ノード位置とアウトライン順は変わりません。`); clearSelection(); } catch (error) { setBulkMessage(error instanceof Error ? error.message : 'ノードを移動できませんでした。'); } }
  function bulkFolderMove() { if (!bulkIds.length) return; try { onBulkFolderMove?.(bulkIds, folderTargetId || null); setBulkMessage(`${bulkIds.length}件を整理フォルダーへ移動しました。グラフとアウトラインは変わりません。`); clearSelection(); } catch (error) { setBulkMessage(error instanceof Error ? error.message : 'フォルダーへ移動できませんでした。'); } }
  function createFolder(event: React.FormEvent) { event.preventDefault(); if (!newFolderName.trim()) return; try { onCreateFolder?.(newFolderName, newFolderParentId || null); setNewFolderName(''); setBulkMessage('整理フォルダーを作成しました。'); } catch (error) { setBulkMessage(error instanceof Error ? error.message : 'フォルダーを作成できませんでした。'); } }
  const folderById = new Map(snapshot.organizerFolders.map(folder => [folder.id, folder]));
  function folderPath(folderId: string): string { const folder = folderById.get(folderId); return folder ? `${folder.parentId ? `${folderPath(folder.parentId)} / ` : ''}${folder.name}` : ''; }
  const collapseAll = () => patch(current => ({ ...current, collapsedNodeIds: snapshot.nodes.filter(node => childMap.has(node.id)).map(node => node.id) }));
  const showCurrent = () => { if (preferences.selectedNodeId && nodeMap.has(preferences.selectedNodeId)) revealNode(preferences.selectedNodeId); };
  const rootItems = childMap.get(null) ?? [];

  return <><aside className={`scenario-explorer ${className}`} style={{ '--explorer-width': `${preferences.width}px` } as React.CSSProperties}>
    <header className="explorer-header"><h2>{title}<span>{matches.size} / {snapshot.nodes.length}</span></h2><button type="button" className="explorer-create" disabled={disabled} onClick={onCreateNode}>＋ ノード</button></header>
    <label className="explorer-search">一覧を検索<input type="search" value={preferences.query} onChange={event => patch({ query: event.target.value })} placeholder="名前・本文を検索" aria-label="ノード名・タイプ・タグ・本文で検索"/></label>
    <label className="explorer-filter-label">タイプ<select value={preferences.typeId} onChange={event => patch({ typeId: event.target.value })}><option value="">すべてのタイプ</option>{snapshot.nodeTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
    <details className="explorer-folders"><summary>整理フォルダー{preferences.folderFilterId !== null && <span> · 絞り込み中</span>}</summary><label>一覧<select aria-label="整理フォルダーで絞り込む" value={preferences.folderFilterId ?? '__all__'} onChange={event => patch({ folderFilterId: event.target.value === '__all__' ? null : event.target.value })}><option value="__all__">すべてのノード</option><option value="">未整理</option>{snapshot.organizerFolders.map(folder => <option key={folder.id} value={folder.id}>{folderPath(folder.id)}</option>)}</select></label>{snapshot.organizerFolders.length > 0 && <ul>{snapshot.organizerFolders.map(folder => <li key={folder.id}><span title={folderPath(folder.id)}>{folderPath(folder.id)}</span><button type="button" disabled={disabled || !onRenameFolder} onClick={() => { const name = window.prompt('フォルダー名', folder.name); if (name?.trim()) onRenameFolder?.(folder.id, name); }} aria-label={`${folder.name}の名前を変更`}>名前</button><button type="button" disabled={disabled || !onDeleteFolder} onClick={() => { if (window.confirm(`「${folder.name}」を削除しますか？中のノードは削除されず、子フォルダーは一つ上へ移動します。`)) onDeleteFolder?.(folder.id); }} aria-label={`${folder.name}を削除`}>削除</button></li>)}</ul>}<form onSubmit={createFolder}><input aria-label="新しい整理フォルダー名" value={newFolderName} onChange={event => setNewFolderName(event.target.value)} placeholder="フォルダー名" maxLength={120}/><select aria-label="親フォルダー" value={newFolderParentId} onChange={event => setNewFolderParentId(event.target.value)}><option value="">トップ階層</option>{snapshot.organizerFolders.map(folder => <option key={folder.id} value={folder.id}>{folderPath(folder.id)}</option>)}</select><button type="submit" disabled={disabled || !newFolderName.trim() || !onCreateFolder}>作成</button></form></details>
    <details className="explorer-saved-searches"><summary>保存した検索{preferences.savedSearches.length > 0 && <span> · {preferences.savedSearches.length}</span>}</summary><div className="explorer-saved-search-form"><input aria-label="検索条件の名前" value={savedSearchName} onChange={event => setSavedSearchName(event.target.value)} placeholder="現在の条件に名前を付ける"/><button type="button" disabled={!savedSearchName.trim()} onClick={saveSearch}>保存</button></div>{preferences.savedSearches.length ? <ul>{preferences.savedSearches.map(search => <li key={search.id}><button type="button" className="explorer-saved-search-apply" onClick={() => applySavedSearch(search.id)}>{search.name}</button><button type="button" aria-label={`${search.name}を削除`} onClick={() => patch(current => ({ ...current, savedSearches: current.savedSearches.filter(item => item.id !== search.id) }))}>×</button></li>)}</ul> : <p>保存した検索はありません。</p>}</details>
    {snapshot.tags.length > 0 && <details className="explorer-tag-filter"><summary>タグで絞り込む{preferences.tagIds.length > 0 && <span> · {preferences.tagIds.length}</span>}</summary><label>タグを検索<input value={tagQuery} onChange={event => setTagQuery(event.target.value)} placeholder="タグ名"/></label><label>一致条件<select value={preferences.tagMode} onChange={event => patch({ tagMode: event.target.value as ExplorerPreferences['tagMode'] })}><option value="or">いずれか（OR）</option><option value="and">すべて（AND）</option></select></label><div className="explorer-tag-options">{searchableTagList.map(tag => <label key={tag.id}><input type="checkbox" checked={preferences.tagIds.includes(tag.id)} onChange={event => patch(current => ({ ...current, tagIds: event.target.checked ? [...current.tagIds, tag.id] : current.tagIds.filter(id => id !== tag.id) }))}/><span>{tag.name}</span></label>)}</div></details>}
    <div className="explorer-list-actions"><button type="button" onClick={collapseAll}>全折りたたみ</button><button type="button" disabled={!preferences.selectedNodeId || !nodeMap.has(preferences.selectedNodeId)} onClick={showCurrent}>開いている項目を表示</button></div>
    {filtersActive && <div className="explorer-filter-status" role="status">絞り込み中：{matches.size}件 <button type="button" onClick={clearFilters}>解除</button></div>}
    {bulkIds.length > 0 && <details className="explorer-bulk-actions" open><summary>選択中：{bulkIds.length}件</summary><div className="explorer-bulk-toolbar"><div className="explorer-bulk-controls"><label>タグ<select value={bulkTagId} onChange={event => setBulkTagId(event.target.value)}><option value="">タグを選択</option>{snapshot.tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label><label>操作<select value={bulkTagAction} onChange={event => setBulkTagAction(event.target.value as 'add' | 'remove')}><option value="add">追加</option><option value="remove">削除</option></select></label><button type="button" disabled={!bulkTagId || disabled || !onBulkTag} onClick={bulkTag}>タグを一括変更</button></div><div className="explorer-bulk-controls"><label>移動先<select value={moveTargetId} onChange={event => setMoveTargetId(event.target.value)}><option value="">トップ階層</option>{snapshot.nodes.filter(node => childMap.has(node.id) && canMoveInto(node.id)).map(node => <option key={node.id} value={node.id}>{node.title || '無題'} へ</option>)}</select></label><button type="button" disabled={disabled || !onBulkMove} onClick={bulkMove}>所属を変更</button></div><div className="explorer-bulk-controls"><label>整理先<select value={folderTargetId} onChange={event => setFolderTargetId(event.target.value)}><option value="">未整理</option>{snapshot.organizerFolders.map(folder => <option key={folder.id} value={folder.id}>{folderPath(folder.id)}</option>)}</select></label><button type="button" disabled={disabled || !onBulkFolderMove} onClick={bulkFolderMove}>フォルダーへ移動</button><button type="button" onClick={clearSelection}>選択解除</button></div></div></details>}
    {bulkMessage && <div className="explorer-filter-status" role="status">{bulkMessage}</div>}
    <div ref={listRef} className="explorer-tree-scroll" role="tree" aria-label="ノード一覧" aria-multiselectable="true" onKeyDown={handleTreeKeyDown} onScroll={event => { const scrollTop = event.currentTarget.scrollTop; window.clearTimeout(scrollSaveTimer.current); scrollSaveTimer.current = window.setTimeout(() => patch({ scrollTop }), 140); }}>
      {rootItems.map(node => renderNode(node, 0))}
      {snapshot.nodes.length === 0 ? <p className="explorer-empty">ノードはまだありません。ノードを作成してください。</p> : matches.size === 0 ? <p className="explorer-empty">条件に一致するノードはありません。絞り込みを解除してください。</p> : null}
    </div>
    {extraContent}
  </aside><div className="explorer-resizer" role="separator" aria-label="ノード一覧の幅" aria-orientation="vertical" aria-valuenow={preferences.width} aria-valuemin={200} aria-valuemax={520} tabIndex={0} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); patch(current => ({ ...current, width: Math.min(520, Math.max(200, current.width + (event.key === 'ArrowRight' ? 20 : -20))) })); } }} onPointerDown={event => { const element = event.currentTarget; element.setPointerCapture(event.pointerId); const start = event.clientX; const initial = preferences.width; const move = (pointer: PointerEvent) => patch({ width: Math.min(520, Math.max(200, initial + pointer.clientX - start)) }); const stop = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', stop); element.removeEventListener('pointercancel', stop); }; element.addEventListener('pointermove', move); element.addEventListener('pointerup', stop); element.addEventListener('pointercancel', stop); }}/></>;
}
