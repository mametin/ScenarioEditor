import type { Snapshot } from '../../domain/schema';

export type ExplorerPreferences = {
  width: number;
  selectedNodeId: string | null;
  collapsedNodeIds: string[];
  scrollTop: number;
  query: string;
  typeId: string;
  tagIds: string[];
  tagMode: 'and' | 'or';
  folderFilterId: string | null | '';
  selectedNodeIds: string[];
  savedSearches: { id: string; name: string; query: string; typeId: string; tagIds: string[]; tagMode: 'and' | 'or'; folderFilterId: string | null | '' }[];
};

export const explorerPreferencesKey = (projectId: string) => `scenario-editor-explorer:${projectId}`;
export const defaultExplorerPreferences: ExplorerPreferences = { width: 280, selectedNodeId: null, collapsedNodeIds: [], scrollTop: 0, query: '', typeId: '', tagIds: [], tagMode: 'or', folderFilterId: null, selectedNodeIds: [], savedSearches: [] };

export function normalizeExplorerPreferences(raw: unknown, snapshot: Snapshot): ExplorerPreferences {
  if (!raw || typeof raw !== 'object') return { ...defaultExplorerPreferences };
  const value = raw as Partial<ExplorerPreferences>;
  const nodes = new Set(snapshot.nodes.map(node => node.id));
  const types = new Set(snapshot.nodeTypes.map(type => type.id));
  const tags = new Set(snapshot.tags.map(tag => tag.id));
  const folders = new Set(snapshot.organizerFolders.map(folder => folder.id));
  const validFolderFilter = (id: unknown): string | null | '' => id === '' ? '' : typeof id === 'string' && folders.has(id) ? id : null;
  const savedSearches = Array.isArray(value.savedSearches) ? value.savedSearches.flatMap(search => {
    if (!search || typeof search !== 'object' || typeof search.id !== 'string' || typeof search.name !== 'string') return [];
    return [{ id: search.id.slice(0, 80), name: search.name.trim().slice(0, 80), query: typeof search.query === 'string' ? search.query.slice(0, 500) : '', typeId: typeof search.typeId === 'string' && types.has(search.typeId) ? search.typeId : '', tagIds: Array.isArray(search.tagIds) ? [...new Set(search.tagIds.filter((id): id is string => typeof id === 'string' && tags.has(id)))] : [], tagMode: search.tagMode === 'and' ? 'and' as const : 'or' as const, folderFilterId: validFolderFilter(search.folderFilterId) }].filter(item => item.name);
  }).slice(0, 30) : [];
  const width = typeof value.width === 'number' && Number.isFinite(value.width) ? Math.min(520, Math.max(200, value.width)) : defaultExplorerPreferences.width;
  const selectedNodeId = typeof value.selectedNodeId === 'string' && nodes.has(value.selectedNodeId) ? value.selectedNodeId : null;
  const collapsedNodeIds = Array.isArray(value.collapsedNodeIds) ? [...new Set(value.collapsedNodeIds.filter((id): id is string => typeof id === 'string' && nodes.has(id)))] : [];
  const scrollTop = typeof value.scrollTop === 'number' && Number.isFinite(value.scrollTop) && value.scrollTop >= 0 ? value.scrollTop : 0;
  const query = typeof value.query === 'string' ? value.query.slice(0, 500) : '';
  const typeId = typeof value.typeId === 'string' && types.has(value.typeId) ? value.typeId : '';
  const tagIds = Array.isArray(value.tagIds) ? [...new Set(value.tagIds.filter((id): id is string => typeof id === 'string' && tags.has(id)))] : [];
  const tagMode = value.tagMode === 'and' ? 'and' : 'or';
  const folderFilterId = validFolderFilter(value.folderFilterId);
  const selectedNodeIds = Array.isArray(value.selectedNodeIds) ? [...new Set(value.selectedNodeIds.filter((id): id is string => typeof id === 'string' && nodes.has(id)))].slice(0, 1000) : [];
  return { width, selectedNodeId, collapsedNodeIds, scrollTop, query, typeId, tagIds, tagMode, folderFilterId, selectedNodeIds, savedSearches };
}

export function readExplorerPreferences(projectId: string, snapshot: Snapshot): ExplorerPreferences {
  try {
    const value = localStorage.getItem(explorerPreferencesKey(projectId));
    return normalizeExplorerPreferences(value ? JSON.parse(value) : null, snapshot);
  } catch {
    return { ...defaultExplorerPreferences };
  }
}

export function writeExplorerPreferences(projectId: string, value: ExplorerPreferences): boolean {
  try {
    localStorage.setItem(explorerPreferencesKey(projectId), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
