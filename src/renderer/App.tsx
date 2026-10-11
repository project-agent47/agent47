import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, ArrowUpRight, ArrowLeft, Plus, Folder, FileText, Inbox, SlidersHorizontal, Layers, Search, Sun, Moon, Check, X, Square, ChevronRight, ShieldCheck, Activity, Cpu, LoaderCircle, Cable, LockKeyhole, PanelRightClose, Download, Circle, CheckCircle2 } from 'lucide-react';
import { bridge } from './bridge';
import type { TaskView, SkillId, FolderGrant, ProviderView, Artifact, SkillView, SkillImport, ExecutionSettings, SnapshotSettings } from '../shared/contracts';
import { Markdown } from './Markdown';

type Page = 'home' | 'artifacts' | 'capabilities' | 'settings';
const statusLabels: Record<TaskView['status'], string> = {
  queued: '等待执行', running: '进行中', awaiting_approval: '待你审阅', awaiting_input: '等待回答', awaiting_reconciliation: '需要检查效果', completed: '已完成', failed: '未完成', cancelled: '已停止'
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
  const [page, setPage] = useState<Page>('home');
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [goal, setGoal] = useState('');
  const [skill, setSkill] = useState<SkillId>('general');
  const [folder, setFolder] = useState<FolderGrant>();
  const [theme, setTheme] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inspector, setInspector] = useState(false);
  const [artifact, setArtifact] = useState<{ task: TaskView; artifact: Artifact }>();
  const [connection, setConnection] = useState<ProviderView>();
  const [reply, setReply] = useState('');
  const [extensions, setExtensions] = useState<SkillView[]>([]);
  const [skillImport, setSkillImport] = useState<SkillImport>();
  const [hostEnabled, setHostEnabled] = useState(false);
  const [fileMode, setFileMode] = useState<'snapshot' | 'ask'>('snapshot');
  const goalRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const task = tasks.find(t => t.id === selected);
  const pending = tasks.filter(t => t.status === 'awaiting_approval').length;
  const active = tasks.filter(t => ['running', 'queued'].includes(t.status)).length;
  const refresh = async () => {
    try { setTasks(await bridge.listTasks()); setConnection(await bridge.provider()); setExtensions(await bridge.listSkills()); const execution = await bridge.executionSettings(); setHostEnabled(execution.hostExecution); setFileMode(execution.fileMode ?? 'snapshot'); }
    catch { setError('未能加载本地任务。请检查应用存储，不要删除原有数据。'); }
  };
  useEffect(() => { void refresh(); return bridge.onChange(() => void refresh()); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [page, selected]);
  useEffect(() => {
    if (!artifact) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    const focusable = () => [...(node?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') ?? [])];
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus(); };
  }, [artifact]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault(); setSelected(undefined); setPage('home'); queueMicrotask(() => goalRef.current?.focus());
      }
      if (event.key === 'Escape') { setArtifact(undefined); setInspector(false); }
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
    void run(async () => {
      const created = await bridge.createTask({ goal: goal.trim(), skill, folderGrant: folder?.id });
      setSelected(created.id); setGoal(''); setInspector(false);
    });
  };
  const go = (next: Page) => { setPage(next); setSelected(undefined); setError(''); };
  const open = (id: string) => { setPage('home'); setSelected(id); setInspector(false); setError(''); };
  const latest = tasks.filter((t, index) => tasks.findIndex(other => (other.conversationId ?? other.id) === (t.conversationId ?? t.id)) === index);
  const visible = latest.filter(t => t.goal.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'active' ? ['running', 'queued', 'awaiting_input'].includes(t.status) : t.status === 'awaiting_approval')));

  return <div className={selected ? 'app task-open' : 'app'}>
    <aside className="sidebar" inert={artifact ? true : undefined}>
      <button className="brand" onClick={() => go('home')} aria-label="回到任务中心"><span className="brand-mark"><Logo small /></span><span>Agent47<span className="brand-caption">YOUR LOCAL AGENT</span></span><span className="version">02</span></button>
      <button className="new-task" onClick={() => { go('home'); queueMicrotask(() => goalRef.current?.focus()); }}><Plus size={17} />新任务<span className="keycap">⌘ N</span></button>
      <nav aria-label="主导航">
        <button className={page === 'home' ? 'nav active' : 'nav'} onClick={() => go('home')}><Inbox size={18} />任务中心{pending > 0 && <span className="nav-count">{pending}</span>}</button>
        <button className={page === 'artifacts' ? 'nav active' : 'nav'} onClick={() => go('artifacts')}><Layers size={18} />成果库</button>
        <button className={page === 'capabilities' ? 'nav active' : 'nav'} onClick={() => go('capabilities')}><ShieldCheck size={18} />能力与边界</button>
      </nav>
      <div className="sidebar-section"><span>最近任务</span><span className="tiny">{tasks.length}</span></div>
      <div className="recent-nav">{latest.slice(0, 7).map(t => <button key={t.id} className={t.id === selected ? 'recent-item selected' : 'recent-item'} onClick={() => open(t.id)}>
        <span className={`task-dot ${t.status}`} /><span>{t.goal}</span>
      </button>)}{!tasks.length && <p className="sidebar-empty">你的第一个任务会出现在这里。</p>}</div>
      <div className="sidebar-bottom">
        <div className="local-indicator"><span className="local-dot" /><span>本地工作空间<small>{bridge.preview ? '交互预览 · 示例数据' : '任务保存在这台设备'}</small></span><LockKeyhole size={14} /></div>
        <button className={page === 'settings' ? 'nav active' : 'nav'} onClick={() => go('settings')}><SlidersHorizontal size={17} />连接设置与工具<span className={connection?.configured ? 'connected-dot' : 'disconnected-dot'} /></button>
      </div>
    </aside>
    <div className="shell" inert={artifact ? true : undefined}>
      <header className="topbar"><div className="breadcrumb"><span>工作空间</span><ChevronRight size={14} /><strong>{selected ? '任务详情' : { home: '任务中心', artifacts: '成果库', capabilities: '能力与边界', settings: '连接设置' }[page]}</strong></div>
        <div className="topbar-right">{bridge.preview && <span className="preview-label">交互预览 · 不调用模型</span>}<span className="model-label"><Cpu size={14} />{connection?.model || '未连接模型'}</span><button className="icon-button" aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button></div>
      </header>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="关闭错误提示"><X size={16} /></button></div>}
      <main className={selected ? 'content task-content' : 'content'}>
        {page === 'home' && !task && <div className="home page-enter">
          <div className="home-heading"><div><h1>Agentic Workbench</h1><p>DeepSeek · 本地任务、文件与 Skills</p></div></div>
          <form className="composer" onSubmit={create}>
            <label className="sr-only" htmlFor="goal">任务目标</label>
            <textarea id="goal" ref={goalRef} placeholder="描述目标，或选择项目后开始工作…" value={goal} onChange={e => setGoal(e.target.value)} maxLength={12000} rows={2} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') create(e); }} />
            <div className="composer-bottom"><div className="composer-options"><button type="button" className={folder ? 'context-chip attached' : 'context-chip'} onClick={() => void run(async () => { const grant = await bridge.chooseFolder(); if (grant) setFolder(grant); })}><Folder size={16} /><span>{folder ? folder.path.split(/[\\/]/).pop() : '选择项目目录'}</span></button>{folder && <button type="button" className="icon-button" aria-label="移除目录授权" onClick={() => setFolder(undefined)}><X size={14} /></button>}<label className="skill-select"><span className="sr-only">任务指导</span><select value={skill} onChange={e => setSkill(e.target.value as SkillId)}>{skills.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label></div><button type="submit" className="submit-button" aria-label="开始任务" disabled={!goal.trim() || busy}>{busy ? <LoaderCircle size={18} className="spin" /> : <ArrowUp size={20} />}</button></div>
          </form>
          <div className="composer-note"><ShieldCheck size={14} />{(folder?.fileMode ?? fileMode) === 'snapshot' ? '选择项目即授权文件读写；改动前自动快照，可恢复。' : '已选项目可读取；文件与目录修改逐次确认。'}<span>⌘ / Ctrl + Enter</span></div>
          <button className="text-button" onClick={() => go('settings')}>工具设置 · 文件{fileMode === 'snapshot' ? '自动快照' : '逐次确认'} · Shell / JavaScript {hostEnabled ? '已启用' : '未启用'}<SlidersHorizontal size={14} /></button>
          {!bridge.preview && !connection?.configured && <button className="connect-callout" onClick={() => go('settings')}><Cable size={18} /><span>先连接一个模型，再开始真实任务。</span><ArrowUpRight size={17} /></button>}
          <section className="starter-section"><div className="section-label">从一个明确的目标开始<span>没有强制 workflow</span></div><div className="starters">
            {[['审阅一个项目', '查看项目结构，指出实现缺口与优先修复项。', 'review'], ['整理一份成果', '把零散材料整理成一份可审阅的 Markdown。', 'deliver'], ['想清楚再行动', '比较可行方案，说明约束与取舍。', 'general']].map(([title, text, mode], i) => <button className="starter" key={title} onClick={() => { setGoal(text); setSkill(mode as SkillId); goalRef.current?.focus(); }}><span className="starter-number">0{i + 1}</span><strong>{title}</strong><p>{text}</p><ArrowUpRight size={17} /></button>)}
          </div></section>
          <section className="task-list-section"><div className="list-heading"><h2>任务<span className="subtle-count">{tasks.length}</span></h2><div className="task-totals">{active > 0 && <span>{active} 项进行中</span>}{pending > 0 && <span className="attention">{pending} 项待审阅</span>}</div></div>
            <div className="list-controls"><div className="tabs">{[['all', '全部'], ['active', '进行中'], ['approval', '待审阅']].map(([id, label]) => <button className={filter === id ? 'tab selected' : 'tab'} key={id} onClick={() => setFilter(id)}>{label}{id === 'approval' && pending > 0 && <span>{pending}</span>}</button>)}</div><label className="search-box"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索任务" aria-label="搜索任务" /></label></div>
            <div className="task-table">{visible.map(t => <button className="task-row" key={t.id} onClick={() => open(t.id)}><span className="row-icon"><FileText size={18} /></span><span className="row-body"><strong>{t.goal}</strong><small>{skills.find(s => s.id === t.skill)?.title} · {t.root ? '已授权项目目录' : '无目录访问'}{bridge.preview ? ' · 示例' : ''}</small></span><Status task={t} /><span className="row-time">{time(t.updatedAt)}</span><ChevronRight size={16} /></button>)}{!visible.length && <div className="empty-state"><Inbox size={28} /><h3>{query || filter !== 'all' ? '没有匹配的任务' : '从一个小任务开始'}</h3><p>{query || filter !== 'all' ? '换一个关键词，或切回全部任务。' : '交办目标后，你可以在这里查看每一步进展。'}</p>{(query || filter !== 'all') && <button className="text-button" onClick={() => { setQuery(''); setFilter('all'); }}>清除筛选</button>}</div>}</div>
          </section>
        </div>}
        {page === 'home' && task && <div className="task-page page-enter">
          <div className="task-heading"><button className="text-button back" onClick={() => setSelected(undefined)}><ArrowLeft size={15} />全部任务</button><div className="task-actions"><button className="icon-button" aria-label={inspector ? '隐藏执行详情' : '显示执行详情'} onClick={() => setInspector(!inspector)}><Activity size={18} /></button>{!['completed', 'failed', 'cancelled'].includes(task.status) && <button className="secondary small-button" disabled={busy} onClick={() => void run(() => bridge.cancelTask(task.id))}><Square size={12} />停止任务</button>}</div></div>
          <div className="task-title"><Status task={task} /><h1>{task.goal.length > 100 ? task.goal.slice(0, 100) + '…' : task.goal}</h1><div className="task-meta"><span>{skills.find(s => s.id === task.skill)?.title}</span><span>第 {task.runNumber ?? 1} 轮</span><span>{task.steps} 个模型步骤</span></div></div>
          <TokenStats tasks={tasks.filter(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id))} />
          {!!Object.keys(task.skillPins ?? {}).length && <div className="active-skills">已加载 Skills：{Object.entries(task.skillPins!).map(([id, hash]) => <span key={id}>{id} · {hash.slice(0, 8)}</span>)}</div>}
          <details className="permission-disclosure"><summary>工具权限 · 文件{task.fileMode === 'snapshot' ? '自动快照' : '逐次确认'} · Shell {hostEnabled ? task.hostMode === 'allow' ? '已授权' : '需确认' : '关闭'} · {task.root ?? '无项目目录'}</summary><section className="tool-permissions" aria-label="本次对话工具权限"><div><strong>本次对话工具权限</strong><span>{task.root ?? '尚未选择项目目录'}</span></div>
            <label>文件与目录<select aria-label="本次对话文件权限" disabled={busy} value={task.fileMode ?? 'ask'} onChange={e => void run(() => bridge.setTaskPermissions({ taskId: task.id, fileMode: e.target.value as 'snapshot' | 'ask', hostMode: task.hostMode ?? 'ask' }))}><option value="snapshot">自动快照，免逐文件确认</option><option value="ask">每次修改确认</option></select></label>
            <label>Shell / JavaScript<select aria-label="本次对话执行权限" disabled={busy || !hostEnabled || !task.root} value={task.hostMode ?? 'ask'} onChange={e => {
              const mode = e.target.value as 'ask' | 'allow';
              if (mode === 'allow' && !window.confirm('授权本次对话的 Shell / JavaScript 免逐次确认。不是安全沙箱，可访问本机文件和网络；Shell 修改不在文件快照覆盖范围内。仅对可信任务启用。')) return;
              void run(() => bridge.setTaskPermissions({ taskId: task.id, fileMode: task.fileMode ?? 'ask', hostMode: mode }));
            }}><option value="ask">{hostEnabled ? '每次执行确认' : '未启用（到工具设置开启）'}</option><option value="allow">本次对话免确认（可信任务）</option></select></label>
            <button className="text-button" onClick={() => go('settings')}>工具设置<SlidersHorizontal size={14} /></button>
          </section></details>
          <WebAccess task={task} busy={busy} run={run} />
          <div className={inspector ? 'task-layout with-inspector' : 'task-layout'}><div className="conversation">
            {task.events.filter(e => ['assistant', 'user', 'error', 'reasoning', 'tool'].includes(e.kind)).map(e => e.kind === 'tool'
              ? <details className="tool-event" key={e.id}><summary><CheckCircle2 size={13} />{e.text.split(' · ')[0]}<time>{time(e.at)}</time></summary><pre>{e.text}</pre></details> : e.kind === 'reasoning'
              ? <details className="reasoning" key={e.id}><summary>模型返回的推理内容</summary><Markdown>{e.text}</Markdown></details>
              : <article className={`message ${e.kind}`} key={e.id}><div className="message-icon">{e.kind === 'user' ? <span>你</span> : <Logo small />}</div><div className="message-body"><div className="message-author">{e.kind === 'user' ? '你' : e.kind === 'error' ? '执行中断' : 'Agent47'}<time>{time(e.at)}</time></div>{e.kind === 'assistant' ? <Markdown>{e.text}</Markdown> : <div className="message-text">{e.text}</div>}</div></article>)}
            {task.draft?.reasoning && <details className="reasoning"><summary>正在接收模型推理…</summary><Markdown>{task.draft.reasoning}</Markdown></details>}
            {task.draft?.text && <article className="message assistant streaming"><div className="message-icon"><Logo small /></div><div className="message-body"><div className="message-author">Agent47 · 流式输出</div><Markdown>{task.draft.text}</Markdown></div></article>}
            {task.context && <div className="context-note">上下文预估 {task.context.estimatedTokens.toLocaleString()}（本地保守估计，非供应商 tokens） · 自动压缩 {task.context.compactions} 次 · 原始历史保留</div>}
            {tasks.filter(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id)).some(t => t.fileChanges?.length) && <details className="file-changes"><summary>文件改动与恢复点（写入前自动备份）</summary>{tasks.filter(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id)).flatMap(owner => [...(owner.fileChanges ?? [])].reverse().map(change => <div className="snapshot-row" key={`${owner.id}-${change.id}`}><span>{change.path}<small>第 {owner.runNumber ?? 1} 轮 · {change.state === 'restored' ? '已恢复' : change.state === 'cleaned' ? '备份已清理，不能恢复' : '可恢复'}</small></span><button className="secondary small-button" disabled={busy || change.state !== 'saved' || !['completed', 'failed', 'cancelled'].includes(task.status)} onClick={() => {
              if (window.confirm(`恢复 ${change.path} 到此次改动前？新建文件将删除，已有文件恢复原文；外部改动会拒绝覆盖。`)) void run(() => bridge.restoreFile({ taskId: owner.id, snapshotId: change.id }));
            }}>恢复改动前</button></div>))}<p className="context-note">只覆盖 writeFile / editFile / makeDirectory，不回退聊天、Shell 改动或远端操作。多次修改同一文件请从最近一次恢复。</p>
              {tasks.filter(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id) && t.fileChanges?.some(change => change.state === 'saved')).map(owner => <button className="secondary" disabled={busy || !['completed', 'failed', 'cancelled'].includes(task.status)} key={owner.id} onClick={() => {
                if (window.confirm(`撤销第 ${owner.runNumber ?? 1} 轮在 ${owner.root} 的 ${owner.fileChanges!.filter(change => change.state === 'saved').length} 项文件工具改动？按倒序恢复，冲突项及其旧版本保留；不是原子事务，不撤销 Shell/远端效果。`)) void run(() => bridge.undoRun(owner.id));
              }}>撤销第 {owner.runNumber ?? 1} 轮文件改动</button>)}
              {tasks.filter(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id) && t.undo).map(owner => <div className="context-note" role="status" key={owner.id}>第 {owner.runNumber ?? 1} 轮撤销：{owner.undo!.state === 'running' ? '进行中' : owner.undo!.state === 'completed' ? '已完成' : '部分恢复 / 需要检查'} · 恢复 {owner.undo!.restored} 项 · 冲突 {owner.undo!.conflicts.length} 项{owner.undo!.conflicts.map(conflict => <p key={conflict.path}>{conflict.path}：{conflict.error}</p>)}</div>)}
            </details>}
            {(task.status === 'running' || task.status === 'queued') && <div className="working-state" role="status"><LoaderCircle size={16} className="spin" />{task.status === 'queued' ? '已进入本地队列，等待执行…' : '正在推进任务，进展会保存在本地…'}</div>}
            {task.status === 'awaiting_approval' && task.approval && <section className="approval-card">
              <div className="approval-top"><span className="approval-icon"><ShieldCheck size={21} /></span><div><div className="eyebrow">需要你的确认</div><h2>{task.approval.kind === 'project_write' ? '修改项目文件' : task.approval.kind ? '执行本机工具' : '创建一份成果文件'}</h2></div><span className="badge">一次性授权</span></div>
              <p>{task.approval.kind === 'project_write' ? '写入授权项目目录，完整新内容如下；原文件变化后将拒绝执行。' : task.approval.kind ? '这不是安全沙箱。命令/代码以你的系统用户权限执行，可能读写目录以外的数据或访问网络；仅批准你信任的完整内容。' : '只写入 Agent47 成果库，不修改项目目录。请审阅下面的完整内容。'}</p>
              {task.approval.kind && <p className="context-note">目录：{task.approval.root} {task.approval.payload?.cwd ? ` · cwd ${task.approval.payload.cwd}` : ''}</p>}
              {task.approval.before !== undefined && <details className="reasoning"><summary>修改前内容</summary><pre>{task.approval.before}</pre></details>}
              <div className="file-preview"><div className="file-preview-bar"><FileText size={15} /><strong>{task.approval.name}</strong><span>{new TextEncoder().encode(task.approval.content).length} B</span></div><pre>{task.approval.content}</pre></div>
              <div className="approval-footer"><span>授权绑定当前对象与完整内容，24 小时后失效。</span><div><button className="secondary" disabled={busy} onClick={() => void run(() => bridge.decide({ taskId: task.id, approvalId: task.approval!.id, digest: task.approval!.digest, approve: false }))}><X size={16} />{task.approval.kind === 'shell' || task.approval.kind === 'code' ? '拒绝执行' : '拒绝写入'}</button><button className="primary" disabled={busy} onClick={() => void run(() => bridge.decide({ taskId: task.id, approvalId: task.approval!.id, digest: task.approval!.digest, approve: true }))}><Check size={16} />{task.approval.kind === 'project_write' ? '批准写入' : task.approval.kind ? '批准执行' : '批准创建'}</button></div></div>
            </section>}
            {task.status === 'awaiting_input' && <section className="question-card"><h2>需要你的补充</h2><Markdown>{task.question?.text ?? ''}</Markdown><p>直接在下方回答；回复不授予任何额外工具权限。</p></section>}
            {(task.status === 'awaiting_reconciliation' || (task.status === 'cancelled' && task.unknownEffect)) && <section className="question-card"><h2>主机执行结果未知</h2><p>请先检查项目与系统的实际效果。恢复不会重放原命令；已停止轮次仍保持停止。</p><button className="secondary" onClick={() => void run(() => bridge.resolveUnknown(task.id))}>我已检查，不重放并继续</button></section>}
            {!!task.artifacts.length && <section className="task-artifacts"><h2>这次任务的成果</h2>{task.artifacts.map(a => <button className="artifact-row" key={a.id} onClick={() => setArtifact({ task, artifact: a })}><FileText size={22} /><span><strong>{a.name}</strong><small>已保存 · {bridge.preview ? '示例成果' : '内容校验可追溯'}</small></span><ArrowUpRight size={17} /></button>)}</section>}
            {['failed', 'cancelled'].includes(task.status) && <div className="task-end-note">这个任务已结束，不会自动重新执行。你可以复制目标，创建一个新任务。<button className="text-button" onClick={() => { setGoal(task.goal); setSkill(task.skill); setSelected(undefined); }}>带入新任务<ArrowUpRight size={14} /></button></div>}
            {task.status === 'completed' && <div className="completion-note"><CheckCircle2 size={15} />任务已完成。已结束的任务不会被重新执行。</div>}
          </div>
          {inspector && <aside className="inspector"><div className="inspector-heading"><h2>执行详情</h2><button className="icon-button" aria-label="关闭执行详情" onClick={() => setInspector(false)}><PanelRightClose size={17} /></button></div><div className="permission-summary"><span>本次权限</span><p><Folder size={14} />{task.root || '未授权任何项目目录'}</p><p><ShieldCheck size={14} />写入与主机执行逐次审批</p></div><h3>事件记录</h3><div className="event-timeline">{task.events.map(e => <div key={e.id} className="timeline-event"><span className="timeline-dot" /><div><time>{time(e.at)} · {({ user: '目标', assistant: '回复', reasoning: '推理', tool: '工具', system: '状态', error: '错误' })[e.kind]}</time><p>{e.text.length > 240 ? e.text.slice(0, 240) + '…' : e.text}</p></div></div>)}</div><div className="inspector-foot">任务与检查点保存在本地。<br />模型请求由所选服务处理。</div></aside>}
          </div>
          <section className="composer-dock" aria-label="对话输入区">
            {!!task.queuedInput?.length && <div className="message-queue" aria-label="待发送消息"><div className="queue-heading">待发送 · {task.queuedInput.length}<span>{['completed', 'cancelled', 'failed'].includes(task.status) ? '已暂停，点击立即发送继续' : task.status === 'awaiting_approval' ? '审批等待中，立即发送可改写要求' : '下一个工具边界合并发送'}</span></div>{task.queuedInput.map(item => <div className="queue-row" key={item.id}><p>{item.text}</p><button className="secondary small-button" disabled={busy || task.status === 'awaiting_reconciliation'} onClick={() => void run(async () => { const next = await bridge.manageQueue({ taskId: task.id, messageId: item.id, action: 'send' }); setSelected(next.id); })}>立即发送</button><button className="icon-button" aria-label={`删除待发送消息：${item.text}`} disabled={busy} onClick={() => void run(() => bridge.manageQueue({ taskId: task.id, messageId: item.id, action: 'delete' }))}><X size={15} /></button></div>)}</div>}
            <form className="reply-composer" onSubmit={event => { event.preventDefault(); if (!reply.trim() || busy) return; void run(async () => { const next = await bridge.sendMessage({ taskId: task.id, text: reply.trim(), mode: 'queue', clientMessageId: crypto.randomUUID() }); setSelected(next.id); setReply(''); }); }}>
              <label className="sr-only" htmlFor="reply">继续对话</label><textarea id="reply" value={reply} onChange={e => setReply(e.target.value)} maxLength={12000} rows={2} placeholder={task.status === 'awaiting_input' ? '回答上面的问题…' : '补充要求或继续追问…'} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
              <div className="composer-bottom"><span className="context-note">Enter 发送 · Shift + Enter 换行 · {['running', 'queued', 'awaiting_approval'].includes(task.status) ? '先加入队列，可立即打断模型；工具不强杀' : '继续对话不重放旧动作'}</span><button className="primary small-button" type="submit" disabled={!reply.trim() || busy || task.status === 'awaiting_reconciliation' || (task.unknownEffect && task.status !== 'running')}>发送消息<ArrowUp size={16} /></button></div>
            </form>
          </section>
        </div>}
        {page === 'artifacts' && <div className="standard-page page-enter"><div className="page-eyebrow">可审阅，可带走</div><h1>成果库</h1><p className="page-description">经过确认的交付物集中在这里。每份成果都能回到它的来源任务。</p><div className="artifact-grid">{tasks.flatMap(t => t.artifacts.map(a => <button className="artifact-card" key={`${t.id}-${a.id}`} onClick={() => setArtifact({ task: t, artifact: a })}><span className="artifact-type"><FileText size={25} /><span>{a.name.split('.').pop()?.toUpperCase()}</span></span><h2>{a.name}</h2><p>{t.goal}</p><div><span>{bridge.preview ? '示例成果' : '已批准创建'} · {time(t.updatedAt)}</span><ArrowUpRight size={16} /></div></button>))}</div>{!tasks.some(t => t.artifacts.length) && <div className="empty-state bordered"><Layers size={30} /><h3>还没有已保存的成果</h3><p>批准任务中的写入申请后，成果会出现在这里。</p><button className="secondary" onClick={() => go('home')}>回到任务中心<ArrowUpRight size={15} /></button></div>}</div>}
        {page === 'capabilities' && <div className="standard-page page-enter">
          <h1>能力与 Skills</h1>
          <p className="page-description">任务指导与 skill 包影响如何处理目标，但不会扩大工具权限。</p>
          <div className="skill-cards">{skills.map(s => <article className="skill-card" key={s.id}><span className="skill-code">{s.id.toUpperCase()}</span><h2>{s.title}</h2><p>{s.description}</p><button className="text-button" onClick={() => { setSkill(s.id); go('home'); }}>用于新任务<ArrowUpRight size={14} /></button></article>)}</div>
          <section className="capability-section"><h2>Skills 扩展包</h2><p>导入含 SKILL.md、references 与 scripts 的文本目录。只加载启用包的元信息，完整内容按需读取；脚本不会自动安装或执行。</p>
            <button className="secondary" disabled={busy} onClick={() => void run(async () => setSkillImport(await bridge.previewSkill()))}>选择 Skill 包</button>
            {extensions.map(extension => <article className="skill-entry" key={extension.id}><div><strong>{extension.name}</strong><p>{extension.description}</p><small>{extension.files.length} 个文本文件 · 固定版本 {extension.hash.slice(0, 12)}</small></div><button className="secondary" disabled={busy} onClick={() => void run(() => bridge.setSkill({ id: extension.id, enabled: !extension.enabled }))}>{extension.enabled ? '停用' : '启用'}</button><button className="secondary" disabled={busy} onClick={() => { if (window.confirm(`卸载 ${extension.name}？停止后续加载，保留历史版本与会话记录；已经进入模型上下文的内容不会被擦除。`)) void run(() => bridge.removeSkill(extension.id)); }}>卸载</button></article>)}
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
      <footer className="app-footer"><span><span className="local-dot" />{bridge.preview ? 'PREVIEW MODE' : 'LOCAL-FIRST'}</span><span>{bridge.preview ? '示例数据仅在当前页面内存中，不接收真实凭据。' : '项目权限由你授权；文件工具改动前自动快照。'}<span className="footer-version">Agent47 0.2</span></span></footer>
    </div>
    {artifact && <div className="modal-backdrop" role="presentation" onClick={() => setArtifact(undefined)}><section ref={dialogRef} className="artifact-modal" role="dialog" aria-modal="true" aria-label={artifact.artifact.name} onClick={e => e.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">成果预览</span><h2>{artifact.artifact.name}</h2></div><button className="icon-button" aria-label="关闭成果预览" onClick={() => setArtifact(undefined)}><X size={20} /></button></div><pre>{artifact.artifact.content}</pre><div className="modal-footer"><button className="text-button" onClick={() => { open(artifact.task.id); setArtifact(undefined); }}>查看来源任务<ArrowUpRight size={14} /></button><button className="primary" onClick={() => void run(() => bridge.openArtifact({ taskId: artifact.task.id, artifactId: artifact.artifact.id }))}><Download size={16} />{bridge.preview ? '下载示例文件' : '用默认应用打开'}</button></div></section></div>}
  </div>;
}

function WebAccess({ task, busy, run }: { task: TaskView; busy: boolean; run: (operation: () => Promise<unknown>) => Promise<void> }) {
  const [url, setUrl] = useState('');
  return <details className="permission-disclosure web-access"><summary>网页读取 · {task.webOrigins?.length ?? 0} 个授权站点</summary>
    <form onSubmit={event => { event.preventDefault(); void run(async () => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('请使用不含登录信息的 HTTPS 站点地址。');
      const origin = parsed.origin;
      if (!window.confirm(`授权本次对话读取 ${origin} 的公开 HTTPS 页面？请求不携带登录 Cookie 或模型密钥，内容会发送给 DeepSeek；无脚本、点击或表单提交能力。GET 不是远端操作回滚机制，请勿授权有副作用的接口。`)) return;
      await bridge.setWebOrigins({ taskId: task.id, origins: [...(task.webOrigins ?? []), origin] }); setUrl('');
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
