import { parseSnapshot, type Snapshot } from './schema';

export function filterNodesByOrganizerFolder(source: Snapshot, matchingNodeIds: Set<string>, folderId: string | null | ''): Set<string> {
  if (folderId === null) return matchingNodeIds;
  const result = new Set(matchingNodeIds);
  if (folderId === '') {
    for (const folder of source.organizerFolders) for (const id of folder.nodeIds) result.delete(id);
    return result;
  }
  const children = new Map<string, string[]>();
  const folderById = new Map(source.organizerFolders.map(folder => [folder.id, folder]));
  for (const folder of source.organizerFolders) if (folder.parentId) { const items = children.get(folder.parentId) ?? []; items.push(folder.id); children.set(folder.parentId, items); }
  const includedFolderIds = new Set<string>();
  const includedNodes = new Set<string>();
  const stack = [folderId];
  while (stack.length) {
    const current = stack.pop()!;
    if (includedFolderIds.has(current)) continue;
    includedFolderIds.add(current);
    const folder = folderById.get(current);
    if (folder) { for (const nodeId of folder.nodeIds) includedNodes.add(nodeId); stack.push(...(children.get(current) ?? [])); }
  }
  for (const nodeId of result) if (!includedNodes.has(nodeId)) result.delete(nodeId);
  return result;
}

function siblingOrder(snapshot: Snapshot, parentId: string | null) {
  return snapshot.organizerFolders.filter(folder => folder.parentId === parentId).length;
}

export function createOrganizerFolder(source: Snapshot, name: string, parentId: string | null = null): Snapshot {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('フォルダー名を入力してください');
  if (parentId && !source.organizerFolders.some(folder => folder.id === parentId)) throw new Error('親フォルダーが見つかりません');
  const now = new Date().toISOString();
  return parseSnapshot({ ...source, project: { ...source.project, updatedAt: now }, organizerFolders: [...source.organizerFolders, { id: crypto.randomUUID(), parentId, name: cleanName.slice(0, 120), order: siblingOrder(source, parentId), nodeIds: [] }] });
}

export function renameOrganizerFolder(source: Snapshot, id: string, name: string): Snapshot {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('フォルダー名を入力してください');
  if (!source.organizerFolders.some(folder => folder.id === id)) throw new Error('フォルダーが見つかりません');
  return parseSnapshot({ ...source, project: { ...source.project, updatedAt: new Date().toISOString() }, organizerFolders: source.organizerFolders.map(folder => folder.id === id ? { ...folder, name: cleanName.slice(0, 120) } : folder) });
}

/** Delete an organizer folder, promote its child folders, and keep its nodes in the parent folder or unfiled. */
export function deleteOrganizerFolder(source: Snapshot, id: string): Snapshot {
  const folder = source.organizerFolders.find(item => item.id === id);
  if (!folder) throw new Error('フォルダーが見つかりません');
  const parent = folder.parentId;
  // Clone every remaining folder before changing membership or sibling order.
  // A shallow filtered array still shares folder objects with the source snapshot.
  const folders = source.organizerFolders.filter(item => item.id !== id).map(item => ({
    ...item,
    parentId: item.parentId === id ? parent : item.parentId,
    nodeIds: [...item.nodeIds],
  }));
  if (parent && folder.nodeIds.length) {
    const parentFolder = folders.find(item => item.id === parent)!;
    parentFolder.nodeIds = [...parentFolder.nodeIds, ...folder.nodeIds.filter(nodeId => !parentFolder.nodeIds.includes(nodeId))];
  }
  const promotedIds = new Set(source.organizerFolders.filter(item => item.parentId === id).map(item => item.id));
  const siblings = folders.filter(item => item.parentId === parent && !promotedIds.has(item.id)).sort((a, b) => a.order - b.order);
  const promotedChildren = folders.filter(item => promotedIds.has(item.id)).sort((a, b) => a.order - b.order);
  const before = siblings.filter(item => item.order < folder.order);
  const after = siblings.filter(item => item.order >= folder.order);
  const orderedSiblings = [...before, ...promotedChildren, ...after];
  orderedSiblings.forEach((item, index) => { item.order = index; });
  return parseSnapshot({ ...source, project: { ...source.project, updatedAt: new Date().toISOString() }, organizerFolders: folders });
}

/** Organizer membership is independent from graph groups and outline order. */
export function moveNodesToOrganizerFolder(source: Snapshot, nodeIds: string[], folderId: string | null): Snapshot {
  const nodes = new Set(source.nodes.map(node => node.id));
  const selected = [...new Set(nodeIds)].filter(nodeId => nodes.has(nodeId));
  if (folderId && !source.organizerFolders.some(folder => folder.id === folderId)) throw new Error('移動先フォルダーが見つかりません');
  const selectedSet = new Set(selected);
  const organizerFolders = source.organizerFolders.map(folder => ({ ...folder, nodeIds: folder.nodeIds.filter(nodeId => !selectedSet.has(nodeId)) }));
  if (folderId) {
    const folder = organizerFolders.find(item => item.id === folderId)!;
    folder.nodeIds = [...folder.nodeIds, ...source.nodes.map(node => node.id).filter(nodeId => selectedSet.has(nodeId))];
  }
  return parseSnapshot({ ...source, project: { ...source.project, updatedAt: new Date().toISOString() }, organizerFolders });
}
