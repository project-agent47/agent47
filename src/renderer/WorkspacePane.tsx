import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { X, PanelRightClose, RefreshCw, ArrowLeft, ArrowRight, FilePlus2 } from 'lucide-react';
import type { WorkspaceState } from '../shared/contracts';
import { bridge } from './bridge';
import { Markdown } from './Markdown';
import { previewWorkspace } from './workspace-preview';
const CodeViewer = lazy(() => import('./CodeViewer'));
class DocumentBoundary extends Component<{ children: ReactNode; content: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="document-markdown"><p>编辑器加载失败，暂以纯文本查看。关闭后重新打开可重试。</p><pre>{this.props.content}</pre></div> : this.props.children; }
}
export function WorkspacePane({ state, setState, theme, blocked, run, sourceTask, canSendPage, sendPage, conversationId, grantPage, attachMaterial, selectText, canSelect, projectBrowser }: { projectBrowser?: ReactNode; state: WorkspaceState; setState: (s: WorkspaceState) => void; theme: string; blocked: boolean;
  run: (operation: () => Promise<unknown>) => Promise<void>; sourceTask: (id: string) => void; canSendPage: boolean; sendPage: (tabId: string) => void; conversationId?: string; grantPage: (tabId: string, mode: 'deny' | 'read' | 'ask' | 'allow') => void; attachMaterial: (tabId: string) => void;
  canSelect: boolean; selectText: (tabId: string, hash: string, range: { start: number; end: number }) => Promise<void> }) {
  const tab = state.tabs.find(t => t.id === state.activeId), box = useRef<HTMLDivElement>(null);
  const [raw, setRaw] = useState(false), [draftWidth, setDraftWidth] = useState(state.width);
  const [url, setURL] = useState('');
  const [range, setRange] = useState<{ start: number; end: number }>(), [selectionHint, setSelectionHint] = useState('');
  useEffect(() => { setRaw(false); }, [tab?.id]);
  useEffect(() => { setRange(undefined); setSelectionHint(''); }, [tab?.id, tab?.sha256, raw]);
  useEffect(() => { setDraftWidth(state.width); }, [state.width]);
  useEffect(() => {
    let disposed = false, frame = 0;
    const layout = () => {
      cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
        if (disposed) return;
        const rect = box.current?.getBoundingClientRect();
        const visible = state.visible && tab && ['html', 'web'].includes(tab.kind) && !tab.paused && !raw && !blocked && rect && rect.width > 0 && rect.height > 0;
        void bridge.workspaceLayout(visible ? { tabId: tab.id, bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.floor(rect.width), height: Math.floor(rect.height) } } : {}).catch(() => {});
      });
    };
    const observer = new ResizeObserver(layout); if (box.current) observer.observe(box.current);
    layout(); window.addEventListener('resize', layout);
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', layout); void bridge.workspaceLayout({}); };
  }, [state.visible, state.width, tab?.id, tab?.sha256, tab?.kind, tab?.paused, tab?.revision, raw, blocked, draftWidth]);
  if (!state.visible) return null;
  const mutate = (input: Parameters<typeof bridge.workspaceUpdate>[0]) => void run(async () => setState(await bridge.workspaceUpdate(input)));
  return <aside className={`workspace-pane${blocked ? ' workspace-blocked' : ''}`} aria-label="产物工作区" style={{ width: draftWidth }}>
    <div className="workspace-splitter" role="separator" tabIndex={0} aria-label="调整工作区宽度" aria-orientation="vertical" aria-valuenow={draftWidth} aria-valuemin={280} aria-valuemax={1000}
      onKeyDown={e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); mutate({ width: Math.max(280, Math.min(1000, draftWidth + (e.key === 'ArrowLeft' ? 20 : -20))) }); } }}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setDraftWidth(Math.max(280, Math.min(1000, innerWidth - e.clientX))); }}
      onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); mutate({ width: draftWidth }); }} />
    <header className="workspace-heading"><strong>产物工作区</strong><span>查看不自动交给模型</span>
      <button className="icon-button" aria-label="打开本地文件" onClick={() => void run(async () => setState(await bridge.workspaceImport()))}><FilePlus2 size={16} /></button>
      <button className="icon-button" aria-label="收起工作区" onClick={() => mutate({ visible: false })}><PanelRightClose size={16} /></button></header>
    <form className="workspace-address" onSubmit={e => { e.preventDefault(); if (url.trim()) void run(async () => { setState(await bridge.workspaceWebOpen(url.trim())); setURL(''); }); }}>
      <input aria-label="公共 HTTPS 网页地址" value={url} onChange={e => setURL(e.target.value)} placeholder="https://… 在新标签打开" maxLength={2048} />
      <button className="secondary small-button" disabled={!url.trim() || blocked}>打开网页</button>
    </form>
    <div className="workspace-tabs" role="tablist" aria-label="打开的文档">{state.tabs.map(t => <div key={t.id}>
      <button role="tab" aria-selected={tab?.id === t.id} title={t.name} onClick={() => mutate({ activeId: t.id })}>{t.name}</button>
      <button className="icon-button" aria-label={`关闭标签：${t.name}`} onClick={() => mutate({ closeId: t.id })}><X size={12} /></button></div>)}</div>
    {projectBrowser && <details className="project-browser-toggle" open={!tab}><summary>项目文件与成果</summary>{projectBrowser}</details>}
    {tab ? <>
      <div className="workspace-toolbar"><span title={tab.source === 'web' ? '用户浏览；Agent 能力由下方当前对话权限决定' : undefined}>{tab.source === 'web' ? '网页' : tab.source === 'proposal' ? tab.status ?? '未保存提案' : `${tab.source === 'file' ? '用户材料' : tab.source === 'diff' ? '历史差异' : tab.source === 'evidence' ? '来源证据' : '已保存成果'} · ${tab.sha256.slice(0, 8)}`}</span>
        {['html', 'markdown'].includes(tab.kind) && <button className="text-button" onClick={() => setRaw(!raw)}>{raw ? '查看渲染' : '查看源码'}</button>}
        {['html', 'web'].includes(tab.kind) && <button className="text-button" disabled={tab.paused} onClick={() => mutate({ pauseId: tab.id })}>{tab.paused ? '已停止，刷新恢复' : tab.kind === 'web' ? '停止网页' : '停止 HTML 运行'}</button>}
        {tab.kind === 'web' && <button className="text-button" aria-label="将页面内容交给 Agent" disabled={!canSendPage || !!tab.paused || blocked} onClick={() => sendPage(tab.id)}>发送页面摘录</button>}
        {tab.kind !== 'diff' && tab.source !== 'evidence' && <button className="icon-button" aria-label="刷新当前文档" onClick={() => void run(async () => setState(await bridge.workspaceRefresh(tab.id)))}><RefreshCw size={14} /></button>}
        <button className="icon-button" aria-label="标签左移" onClick={() => mutate({ moveId: tab.id, direction: -1 })}><ArrowLeft size={14} /></button>
        <button className="icon-button" aria-label="标签右移" onClick={() => mutate({ moveId: tab.id, direction: 1 })}><ArrowRight size={14} /></button></div>
      {tab.kind === 'html' && !raw && <p className="workspace-note">离线隔离渲染；外网、相对资源、弹窗与表单提交不开放。{bridge.preview && '预览关闭脚本。'}</p>}
      {tab.evidence && <div className="workspace-note evidence-meta" aria-label="来源证据版本与范围"><strong>{tab.evidence.name}</strong>
        <span> {tab.evidence.offset}–{tab.evidence.end} 原文 UTF-16 · {tab.evidence.observedAt} · 版本 {tab.evidence.versionHash.slice(0, 12)}</span>
        <span>{tab.evidence.coverage}</span><span>只读历史摘录，显示统一LF并隐藏BOM；范围与哈希仍对应原文。不是完整来源、当前页面或事实正确性保证。关闭标签移除查看副本。</span>
        {tab.evidence.url && <><span className="workspace-url">{tab.evidence.url}</span><button className="text-button" onClick={() => void run(async () => setState(await bridge.workspaceWebOpen(tab.evidence!.url!)))}>打开当前网页（重新联网）</button></>}
      </div>}
      {tab.kind === 'web' && <div className="workspace-note"><span className="workspace-url" title={tab.url}>{tab.url}</span>
        <label>Agent 权限 <select aria-label="当前网页 Agent 权限" disabled={!conversationId || !!tab.paused || blocked} value={tab.agentGrants?.find(g => g.conversationId === conversationId)?.mode ?? 'deny'} onChange={e => grantPage(tab.id, e.target.value as 'deny' | 'read' | 'ask' | 'allow')}>
          <option value="deny">未授权</option><option value="read">读取与同站导航</option><option value="ask">交互逐次确认</option><option value="allow">可信交互免确认</option>
        </select></label>
        <span> · 本次对话／此 Tab／此站点，重启失效。</span>{!canSendPage && '选择对话并完成当前决定后可发送摘录。'}</div>}
      <div className="workspace-body" ref={box}>
        {raw || tab.kind === 'code' || tab.kind === 'diff' ? <DocumentBoundary key={`${tab.id}:${tab.sha256}`} content={tab.content ?? ''}><Suspense fallback={<p className="workspace-note">正在加载只读编辑器…</p>}><CodeViewer content={tab.content ?? ''} name={tab.name} theme={theme} before={tab.kind === 'diff' ? tab.before : undefined} onSelection={['markdown', 'code'].includes(tab.kind) && ['file', 'artifact'].includes(tab.source) ? setRange : undefined} /></Suspense></DocumentBoundary>
          : tab.kind === 'markdown' ? <div className="document-markdown" onMouseUp={event => {
            if (!['file', 'artifact'].includes(tab.source)) return;
            const selection = window.getSelection(), selected = selection?.toString(), domRange = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
            if (!selected || !domRange || !event.currentTarget.contains(domRange.startContainer) || !event.currentTarget.contains(domRange.endContainer)) { setRange(undefined); return; }
            const content = tab.content ?? '', first = content.indexOf(selected);
            if (first < 0 || content.indexOf(selected, first + 1) >= 0) { setRange(undefined); setSelectionHint('跨格式或重复文本，请切换源码精确选区。'); return; }
            setSelectionHint(''); setRange({ start: first, end: first + selected.length });
          }}><Markdown sources={tab.sources} openSource={sourceId => void run(async () => setState(await bridge.openArtifactEvidence({ tabId: tab.id, expectedHash: tab.sha256, sourceId })))}>{tab.content ?? ''}</Markdown>
            {tab.citationStatus === 'legacy' && <p className="workspace-note">旧版成果没有保存时来源清单；请使用“查看来源任务”核对，不自动猜测引用。</p>}
            {tab.citationStatus === 'unavailable' && <p className="workspace-note">成果来源版本不可用；引用未激活，正文仍可查看。</p>}
          </div>
          : tab.kind === 'web' ? <p className="workspace-note">{tab.paused ? '网页已暂停；刷新会重新联网加载。' : bridge.preview ? '网页示例，不访问该地址；桌面应用在独立原生会话中浏览。' : '网页在独立原生会话中加载，应用 IPC 不进入网页。'}</p>
          : tab.kind === 'html' ? tab.paused ? <p className="workspace-note">页面已停止，点击刷新重新加载。不会重放 Agent 工具。</p> : bridge.preview ? <iframe title={`HTML 预览：${tab.name}`} sandbox="" srcDoc={'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; form-action \'none\'">' + tab.content} /> : <p className="workspace-note">隔离页面加载中；应用 IPC 不进入该页面。</p>
          : <div className="unsupported-document"><h3>暂不支持此格式</h3><p>{tab.name} 可以在系统默认查看器打开；不会解析或自动发送给模型。</p></div>}
      </div>
      {['markdown', 'code'].includes(tab.kind) && ['file', 'artifact'].includes(tab.source) && <div className="selection-toolbar" aria-label="文档选区修改"><span>{selectionHint || (range ? `选区 ${range.start}–${range.end} · ${range.end - range.start} 字符` : '选择文字或代码，再引用到输入区')}<small>发送后才入模 · 不扩大写权限</small></span>
        <button className="secondary small-button" disabled={!range || range.end - range.start > 12000 || !canSelect || blocked} onClick={() => { if (range) void run(async () => { await selectText(tab.id, tab.sha256, range); setRange(undefined); setSelectionHint('已引用选区；在下方填写修改要求后发送。'); }); }}>让 Agent 修改</button></div>}
      {tab.kind === 'diff' && <p className="workspace-note">{tab.beforeHash?.slice(0, 8)} → {tab.sha256.slice(0, 8)} · {tab.status}。只读文本差异统一显示LF，隐藏文件头BOM；不自动入模。标签是独立查看快照，备份清理不删除它，关闭可移除。</p>}
      <footer className="workspace-footer">{tab.taskId && <button className="text-button" onClick={() => sourceTask(tab.taskId!)}>查看来源任务</button>}
        {['file', 'artifact'].includes(tab.source) && tab.kind !== 'unsupported' && <button className="text-button" disabled={!canSendPage || blocked} onClick={() => attachMaterial(tab.id)}>引用到当前对话</button>}
        {!['web', 'diff'].includes(tab.kind) && tab.source !== 'evidence' && <button className="secondary small-button" disabled={tab.source === 'proposal'} onClick={() => void run(async () => {
          if (bridge.preview) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([tab.content ?? ''])); a.download = tab.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
          else await bridge.workspaceSystemOpen(tab.id);
        })}>{bridge.preview ? '下载示例文件' : '用系统默认查看器打开'}</button>}</footer>
    </> : <div className="unsupported-document"><h3>打开一份材料</h3><p>HTML、Markdown 和代码在这里查看，其他文档交给系统查看器。</p></div>}
    {bridge.preview && <div className="workspace-preview-actions">{(['html', 'code', 'unsupported'] as const).map(kind => <button className="text-button" key={kind} onClick={() => void previewWorkspace.demo(kind).then(setState)}>{({ html: '体验 HTML', code: '体验代码', unsupported: '其他格式提示' })[kind]}</button>)}</div>}
  </aside>;
}
