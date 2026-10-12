import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, ArrowUpRight, ArrowLeft, Plus, Folder, FileText, Inbox, SlidersHorizontal, Layers, Search, Sun, Moon, Check, X, Square, ChevronRight, ShieldCheck, Activity, Cpu, LoaderCircle, Cable, LockKeyhole, PanelRightClose, Circle, CheckCircle2 } from 'lucide-react';
import { bridge } from './bridge';
import type { TaskView, SkillId, FolderGrant, ProviderView, Artifact, SkillView, SkillImport, ExecutionSettings, SnapshotSettings, WorkspaceState } from '../shared/contracts';
import { Markdown } from './Markdown';
import { ConsentPanel, DecisionPanel, MessageComposer, type LocalDecision } from './DecisionPanel';
import { WorkspacePane } from './WorkspacePane';
import { MaterialBar } from './MaterialBar';
import { ProjectControls } from './ProjectControls';
import { ProjectBrowser } from './ProjectBrowser';
import type { ProjectState } from '../shared/contracts';
import type { ProjectContext, ResourceSource } from '../shared/contracts';
import { ResourceBrowser } from './ResourceBrowser';

type Page = 'home' | 'artifacts' | 'capabilities' | 'settings';
const statusLabels: Record<TaskView['status'], string> = {
  queued: '等待执行', running: '进行中', paused: '已暂停', awaiting_approval: '待你审阅', awaiting_input: '等待回答', awaiting_reconciliation: '需要检查效果', completed: '已完成', failed: '未完成', cancelled: '已停止'
};
const skills: { id: SkillId; title: string; description: string }[] = [
  { id: 'general', title: '通用助理', description: '按目标选择步骤。简单问题可以直接回答，不强制任何流程。' },
  { id: 'review', title: '审阅与分析', description: '先看证据，区分已验证的事实、假设和缺失的信息。' },
  { id: 'deliver', title: '成果交付', description: '围绕可审阅的成果组织任务，在必要时提出写入申请。' }
];
function Logo({ small = false }: { small?: boolean }) {
  return <svg role="img" aria-label="Agent47" width={small ? 28 : 40} height={small ? 28 : 40} viewBox="0 0 40 40" fill="none">
    <path d="M8 29 19 8h7L15 29H8Z" fill="currentColor" /><path d="M20 22h11M29 12v18" stroke="currentColor" strokeWidth="4" strokeLinecap="square" />
  </svg>;
}
function Status({ task }: { task: TaskView }) {
  return <span className={`status ${task.status}`}>{task.status === 'running' ? <LoaderCircle size={13} className="spin" /> : task.status === 'completed' ? <Check size={13} /> : <Circle size={8} fill="currentColor" />}{statusLabels[task.status]}</span>;
}
function time(value: string) { return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }

export function App() {
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [projectState, setProjectState] = useState<ProjectState>({ projects: [] });
  const [projectContext, setProjectContext] = useState<ProjectContext>();
  const [pinExclusions, setPinExclusions] = useState<Record<string, string[]>>({});
  const [resourcePicker, setResourcePicker] = useState(false);
  const [newProject, setNewProject] = useState(false), [projectName, setProjectName] = useState('');
  const project = projectState.projects.find(p => p.id === projectState.currentId);
  const activeContext = projectContext?.projectId === project?.id ? projectContext : undefined;
  const initialPins = activeContext?.pins.filter(p => !(pinExclusions[project!.id] ?? []).includes(p.id)) ?? [];
  const projectDrafts = useRef<Record<string, string>>({});
  const projectMaterialDrafts = useRef<Record<string, { ticket: string; material: import('../shared/contracts').MaterialView }[]>>({});
  const [page, setPage] = useState<Page>('home');
  const [selected, setSelected] = useState<string>();
  const [selectionLoaded, setSelectionLoaded] = useState(bridge.preview);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [goal, setGoal] = useState('');
  const [skill, setSkill] = useState<SkillId>('general');
  const [folder, setFolder] = useState<FolderGrant>();
  const [initialMaterials, setInitialMaterials] = useState<{ ticket: string; material: import('../shared/contracts').MaterialView }[]>([]);
  const [theme, setTheme] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inspector, setInspector] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceState>({ tabs: [], width: 440, visible: false });
  const [connection, setConnection] = useState<ProviderView>();
  const [editingDecision, setEditingDecision] = useState(false);
  const [localDecision, setLocalDecision] = useState<LocalDecision>();
  const [composerDrafts, setComposerDrafts] = useState<Record<string, string>>({});
  const [extensions, setExtensions] = useState<SkillView[]>([]);
  const [skillImport, setSkillImport] = useState<SkillImport>();
  const [hostEnabled, setHostEnabled] = useState(false);
  const [fileMode, setFileMode] = useState<'snapshot' | 'ask'>('snapshot');
  const goalRef = useRef<HTMLTextAreaElement>(null);
  const task = tasks.find(t => t.id === selected);
  const current = task && tasks.find(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id));
  const historical = !!task && current?.id !== task.id;
  const title = (t: TaskView) => t.conversationTitle ?? tasks.filter(o => (o.conversationId ?? o.id) === (t.conversationId ?? t.id)).at(-1)?.goal.split('\n')[0].slice(0, 60) ?? t.goal;
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const needsDecision = !!task && (['paused', 'awaiting_input', 'awaiting_approval', 'awaiting_reconciliation'].includes(task.status) || (task.status === 'cancelled' && !!task.unknownEffect));
  useEffect(() => { setEditingDecision(false); setLocalDecision(undefined); setResourcePicker(false); }, [selected, project?.id]);
  useEffect(() => { let alive = true; if (project) void bridge.projectContext(project.id).then(c => { if (alive) setProjectContext(c); }).catch(() => setError('未能读取项目上下文，请检查原数据。')); else setProjectContext(undefined); return () => { alive = false; }; }, [project?.id, project?.revision]);
  useEffect(() => {
    if (!bridge.preview) void bridge.lastRun().then(id => { setSelected(value => value ?? id); setSelectionLoaded(true); }).catch(() => setSelectionLoaded(true));
  }, []);
  useEffect(() => { if (selectionLoaded && !bridge.preview) void bridge.rememberRun(selected).catch(() => setError('未能保存打开位置；任务记录仍保留。')); }, [selected, selectionLoaded]);
  useEffect(() => { if (!needsDecision) setEditingDecision(false); }, [needsDecision]);
  const pending = tasks.filter(t => t.status === 'awaiting_approval').length;
  const refresh = async () => {
    try { setTasks(await bridge.listTasks()); setProjectState(await bridge.projects()); setConnection(await bridge.provider()); setExtensions(await bridge.listSkills()); setWorkspace(await bridge.workspaceView()); const execution = await bridge.executionSettings(); setHostEnabled(execution.hostExecution); setFileMode(execution.fileMode ?? 'snapshot'); }
    catch { setError('未能加载本地任务。请检查应用存储，不要删除原有数据。'); }
  };
  useEffect(() => { void refresh(); return bridge.onChange(() => void refresh()); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [page, selected]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault(); setSelected(undefined); setPage('home'); queueMicrotask(() => goalRef.current?.focus());
      }
      if (event.key === 'Escape') { setInspector(false); }
    };
    addEventListener('keydown', handler); return () => removeEventListener('keydown', handler);
  }, []);
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await operation(); await refresh(); } catch (e) { setError((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { setBusy(false); }
  };
  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!goal.trim() || busy) return;
    if (project && !activeContext) { setError('请等待项目说明和固定材料加载完成。'); return; }
    void run(async () => {
      const created = await bridge.createTask({ goal: goal.trim(), skill, folderGrant: project ? undefined : folder?.id, projectId: project?.id, materialTickets: initialMaterials.map(m => m.ticket), projectPinIds: initialPins.map(p => p.id), projectContextRevision: activeContext?.revision });
      setSelected(created.id); setGoal(''); setInitialMaterials([]); setInspector(false);
      if (project) setPinExclusions(old => ({ ...old, [project.id]: [] }));
    });
  };
  const go = (next: Page) => { setPage(next); setSelected(undefined); setError(''); };
  const switchProject = async (id?: string) => {
    projectDrafts.current[projectState.currentId ?? ''] = goal;
    projectMaterialDrafts.current[projectState.currentId ?? ''] = initialMaterials;
    const result = await bridge.switchProject(id); setProjectState(result.state); setWorkspace(result.workspace);
    setGoal(projectDrafts.current[id ?? ''] ?? ''); setFolder(undefined);
    setInitialMaterials(projectMaterialDrafts.current[id ?? ''] ?? []); setSelected(result.lastRun); setPage('home'); setInspector(false);
  };
  const open = (id: string) => {
    const target = tasks.find(t => t.id === id);
    if (target && target.projectId !== projectState.currentId) void run(async () => { await switchProject(target.projectId); setSelected(id); });
    else { setPage('home'); setSelected(id); setInspector(false); setError(''); }
  };
  const setArtifact = (value: { task: TaskView; artifact: Artifact }) => void run(async () => setWorkspace(await bridge.workspaceOpen({ kind: 'artifact', taskId: value.task.id, artifactId: value.artifact.id })));
  const latest = tasks.filter((t, index) => tasks.findIndex(other => (other.conversationId ?? other.id) === (t.conversationId ?? t.id)) === index);
  const scopedLatest = latest.filter(t => !project || t.projectId === project.id);
  const scopedActive = scopedLatest.filter(t => ['running', 'queued'].includes(t.status)).length;
  const scopedPending = scopedLatest.filter(t => t.status === 'awaiting_approval').length;
  const visible = scopedLatest.filter(t => (title(t) + ' ' + t.goal).toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'active' ? ['running', 'queued', 'awaiting_input'].includes(t.status) : t.status === 'awaiting_approval')));
  const pickResource = async (source: ResourceSource) => {
    if (task) { await bridge.attachResource({ taskId: task.id, source }); }
    else {
      const prepared = await bridge.prepareResource(source);
      if (initialPins.some(p => p.material.id === prepared.material.id) || initialMaterials.some(m => m.material.id === prepared.material.id)) await bridge.discardMaterialTicket(prepared.ticket);
      else setInitialMaterials(old => [...old, prepared]);
    }
    setResourcePicker(false);
  };
  const resourcesVersion = tasks.map(t => `${t.id}:${t.projectId}:${t.artifacts.length}:${JSON.stringify(t.fileChanges)}`).join(',');

  return <div className={selected ? 'app task-open' : 'app'}>
    <aside className="sidebar">
      <button className="brand" onClick={() => go('home')} aria-label="回到任务中心"><span className="brand-mark"><Logo small /></span><span>Agent47<span className="brand-caption">YOUR LOCAL AGENT</span></span><span className="version">02</span></button>
      <button className="new-task" onClick={() => { go('home'); queueMicrotask(() => goalRef.current?.focus()); }}><Plus size={17} />新任务<span className="keycap">⌘ N</span></button>
      <nav aria-label="主导航">
        <button className={page === 'home' ? 'nav active' : 'nav'} onClick={() => go('home')}><Inbox size={18} />任务中心{pending > 0 && <span className="nav-count">{pending}</span>}</button>
        <button className={page === 'artifacts' ? 'nav active' : 'nav'} onClick={() => go('artifacts')}><Layers size={18} />资源库</button>
        <button className={page === 'capabilities' ? 'nav active' : 'nav'} onClick={() => go('capabilities')}><ShieldCheck size={18} />能力与边界</button>
      </nav>
      <div className="sidebar-section"><span>工作项目</span><button className="text-button" aria-label="新建项目" onClick={() => setNewProject(!newProject)}>＋</button></div>
      {newProject && <form className="project-create" onSubmit={e => { e.preventDefault(); if (projectName.trim()) void run(async () => { const p = await bridge.createProject({ name: projectName, clientRequestId: crypto.randomUUID() }); setNewProject(false); setProjectName(''); await switchProject(p.id); }); }}><input aria-label="新项目名称" placeholder="例如：家庭资料、周报、旅行" maxLength={96} value={projectName} onChange={e => setProjectName(e.target.value)} /><button className="secondary small-button" disabled={busy || !projectName.trim()}>创建项目</button></form>}
      <div className="project-nav" aria-label="工作项目列表"><button className={!project ? 'recent-item selected' : 'recent-item'} onClick={() => void run(() => switchProject())}>全部会话</button>
        {projectState.projects.filter(p => !p.archived).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)).map(p => <button key={p.id} className={p.id === project?.id ? 'recent-item selected' : 'recent-item'} title={p.name} onClick={() => void run(() => switchProject(p.id))}>{p.pinned ? '置顶 · ' : ''}{p.name}</button>)}
        {projectState.projects.some(p => p.archived) && <details><summary>已归档</summary>{projectState.projects.filter(p => p.archived).map(p => <button className="recent-item" key={p.id} onClick={() => void run(() => switchProject(p.id))}>{p.name}</button>)}</details>}
      </div>
      <div className="sidebar-section"><span>{project ? '项目会话' : '最近会话'}</span><span className="tiny">{scopedLatest.length}</span></div>
      <div className="recent-nav">{scopedLatest.slice(0, 20).map(t => <button key={t.id} className={t.id === selected ? 'recent-item selected' : 'recent-item'} onClick={() => open(t.id)}>
        <span className={`task-dot ${t.status}`} /><span>{title(t)}</span>
      </button>)}{!tasks.length && <p className="sidebar-empty">你的第一个任务会出现在这里。</p>}</div>
      <div className="sidebar-bottom">
        <div className="local-indicator"><span className="local-dot" /><span>本地工作空间<small>{bridge.preview ? '交互预览 · 示例数据' : '任务保存在这台设备'}</small></span><LockKeyhole size={14} /></div>
        <button className={page === 'settings' ? 'nav active' : 'nav'} onClick={() => go('settings')}><SlidersHorizontal size={17} />连接设置与工具<span className={connection?.configured ? 'connected-dot' : 'disconnected-dot'} /></button>
      </div>
    </aside>
    <div className="shell">
      <header className="topbar"><div className="breadcrumb"><span>工作空间</span><ChevronRight size={14} /><strong>{selected ? '任务详情' : { home: '任务中心', artifacts: '资源库', capabilities: '能力与边界', settings: '连接设置' }[page]}</strong></div>
        <div className="topbar-right">{bridge.preview && <span className="preview-label">交互预览 · 不调用模型</span>}<span className="model-label"><Cpu size={14} />{connection?.model || '未连接模型'}</span>
          <button className="text-button" onClick={() => void run(async () => setWorkspace(await bridge.workspaceImport()))}>打开文件</button>
          <button className="text-button" onClick={() => void run(async () => setWorkspace(await bridge.workspaceUpdate({ visible: !workspace.visible })))}>工作区{workspace.tabs.length > 0 ? ` ${workspace.tabs.length}` : ''}</button>
          <button className="icon-button" aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button></div>
      </header>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="关闭错误提示"><X size={16} /></button></div>}
      <div className="shell-body">
      <main className={selected ? 'content task-content' : 'content'}>
        {project && <ProjectControls key={project.id} project={project} busy={busy} run={run} />}
        {page === 'home' && !task && <div className="home page-enter">
          <div className="home-heading"><div><h1>{project ? project.name : 'Agentic Workbench'}</h1><p>交办日常工作：整理、研究、写作与办公 · DeepSeek</p></div>{project && <button className="secondary small-button" onClick={() => void run(async () => setWorkspace(await bridge.workspaceUpdate({ visible: true })))}>项目文件与成果</button>}</div>
          <form className="composer" onSubmit={create}>
            <div className="material-bar"><div className="material-chips">{initialPins.map(p => <span className="material-chip" key={p.id}>固定：{p.material.name} · {p.material.sha256.slice(0, 6)}<button type="button" aria-label={`本次不引用：${p.material.name}`} onClick={() => setPinExclusions(old => ({ ...old, [project!.id]: [...(old[project!.id] ?? []), p.id] }))}>×</button></span>)}{initialMaterials.map(m => <span key={m.ticket} className="material-chip">{m.material.name} · {m.material.sha256.slice(0, 6)}<button type="button" disabled={busy} aria-label={`移除待发送材料：${m.material.name}`} onClick={() => void run(async () => { await bridge.discardMaterialTicket(m.ticket); setInitialMaterials(old => old.filter(item => item.ticket !== m.ticket)); })}>×</button></span>)}</div>
              <button type="button" className="text-button" disabled={busy || initialMaterials.length + initialPins.length >= 10} onClick={() => void run(async () => { const m = await bridge.prepareMaterial(); if (m) setInitialMaterials(old => [...old, m]); })}>＋引用文件材料</button><button type="button" className="text-button" onClick={() => setResourcePicker(v => !v)}>@ 资源</button><span>发送时引用版本，按需读取，不授权父目录。</span></div>
            {resourcePicker && <><button type="button" className="text-button" onClick={() => setResourcePicker(false)}>关闭资源选择</button><ResourceBrowser project={project} busy={busy} version={resourcesVersion} run={run} open={setWorkspace} pick={pickResource} /></>}
            <label className="sr-only" htmlFor="goal">任务目标</label>
            <textarea id="goal" ref={goalRef} placeholder="描述目标，输入 @ 选择资源…" value={goal} onChange={e => { setGoal(e.target.value); if (e.target.value.endsWith('@')) setResourcePicker(true); }} maxLength={12000} rows={2} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') create(e); }} />
            <div className="composer-bottom"><div className="composer-options">{project ? <span className="context-chip" title={project.rootEnabled ? project.root : '项目未授权目录'}><Folder size={16} /><span>{project.rootEnabled ? '项目目录已授权' : '项目无目录授权'}</span></span> : <><button type="button" className={folder ? 'context-chip attached' : 'context-chip'} onClick={() => void run(async () => { const grant = await bridge.chooseFolder(); if (grant) setFolder(grant); })}><Folder size={16} /><span>{folder ? folder.path.split(/[\\/]/).pop() : '选择项目目录'}</span></button>{folder && <button type="button" className="icon-button" aria-label="移除目录授权" onClick={() => setFolder(undefined)}><X size={14} /></button>}</>}<label className="skill-select"><span className="sr-only">任务指导</span><select value={skill} onChange={e => setSkill(e.target.value as SkillId)}>{skills.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label></div><button type="submit" className="submit-button" aria-label="开始任务" disabled={!goal.trim() || busy || project?.archived}>{busy ? <LoaderCircle size={18} className="spin" /> : <ArrowUp size={20} />}</button></div>
          </form>
          <div className="composer-note"><ShieldCheck size={14} />{(folder?.fileMode ?? fileMode) === 'snapshot' ? '选择项目即授权文件读写；改动前自动快照，可恢复。' : '已选项目可读取；文件与目录修改逐次确认。'}<span>⌘ / Ctrl + Enter</span></div>
          {bridge.preview && <button className="text-button" onClick={() => void run(async () => { const created = await bridge.createTask({ goal: '多题演示：选择报告受众与内容', skill: 'general' }); setSelected(created.id); })}>体验多题选择与自定义回答<ChevronRight size={14} /></button>}
          <button className="text-button" onClick={() => go('settings')}>工具设置 · 文件{fileMode === 'snapshot' ? '自动快照' : '逐次确认'} · Shell / JavaScript {hostEnabled ? '已启用' : '未启用'}<SlidersHorizontal size={14} /></button>
          {!bridge.preview && !connection?.configured && <button className="connect-callout" onClick={() => go('settings')}><Cable size={18} /><span>先连接一个模型，再开始真实任务。</span><ArrowUpRight size={17} /></button>}
          <section className="starter-section"><div className="section-label">从一个明确的目标开始<span>没有强制 workflow</span></div><div className="starters">
            {[['审阅一个项目', '查看项目结构，指出实现缺口与优先修复项。', 'review'], ['整理一份成果', '把零散材料整理成一份可审阅的 Markdown。', 'deliver'], ['想清楚再行动', '比较可行方案，说明约束与取舍。', 'general']].map(([title, text, mode], i) => <button className="starter" key={title} onClick={() => { setGoal(text); setSkill(mode as SkillId); goalRef.current?.focus(); }}><span className="starter-number">0{i + 1}</span><strong>{title}</strong><p>{text}</p><ArrowUpRight size={17} /></button>)}
          </div></section>
          <section className="task-list-section"><div className="list-heading"><h2>任务<span className="subtle-count">{scopedLatest.length}</span></h2><div className="task-totals">{scopedActive > 0 && <span>{scopedActive} 项进行中</span>}{scopedPending > 0 && <span className="attention">{scopedPending} 项待审阅</span>}</div></div>
            <div className="list-controls"><div className="tabs">{[['all', '全部'], ['active', '进行中'], ['approval', '待审阅']].map(([id, label]) => <button className={filter === id ? 'tab selected' : 'tab'} key={id} onClick={() => setFilter(id)}>{label}{id === 'approval' && scopedPending > 0 && <span>{scopedPending}</span>}</button>)}</div><label className="search-box"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索任务" aria-label="搜索任务" /></label></div>
            <div className="task-table">{visible.map(t => <button className="task-row" key={t.id} onClick={() => open(t.id)}><span className="row-icon"><FileText size={18} /></span><span className="row-body"><strong>{title(t)}</strong><small>{skills.find(s => s.id === t.skill)?.title} · 第 {t.runNumber ?? 1} 轮 · {t.root ? '已授权项目目录' : '无目录访问'}{bridge.preview ? ' · 示例' : ''}</small></span><Status task={t} /><span className="row-time">{time(t.updatedAt)}</span><ChevronRight size={16} /></button>)}{!visible.length && <div className="empty-state"><Inbox size={28} /><h3>{query || filter !== 'all' ? '没有匹配的任务' : '从一个小任务开始'}</h3><p>{query || filter !== 'all' ? '换一个关键词，或切回全部任务。' : '交办目标后，你可以在这里查看每一步进展。'}</p>{(query || filter !== 'all') && <button className="text-button" onClick={() => { setQuery(''); setFilter('all'); }}>清除筛选</button>}</div>}</div>
          </section>
        </div>}
        {page === 'home' && task && <div className="task-page page-enter">
          <div className="task-heading"><button className="text-button back" onClick={() => setSelected(undefined)}><ArrowLeft size={15} />全部任务</button><div className="task-actions"><details className="project-membership-menu"><summary>归类</summary><div className="project-membership"><label>会话归类 <select aria-label="会话所属项目" value={task.projectId ?? ''} disabled={busy || !['completed', 'failed', 'cancelled'].includes(task.status)} onChange={e => { const id = e.target.value || undefined; void run(async () => { await bridge.assignProject({ taskId: task.id, projectId: id }); await switchProject(id); setSelected(task.id); }); }}><option value="">未归类</option>{projectState.projects.filter(p => !p.archived).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><span>归类不修改本会话已有目录或权限</span></div></details><button className="icon-button" aria-label={inspector ? '隐藏执行详情' : '显示执行详情'} onClick={() => setInspector(!inspector)}><Activity size={18} /></button>{!historical && !['completed', 'failed', 'cancelled', 'paused', 'awaiting_reconciliation'].includes(task.status) && <button className="secondary small-button" disabled={busy || task.pauseRequested} onClick={() => void run(() => bridge.pauseTask(task.id))}>{task.pauseRequested ? '等待安全暂停' : '暂停任务'}</button>}{!['completed', 'failed', 'cancelled'].includes(task.status) && <button className="secondary small-button" disabled={busy} onClick={() => void run(() => bridge.cancelTask(task.id))}><Square size={12} />停止任务</button>}</div></div>
          <div className="task-title"><Status task={task} /><h1>{title(task)}</h1><div className="task-meta"><span>{skills.find(s => s.id === task.skill)?.title}</span><span>第 {task.runNumber ?? 1} 轮</span><span>{task.steps} 个模型步骤</span></div></div>
          <div className="run-navigation"><label>执行轮次 <select aria-label="执行轮次" value={task.id} onChange={e => open(e.target.value)}>{tasks.filter(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id)).map(t => <option key={t.id} value={t.id}>第 {t.runNumber ?? 1} 轮 · {statusLabels[t.status]}{current?.id === t.id ? ' · 当前' : ''}</option>)}</select></label>{historical && <button className="secondary small-button" onClick={() => open(current!.id)}>回到当前轮次继续</button>}<details><summary>本轮目标</summary><p>{task.goal}</p></details></div>
          <TokenStats tasks={tasks.filter(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id))} />
          {task.projectContext && <div className="run-project-context">本轮项目说明 v{task.projectContext.revision} · {task.projectContext.instructionHash.slice(0, 8)}{activeContext && task.projectContext.projectId === activeContext.projectId && task.projectContext.revision !== activeContext.revision ? ' · 项目上下文有更新，下轮采用' : ''}</div>}
          {task.progress && <div className="execution-progress" aria-label="执行进展"><span>窗口 {task.progress.window} · {task.steps - task.progress.windowStart}/{task.progress.windowSize} 步</span><span>工具结果 {task.progress.tools} · 错误 {task.progress.errors}</span><span>{task.progress.lastTool ? `最近：${task.progress.lastTool} · ${time(task.progress.lastAt!)}` : '尚无工具结果'}</span><small>不代表业务完成率</small></div>}
          {!!Object.keys(task.skillPins ?? {}).length && <div className="active-skills">已加载 Skills：{Object.entries(task.skillPins!).map(([id, hash]) => <span key={id}>{id} · {hash.slice(0, 8)}</span>)}</div>}
          <details className="permission-disclosure"><summary>工具权限 · 文件{task.fileMode === 'snapshot' ? '自动快照' : '逐次确认'} · Shell {hostEnabled ? task.hostMode === 'allow' ? '已授权' : '需确认' : '关闭'} · {task.root ?? '无项目目录'}</summary><section className="tool-permissions" aria-label="本次对话工具权限"><div><strong>本次对话工具权限</strong><span>{task.root ?? '尚未选择项目目录'}</span></div>
            <label>文件与目录<select aria-label="本次对话文件权限" disabled={busy} value={task.fileMode ?? 'ask'} onChange={e => void run(() => bridge.setTaskPermissions({ taskId: task.id, fileMode: e.target.value as 'snapshot' | 'ask', hostMode: task.hostMode ?? 'ask' }))}><option value="snapshot">自动快照，免逐文件确认</option><option value="ask">每次修改确认</option></select></label>
            <label>Shell / JavaScript<select aria-label="本次对话执行权限" disabled={busy || !hostEnabled || !task.root} value={task.hostMode ?? 'ask'} onChange={e => {
              const mode = e.target.value as 'ask' | 'allow';
              if (mode === 'allow') { setLocalDecision({ title: '授权本次对话本机执行', detail: 'Shell / JavaScript 不再逐次确认。不是安全沙箱，可访问本机文件与网络；这些改动不受文件快照保护。全局关闭本机执行会撤销旧授权。',
                confirmLabel: '授权本次对话免确认', confirm: () => bridge.setTaskPermissions({ taskId: task.id, fileMode: task.fileMode ?? 'ask', hostMode: 'allow' }) }); return; }
              void run(() => bridge.setTaskPermissions({ taskId: task.id, fileMode: task.fileMode ?? 'ask', hostMode: mode }));
            }}><option value="ask">{hostEnabled ? '每次执行确认' : '未启用（到工具设置开启）'}</option><option value="allow">本次对话免确认（可信任务）</option></select></label>
            <button className="secondary small-button" disabled={busy || !task.root || task.unknownEffect} onClick={() => setLocalDecision({
              title: '开启可信对话', detail: `项目：${task.root}\n本次对话及后续轮次，文件自动快照，Shell / JavaScript 免重复确认。如果本机执行关闭，会同时启用它。\n本机代码拥有你的系统用户权限，不是项目目录沙箱，可能读写目录外文件和访问网络；文件快照不覆盖 Shell / JavaScript 的改动。\n仅对你信任的任务使用；可随时退回逐次确认或全局关闭本机执行。`,
              confirmLabel: '我理解范围，开启可信对话', confirm: async () => { await bridge.setExecutionSettings({ hostExecution: true }); await bridge.setTaskPermissions({ taskId: task.id, fileMode: 'snapshot', hostMode: 'allow' }); }
            })}>开启可信对话</button>
            <button className="text-button" onClick={() => go('settings')}>工具设置<SlidersHorizontal size={14} /></button>
          </section></details>
          <WebAccess task={task} busy={busy} run={run} request={setLocalDecision} />
          <div className={inspector ? 'task-layout with-inspector' : 'task-layout'}><div className="conversation">
            {!!task.sources?.length && <details className="source-list"><summary>来源证据（{task.sources.length}）· 实际读取范围</summary><div>{task.sources.map(source => <button className="source-row" key={source.id} onClick={() => void run(async () => setWorkspace(await bridge.openEvidence({ taskId: task.id, sourceId: source.id })))}><strong>{source.name}</strong><span>{source.offset}–{source.end} · {source.versionHash.slice(0, 8)} · {source.observedAt}</span></button>)}</div><small>记录证明已读取摘录，不保证回答正确或覆盖完整来源。打开不入模、不联网。</small></details>}
            {task.events.filter(e => ['assistant', 'user', 'error', 'reasoning', 'tool'].includes(e.kind)).map(e => e.kind === 'tool'
              ? <details className="tool-event" key={e.id}><summary><CheckCircle2 size={13} />{e.text.split(' · ')[0]}<time>{time(e.at)}</time></summary><pre>{e.text}</pre></details> : e.kind === 'reasoning'
              ? <details className="reasoning" key={e.id}><summary>模型返回的推理内容</summary><Markdown>{e.text}</Markdown></details>
              : <article className={`message ${e.kind}`} key={e.id}><div className="message-icon">{e.kind === 'user' ? <span>你</span> : <Logo small />}</div><div className="message-body"><div className="message-author">{e.kind === 'user' ? '你' : e.kind === 'error' ? '执行中断' : 'Agent47'}<time>{time(e.at)}</time></div>{e.kind === 'assistant' ? <Markdown sources={task.sources} openSource={sourceId => void run(async () => setWorkspace(await bridge.openEvidence({ taskId: task.id, sourceId })))}>{e.text}</Markdown> : <div className="message-text">{e.text}</div>}{!!e.materials?.length && <div className="material-chips">{e.materials.map(m => <button className="material-chip" title={`${m.sha256} · ${m.bytes} B`} key={m.id} onClick={() => void run(async () => setWorkspace(await bridge.openMaterial({ taskId: task.id, materialId: m.id })))}>{m.name} · {m.sha256.slice(0, 6)}</button>)}</div>}</div></article>)}
            {task.draft?.reasoning && <details className="reasoning"><summary>正在接收模型推理…</summary><Markdown>{task.draft.reasoning}</Markdown></details>}
            {task.draft?.text && <article className="message assistant streaming"><div className="message-icon"><Logo small /></div><div className="message-body"><div className="message-author">Agent47 · 流式输出</div><Markdown sources={task.sources} openSource={sourceId => void run(async () => setWorkspace(await bridge.openEvidence({ taskId: task.id, sourceId })))}>{task.draft.text}</Markdown></div></article>}
            {task.context && <div className="context-note">上下文预估 {task.context.estimatedTokens.toLocaleString()}（本地保守估计，非供应商 tokens） · 自动压缩 {task.context.compactions} 次 · 原始历史保留</div>}
            {tasks.filter(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id)).some(t => t.fileChanges?.length) && <details className="file-changes"><summary>文件改动与恢复点（写入前自动备份）</summary>{tasks.filter(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id)).flatMap(owner => [...(owner.fileChanges ?? [])].reverse().map(change => <div className="snapshot-row" key={`${owner.id}-${change.id}`}><span>{change.path}<small>第 {owner.runNumber ?? 1} 轮 · {change.state === 'restored' ? '已恢复' : change.state === 'cleaned' ? '备份已清理，不能恢复' : '可恢复'}</small></span><button className="secondary small-button" disabled={busy || change.state !== 'saved' || !['completed', 'failed', 'cancelled'].includes(task.status)} onClick={() => {
              setLocalDecision({ title: `恢复 ${change.path}`, detail: '恢复到此次改动前；新建文件将删除，已有文件恢复原文，外部改动会拒绝覆盖。对话和主机/远端操作不回退。', confirmLabel: '确认恢复', confirm: () => bridge.restoreFile({ taskId: owner.id, snapshotId: change.id }) });
            }}>恢复改动前</button>{change.kind !== 'directory' && <button className="text-button" disabled={busy || change.state === 'cleaned'} onClick={() => void run(async () => setWorkspace(await bridge.openFileDiff({ taskId: owner.id, snapshotId: change.id })))}>查看差异</button>}</div>))}<p className="context-note">只覆盖 writeFile / fileEdit / editFile / makeDirectory，不回退聊天、Shell 改动或远端操作。多次修改同一文件请从最近一次恢复。</p>
              {tasks.filter(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id) && t.fileChanges?.some(change => change.state === 'saved')).map(owner => <button className="secondary" disabled={busy || !['completed', 'failed', 'cancelled'].includes(task.status)} key={owner.id} onClick={() => {
                setLocalDecision({ title: `撤销第 ${owner.runNumber ?? 1} 轮文件改动`, detail: `${owner.root}：${owner.fileChanges!.filter(change => change.state === 'saved').length} 项，按倒序恢复。冲突项及其旧版本保留；不是原子事务，不撤销 Shell 或远端效果。`, confirmLabel: '确认撤销本轮文件', confirm: () => bridge.undoRun(owner.id) });
              }}>撤销第 {owner.runNumber ?? 1} 轮文件改动</button>)}
              {tasks.filter(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id) && t.undo).map(owner => <div className="context-note" role="status" key={owner.id}>第 {owner.runNumber ?? 1} 轮撤销：{owner.undo!.state === 'running' ? '进行中' : owner.undo!.state === 'completed' ? '已完成' : '部分恢复 / 需要检查'} · 恢复 {owner.undo!.restored} 项 · 冲突 {owner.undo!.conflicts.length} 项{owner.undo!.conflicts.map(conflict => <p key={conflict.path}>{conflict.path}：{conflict.error}</p>)}</div>)}
            </details>}
            {(task.status === 'running' || task.status === 'queued') && <div className="working-state" role="status"><LoaderCircle size={16} className="spin" />{task.pauseRequested ? '暂停已请求；等待已开始的工具返回，不强杀或回滚…' : task.status === 'queued' ? '已进入本地队列，等待执行…' : '正在推进任务，进展会保存在本地…'}</div>}
            {needsDecision && <button className="decision-anchor text-button" onClick={() => { setEditingDecision(false); document.querySelector('.composer-dock')?.scrollIntoView({ block: 'nearest' }); }}>等待你的{task.status === 'awaiting_input' ? '回答' : task.unknownEffect ? '检查' : '确认'} · 在底部完成<ChevronRight size={14} /></button>}
            {!!task.artifacts.length && <section className="task-artifacts"><h2>这次任务的成果</h2>{task.artifacts.map(a => <button className="artifact-row" key={a.id} onClick={() => setArtifact({ task, artifact: a })}><FileText size={22} /><span><strong>{a.name}</strong><small>已保存 · {bridge.preview ? '示例成果' : '内容校验可追溯'}</small></span><ArrowUpRight size={17} /></button>)}</section>}
            {['failed', 'cancelled'].includes(task.status) && <div className="task-end-note">本轮已结束，不会自动重新执行。可以在当前轮次下方追问，开启新的执行轮次；不会重放旧动作。<button className="text-button" onClick={() => { setGoal(task.goal); setSkill(task.skill); setSelected(undefined); }}>带入独立新任务<ArrowUpRight size={14} /></button></div>}
            {task.status === 'completed' && <div className="completion-note"><CheckCircle2 size={15} />任务已完成。已结束的任务不会被重新执行。</div>}
          </div>
          {inspector && <aside className="inspector"><div className="inspector-heading"><h2>执行详情</h2><button className="icon-button" aria-label="关闭执行详情" onClick={() => setInspector(false)}><PanelRightClose size={17} /></button></div><div className="permission-summary"><span>本次权限</span><p><Folder size={14} />{task.root || '未授权任何项目目录'}</p><p><ShieldCheck size={14} />文件：{task.fileMode === 'snapshot' ? '自动快照' : '逐次确认'}；本机执行：{!hostEnabled ? '关闭' : task.hostMode === 'allow' ? '已授权，免重复确认' : '逐次确认'}</p></div><h3>事件记录</h3><div className="event-timeline">{task.events.map(e => <div key={e.id} className="timeline-event"><span className="timeline-dot" /><div><time>{time(e.at)} · {({ user: '目标', assistant: '回复', reasoning: '推理', tool: '工具', system: '状态', error: '错误' })[e.kind]}</time><p>{e.text.length > 240 ? e.text.slice(0, 240) + '…' : e.text}</p></div></div>)}</div><div className="inspector-foot">任务与检查点保存在本地。<br />模型请求由所选服务处理。</div></aside>}
          </div>
          <section className="composer-dock" aria-label="对话输入区">
            {historical && !localDecision ? <div className="history-notice"><span>历史轮次不发送聊天；继续不会重放旧动作。</span><button className="primary small-button" onClick={() => open(current!.id)}>回到当前轮次</button></div> : <>
            {!localDecision && (!needsDecision || editingDecision) && <MaterialBar key={`materials-${task.id}`} task={task} busy={busy} run={run} open={setWorkspace} resources={() => setResourcePicker(v => !v)} />}
            {resourcePicker && !localDecision && (!needsDecision || editingDecision) && <><button className="text-button" onClick={() => setResourcePicker(false)}>关闭资源选择</button><ResourceBrowser project={project} busy={busy} version={resourcesVersion} run={run} open={setWorkspace} pick={pickResource} /></>}
            {!!task.queuedInput?.length && <div className="message-queue" aria-label="待发送消息"><div className="queue-heading">待发送 · {task.queuedInput.length}<span>{task.status === 'paused' ? '已暂停；排序或删除不启动，继续本轮后发送' : ['completed', 'cancelled', 'failed'].includes(task.status) ? '已暂停，点击立即发送继续' : needsDecision ? '等待本次决定；立即发送会作废旧决定' : '下一个工具边界合并发送'}</span></div>{task.queuedInput.map(item => <div className="queue-row" key={item.id}><p>{item.text}</p><button className="secondary small-button" disabled={busy || task.unknownEffect && task.status !== 'running'} onClick={() => {
              const send = async () => { const next = await bridge.manageQueue({ taskId: task.id, messageId: item.id, action: 'send' }); setSelected(next.id); };
              if (needsDecision && (task.status !== 'paused' || task.question || task.approval?.state === 'pending')) setLocalDecision({ title: '用补充要求替换当前决定？', detail: `将提前投递：${item.text}\n旧问题或审批将作废，不能再提交；其他排队消息继续等待。已开始的工具不会强杀或重放。${task.status === 'paused' ? '\n本轮仍暂停，需点击继续本轮。' : ''}`, confirmLabel: '作废旧决定并立即发送', confirm: send });
              else void run(send);
            }}>立即发送</button><button className="icon-button" aria-label={`删除待发送消息：${item.text}`} disabled={busy} onClick={() => void run(() => bridge.manageQueue({ taskId: task.id, messageId: item.id, action: 'delete' }))}><X size={15} /></button></div>)}</div>}
            {localDecision ? <ConsentPanel decision={localDecision} busy={busy} run={run} close={() => setLocalDecision(undefined)} />
              : task.status === 'paused' && !editingDecision ? <div className="pause-decision" aria-label="暂停与续跑"><div><strong>{task.pause?.reason === 'window' ? '执行窗口已结束' : task.pause?.reason === 'manual' ? '本轮已暂停' : '需要检查进展'}</strong><p>{task.pause?.detail}</p><small>继续同一 Run，不清零用量，也不代替工具授权。重启保持暂停。</small></div><div className="pause-actions"><button className="text-button" disabled={busy} onClick={() => setEditingDecision(true)}>补充要求</button><button className="primary small-button" disabled={busy || task.unknownEffect} onClick={() => void run(() => bridge.resumeTask(task.id))}>继续本轮</button></div></div>
              : needsDecision && !editingDecision ? <DecisionPanel task={task} busy={busy} hostEnabled={hostEnabled} run={run} supplement={() => setEditingDecision(true)} />
                : <MessageComposer key={`composer-${task.id}`} task={{ ...task, composerDraft: composerDrafts[task.id] ?? task.composerDraft }} busy={busy} run={run} sent={id => { setSelected(id); setEditingDecision(false); }} editing={needsDecision} back={() => setEditingDecision(false)} remember={text => setComposerDrafts(old => ({ ...old, [task.id]: text }))} mention={() => setResourcePicker(true)} />}</>}
          </section>
        </div>}
        {page === 'artifacts' && <div className="standard-page page-enter"><h1>资源库</h1><p className="page-description">材料与成果统一查看、引用和固定；成果是资源的一种来源，不复制文件。</p><ResourceBrowser project={project} version={resourcesVersion} busy={busy} run={run} open={setWorkspace} sourceTask={open} /></div>}
        {page === 'capabilities' && <div className="standard-page page-enter">
          <h1>能力与 Skills</h1>
          <p className="page-description">任务指导与 skill 包影响如何处理目标，但不会扩大工具权限。</p>
          <div className="skill-cards">{skills.map(s => <article className="skill-card" key={s.id}><span className="skill-code">{s.id.toUpperCase()}</span><h2>{s.title}</h2><p>{s.description}</p><button className="text-button" onClick={() => { setSkill(s.id); go('home'); }}>用于新任务<ArrowUpRight size={14} /></button></article>)}</div>
          <section className="capability-section"><h2>Skills 扩展包</h2><p>导入含 SKILL.md、references 与 scripts 的文本目录。只加载启用包的元信息，完整内容按需读取；脚本不会自动安装或执行。</p>
            <button className="secondary" disabled={busy} onClick={() => void run(async () => setSkillImport(await bridge.previewSkill()))}>选择 Skill 包</button>
            {extensions.map(extension => <article className="skill-entry" key={extension.id}><div><strong>{extension.name}</strong><p>{extension.description}</p><small>{extension.files.length} 个文本文件 · 固定版本 {extension.hash.slice(0, 12)}</small></div><button className="secondary" disabled={busy} onClick={() => void run(() => bridge.setSkill({ id: extension.id, enabled: !extension.enabled }))}>{extension.enabled ? '停用' : '启用'}</button><button className="secondary" disabled={busy} onClick={() => void run(async () => { const next = await bridge.previewSkill(); if (next && next.skill.id !== extension.id) throw new Error(`请选择同名 ${extension.name} 包来更新。`); setSkillImport(next); })}>更新</button><button className="secondary" disabled={busy} onClick={() => { if (window.confirm(`卸载 ${extension.name}？停止后续加载，保留历史版本与会话记录；已经进入模型上下文的内容不会被擦除。`)) void run(() => bridge.removeSkill(extension.id)); }}>卸载</button></article>)}
            {!extensions.length && <p className="context-note">尚无已安装扩展；上面的三个任务指导不是完整 skill 包。</p>}
            {skillImport && <section className="question-card"><h3>审阅{skillImport.replaces ? '更新' : '导入'}：{skillImport.skill.name}</h3><p>{skillImport.skill.description}</p><p className="context-note">{skillImport.replaces ? `旧版本 ${skillImport.replaces.slice(0, 12)} → ${skillImport.skill.hash.slice(0, 12)}；已加载会话保持旧版本，新版本需重新启用。` : '导入后默认停用。'} 文件：{skillImport.skill.files.join(' · ')}</p><pre>{skillImport.instructions}</pre>{Object.entries(skillImport.resources ?? {}).filter(([path]) => path !== 'SKILL.md').map(([path, content]) => <details className="reasoning" key={path}><summary>{path}</summary><pre>{content}</pre></details>)}<div className="composer-bottom"><button className="secondary" onClick={() => setSkillImport(undefined)}>取消导入</button><button className="primary" onClick={() => void run(async () => { await bridge.installSkill(skillImport.ticket); setSkillImport(undefined); })}>{skillImport.replaces ? '更新为停用包' : '导入为停用包'}</button></div></section>}
          </section>
          <section className="capability-section"><h2>本机执行</h2><p>使用 Electron 自带 Node utility process 执行 JavaScript，使用系统 Shell 执行命令。独立进程不是安全沙箱；批准后拥有你的系统用户权限，可能访问目录之外的数据与网络。环境不会继承应用的模型密钥或代理配置。</p>
            <ToolSettings settings={{ hostExecution: hostEnabled, fileMode }} busy={busy} run={run} />
          </section>
          <section className="capability-section"><h2>这一版能做什么</h2><div className="capability-table">{[['真实模型', '流式文本与供应商返回的推理，Markdown、多轮追问和 token 用量。'], ['项目文件', '授权目录内读取、自动快照修改与整轮撤销；不覆盖外部变更。'], ['网页读取', '对话内授权公共 HTTPS 站点后，只读获取 HTML／文本。不登录、不执行网页脚本，不点击或提交表单。'], ['成果创建', '按文件权限模式保存到应用成果库。'], ['上下文管理', '在安全 turn 边界自动压缩，保留完整本地历史；估计值不冒充供应商 tokenizer。']].map(([name, text]) => <div key={name}><span><CheckCircle2 size={16} />{name}</span><p>{text}</p></div>)}</div><div className="boundary-note"><LockKeyhole size={20} /><div><strong>尚未开放的能力</strong><p>OS 安全沙箱、完整浏览器自动化、系统桌面自动化、定时触发、MCP 与多 Agent 协调仍未实现。账单和金额预算不在当前范围。</p></div></div></section>
        </div>}
        {page === 'settings' && <Settings connection={connection} settings={{ hostExecution: hostEnabled, fileMode }} busy={busy} run={run} />}
      </main>
    <WorkspacePane state={workspace} setState={setWorkspace} theme={theme} blocked={!!localDecision || busy} run={run} sourceTask={open}
        projectBrowser={project && <ProjectBrowser key={project.id} project={project} tasks={tasks} run={run} open={setWorkspace} sourceTask={open} />}
        canSelect={!!task && !historical && !task.unknownEffect}
        selectText={async (tabId, expectedHash, range) => { if (task && !historical) {
          await bridge.selectWorkspace({ taskId: task.id, tabId, expectedHash, ...range });
          if (selectedRef.current === task.id) setEditingDecision(true);
        } }}
        attachMaterial={tabId => { if (task && !historical) void run(() => bridge.attachMaterial({ taskId: task.id, tabId })); }}
        conversationId={task?.conversationId ?? task?.id} grantPage={(tabId, mode) => {
          const tab = workspace.tabs.find(t => t.id === tabId);
          if (!task || !tab?.url) return;
          const input = { taskId: task.id, tabId, expectedURL: tab.url, mode };
          const confirm = async () => setWorkspace(await bridge.workspaceAgentGrant(input));
          if (mode === 'deny') { void run(confirm); return; }
          setLocalDecision({ title: mode === 'allow' ? '授权此网页可信交互' : '授权此网页给当前对话',
            detail: `${tab.url}\n目标对话：${task.goal.slice(0, 80)}\n范围：此 Tab 的 ${new URL(tab.url).origin}，包括后续执行轮次，应用重启／关闭／刷新失效。\n页面正文、元素标签与链接 URL 将发送给 DeepSeek，可能包含私人信息。${mode === 'read' ? '允许读取、切换、滚动与同站导航，不允许点击和输入。' : mode === 'ask' ? '点击和输入仍需在底部批准具体元素和内容。' : '点击和输入不再逐次确认，可能发布、提交或改变远端数据。系统不能可靠识别按钮的业务后果；文件快照不能撤销。仅用于你信任、能承担后果的页面。'}\n不读取密码控件值、Cookie 或 storage，不提供任意 JS／文件上传工具。`,
            confirmLabel: mode === 'allow' ? '确认可信交互范围' : '确认网页授权', confirm });
        }}
        canSendPage={!!task && !historical && !needsDecision && !task.unknownEffect} sendPage={tabId => void run(async () => {
          if (!task || needsDecision) throw new Error('请先选择对话并完成当前决定。');
          const snapshot = await bridge.workspaceCapture({ tabId, taskId: task.id });
          if (selectedRef.current !== task.id) throw new Error('请重新读取：对话已切换。');
          const clientMessageId = crypto.randomUUID();
          setLocalDecision({ title: '将页面摘录发送给 DeepSeek', detail: `${snapshot.url}\n目标对话：${task.goal.slice(0, 80)}\n采集于 ${snapshot.capturedAt} · ${snapshot.truncated ? '已截断' : '正文摘录'} · ${snapshot.digest.slice(0, 8)}\n不直接读取 Cookie、表单值或脚本；可见正文仍可能含隐私，请审阅。不授予网页操作权限，运行中按原队列边界消费。`,
            preview: snapshot.content, confirmLabel: '发送已审阅摘录', confirm: async () => {
              const result = await bridge.workspaceSendCapture({ id: snapshot.id, digest: snapshot.digest, clientMessageId }); setSelected(result.id); setEditingDecision(false);
            } });
        })} />
      </div>
      <footer className="app-footer"><span><span className="local-dot" />{bridge.preview ? 'PREVIEW MODE' : 'LOCAL-FIRST'}</span><span>{bridge.preview ? '示例数据仅在当前页面内存中，不接收真实凭据。' : '项目权限由你授权；文件工具改动前自动快照。'}<span className="footer-version">Agent47 0.2</span></span></footer>
    </div>
  </div>;
}

function WebAccess({ task, busy, run, request }: { task: TaskView; busy: boolean; run: (operation: () => Promise<unknown>) => Promise<void>; request: (decision: LocalDecision) => void }) {
  const [url, setUrl] = useState('');
  return <details className="permission-disclosure web-access"><summary>网页读取 · {task.webOrigins?.length ?? 0} 个授权站点</summary>
    <form onSubmit={event => { event.preventDefault(); void run(async () => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('请使用不含登录信息的 HTTPS 站点地址。');
      const origin = parsed.origin;
      request({ title: '授权本次对话读取站点', detail: `${origin}\n公开 HTTPS 请求不携带登录 Cookie 或模型密钥，内容会发送给 DeepSeek；不执行脚本、点击或提交表单。GET 不是远端回滚机制，请勿授权有副作用的接口。`, confirmLabel: '确认授权站点', confirm: async () => {
        const current = (await bridge.listTasks()).find(t => t.id === task.id)!;
        await bridge.setWebOrigins({ taskId: task.id, origins: [...new Set([...(current.webOrigins ?? []), origin])] }); setUrl('');
      } });
    }); }}><label className="sr-only" htmlFor="web-origin">授权站点 URL</label><input id="web-origin" type="url" required value={url} placeholder="https://docs.example.com" onChange={e => setUrl(e.target.value)} /><button className="secondary small-button" disabled={busy}>授权站点</button></form>
    {(task.webOrigins ?? []).map(origin => <div className="queue-row" key={origin}><p>{origin}</p><button className="secondary small-button" disabled={busy} onClick={() => void run(() => bridge.setWebOrigins({ taskId: task.id, origins: task.webOrigins!.filter(item => item !== origin) }))}>撤销访问</button></div>)}
  </details>;
}

function ToolSettings({ settings, busy, run }: { settings: ExecutionSettings; busy: boolean; run: (operation: () => Promise<unknown>) => Promise<void> }) {
  return <section className="tool-settings" aria-label="工具设置"><h2>工具设置</h2>
    {bridge.preview && <p className="context-note">当前是交互预览。可以体验设置，但不会启用任何真实工具；桌面版使用相同入口。</p>}
    <label>新任务的文件权限<select aria-label="默认文件权限" disabled={busy} value={settings.fileMode ?? 'snapshot'} onChange={e => void run(() => bridge.setExecutionSettings({ fileMode: e.target.value as 'snapshot' | 'ask' }))}><option value="snapshot">自动快照，免逐文件确认（推荐）</option><option value="ask">每次修改确认</option></select></label>
    <p>项目选择器明确授权读写。文件改动前保存应用私有快照，支持嵌套目录、新建文件和文本修改，不要求项目已使用 Git。已有对话的权限在任务页单独调整。</p>
    <div className="host-setting"><div><strong>Shell / JavaScript</strong><p>{settings.hostExecution ? '已启用。默认逐次确认，可在可信对话的任务页授权免重复确认。' : '未启用。文件读写和目录创建不依赖这个开关。'}</p></div>
      <button className={settings.hostExecution ? 'secondary' : 'primary'} disabled={busy} onClick={() => {
        if (!settings.hostExecution && !window.confirm('启用本机 Shell / JavaScript？它不是安全沙箱，可能访问本机文件和网络。启用后默认逐次确认；文件快照不覆盖 Shell / JavaScript 改动。')) return;
        void run(() => bridge.setExecutionSettings({ hostExecution: !settings.hostExecution }));
      }}>{settings.hostExecution ? '关闭本机 Shell / JavaScript' : '我理解风险，启用本机 Shell / JavaScript'}</button></div>
    <p className="context-note">使用 Electron 自带 Node，不另装运行时。停止不是回滚；关闭本机执行会撤销已保存的免确认授权。</p>
    <SnapshotControls busy={busy} run={run} />
  </section>;
}
function SnapshotControls({ busy, run }: { busy: boolean; run: (operation: () => Promise<unknown>) => Promise<void> }) {
  const [settings, setSettings] = useState<SnapshotSettings>();
  const [result, setResult] = useState('');
  useEffect(() => { void bridge.snapshotSettings().then(setSettings).catch(() => setResult('无法读取快照统计。')); }, []);
  const refresh = async () => setSettings(await bridge.snapshotSettings());
  return <section className="snapshot-controls"><h3>快照保留与清理</h3><p>默认保留全部。清理只删除旧的、已结束项目任务的备份原文；不删除项目文件、成果或聊天。活动、结果未知、正在恢复的快照不会清理，少量审计元数据会保留。</p>
    <label>保留策略<select aria-label="快照保留策略" disabled={busy || !settings} value={settings?.retentionDays ?? 0} onChange={e => {
      const days = Number(e.target.value) as 0 | 7 | 30 | 90;
      if (days && !window.confirm(`启用 ${days} 天快照保留策略？${settings?.storagePath} 中，距任务最后活动超过 ${days} 天的已结束任务备份原文会在启动、每日检查或手动清理时永久清除，之后无法恢复这些改动。项目文件和聊天不会删除。`)) return;
      void run(async () => { await bridge.setSnapshotRetention(days); await refresh(); setResult('保留策略已保存。'); });
    }}><option value={0}>保留全部（不自动清理）</option><option value={7}>保留 7 天</option><option value={30}>保留 30 天</option><option value={90}>保留 90 天</option></select></label>
    <p>{settings ? `${settings.count} 份备份 · ${(settings.bytes / 1024).toFixed(1)} KiB（含元数据）` : '正在读取备份统计…'}</p>
    <p className="context-note snapshot-path">{settings?.storagePath}</p>
    <button className="secondary" disabled={busy || !settings?.retentionDays} onClick={() => {
      if (!window.confirm(`按 ${settings?.retentionDays} 天策略永久清除 ${settings?.storagePath} 中的过期备份原文？不会删除项目文件和聊天；备份清除后无法撤销对应改动。`)) return;
      void run(async () => { const cleaned = await bridge.cleanSnapshots(); await refresh(); setResult(`已清理 ${cleaned.cleaned} 项；${cleaned.errors} 项未清理。`); });
    }}>清理过期快照</button>{result && <p role="status">{result}</p>}
  </section>;
}

function TokenStats({ tasks }: { tasks: TaskView[] }) {
  const usage = tasks.flatMap(task => task.usage ?? []);
  const sum = (key: 'input' | 'output' | 'cacheRead') => usage.reduce((n, item) => n + (item[key] ?? 0), 0);
  const input = sum('input'), output = sum('output');
  const cacheEntries = usage.filter(item => item.cacheRead !== undefined && item.input !== undefined);
  const cacheInput = cacheEntries.reduce((n, item) => n + item.input!, 0);
  const cacheHit = cacheEntries.reduce((n, item) => n + item.cacheRead!, 0);
  const unknown = usage.filter(item => item.state === 'unknown' || item.state === 'partial').length;
  const pending = usage.filter(item => item.state === 'pending').length;
  return <div className="token-stats" aria-label="模型用量"><span>Input <strong>{usage.some(u => u.input !== undefined) ? input.toLocaleString() : '未报告'}</strong></span><span>Output <strong>{usage.some(u => u.output !== undefined) ? output.toLocaleString() : '未报告'}</strong></span><span>Cache rate <strong>{cacheInput > 0 ? `${(cacheHit / cacheInput * 100).toFixed(1)}%` : '未报告'}</strong></span><span>{usage.length} 次请求{pending > 0 ? ` · ${pending} 次进行中` : ''}{unknown > 0 ? ` · ${unknown} 次用量未知/不完整` : ''}</span><span className="context-note">仅供应商已报告部分，含压缩请求；不计价格与账单</span></div>;
}

function Settings({ connection, settings, busy, run }: { connection?: ProviderView; settings: ExecutionSettings; busy: boolean; run: (operation: () => Promise<unknown>) => Promise<void> }) {
  const [url, setUrl] = useState(connection?.baseURL || 'https://opencode.ai/zen/go/v1');
  const [model, setModel] = useState(connection?.model || 'deepseek-v4.1-flash');
  const [key, setKey] = useState('');
  const [result, setResult] = useState('');
  const [saved, setSaved] = useState(false);
  return <div className="standard-page settings-page page-enter"><div className="page-eyebrow">工具权限与 DeepSeek 连接</div><h1>连接设置与工具</h1><p className="page-description">先设置工具使用方式，再配置模型连接。密钥只在桌面主进程使用，不返回给页面。</p>
    <ToolSettings settings={settings} busy={busy} run={run} />
    {bridge.preview && <div className="boundary-note"><LockKeyhole size={20} /><div><strong>这是预览，不是凭据入口</strong><p>下面展示桌面应用的配置方式。预览禁止输入或保存真实 Key，连接测试也不会发送网络请求。</p></div></div>}
    <form className="settings-card" onSubmit={e => { e.preventDefault(); void run(async () => { await bridge.saveProvider({ baseURL: url, model, apiKey: key || undefined }); setKey(''); setSaved(true); }); }}>
      <div className="settings-card-heading"><span className="provider-mark"><Cable size={23} /></span><div><h2>DeepSeek</h2><p>{connection?.configured ? '已配置连接' : '等待配置'}</p></div><span className="badge">AI SDK</span></div>
      <label className="field-label">API Base URL<input required type="url" value={url} onChange={e => { setUrl(e.target.value); setSaved(false); }} disabled={bridge.preview} /></label><p className="field-help">填 API 基础地址，不包含 /chat/completions；仅接受 HTTPS。</p>
      <label className="field-label">Model ID<input required value={model} onChange={e => { setModel(e.target.value); setSaved(false); }} disabled={bridge.preview} /></label>
      <label className="field-label">API Key<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={bridge.preview ? '预览不接收真实凭据' : connection?.configured ? '留空保留当前密钥' : '输入你的 API Key'} disabled={bridge.preview} /></label>
      <div className="storage-note"><ShieldCheck size={15} /><span>{bridge.preview ? 'Windows / macOS 桌面版使用系统安全存储。' : connection?.secureStorage ? '系统安全存储可用，密钥将加密保存。' : '系统安全存储不可用，禁止保存 Key。可用启动环境变量。'}</span></div>
      <div className="settings-actions"><button className="secondary" type="button" disabled={busy} onClick={() => void run(async () => { setResult(await bridge.testProvider()); })}>{busy ? <LoaderCircle size={16} className="spin" /> : <Activity size={16} />}测试连接</button><button className="primary" type="submit" disabled={busy || bridge.preview || !connection?.secureStorage}><Check size={16} />保存连接</button></div>
      {saved && <div className="inline-success" role="status">连接已保存，密钥未返回给页面。</div>}{result && <div className="test-result" role="status">{result}</div>}
    </form><div className="settings-footnote"><strong>DeepSeek 接入说明</strong><p>这一版只支持 DeepSeek 模型系列，可配置你选择的兼容 API 地址。默认使用 OpenCode Go 的 DeepSeek 路由，并按任务发送稳定会话标识；没有自动切换到其他模型的 fallback。</p></div>
  </div>;
}
