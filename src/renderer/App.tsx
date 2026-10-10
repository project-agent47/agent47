import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, ArrowUpRight, ArrowLeft, Plus, Folder, FileText, Inbox, SlidersHorizontal, Layers, Search, Sun, Moon, Check, X, Square, ChevronRight, ShieldCheck, Activity, Cpu, LoaderCircle, Cable, LockKeyhole, PanelRightClose, Download, Circle, CheckCircle2 } from 'lucide-react';
import { bridge } from './bridge';
import type { TaskView, SkillId, FolderGrant, ProviderView, Artifact } from '../shared/contracts';

type Page = 'home' | 'artifacts' | 'capabilities' | 'settings';
const statusLabels: Record<TaskView['status'], string> = {
  queued: '等待执行', running: '进行中', awaiting_approval: '待你审阅', completed: '已完成', failed: '未完成', cancelled: '已停止'
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
  const goalRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const task = tasks.find(t => t.id === selected);
  const pending = tasks.filter(t => t.status === 'awaiting_approval').length;
  const active = tasks.filter(t => ['running', 'queued'].includes(t.status)).length;
  const refresh = async () => {
    try { setTasks(await bridge.listTasks()); setConnection(await bridge.provider()); }
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
  const visible = tasks.filter(t => t.goal.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'active' ? ['running', 'queued'].includes(t.status) : t.status === 'awaiting_approval')));

  return <div className="app">
    <aside className="sidebar" inert={artifact ? true : undefined}>
      <button className="brand" onClick={() => go('home')} aria-label="回到任务中心"><span className="brand-mark"><Logo small /></span><span>Agent47<span className="brand-caption">YOUR LOCAL AGENT</span></span><span className="version">02</span></button>
      <button className="new-task" onClick={() => { go('home'); queueMicrotask(() => goalRef.current?.focus()); }}><Plus size={17} />新任务<span className="keycap">⌘ N</span></button>
      <nav aria-label="主导航">
        <button className={page === 'home' ? 'nav active' : 'nav'} onClick={() => go('home')}><Inbox size={18} />任务中心{pending > 0 && <span className="nav-count">{pending}</span>}</button>
        <button className={page === 'artifacts' ? 'nav active' : 'nav'} onClick={() => go('artifacts')}><Layers size={18} />成果库</button>
        <button className={page === 'capabilities' ? 'nav active' : 'nav'} onClick={() => go('capabilities')}><ShieldCheck size={18} />能力与边界</button>
      </nav>
      <div className="sidebar-section"><span>最近任务</span><span className="tiny">{tasks.length}</span></div>
      <div className="recent-nav">{tasks.slice(0, 7).map(t => <button key={t.id} className={t.id === selected ? 'recent-item selected' : 'recent-item'} onClick={() => open(t.id)}>
        <span className={`task-dot ${t.status}`} /><span>{t.goal}</span>
      </button>)}{!tasks.length && <p className="sidebar-empty">你的第一个任务会出现在这里。</p>}</div>
      <div className="sidebar-bottom">
        <div className="local-indicator"><span className="local-dot" /><span>本地工作空间<small>{bridge.preview ? '交互预览 · 示例数据' : '任务保存在这台设备'}</small></span><LockKeyhole size={14} /></div>
        <button className={page === 'settings' ? 'nav active' : 'nav'} onClick={() => go('settings')}><SlidersHorizontal size={17} />连接设置<span className={connection?.configured ? 'connected-dot' : 'disconnected-dot'} /></button>
      </div>
    </aside>
    <div className="shell" inert={artifact ? true : undefined}>
      <header className="topbar"><div className="breadcrumb"><span>工作空间</span><ChevronRight size={14} /><strong>{selected ? '任务详情' : { home: '任务中心', artifacts: '成果库', capabilities: '能力与边界', settings: '连接设置' }[page]}</strong></div>
        <div className="topbar-right">{bridge.preview && <span className="preview-label">交互预览 · 不调用模型</span>}<span className="model-label"><Cpu size={14} />{connection?.model || '未连接模型'}</span><button className="icon-button" aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button></div>
      </header>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="关闭错误提示"><X size={16} /></button></div>}
      <main className={selected ? 'content task-content' : 'content'}>
        {page === 'home' && !task && <div className="home page-enter">
          <div className="page-eyebrow"><span className="local-dot" />为你推进，不替你越界</div>
          <div className="home-heading"><div><h1>接下来，交给 Agent47。</h1><p>说清目标。必要的步骤由任务决定。</p></div><div className="heading-symbol"><Logo /></div></div>
          <form className="composer" onSubmit={create}>
            <label className="sr-only" htmlFor="goal">任务目标</label>
            <textarea id="goal" ref={goalRef} placeholder="你想完成什么？例如：审阅这个项目，整理一份可执行的改造清单。" value={goal} onChange={e => setGoal(e.target.value)} maxLength={12000} rows={3} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') create(e); }} />
            <div className="composer-bottom"><div className="composer-options"><button type="button" className={folder ? 'context-chip attached' : 'context-chip'} onClick={() => void run(async () => { const grant = await bridge.chooseFolder(); if (grant) setFolder(grant); })}><Folder size={16} /><span>{folder ? folder.path.split(/[\\/]/).pop() : '选择项目目录'}</span></button>{folder && <button type="button" className="icon-button" aria-label="移除目录授权" onClick={() => setFolder(undefined)}><X size={14} /></button>}<label className="skill-select"><span className="sr-only">任务指导</span><select value={skill} onChange={e => setSkill(e.target.value as SkillId)}>{skills.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label></div><button type="submit" className="submit-button" aria-label="开始任务" disabled={!goal.trim() || busy}>{busy ? <LoaderCircle size={18} className="spin" /> : <ArrowUp size={20} />}</button></div>
          </form>
          <div className="composer-note"><ShieldCheck size={14} />只读取授权目录。文件内容会发给所选模型；成果写入须经你确认。<span>⌘ / Ctrl + Enter</span></div>
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
          <div className="task-heading"><button className="text-button back" onClick={() => setSelected(undefined)}><ArrowLeft size={15} />全部任务</button><div className="task-actions"><button className="icon-button" aria-label={inspector ? '隐藏执行详情' : '显示执行详情'} onClick={() => setInspector(!inspector)}><Activity size={18} /></button>{['queued', 'running', 'awaiting_approval'].includes(task.status) && <button className="secondary small-button" disabled={busy} onClick={() => void run(() => bridge.cancelTask(task.id))}><Square size={12} />停止任务</button>}</div></div>
          <div className="task-title"><Status task={task} /><h1>{task.goal}</h1><div className="task-meta"><span>{skills.find(s => s.id === task.skill)?.title}</span><span>创建于 {time(task.createdAt)}</span><span>{task.steps} 个模型步骤</span></div></div>
          <div className={inspector ? 'task-layout with-inspector' : 'task-layout'}><div className="conversation">
            {task.events.filter(e => e.kind === 'assistant' || e.kind === 'user' || e.kind === 'error').map(e => <article className={`message ${e.kind}`} key={e.id}><div className="message-icon">{e.kind === 'user' ? <span>你</span> : <Logo small />}</div><div className="message-body"><div className="message-author">{e.kind === 'user' ? '你的目标' : e.kind === 'error' ? '执行中断' : 'Agent47'}<time>{time(e.at)}</time></div><div className="message-text">{e.text}</div></div></article>)}
            {(task.status === 'running' || task.status === 'queued') && <div className="working-state" role="status"><LoaderCircle size={16} className="spin" />{task.status === 'queued' ? '已进入本地队列，等待执行…' : '正在推进任务，进展会保存在本地…'}</div>}
            {task.status === 'awaiting_approval' && task.approval && <section className="approval-card">
              <div className="approval-top"><span className="approval-icon"><ShieldCheck size={21} /></span><div><div className="eyebrow">需要你的确认</div><h2>创建一份成果文件</h2></div><span className="badge">一次性授权</span></div>
              <p>只写入 Agent47 成果库，不修改项目目录。请审阅下面的完整内容。</p>
              <div className="file-preview"><div className="file-preview-bar"><FileText size={15} /><strong>{task.approval.name}</strong><span>{new TextEncoder().encode(task.approval.content).length} B</span></div><pre>{task.approval.content}</pre></div>
              <div className="approval-footer"><span>授权绑定当前文件与内容，24 小时后失效。</span><div><button className="secondary" disabled={busy} onClick={() => void run(() => bridge.decide({ taskId: task.id, approvalId: task.approval!.id, digest: task.approval!.digest, approve: false }))}><X size={16} />拒绝写入</button><button className="primary" disabled={busy} onClick={() => void run(() => bridge.decide({ taskId: task.id, approvalId: task.approval!.id, digest: task.approval!.digest, approve: true }))}><Check size={16} />批准创建</button></div></div>
            </section>}
            {!!task.artifacts.length && <section className="task-artifacts"><h2>这次任务的成果</h2>{task.artifacts.map(a => <button className="artifact-row" key={a.id} onClick={() => setArtifact({ task, artifact: a })}><FileText size={22} /><span><strong>{a.name}</strong><small>已保存 · {bridge.preview ? '示例成果' : '内容校验可追溯'}</small></span><ArrowUpRight size={17} /></button>)}</section>}
            {['failed', 'cancelled'].includes(task.status) && <div className="task-end-note">这个任务已结束，不会自动重新执行。你可以复制目标，创建一个新任务。<button className="text-button" onClick={() => { setGoal(task.goal); setSkill(task.skill); setSelected(undefined); }}>带入新任务<ArrowUpRight size={14} /></button></div>}
            {task.status === 'completed' && <div className="completion-note"><CheckCircle2 size={15} />任务已完成。已结束的任务不会被重新执行。</div>}
          </div>
          {inspector && <aside className="inspector"><div className="inspector-heading"><h2>执行详情</h2><button className="icon-button" aria-label="关闭执行详情" onClick={() => setInspector(false)}><PanelRightClose size={17} /></button></div><div className="permission-summary"><span>本次权限</span><p><Folder size={14} />{task.root || '未授权任何项目目录'}</p><p><ShieldCheck size={14} />成果写入逐次审批</p></div><h3>事件记录</h3><div className="event-timeline">{task.events.map(e => <div key={e.id} className="timeline-event"><span className="timeline-dot" /><div><time>{time(e.at)} · {({ user: '目标', assistant: '回复', tool: '工具', system: '状态', error: '错误' })[e.kind]}</time><p>{e.text.length > 240 ? e.text.slice(0, 240) + '…' : e.text}</p></div></div>)}</div><div className="inspector-foot">任务与检查点保存在本地。<br />模型请求由所选服务处理。</div></aside>}
          </div>
        </div>}
        {page === 'artifacts' && <div className="standard-page page-enter"><div className="page-eyebrow">可审阅，可带走</div><h1>成果库</h1><p className="page-description">经过确认的交付物集中在这里。每份成果都能回到它的来源任务。</p><div className="artifact-grid">{tasks.flatMap(t => t.artifacts.map(a => <button className="artifact-card" key={`${t.id}-${a.id}`} onClick={() => setArtifact({ task: t, artifact: a })}><span className="artifact-type"><FileText size={25} /><span>{a.name.split('.').pop()?.toUpperCase()}</span></span><h2>{a.name}</h2><p>{t.goal}</p><div><span>{bridge.preview ? '示例成果' : '已批准创建'} · {time(t.updatedAt)}</span><ArrowUpRight size={16} /></div></button>))}</div>{!tasks.some(t => t.artifacts.length) && <div className="empty-state bordered"><Layers size={30} /><h3>还没有已保存的成果</h3><p>批准任务中的写入申请后，成果会出现在这里。</p><button className="secondary" onClick={() => go('home')}>回到任务中心<ArrowUpRight size={15} /></button></div>}</div>}
        {page === 'capabilities' && <div className="standard-page page-enter"><div className="page-eyebrow">能力可见，权限具体</div><h1>不是一套固定的流程。</h1><p className="page-description">任务指导影响模型如何处理目标，但不强制阶段，也不扩大工具权限。</p><div className="skill-cards">{skills.map(s => <article className="skill-card" key={s.id}><span className="skill-code">{s.id.toUpperCase()}</span><h2>{s.title}</h2><p>{s.description}</p><button className="text-button" onClick={() => { setSkill(s.id); go('home'); }}>用于新任务<ArrowUpRight size={14} /></button></article>)}</div><section className="capability-section"><h2>这一版能做什么</h2><div className="capability-table">{[['真实模型', 'AI SDK 驱动的目标式工具循环，单任务最多 12 个模型步骤。'], ['项目读取', '仅可读取你通过系统目录选择器授权的目录；限制文本大小，阻止隐含目录与符号链接。'], ['成果创建', '展示完整文件内容，批准后写入应用成果库，不提供项目文件修改工具。'], ['任务恢复', '保存模型消息与待执行动作。应用重启从检查点继续，已完成任务不重跑。']].map(([name, text]) => <div key={name}><span><CheckCircle2 size={16} />{name}</span><p>{text}</p></div>)}</div><div className="boundary-note"><LockKeyhole size={20} /><div><strong>尚未开放的能力</strong><p>Shell、浏览器操作、系统桌面自动化、定时触发、MCP 与多 Agent 协调不在本轮实现范围。不会用模拟结果冒充执行成功。</p></div></div></section></div>}
        {page === 'settings' && <Settings connection={connection} busy={busy} run={run} />}
      </main>
      <footer className="app-footer"><span><span className="local-dot" />{bridge.preview ? 'PREVIEW MODE' : 'LOCAL-FIRST'}</span><span>{bridge.preview ? '示例数据仅在当前页面内存中，不接收真实凭据。' : '目录访问由你授权，成果写入由你确认。'}<span className="footer-version">Agent47 0.2</span></span></footer>
    </div>
    {artifact && <div className="modal-backdrop" role="presentation" onClick={() => setArtifact(undefined)}><section ref={dialogRef} className="artifact-modal" role="dialog" aria-modal="true" aria-label={artifact.artifact.name} onClick={e => e.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">成果预览</span><h2>{artifact.artifact.name}</h2></div><button className="icon-button" aria-label="关闭成果预览" onClick={() => setArtifact(undefined)}><X size={20} /></button></div><pre>{artifact.artifact.content}</pre><div className="modal-footer"><button className="text-button" onClick={() => { open(artifact.task.id); setArtifact(undefined); }}>查看来源任务<ArrowUpRight size={14} /></button><button className="primary" onClick={() => void run(() => bridge.openArtifact({ taskId: artifact.task.id, artifactId: artifact.artifact.id }))}><Download size={16} />{bridge.preview ? '下载示例文件' : '用默认应用打开'}</button></div></section></div>}
  </div>;
}

function Settings({ connection, busy, run }: { connection?: ProviderView; busy: boolean; run: (operation: () => Promise<unknown>) => Promise<void> }) {
  const [url, setUrl] = useState(connection?.baseURL || 'https://opencode.ai/zen/go/v1');
  const [model, setModel] = useState(connection?.model || 'deepseek-v4.1-flash');
  const [key, setKey] = useState('');
  const [result, setResult] = useState('');
  const [saved, setSaved] = useState(false);
  return <div className="standard-page settings-page page-enter"><div className="page-eyebrow">DeepSeek，专注一个模型系列</div><h1>连接设置</h1><p className="page-description">通过 AI SDK 接入 DeepSeek 的兼容 Chat Completion API。密钥只在桌面主进程使用，不返回给页面。</p>
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
