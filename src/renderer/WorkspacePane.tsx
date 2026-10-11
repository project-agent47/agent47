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
export function WorkspacePane({ state, setState, theme, blocked, run, sourceTask }: { state: WorkspaceState; setState: (s: WorkspaceState) => void; theme: string; blocked: boolean;
  run: (operation: () => Promise<unknown>) => Promise<void>; sourceTask: (id: string) => void }) {
  const tab = state.tabs.find(t => t.id === state.activeId), box = useRef<HTMLDivElement>(null);
  const [raw, setRaw] = useState(false), [draftWidth, setDraftWidth] = useState(state.width);
  useEffect(() => { setRaw(false); }, [tab?.id]);
  useEffect(() => { setDraftWidth(state.width); }, [state.width]);
  useEffect(() => {
    let disposed = false, frame = 0;
    const layout = () => {
      cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
        if (disposed) return;
        const rect = box.current?.getBoundingClientRect();
        const visible = state.visible && tab?.kind === 'html' && !tab.paused && !raw && !blocked && rect && rect.width > 0 && rect.height > 0;
        void bridge.workspaceLayout(visible ? { tabId: tab.id, bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.floor(rect.width), height: Math.floor(rect.height) } } : {}).catch(() => {});
      });
    };
    const observer = new ResizeObserver(layout); if (box.current) observer.observe(box.current);
    layout(); window.addEventListener('resize', layout);
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', layout); void bridge.workspaceLayout({}); };
  }, [state.visible, state.width, tab?.id, tab?.sha256, tab?.kind, tab?.paused, raw, blocked, draftWidth]);
  if (!state.visible) return null;
  const mutate = (input: Parameters<typeof bridge.workspaceUpdate>[0]) => void run(async () => setState(await bridge.workspaceUpdate(input)));
  return <aside className="workspace-pane" aria-label="产物工作区" style={{ width: draftWidth }}>
    <div className="workspace-splitter" role="separator" tabIndex={0} aria-label="调整工作区宽度" aria-orientation="vertical" aria-valuenow={draftWidth} aria-valuemin={280} aria-valuemax={1000}
      onKeyDown={e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); mutate({ width: Math.max(280, Math.min(1000, draftWidth + (e.key === 'ArrowLeft' ? 20 : -20))) }); } }}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setDraftWidth(Math.max(280, Math.min(1000, innerWidth - e.clientX))); }}
      onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); mutate({ width: draftWidth }); }} />
    <header className="workspace-heading"><strong>产物工作区</strong><span>本地查看，不自动交给模型</span>
      <button className="icon-button" aria-label="打开本地文件" onClick={() => void run(async () => setState(await bridge.workspaceImport()))}><FilePlus2 size={16} /></button>
      <button className="icon-button" aria-label="收起工作区" onClick={() => mutate({ visible: false })}><PanelRightClose size={16} /></button></header>
    <div className="workspace-tabs" role="tablist" aria-label="打开的文档">{state.tabs.map(t => <div key={t.id}>
      <button role="tab" aria-selected={tab?.id === t.id} title={t.name} onClick={() => mutate({ activeId: t.id })}>{t.name}</button>
      <button className="icon-button" aria-label={`关闭标签：${t.name}`} onClick={() => mutate({ closeId: t.id })}><X size={12} /></button></div>)}</div>
    {tab ? <>
      <div className="workspace-toolbar"><span>{tab.source === 'proposal' ? tab.status ?? '未保存提案' : `${tab.source === 'file' ? '用户材料' : '已保存成果'} · ${tab.sha256.slice(0, 8)}`}</span>
        {['html', 'markdown'].includes(tab.kind) && <button className="text-button" onClick={() => setRaw(!raw)}>{raw ? '查看渲染' : '查看源码'}</button>}
        {tab.kind === 'html' && <button className="text-button" disabled={tab.paused} onClick={() => mutate({ pauseId: tab.id })}>{tab.paused ? '已停止，刷新恢复' : '停止 HTML 运行'}</button>}
        <button className="icon-button" aria-label="刷新当前文档" onClick={() => void run(async () => setState(await bridge.workspaceRefresh(tab.id)))}><RefreshCw size={14} /></button>
        <button className="icon-button" aria-label="标签左移" onClick={() => mutate({ moveId: tab.id, direction: -1 })}><ArrowLeft size={14} /></button>
        <button className="icon-button" aria-label="标签右移" onClick={() => mutate({ moveId: tab.id, direction: 1 })}><ArrowRight size={14} /></button></div>
      {tab.kind === 'html' && !raw && <p className="workspace-note">离线隔离渲染；外网、相对资源、弹窗与表单提交不开放。{bridge.preview && '预览关闭脚本。'}</p>}
      <div className="workspace-body" ref={box}>
        {raw || tab.kind === 'code' ? <DocumentBoundary key={`${tab.id}:${tab.sha256}`} content={tab.content ?? ''}><Suspense fallback={<p className="workspace-note">正在加载只读编辑器…</p>}><CodeViewer content={tab.content ?? ''} name={tab.name} theme={theme} /></Suspense></DocumentBoundary>
          : tab.kind === 'markdown' ? <div className="document-markdown"><Markdown>{tab.content ?? ''}</Markdown></div>
          : tab.kind === 'html' ? tab.paused ? <p className="workspace-note">页面已停止，点击刷新重新加载。不会重放 Agent 工具。</p> : bridge.preview ? <iframe title={`HTML 预览：${tab.name}`} sandbox="" srcDoc={'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; form-action \'none\'">' + tab.content} /> : <p className="workspace-note">隔离页面加载中；应用 IPC 不进入该页面。</p>
          : <div className="unsupported-document"><h3>暂不支持此格式</h3><p>{tab.name} 可以在系统默认查看器打开；不会解析或自动发送给模型。</p></div>}
      </div>
      <footer className="workspace-footer">{tab.taskId && <button className="text-button" onClick={() => sourceTask(tab.taskId!)}>查看来源任务</button>}
        <button className="secondary small-button" disabled={tab.source === 'proposal'} onClick={() => void run(async () => {
          if (bridge.preview) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([tab.content ?? ''])); a.download = tab.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
          else await bridge.workspaceSystemOpen(tab.id);
        })}>{bridge.preview ? '下载示例文件' : '用系统默认查看器打开'}</button></footer>
    </> : <div className="unsupported-document"><h3>打开一份材料</h3><p>HTML、Markdown 和代码在这里查看，其他文档交给系统查看器。</p></div>}
    {bridge.preview && <div className="workspace-preview-actions">{(['html', 'code', 'unsupported'] as const).map(kind => <button className="text-button" key={kind} onClick={() => void previewWorkspace.demo(kind).then(setState)}>{({ html: '体验 HTML', code: '体验代码', unsupported: '其他格式提示' })[kind]}</button>)}</div>}
  </aside>;
}
