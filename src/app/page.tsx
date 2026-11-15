'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { createProject } from '../domain/project';
import { parseSnapshot, type Snapshot } from '../domain/schema';
import { ProjectRepository, ScenarioDatabase, type Stored } from '../storage/database';
import { Autosave, type SaveStatus } from '../storage/autosave';
import ColorPicker from '../components/ColorPicker';
import CommandSearch from '../components/CommandSearch';
import EditorTabs from '../components/workbench/EditorTabs';
import ApplicationMenu, { type ApplicationMenuGroup } from '../components/workbench/ApplicationMenu';
import PinnedReferencePanel from '../components/entities/PinnedReferencePanel';
import { closeEditorTab, editorTargetKey, emptyEditorTabs, openEditorTab, pinEditorTab, readEditorTabs, writeEditorTabs, type EditorTab, type EditorTarget, type EditorTabsState } from '../components/workbench/session';
import { connectGoogleDrive, createGoogleDriveFile, disconnectGoogleDrive, googleDriveConfig, loadGoogleDriveSnapshot, pickGoogleDriveFile, prepareGoogleDrive, readDriveBinding, updateGoogleDriveFile, writeDriveBinding, type DriveBinding, type DriveCredential } from '../storage/google-drive';
const GraphEditor = dynamic(() => import('../components/graph/GraphEditor'), { ssr: false, loading: () => <p>グラフを読み込んでいます…</p> });

const RichTextEditor = dynamic(() => import('../components/editor/RichTextEditor'), { ssr: false });
const WritingWorkspace = dynamic(() => import('../components/WritingWorkspace'), { ssr: false });
const EntityManager = dynamic(() => import('../components/entities/EntityManager'), { ssr: false });
const NodeTypeManager = dynamic(() => import('../components/types/NodeTypeManager'), { ssr: false });
const ConnectionTypeManager = dynamic(() => import('../components/types/ConnectionTypeManager'), { ssr: false });
const TagManager = dynamic(() => import('../components/types/TagManager'), { ssr: false });
const OutlineWorkspace = dynamic(() => import('../components/OutlineWorkspace'), { ssr: false });
const EntityHoverCard = dynamic(() => import('../components/entities/EntityHoverCard'), { ssr: false });
const AIAssistantPanel = dynamic(() => import('../components/AIAssistantPanel'), { ssr: false });

const labels = { saved: 'ローカル保存済み', pending: '未保存の変更あり', saving: '保存中…', error: '保存できませんでした' };
const screens = [
  { id: 'overview', label: '概要', icon: '◫' }, { id: 'graph', label: 'グラフ', icon: '⠿' },
  { id: 'writing', label: '執筆', icon: '¶' }, { id: 'entities', label: '設定資料', icon: '◈' },
  { id: 'outline', label: 'アウトライン', icon: '☷' }, { id: 'types', label: 'タイプ', icon: '▤' }, { id: 'tags', label: 'タグ', icon: '#' },
] as const;
const screenLabels = Object.fromEntries(screens.map(screen => [screen.id, screen.label])) as Record<(typeof screens)[number]['id'], string>;
function darkenHex(hex: string, amount: number) { return `#${[1, 3, 5].map(index => Math.round(parseInt(hex.slice(index, index + 2), 16) * (1 - amount)).toString(16).padStart(2, '0')).join('')}`; }
function mixHex(first: string, second: string, amount: number) { return `#${[1, 3, 5].map(index => Math.round(parseInt(first.slice(index, index + 2), 16) * (1 - amount) + parseInt(second.slice(index, index + 2), 16) * amount).toString(16).padStart(2, '0')).join('')}`; }
function luminance(hex: string) { const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722; }
function contrastRatio(first: string, second: string) { const [bright, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a); return (bright + .05) / (dark + .05); }
function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; const units = ['KB', 'MB', 'GB']; let value = bytes / 1024; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; } return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`; }
export default function Home() {
  const [projects, setProjects] = useState<Stored[]>([]);
  const [active, setActive] = useState<Snapshot>();
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Stored[]>([]);
  const [focus, setFocus] = useState(false);
  const [online, setOnline] = useState(true);
  const [view, setView] = useState<'overview' | 'graph' | 'writing' | 'entities' | 'types' | 'tags' | 'outline'>('overview');
  const [openedEntity, setOpenedEntity] = useState<string>();
  const [entityRevealRequest, setEntityRevealRequest] = useState(0);
  const [openedNode, setOpenedNode] = useState<string>();
  const [editorTabs, setEditorTabs] = useState<EditorTabsState>(emptyEditorTabs);
  const [tabsProjectId, setTabsProjectId] = useState<string>();
  const [backHistory, setBackHistory] = useState<EditorTarget[]>([]);
  const [forwardHistory, setForwardHistory] = useState<EditorTarget[]>([]);
  const [pinnedReferenceId, setPinnedReferenceId] = useState<string | null>(null);
  const [graphFocusNodeId, setGraphFocusNodeId] = useState<string>();
  const [focusOutlineItemId, setFocusOutlineItemId] = useState<string>();
  const [outlineTargetNodeId, setOutlineTargetNodeId] = useState<string>();
  const [editorSession, setEditorSession] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [themeColor, setThemeColor] = useState('#476955');
  const [backgroundColor, setBackgroundColor] = useState('#f5f4ef');
  const [uiFont, setUiFont] = useState<'mono' | 'sans'>('mono');
  const [bodyFont, setBodyFont] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [bodyFontSize, setBodyFontSize] = useState(18);
  const [themeReady, setThemeReady] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState(false);
  const [navigationVisible, setNavigationVisible] = useState(false);
  const menuImport = useRef<HTMLInputElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string>();
  const [lastSavedAt, setLastSavedAt] = useState<string>();
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota?: number }>();
  const [driveCredential, setDriveCredential] = useState<DriveCredential>();
  const [driveBinding, setDriveBinding] = useState<DriveBinding>();
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiSelection, setAiSelection] = useState<{ documentId: string; updatedAt: string; from: number; to: number; text: string; safeForReplacement: boolean }>();
  useEffect(() => { setAiSelection(undefined); }, [active?.project.id, openedNode, view]);
  useEffect(() => { if (googleDriveConfig()) void prepareGoogleDrive().catch(() => { /* Retry on the user's explicit Drive action. */ }); }, []);
  const repo = useRef<ProjectRepository | undefined>(undefined);
  const saver = useRef<Autosave | undefined>(undefined);
  const lastSaveState = useRef<SaveStatus>('saved');
  const current = useRef<Snapshot | undefined>(undefined);
  function report(e: unknown) { setError(e instanceof Error ? e.message : '処理に失敗しました'); }
  useEffect(() => {
    let initial: 'light' | 'dark' = 'light';
    let color = '#476955';
    let background = '#f5f4ef';
    let initialUiFont: 'mono' | 'sans' = 'mono';
    let initialBodyFont: 'sans' | 'serif' | 'mono' = 'sans';
    let initialBodyFontSize = 18;
    try {
      if (localStorage.getItem('scenario-editor-theme') === 'dark') initial = 'dark';
      const savedColor = localStorage.getItem('scenario-editor-theme-color');
      if (savedColor && /^#[0-9a-f]{6}$/i.test(savedColor)) color = savedColor;
      const savedBackground = localStorage.getItem('scenario-editor-background-color');
      if (savedBackground && /^#[0-9a-f]{6}$/i.test(savedBackground)) background = savedBackground;
      const savedUiFont = localStorage.getItem('scenario-editor-ui-font');
      if (savedUiFont === 'mono' || savedUiFont === 'sans') initialUiFont = savedUiFont;
      const savedBodyFont = localStorage.getItem('scenario-editor-body-font');
      if (savedBodyFont === 'sans' || savedBodyFont === 'serif' || savedBodyFont === 'mono') initialBodyFont = savedBodyFont;
      const savedBodySize = Number(localStorage.getItem('scenario-editor-body-font-size'));
      if (Number.isInteger(savedBodySize) && savedBodySize >= 14 && savedBodySize <= 24) initialBodyFontSize = savedBodySize;
    } catch { /* Appearance is a preference; the app remains usable when storage is blocked. */ }
    document.documentElement.dataset.theme = initial;
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--theme-background', background);
    document.documentElement.style.setProperty('--ui-font', initialUiFont === 'mono' ? "Consolas, 'Courier New', monospace" : "Arial, 'Yu Gothic', Meiryo, sans-serif");
    document.documentElement.style.setProperty('--scenario-font', initialBodyFont === 'serif' ? "'Yu Mincho', 'Hiragino Mincho ProN', serif" : initialBodyFont === 'mono' ? "Consolas, 'Courier New', monospace" : "'Yu Gothic', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif");
    document.documentElement.style.setProperty('--scenario-font-size', `${initialBodyFontSize}px`);
    setTheme(initial); setThemeColor(color); setBackgroundColor(background); setUiFont(initialUiFont); setBodyFont(initialBodyFont); setBodyFontSize(initialBodyFontSize); setThemeReady(true);
  }, []);
  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? darkenHex(backgroundColor, .88) : backgroundColor);
    try { localStorage.setItem('scenario-editor-theme', theme); } catch { /* Keep the current-session choice even if it cannot be persisted. */ }
  }, [theme, themeReady, backgroundColor]);
  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.style.setProperty('--accent', themeColor);
    try { localStorage.setItem('scenario-editor-theme-color', themeColor); } catch { /* Keep the current-session choice even if it cannot be persisted. */ }
  }, [themeColor, themeReady]);
  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.style.setProperty('--theme-background', backgroundColor);
    try { localStorage.setItem('scenario-editor-background-color', backgroundColor); } catch { /* Keep the current-session choice even if it cannot be persisted. */ }
  }, [backgroundColor, themeReady]);
  useEffect(() => {
    if (!themeReady) return;
    const value = uiFont === 'mono' ? "Consolas, 'Courier New', monospace" : "Arial, 'Yu Gothic', Meiryo, sans-serif";
    document.documentElement.style.setProperty('--ui-font', value);
    try { localStorage.setItem('scenario-editor-ui-font', uiFont); } catch { /* Keep this session's preference when browser storage is unavailable. */ }
  }, [uiFont, themeReady]);
  useEffect(() => {
    if (!themeReady) return;
    const value = bodyFont === 'serif' ? "'Yu Mincho', 'Hiragino Mincho ProN', serif" : bodyFont === 'mono' ? "Consolas, 'Courier New', monospace" : "'Yu Gothic', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif";
    document.documentElement.style.setProperty('--scenario-font', value);
    try { localStorage.setItem('scenario-editor-body-font', bodyFont); } catch { /* Keep this session's preference when browser storage is unavailable. */ }
  }, [bodyFont, themeReady]);
  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.style.setProperty('--scenario-font-size', `${bodyFontSize}px`);
    try { localStorage.setItem('scenario-editor-body-font-size', String(bodyFontSize)); } catch { /* Keep this session's preference when browser storage is unavailable. */ }
  }, [bodyFontSize, themeReady]);
  useEffect(() => {
    try { setNavExpanded(localStorage.getItem('scenario-editor-nav-expanded') === 'true'); }
    catch { setNavExpanded(false); }
  }, []);
  useEffect(() => {
    if (!active) { setLastBackupAt(undefined); return; }
    try { setLastBackupAt(localStorage.getItem(`scenario-editor-last-json-download:${active.project.id}`) ?? undefined); }
    catch { setLastBackupAt(undefined); }
  }, [active?.project.id]);
  useEffect(() => {
    if (!active || status !== 'saved' || !navigator.storage?.estimate) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void navigator.storage.estimate().then(estimate => {
        if (!cancelled && typeof estimate.usage === 'number') setStorageEstimate({ usage: estimate.usage, ...(typeof estimate.quota === 'number' ? { quota: estimate.quota } : {}) });
      }).catch(() => { if (!cancelled) setStorageEstimate(undefined); });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [active?.project.id, active?.project.updatedAt, status]);
  useEffect(() => {
    if (!active) return;
    const restored = readEditorTabs(active.project.id, active);
    setEditorTabs(restored); setTabsProjectId(active.project.id); setBackHistory([]); setForwardHistory([]);
    const activeTab = restored.tabs.find(tab => editorTargetKey(tab) === restored.activeKey);
    if (activeTab) {
      if (activeTab.kind === 'node') { setOpenedNode(activeTab.id); setView('writing'); }
      else { setOpenedEntity(activeTab.id); setView('entities'); }
    }
    try {
      const pinned = localStorage.getItem(`scenario-editor-pinned-reference:${active.project.id}`);
      setPinnedReferenceId(pinned && active.entities.some(entity => entity.id === pinned) ? pinned : null);
    } catch { setPinnedReferenceId(null); }
  }, [active?.project.id]);
  useEffect(() => {
    if (!active || tabsProjectId !== active.project.id) return;
    const timer = window.setTimeout(() => writeEditorTabs(active.project.id, editorTabs), 120);
    return () => window.clearTimeout(timer);
  }, [active?.project.id, tabsProjectId, editorTabs]);
  useEffect(() => {
    if (!active || tabsProjectId !== active.project.id) return;
    try {
      const key = `scenario-editor-pinned-reference:${active.project.id}`;
      if (pinnedReferenceId && active.entities.some(entity => entity.id === pinnedReferenceId)) localStorage.setItem(key, pinnedReferenceId);
      else { localStorage.removeItem(key); if (pinnedReferenceId) setPinnedReferenceId(null); }
    } catch { /* A fixed reference is a display preference; it must not interrupt editing. */ }
  }, [active?.project.id, active?.entities, tabsProjectId, pinnedReferenceId]);
  useEffect(() => {
    if (!active) return;
    setEditorTabs(current => {
      const tabs = current.tabs.filter(tab => tab.kind === 'node' ? active.nodes.some(node => node.id === tab.id) : active.entities.some(entity => entity.id === tab.id));
      if (tabs.length === current.tabs.length) return current;
      const activeKey = tabs.some(tab => editorTargetKey(tab) === current.activeKey) ? current.activeKey : tabs.at(-1) ? editorTargetKey(tabs.at(-1)!) : null;
      return { tabs, activeKey };
    });
  }, [active?.nodes, active?.entities]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!current.current || !(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'k') return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')) return;
      event.preventDefault(); setSearchOpen(true);
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  function select(row: Stored) {
    setEditorSession(value => value + 1);
    current.current = row.snapshot; setActive(row.snapshot); setHistory([]); setError(''); setStatus('saved'); setLastSavedAt(row.savedAt);
    lastSaveState.current = 'saved';
    saver.current = new Autosave(repo.current!, row.revision, (state, message) => { setStatus(state); if (message) setError(message); else if (state === 'saved') { setError(''); if (lastSaveState.current === 'saving') setLastSavedAt(new Date().toISOString()); } lastSaveState.current = state; });
  }
  useEffect(() => {
    const db = new ScenarioDatabase(); const repository = new ProjectRepository(db); repo.current = repository;
    let alive = true;
    repository.list().then(rows => { if (alive) { setProjects(rows); if (rows[0]) select(rows[0]); setReady(true); } }).catch(e => { if (alive) report(e); });
    const before = (e: BeforeUnloadEvent) => { if (saver.current?.dirty) { e.preventDefault(); e.returnValue = ''; } };
    const visibility = () => { if (document.visibilityState === 'hidden') void saver.current?.flush(); };
    const network = () => setOnline(navigator.onLine); network();
    window.addEventListener('beforeunload', before); document.addEventListener('visibilitychange', visibility); window.addEventListener('online', network); window.addEventListener('offline', network);
    return () => { alive = false; window.removeEventListener('beforeunload', before); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', network); window.removeEventListener('offline', network); void saver.current?.flush().finally(() => db.close()); };
  }, []);
  async function settle() { await saver.current?.flush(); if (saver.current?.dirty) throw new Error('未保存の変更があります。再試行またはJSON退避後に操作してください。'); }
  async function run(action: () => Promise<void>) { if (busy) return; setBusy(true); try { await action(); } catch (e) { report(e); } finally { setBusy(false); } }
  async function refresh() { setProjects(await repo.current!.list()); }
  function edit(key: 'title' | 'description', value: string) {
    if (!current.current) return;
    const data = { ...current.current, project: { ...current.current.project, [key]: value, updatedAt: new Date().toISOString() } };
    current.current = data; setActive(data); saver.current!.enqueue(data);
  }
  function download() {
    if (!current.current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(current.current, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `scenario-${current.current.project.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    const timestamp = new Date().toISOString(); setLastBackupAt(timestamp);
    try { localStorage.setItem(`scenario-editor-last-json-download:${current.current.project.id}`, timestamp); } catch { /* Keep download available if preference storage is blocked. */ }
  }
  async function importFile(file: File) {
    const data = parseSnapshot(JSON.parse(await file.text()));
    await settle();
    // Import as a new project. Internal IDs remain stable inside its own namespace.
    const newId = crypto.randomUUID(); const now = new Date().toISOString();
    data.project = { ...data.project, id: newId, title: `${data.project.title}（復元コピー）`, createdAt: now, updatedAt: now };
    data.sync = { projectId: newId, status: 'notConfigured', lastSyncedRevision: null, baseCommitSha: null, lastSyncedAt: null };
    const row = await repo.current!.save(data, 0); await refresh(); select(row);
  }
  function saveEditor(data: Snapshot) { try { const validated = parseSnapshot(data); current.current = validated; setActive(validated); saver.current!.enqueue(validated); } catch(e) { report(e); } }
  function currentEditorTarget() { return editorTabs.tabs.find(tab => editorTargetKey(tab) === editorTabs.activeKey); }
  function showEditorTarget(target: EditorTarget) {
    if (!active) return;
    const exists = target.kind === 'node' ? active.nodes.some(node => node.id === target.id) : active.entities.some(entity => entity.id === target.id);
    if (!exists) return;
    setEditorTabs(current => {
      const key = editorTargetKey(target);
      return current.tabs.some(tab => editorTargetKey(tab) === key) ? { ...current, activeKey: key } : openEditorTab(current, target);
    });
    if (target.kind === 'node') { setOpenedNode(target.id); setView('writing'); }
    else { setOpenedEntity(target.id); setEntityRevealRequest(value => value + 1); setView('entities'); }
  }
  function navigateEditorTarget(target: EditorTarget, pin = false, addHistory = true) {
    const key = editorTargetKey(target);
    const previous = currentEditorTarget();
    if (addHistory && previous && editorTargetKey(previous) !== key) {
      setBackHistory(items => [...items, { kind: previous.kind, id: previous.id }].slice(-80));
      setForwardHistory([]);
    }
    setEditorTabs(current => openEditorTab(current, target, pin));
    showEditorTarget(target);
  }
  function goBack() {
    const target = backHistory.at(-1); if (!target) return;
    const currentTarget = currentEditorTarget();
    setBackHistory(items => items.slice(0, -1));
    if (currentTarget) setForwardHistory(items => [...items, { kind: currentTarget.kind, id: currentTarget.id }].slice(-80));
    showEditorTarget(target);
  }
  function goForward() {
    const target = forwardHistory.at(-1); if (!target) return;
    const currentTarget = currentEditorTarget();
    setForwardHistory(items => items.slice(0, -1));
    if (currentTarget) setBackHistory(items => [...items, { kind: currentTarget.kind, id: currentTarget.id }].slice(-80));
    showEditorTarget(target);
  }
  function closeEditorTarget(tab: EditorTab) {
    const key = editorTargetKey(tab);
    const wasActive = editorTabs.activeKey === key;
    setEditorTabs(current => closeEditorTab(current, key));
    setBackHistory(items => items.filter(item => editorTargetKey(item) !== key));
    setForwardHistory(items => items.filter(item => editorTargetKey(item) !== key));
    if (wasActive) {
      const remaining = editorTabs.tabs.filter(item => editorTargetKey(item) !== key);
      const replacement = remaining[Math.min(editorTabs.tabs.findIndex(item => editorTargetKey(item) === key), remaining.length - 1)];
      if (replacement) showEditorTarget(replacement);
      else if (view === 'writing' || view === 'entities') { setOpenedNode(undefined); setOpenedEntity(undefined); setView('overview'); }
    }
  }
  function switchScreen(screenId: (typeof screens)[number]['id']) {
    if (screenId === 'writing' && active) {
      const target = currentEditorTarget()?.kind === 'node' ? currentEditorTarget() : undefined;
      const nodeId = target?.id ?? (openedNode && active.nodes.some(node => node.id === openedNode) ? openedNode : active.nodes[0]?.id);
      if (nodeId) { showEditorTarget({ kind: 'node', id: nodeId }); return; }
    }
    if (screenId === 'entities' && active) {
      const target = currentEditorTarget()?.kind === 'entity' ? currentEditorTarget() : undefined;
      const entityId = target?.id ?? (openedEntity && active.entities.some(entity => entity.id === openedEntity) ? openedEntity : active.entities[0]?.id);
      if (entityId) { showEditorTarget({ kind: 'entity', id: entityId }); return; }
    }
    setView(screenId);
  }
  function PhaseThreeContent() {
    if (!active) return null;
    if (view === 'writing') return <div className={`writing-session${currentPinnedReferenceId ? ' has-reference' : ''}`}><div className="writing-session-main"><WritingWorkspace key={`${active.project.id}-${openedNode ?? ''}`} snapshot={active} onChange={saveEditor} selectedNodeId={openedNode} onOpenEntity={id => navigateEditorTarget({ kind: 'entity', id })} onOpenNode={id => navigateEditorTarget({ kind: 'node', id })} onSelectionTextChange={setAiSelection}/></div><PinnedReferencePanel snapshot={active} entityId={currentPinnedReferenceId} onClose={() => setPinnedReferenceId(null)} onOpen={id => navigateEditorTarget({ kind: 'entity', id })}/></div>
    if (view === 'entities') return <EntityManager snapshot={active} onChange={saveEditor} selectedEntityId={openedEntity} revealRequest={entityRevealRequest} onSelectEntity={setOpenedEntity} onNavigateEntity={id => navigateEditorTarget({ kind: 'entity', id })} pinnedEntityId={currentPinnedReferenceId} onPinEntity={id => setPinnedReferenceId(currentId => currentId === id ? null : id)} renderDescription={id => <RichTextEditor key={`${active.project.id}:${id}`} snapshot={active} documentId={id} onChange={saveEditor} onOpenEntity={nextId => navigateEditorTarget({ kind: 'entity', id: nextId })} onOpenNode={nextId => navigateEditorTarget({ kind: 'node', id: nextId })}/>} onSelectNode={id => navigateEditorTarget({ kind: 'node', id })}/>
    if (view === 'types') return <><NodeTypeManager snapshot={active} onChange={saveEditor}/><ConnectionTypeManager snapshot={active} onChange={saveEditor}/></>;
    if (view === 'tags') return <TagManager snapshot={active} onChange={saveEditor}/>;
    if (view === 'outline') return <OutlineWorkspace snapshot={active} onChange={saveEditor} selectedNodeId={outlineTargetNodeId} focusOutlineItemId={focusOutlineItemId} onSelectNode={id => { setGraphFocusNodeId(id); setView('graph'); }} onSelectEntity={id => navigateEditorTarget({ kind: 'entity', id })}/>;
    return null;
  }
  const contrastSurface = theme === 'dark' ? mixHex(backgroundColor, '#000000', .8) : mixHex(backgroundColor, '#ffffff', .92);
  const accentOnSurface = contrastRatio(themeColor, contrastSurface);
  const whiteOnAccent = contrastRatio('#ffffff', themeColor);
  const contrastNeedsAttention = accentOnSurface < 4.5 || whiteOnAccent < 4.5;
  useEffect(() => { setDriveBinding(active ? readDriveBinding(active.project.id) : undefined); }, [active?.project.id]);
  async function connectDrive() {
    const config = googleDriveConfig();
    if (!config) throw new Error('Google Drive設定がありません。docs/google-drive-and-ai.md の「GitHub Pagesの公開設定」を参照してください。');
    const credential = await connectGoogleDrive(config);
    setDriveCredential(credential);
  }
  function requireDriveSession() {
    const config = googleDriveConfig();
    if (!config) throw new Error('Google Drive設定がありません。docs/google-drive-and-ai.md の「GitHub Pagesの公開設定」を参照してください。');
    if (!driveCredential || driveCredential.expiresAt <= Date.now()) throw new Error('Google Driveへ接続してください。接続はこのページを閉じると解除されます。');
    return { config, credential: driveCredential };
  }
  async function openFromDrive() {
    const { config, credential } = requireDriveSession();
    const selection = await pickGoogleDriveFile(config, credential);
    if (!selection) return;
    const loaded = await loadGoogleDriveSnapshot(selection.id, credential.accessToken);
    await settle();
    // Drive opens as a new local project so the current project is never replaced.
    const newId = crypto.randomUUID(); const now = new Date().toISOString();
    const snapshot = { ...loaded.snapshot, project: { ...loaded.snapshot.project, id: newId, title: loaded.snapshot.project.title || selection.name.replace(/\.json$/i, ''), createdAt: now, updatedAt: now }, sync: { projectId: newId, status: 'notConfigured' as const, lastSyncedRevision: null, baseCommitSha: null, lastSyncedAt: null } };
    const row = await repo.current!.save(snapshot, 0);
    writeDriveBinding(newId, { fileId: loaded.file.id, fileName: loaded.file.name || selection.name, version: loaded.file.version, email: credential.email });
    await refresh(); select(row); setView('overview');
  }
  async function saveToDrive(asCopy: boolean) {
    if (!current.current || !active) throw new Error('保存する作品を開いてください。');
    const { credential } = requireDriveSession();
    if (credential.email !== driveBinding?.email && !asCopy && driveBinding) throw new Error('この作品は別のGoogleアカウントに紐付いています。アカウント切替後は別ファイルとして保存してください。');
    await settle();
    const snapshot = current.current;
    let file: Awaited<ReturnType<typeof createGoogleDriveFile>>;
    if (!asCopy && driveBinding) file = await updateGoogleDriveFile(snapshot, driveBinding, credential.accessToken);
    else {
      const suggested = `${snapshot.project.title || 'シナリオ'}.json`;
      const name = window.prompt('Driveに保存するファイル名', suggested);
      if (!name?.trim()) return;
      file = await createGoogleDriveFile(snapshot, name.trim(), credential.accessToken);
    }
    const binding = { fileId: file.id, fileName: file.name, version: file.version, email: credential.email };
    writeDriveBinding(active.project.id, binding);
    setDriveBinding(binding);
    if (current.current !== snapshot) throw new Error('この保存中に追加編集がありました。変更は端末へ保存されています。続けて「Driveへ保存」を実行してください。');
  }
  const projectTabsReady = !!active && tabsProjectId === active.project.id;
  const currentPinnedReferenceId = projectTabsReady && active?.entities.some(entity => entity.id === pinnedReferenceId) ? pinnedReferenceId : null;
  const menuGroups: ApplicationMenuGroup[] = [
    { label: 'ファイル', items: [
      { label: '新規プロジェクト', disabled: !ready || busy, action: () => void run(async () => { await settle(); const row = await repo.current!.save(createProject(), 0); await refresh(); select(row); setView('overview'); }) },
      { label: 'プロジェクトを開く', disabled: !ready || busy, action: () => setView('overview') },
      { label: 'JSONファイルから復元…', disabled: !ready || busy, action: () => menuImport.current?.click() },
      { label: '今すぐ端末に保存', disabled: !active || busy, action: () => void run(settle) },
      { label: 'Google Driveに接続', disabled: busy, action: () => void run(connectDrive) },
      { label: driveCredential ? `Google Drive接続を解除（${driveCredential.email}）` : 'Google Drive未接続', disabled: !driveCredential, action: () => { disconnectGoogleDrive(driveCredential); setDriveCredential(undefined); } },
      { label: driveBinding ? `この作品のDriveファイル: ${driveBinding.fileName}` : 'この作品はDrive未連携', disabled: true, action: () => {} },
      { label: 'Driveから開く…', disabled: busy, action: () => void run(openFromDrive) },
      { label: 'Driveへ新規保存…', disabled: !active || busy, action: () => void run(() => saveToDrive(true)) },
      { label: 'Driveへ保存', disabled: !active || busy || !driveCredential || !driveBinding, action: () => void run(() => saveToDrive(false)) },
      { label: 'Driveに別ファイルとして保存…', disabled: !active || busy || !driveCredential, action: () => void run(() => saveToDrive(true)) },
      { label: 'JSONバックアップを保存', disabled: !active, action: download },
      { label: 'Markdown・PDFを書き出す…', disabled: !active || busy, action: () => switchScreen('outline') },
      { label: '保存履歴を開く', disabled: !active || busy, action: () => void run(async () => { await settle(); setHistory(await repo.current!.revisions(active!.project.id)); setView('overview'); }) },
    ] },
    { label: '編集', items: [
      { label: 'プロジェクト内を検索…', disabled: !active, shortcut: 'Ctrl / ⌘ K', action: () => setSearchOpen(true) },
      { label: '本文を編集', disabled: !active || busy, action: () => switchScreen('writing') },
      { label: '設定資料を編集', disabled: !active || busy, action: () => switchScreen('entities') },
      { label: '前の項目へ戻る', disabled: !active || !backHistory.length || busy, action: goBack },
      { label: '次の項目へ進む', disabled: !active || !forwardHistory.length || busy, action: goForward },
      { label: 'AIアシスタントを開く', disabled: !active || busy, checked: aiPanelOpen, action: () => setAiPanelOpen(value => !value) },
    ] },
    { label: '表示', items: [
      ...screens.filter(screen => !['types', 'tags'].includes(screen.id)).map(screen => ({ label: screen.label, checked: view === screen.id, disabled: (screen.id !== 'overview' && !active) || busy, action: () => switchScreen(screen.id) })),
      { label: '左の画面ナビゲーション', checked: navigationVisible, action: () => setNavigationVisible(value => !value) },
      { label: 'ダークモード', checked: theme === 'dark', action: () => setTheme(value => value === 'dark' ? 'light' : 'dark') },
    ] },
    { label: 'シナリオ', items: [
      { label: 'グラフで構成を編集', disabled: !active || busy, action: () => switchScreen('graph') },
      { label: '章構成・出力前チェック', disabled: !active || busy, action: () => switchScreen('outline') },
      { label: 'ノード・接続タイプを管理', disabled: !active || busy, action: () => switchScreen('types') },
      { label: 'タグを管理', disabled: !active || busy, action: () => switchScreen('tags') },
    ] },
    { label: 'ヘルプ', items: [{ label: '操作と保存について', action: () => helpDialog.current?.showModal() }] },
  ];
  return <div className={`app${view === 'graph' ? ' graph-mode' : ''}${focus ? ' focus' : ''}${active ? ' has-project' : ''}${active && view !== 'overview' ? ' workspace-mode' : ''}${navExpanded ? ' is-nav-expanded' : ''}${navigationVisible ? '' : ' navigation-hidden'}`} aria-busy={busy} inert={busy}>
    <input ref={menuImport} type="file" accept="application/json,.json" hidden aria-label="JSONバックアップを選択" onChange={event => { const file = event.target.files?.[0]; if (file) void run(() => importFile(file)); event.target.value = ''; }}/>
    <dialog ref={helpDialog} className="application-help" aria-labelledby="application-help-title">
      <h2 id="application-help-title">操作と保存について</h2>
      <p>上部メニューから保存・検索・画面切り替えを選べます。「表示」から左の画面ナビゲーションを再表示できます。ノードや資料の一覧は各作業画面で利用できます。</p>
      <p>メニューは矢印キーで移動、Enterで実行、Escで閉じます。本文のUndo・Redoは本文ツールバー、グラフのUndo・Redoはグラフツールバーから操作できます。</p>
      <p>作品はこのブラウザに自動保存されます。「今すぐ端末に保存」は保存待ちの変更を保存します。別の端末へ移す場合やバックアップには「JSONバックアップを保存」を利用してください。JSONからの復元は別プロジェクトとして読み込みます。</p>
      <form method="dialog"><button autoFocus>閉じる</button></form>
    </dialog>
    <header className="topbar"><a className="brand" href="/" aria-label="Scenario Editor ホーム">◈ <span>SCENARIO <b>EDITOR</b></span></a><div className="topbar-context"><strong>{active?.project.title || 'Scenario Editor'}</strong><span>{active ? ` / ${screenLabels[view]}` : ' / シナリオ執筆環境'}</span></div><button type="button" className="search-launch" disabled={!active} aria-keyshortcuts="Control+K Meta+K" onClick={() => setSearchOpen(true)}>検索 <kbd>Ctrl K</kbd></button><div className="appearance-controls">{view === 'overview' && <button className="focus-toggle" onClick={() => setFocus(!focus)}>{focus ? '通常表示' : '集中表示'}</button>}<details className="appearance-settings"><summary>外観</summary><div className="appearance-picker-list"><ColorPicker label="テーマカラー" value={themeColor} onChange={setThemeColor}/><ColorPicker label="背景色" value={backgroundColor} onChange={setBackgroundColor}/><label className="appearance-select">UIフォント<select value={uiFont} onChange={event => setUiFont(event.target.value as typeof uiFont)}><option value="mono">Consolas / Courier New</option><option value="sans">ゴシック体</option></select></label><label className="appearance-select">本文フォント<select value={bodyFont} onChange={event => setBodyFont(event.target.value as typeof bodyFont)}><option value="sans">ゴシック体</option><option value="serif">明朝体</option><option value="mono">Consolas / Courier New</option></select></label><label className="appearance-select">本文サイズ <output>{bodyFontSize}px</output><input type="range" min="14" max="24" step="1" value={bodyFontSize} onChange={event => setBodyFontSize(Number(event.target.value))}/></label><section className="contrast-check" aria-live="polite"><strong>テーマ色のコントラスト</strong><span>テーマ色／画面面 <b>{accentOnSurface.toFixed(1)}:1</b></span><span>白文字／テーマ色 <b>{whiteOnAccent.toFixed(1)}:1</b></span><p className={contrastNeedsAttention ? 'needs-attention' : 'contrast-ok'}>{contrastNeedsAttention ? '4.5:1を下回る組み合わせがあります。テーマ色または背景色を調整してください。' : '通常サイズの文字で読みやすさの目安を満たしています。'}</p></section></div></details><button className="theme-toggle" aria-label={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'} aria-pressed={theme === 'dark'} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ ライト' : '☾ ダーク'}</button></div></header>
    <ApplicationMenu groups={menuGroups}/>
    {aiPanelOpen && active && <AIAssistantPanel snapshot={active} selectedNodeId={openedNode} selection={aiSelection} credential={driveCredential} canApplySelection={view === 'writing' && !!aiSelection && aiSelection.documentId === active.nodes.find(node => node.id === openedNode)?.documentId} onClose={() => setAiPanelOpen(false)}/>}
    {active && <nav className={`activity-bar${navExpanded ? ' is-expanded' : ''}`} aria-label="作業画面"><button className="activity-bar__toggle" type="button" aria-label={navExpanded ? 'ナビゲーションを折りたたむ' : 'ナビゲーションを展開'} aria-expanded={navExpanded} title={navExpanded ? 'ナビゲーションを折りたたむ' : 'ナビゲーションを展開'} onClick={() => { const next = !navExpanded; setNavExpanded(next); try { localStorage.setItem('scenario-editor-nav-expanded', String(next)); } catch { /* Keep the current-session setting when browser storage is unavailable. */ } }}><span aria-hidden="true">{navExpanded ? '‹' : '›'}</span><small>{navExpanded ? 'ナビを閉じる' : 'ナビを開く'}</small></button><div className="activity-bar__divider"/><p className="activity-bar__heading">{navExpanded ? 'WORKSPACE' : ' '}</p>{screens.map(screen => <button className="activity-bar__item" key={screen.id} type="button" title={screen.label} aria-label={screen.label} aria-current={view === screen.id ? 'page' : undefined} onClick={() => switchScreen(screen.id)}><span aria-hidden="true">{screen.icon}</span><small>{screen.label}</small></button>)}</nav>}
    <div className="workspace" hidden={view !== 'overview'} style={view !== 'overview' ? { display: 'none' } : undefined}>
      <aside className="sidebar"><div className="eyebrow">YOUR WORKSPACE</div><h2>シナリオ</h2><button className="primary wide" disabled={!ready || busy} onClick={() => void run(async () => { await settle(); const row = await repo.current!.save(createProject(), 0); await refresh(); select(row); })}>＋ 新規プロジェクト</button>
        <nav aria-label="プロジェクト一覧">{projects.map(row => <button className={row.id === active?.project.id ? 'project selected' : 'project'} key={row.id} disabled={busy} onClick={() => void run(async () => { await settle(); const latest = await repo.current!.load(row.id); if (latest) select(latest); await refresh(); })}><span>▤</span><span>{row.id === active?.project.id ? active.project.title || '無題' : row.snapshot.project.title || '無題'}<small>{new Date(row.savedAt).toLocaleDateString('ja-JP')}</small></span></button>)}</nav>
        <div className="sidebar-bottom"><label className="import">↑ JSONから復元<input type="file" accept="application/json,.json" disabled={!ready || busy} onChange={e => { const file = e.target.files?.[0]; if (file) void run(() => importFile(file)); e.target.value = ''; }} /></label><p>このブラウザに保存されます。<br/>定期的にJSONを退避してください。</p></div>
      </aside>
      <main><div className="breadcrumb">ワークスペース <span>/</span> プロジェクト概要</div>
        {error && <div className="error" role="alert">{error}<div><button onClick={() => void saver.current?.flush()}>保存を再試行</button>{active && <button onClick={download}>未保存JSONを退避</button>}</div></div>}
        {!active ? <section className="empty"><div className="sigil">◈</div><div className="eyebrow">EVERY STORY STARTS HERE</div><h1>物語の、はじまりを。</h1><p>新規プロジェクトを作成して、<br/>シナリオの名前と構想を記録しましょう。</p><p className="muted">{ready ? '作成後に「グラフ」からノードをつなげられます。' : 'ローカルデータを確認しています…'}</p></section> : <>
          <section className="intro"><div className="eyebrow">PROJECT OVERVIEW</div><h1>物語の輪郭</h1><p>ひらめきを残して、次の一場面へ。</p></section>
          <section className="editor"><label htmlFor="title">シナリオタイトル</label><input id="title" className="title-input" value={active.project.title} disabled={busy} onChange={e => edit('title', e.target.value)} placeholder="無題のシナリオ"/><div className="divider"/><label htmlFor="description">構想・プロジェクトメモ <span>プレーンテキスト</span></label><textarea id="description" value={active.project.description} disabled={busy} onChange={e => edit('description', e.target.value)} placeholder="舞台、テーマ、プレイヤーに届けたい体験…"/><div className="editor-footer"><span>{active.project.description.length.toLocaleString()} 文字</span><span>自動保存 · 0.5秒</span></div></section>
          <div className="stats">{[['ノード', active.nodes.length],['設定資料', active.entities.length],['アウトライン', active.outline.length]].map(([label,count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
        </>}
      </main>
      <aside className="details"><div className="eyebrow">PROJECT STATUS</div><h2>保存とバックアップ</h2><div className={`status ${status}`}><i/>{labels[status]}</div><p className="muted">{online ? 'オンライン' : 'オフライン'} · 保存先はこの端末</p><p className="last-saved-time">最終保存: {lastSavedAt ? new Date(lastSavedAt).toLocaleString('ja-JP') : 'まだ保存されていません'}</p><button className="wide" disabled={!active} onClick={download}>↓ JSONバックアップ</button><button className="wide" disabled={!active || busy} onClick={() => void run(async () => { await settle(); setHistory(await repo.current!.revisions(active!.project.id)); })}>保存履歴を表示</button>
        <section className="storage-health" aria-label="データ保護状況"><h3>データ保護</h3><p className="backup-age">{lastBackupAt ? `最終ダウンロード: ${new Date(lastBackupAt).toLocaleString('ja-JP')}` : 'このプロジェクトのJSON退避履歴はありません'}</p>{storageEstimate && <>{storageEstimate.quota && <><label htmlFor="site-storage-meter">このサイトの保存領域（概算）</label><progress id="site-storage-meter" max="100" value={Math.min(100, storageEstimate.usage / storageEstimate.quota * 100)}/></>}<small>{formatBytes(storageEstimate.usage)} 使用{storageEstimate.quota ? ` / ${formatBytes(storageEstimate.quota)} 推定上限` : ''} · ブラウザの概算値</small></>}{(!lastBackupAt || Date.now() - new Date(lastBackupAt).getTime() > 30 * 24 * 60 * 60 * 1000) && <p className="backup-reminder">JSONファイルを端末へ退避しておくと、ブラウザのデータ消去後も復元できます。</p>}</section>
        {history.length > 0 && <div className="history">{history.map(row => <div key={row.revision}><small>保存 #{row.revision}<br/>{new Date(row.savedAt).toLocaleString('ja-JP')}</small><button disabled={busy} onClick={() => { if (confirm('この履歴を復元しますか？現在の保存内容も履歴に残ります。')) void run(async () => { await settle(); const restored = await repo.current!.restore(active!.project.id, row.revision, saver.current!.revision); select(restored); await refresh(); }); }}>復元</button></div>)}</div>}
        <div className="roadmap"><div className="eyebrow">DEVELOPMENT NOTES</div><h3>執筆環境を、少しずつ。</h3><p>プロジェクト保存とノードグラフを利用できます。</p><ol><li className="done">ローカル保存基盤</li><li className="done">ノードグラフ</li><li>本文・設定資料</li><li>アウトライン・出力</li><li>GitHub連携</li><li>モバイル・PWA</li></ol></div>
      </aside>
    </div>
    {active && view !== 'overview' && <div className="workspace-surface">
      <div className="graph-savebar"><span className={status === 'error' ? 'save-error' : ''} role="status">{labels[status]}</span><span>{online ? 'オンライン' : 'オフライン'}</span><span className="last-saved-inline" title={lastSavedAt ? new Date(lastSavedAt).toLocaleString('ja-JP') : undefined}>最終保存 {lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '—'}</span><span className="backup-inline">{lastBackupAt ? `JSON退避 ${new Date(lastBackupAt).toLocaleDateString('ja-JP')}` : 'JSON未退避'}</span><button onClick={download}>JSONバックアップ</button></div>
      {projectTabsReady && <EditorTabs tabs={editorTabs.tabs} activeKey={editorTabs.activeKey} titleFor={tab => tab.kind === 'node' ? active.nodes.find(node => node.id === tab.id)?.title || '無題のノード' : active.entities.find(entity => entity.id === tab.id)?.name || '無名の資料'} canBack={backHistory.length > 0} canForward={forwardHistory.length > 0} onBack={goBack} onForward={goForward} onActivate={tab => navigateEditorTarget(tab)} onClose={closeEditorTarget} onTogglePin={tab => setEditorTabs(current => pinEditorTab(current, editorTargetKey(tab)))}/> }
      {error && <div className="error" role="alert">{error}<button onClick={() => void saver.current?.flush()}>保存を再試行</button><button onClick={download}>未保存JSONを退避</button></div>}
      {view === 'graph' && <GraphEditor key={`${active.project.id}-${editorSession}`} snapshot={active} disabled={busy} initialSelectedNodeId={graphFocusNodeId} onOpenOutline={(itemId, nodeId) => { setFocusOutlineItemId(itemId); setOutlineTargetNodeId(nodeId); setView('outline'); }} onWriteNode={id => navigateEditorTarget({ kind: 'node', id })} onOpenEntity={id => navigateEditorTarget({ kind: 'entity', id })} onChange={data => { current.current = data; setActive(data); saver.current!.enqueue(data); }}/>}
      {view !== 'graph' && <div className="phase-three-panel">{PhaseThreeContent()}</div>}
      {active && <EntityHoverCard snapshot={active} onOpen={id => navigateEditorTarget({ kind: 'entity', id })}/>}
    </div>}
    <footer className="bottom"><span>TRPG SCENARIO EDITOR</span><span><a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/privacy/`}>プライバシー</a>　·　あなたの物語は、あなたの手元に。</span></footer>
    <nav className="mobile-primary-nav" aria-label="メイン画面">{screens.map(screen => <button key={screen.id} disabled={screen.id !== 'overview' && !active} aria-current={view === screen.id ? 'page' : undefined} aria-label={screen.label} title={screen.label} onClick={() => switchScreen(screen.id)}><span aria-hidden="true">{screen.icon}</span><small>{screen.label}</small></button>)}</nav>
    {searchOpen && active && <CommandSearch snapshot={active} onClose={() => setSearchOpen(false)} onOpen={result => { setSearchOpen(false); navigateEditorTarget({ kind: result.kind, id: result.id }); }}/>}
  </div>;
}





