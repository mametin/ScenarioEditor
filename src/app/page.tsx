'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { createProject } from '../domain/project';
import { parseSnapshot, type Snapshot } from '../domain/schema';
import { ProjectRepository, ScenarioDatabase, type Stored } from '../storage/database';
import { Autosave, type SaveStatus } from '../storage/autosave';
import ColorPicker from '../components/ColorPicker';
import CommandSearch from '../components/CommandSearch';
const GraphEditor = dynamic(() => import('../components/graph/GraphEditor'), { ssr: false, loading: () => <p>グラフを読み込んでいます…</p> });

const RichTextEditor = dynamic(() => import('../components/editor/RichTextEditor'), { ssr: false });
const WritingWorkspace = dynamic(() => import('../components/WritingWorkspace'), { ssr: false });
const EntityManager = dynamic(() => import('../components/entities/EntityManager'), { ssr: false });
const NodeTypeManager = dynamic(() => import('../components/types/NodeTypeManager'), { ssr: false });
const TagManager = dynamic(() => import('../components/types/TagManager'), { ssr: false });
const OutlineWorkspace = dynamic(() => import('../components/OutlineWorkspace'), { ssr: false });

const labels = { saved: 'ローカル保存済み', pending: '未保存の変更あり', saving: '保存中…', error: '保存できませんでした' };
const screens = [
  { id: 'overview', label: '概要', icon: '◫' }, { id: 'graph', label: 'グラフ', icon: '⠿' },
  { id: 'writing', label: '執筆', icon: '¶' }, { id: 'entities', label: '設定資料', icon: '◈' },
  { id: 'outline', label: 'アウトライン', icon: '☷' }, { id: 'types', label: 'タイプ', icon: '▤' }, { id: 'tags', label: 'タグ', icon: '#' },
] as const;
const screenLabels = Object.fromEntries(screens.map(screen => [screen.id, screen.label])) as Record<(typeof screens)[number]['id'], string>;
function darkenHex(hex: string, amount: number) { return `#${[1, 3, 5].map(index => Math.round(parseInt(hex.slice(index, index + 2), 16) * (1 - amount)).toString(16).padStart(2, '0')).join('')}`; }
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
  const [openedNode, setOpenedNode] = useState<string>();
  const [editorSession, setEditorSession] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [themeColor, setThemeColor] = useState('#476955');
  const [backgroundColor, setBackgroundColor] = useState('#f5f4ef');
  const [themeReady, setThemeReady] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string>();
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota?: number }>();
  const repo = useRef<ProjectRepository | undefined>(undefined);
  const saver = useRef<Autosave | undefined>(undefined);
  const current = useRef<Snapshot | undefined>(undefined);
  function report(e: unknown) { setError(e instanceof Error ? e.message : '処理に失敗しました'); }
  useEffect(() => {
    let initial: 'light' | 'dark' = 'light';
    let color = '#476955';
    let background = '#f5f4ef';
    try {
      if (localStorage.getItem('scenario-editor-theme') === 'dark') initial = 'dark';
      const savedColor = localStorage.getItem('scenario-editor-theme-color');
      if (savedColor && /^#[0-9a-f]{6}$/i.test(savedColor)) color = savedColor;
      const savedBackground = localStorage.getItem('scenario-editor-background-color');
      if (savedBackground && /^#[0-9a-f]{6}$/i.test(savedBackground)) background = savedBackground;
    } catch { /* Appearance is a preference; the app remains usable when storage is blocked. */ }
    document.documentElement.dataset.theme = initial;
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--theme-background', background);
    setTheme(initial); setThemeColor(color); setBackgroundColor(background); setThemeReady(true);
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
    current.current = row.snapshot; setActive(row.snapshot); setHistory([]); setError(''); setStatus('saved');
    saver.current = new Autosave(repo.current!, row.revision, (state, message) => { setStatus(state); if (message) setError(message); else if (state === 'saved') setError(''); });
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
  function PhaseThreeContent() {
    if (!active) return null;
    if (view === 'writing') return <WritingWorkspace key={`${active.project.id}-${openedNode ?? ''}`} snapshot={active} onChange={saveEditor} selectedNodeId={openedNode} onOpenEntity={id => { setOpenedEntity(id); setView('entities'); }}/>
    if (view === 'entities') return <EntityManager snapshot={active} onChange={saveEditor} selectedEntityId={openedEntity} onSelectEntity={setOpenedEntity} renderDescription={id => <RichTextEditor key={id} snapshot={active} documentId={id} onChange={saveEditor} onOpenEntity={setOpenedEntity} onOpenNode={id => { setOpenedNode(id); setView("writing"); }}/>} onSelectNode={id => { setOpenedNode(id); setView('writing'); }}/>
    if (view === 'types') return <NodeTypeManager snapshot={active} onChange={saveEditor}/>;
    if (view === 'tags') return <TagManager snapshot={active} onChange={saveEditor}/>;
    if (view === 'outline') return <OutlineWorkspace snapshot={active} onChange={saveEditor}/>;
    return null;
  }
  return <div className={`app${view === 'graph' ? ' graph-mode' : ''}${focus ? ' focus' : ''}${active ? ' has-project' : ''}${active && view !== 'overview' ? ' workspace-mode' : ''}`}>
    <header className="topbar"><a className="brand" href="/" aria-label="Scenario Editor ホーム">◈ <span>SCENARIO <b>EDITOR</b></span></a><div className="topbar-context"><strong>{active?.project.title || 'Scenario Editor'}</strong><span>{active ? ` / ${screenLabels[view]}` : ' / シナリオ執筆環境'}</span></div><button type="button" className="search-launch" disabled={!active} aria-keyshortcuts="Control+K Meta+K" onClick={() => setSearchOpen(true)}>検索 <kbd>Ctrl K</kbd></button><div className="appearance-controls">{view === 'overview' && <button className="focus-toggle" onClick={() => setFocus(!focus)}>{focus ? '通常表示' : '集中表示'}</button>}<details className="appearance-settings"><summary>外観</summary><div className="appearance-picker-list"><ColorPicker label="テーマカラー" value={themeColor} onChange={setThemeColor}/><ColorPicker label="背景色" value={backgroundColor} onChange={setBackgroundColor}/></div></details><button className="theme-toggle" aria-label={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'} aria-pressed={theme === 'dark'} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ ライト' : '☾ ダーク'}</button></div></header>
    {active && <nav className="activity-bar" aria-label="作業画面">{screens.map(screen => <button key={screen.id} type="button" title={screen.label} aria-label={screen.label} aria-current={view === screen.id ? 'page' : undefined} disabled={screen.id !== 'overview' && !active} onClick={() => setView(screen.id)}><span aria-hidden="true">{screen.icon}</span><small>{screen.label}</small></button>)}</nav>}
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
      <aside className="details"><div className="eyebrow">PROJECT STATUS</div><h2>保存とバックアップ</h2><div className={`status ${status}`}><i/>{labels[status]}</div><p className="muted">{online ? 'オンライン' : 'オフライン'} · 保存先はこの端末</p><button className="wide" disabled={!active} onClick={download}>↓ JSONバックアップ</button><button className="wide" disabled={!active || busy} onClick={() => void run(async () => { await settle(); setHistory(await repo.current!.revisions(active!.project.id)); })}>保存履歴を表示</button>
        <section className="storage-health" aria-label="データ保護状況"><h3>データ保護</h3><p className="backup-age">{lastBackupAt ? `最終ダウンロード: ${new Date(lastBackupAt).toLocaleString('ja-JP')}` : 'このプロジェクトのJSON退避履歴はありません'}</p>{storageEstimate && <>{storageEstimate.quota && <><label htmlFor="site-storage-meter">このサイトの保存領域（概算）</label><progress id="site-storage-meter" max="100" value={Math.min(100, storageEstimate.usage / storageEstimate.quota * 100)}/></>}<small>{formatBytes(storageEstimate.usage)} 使用{storageEstimate.quota ? ` / ${formatBytes(storageEstimate.quota)} 推定上限` : ''} · ブラウザの概算値</small></>}{(!lastBackupAt || Date.now() - new Date(lastBackupAt).getTime() > 30 * 24 * 60 * 60 * 1000) && <p className="backup-reminder">JSONファイルを端末へ退避しておくと、ブラウザのデータ消去後も復元できます。</p>}</section>
        {history.length > 0 && <div className="history">{history.map(row => <div key={row.revision}><small>保存 #{row.revision}<br/>{new Date(row.savedAt).toLocaleString('ja-JP')}</small><button disabled={busy} onClick={() => { if (confirm('この履歴を復元しますか？現在の保存内容も履歴に残ります。')) void run(async () => { await settle(); const restored = await repo.current!.restore(active!.project.id, row.revision, saver.current!.revision); select(restored); await refresh(); }); }}>復元</button></div>)}</div>}
        <div className="roadmap"><div className="eyebrow">DEVELOPMENT NOTES</div><h3>執筆環境を、少しずつ。</h3><p>プロジェクト保存とノードグラフを利用できます。</p><ol><li className="done">ローカル保存基盤</li><li className="done">ノードグラフ</li><li>本文・設定資料</li><li>アウトライン・出力</li><li>GitHub連携</li><li>モバイル・PWA</li></ol></div>
      </aside>
    </div>
    {active && view !== 'overview' && <div className="workspace-surface">
      <div className="graph-savebar"><span className={status === 'error' ? 'save-error' : ''} role="status">{labels[status]}</span><span>{online ? 'オンライン' : 'オフライン'}</span><span className="backup-inline">{lastBackupAt ? `JSON退避 ${new Date(lastBackupAt).toLocaleDateString('ja-JP')}` : 'JSON未退避'}</span><button onClick={download}>JSONバックアップ</button></div>
      {error && <div className="error" role="alert">{error}<button onClick={() => void saver.current?.flush()}>保存を再試行</button><button onClick={download}>未保存JSONを退避</button></div>}
      {view === 'graph' && <GraphEditor key={`${active.project.id}-${editorSession}`} snapshot={active} disabled={busy} onWriteNode={id => { setOpenedNode(id); setView("writing"); }} onOpenEntity={id => { setOpenedEntity(id); setView('entities'); }} onChange={data => { current.current = data; setActive(data); saver.current!.enqueue(data); }}/>}
      {view !== 'graph' && <div className="phase-three-panel">{PhaseThreeContent()}</div>}
    </div>}
    <footer className="bottom"><span>TRPG SCENARIO EDITOR</span><span>あなたの物語は、あなたの手元に。</span></footer>
    <nav className="mobile-primary-nav" aria-label="メイン画面">{screens.map(screen => <button key={screen.id} disabled={screen.id !== 'overview' && !active} aria-current={view === screen.id ? 'page' : undefined} aria-label={screen.label} title={screen.label} onClick={() => setView(screen.id)}><span aria-hidden="true">{screen.icon}</span><small>{screen.label}</small></button>)}</nav>
    {searchOpen && active && <CommandSearch snapshot={active} onClose={() => setSearchOpen(false)} onOpen={result => { setSearchOpen(false); if (result.kind === 'node') { setOpenedNode(result.id); setView('writing'); } else { setOpenedEntity(result.id); setView('entities'); } }}/>}
  </div>;
}





