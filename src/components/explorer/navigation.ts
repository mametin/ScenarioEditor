import type { ExplorerPreferences } from './preferences';

/** Keep saved/manual collapse state when opening a result that is visible only due to filters. */
export function openExplorerNode(current: ExplorerPreferences, id: string, isFilterMatch: boolean, ancestors: string[]): ExplorerPreferences {
  return {
    ...current,
    selectedNodeId: id,
    selectedNodeIds: [],
    ...(isFilterMatch ? {} : {
      query: '',
      typeId: '',
      tagIds: [],
      folderFilterId: null,
      collapsedNodeIds: current.collapsedNodeIds.filter(value => !ancestors.includes(value)),
    }),
  };
}

/** An explicit reveal clears every hiding filter and permanently expands the target's ancestors. */
export function revealExplorerNode(current: ExplorerPreferences, ancestors: string[]): ExplorerPreferences {
  return {
    ...current,
    query: '',
    typeId: '',
    tagIds: [],
    folderFilterId: null,
    collapsedNodeIds: current.collapsedNodeIds.filter(value => !ancestors.includes(value)),
  };
}
