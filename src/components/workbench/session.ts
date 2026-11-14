import type { Snapshot } from '../../domain/schema';

export type EditorTarget = { kind: 'node' | 'entity'; id: string };
export type EditorTab = EditorTarget & { pinned: boolean };
export type EditorTabsState = { tabs: EditorTab[]; activeKey: string | null };
export const emptyEditorTabs: EditorTabsState = { tabs: [], activeKey: null };
export const editorTargetKey = (target: EditorTarget) => `${target.kind}:${target.id}`;
const tabsStorageKey = (projectId: string) => `scenario-editor-tabs:${projectId}`;

export function readEditorTabs(projectId: string, snapshot: Snapshot): EditorTabsState {
  try {
    const raw = localStorage.getItem(tabsStorageKey(projectId));
    if (!raw) return emptyEditorTabs;
    const value = JSON.parse(raw) as Partial<EditorTabsState>;
    if (!Array.isArray(value.tabs)) return emptyEditorTabs;
    const valid = new Set<string>();
    const tabs: EditorTab[] = [];
    for (const tab of value.tabs) {
      if (!tab || (tab.kind !== 'node' && tab.kind !== 'entity') || typeof tab.id !== 'string') continue;
      if (tab.kind === 'node' ? !snapshot.nodes.some(node => node.id === tab.id) : !snapshot.entities.some(entity => entity.id === tab.id)) continue;
      const key = editorTargetKey(tab);
      if (valid.has(key)) continue;
      valid.add(key);
      tabs.push({ kind: tab.kind, id: tab.id, pinned: tab.pinned === true });
      if (tabs.length === 40) break;
    }
    const activeKey = typeof value.activeKey === 'string' && valid.has(value.activeKey) ? value.activeKey : tabs.at(-1) ? editorTargetKey(tabs.at(-1)!) : null;
    return { tabs, activeKey };
  } catch { return emptyEditorTabs; }
}

export function writeEditorTabs(projectId: string, value: EditorTabsState): boolean {
  try { localStorage.setItem(tabsStorageKey(projectId), JSON.stringify(value)); return true; }
  catch { return false; }
}

export function openEditorTab(state: EditorTabsState, target: EditorTarget, pin = false): EditorTabsState {
  const key = editorTargetKey(target);
  const existing = state.tabs.findIndex(tab => editorTargetKey(tab) === key);
  if (existing >= 0) {
    const tabs = state.tabs.slice();
    if (pin && !tabs[existing].pinned) tabs[existing] = { ...tabs[existing], pinned: true };
    return { tabs, activeKey: key };
  }
  const nextTab: EditorTab = { ...target, pinned: pin };
  const previewIndex = pin ? -1 : state.tabs.findIndex(tab => !tab.pinned);
  const tabs = state.tabs.slice();
  if (previewIndex >= 0) tabs[previewIndex] = nextTab;
  else tabs.push(nextTab);
  return { tabs, activeKey: key };
}

export function closeEditorTab(state: EditorTabsState, key: string): EditorTabsState {
  const index = state.tabs.findIndex(tab => editorTargetKey(tab) === key);
  if (index < 0) return state;
  const tabs = state.tabs.filter(tab => editorTargetKey(tab) !== key);
  if (state.activeKey !== key) return { ...state, tabs };
  const replacement = tabs[Math.min(index, tabs.length - 1)];
  return { tabs, activeKey: replacement ? editorTargetKey(replacement) : null };
}

export function pinEditorTab(state: EditorTabsState, key: string): EditorTabsState {
  return { ...state, tabs: state.tabs.map(tab => editorTargetKey(tab) === key ? { ...tab, pinned: !tab.pinned } : tab) };
}
