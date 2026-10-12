import { useEffect, useState } from 'react';
import type { ProjectView, ResourceSource, ResourceView, WorkspaceState, ProjectFileList } from '../shared/contracts';
import { bridge } from './bridge';

export function ResourceBrowser({ project, version, busy = false, run, open, sourceTask, pick }: {
  project?: ProjectView; version?: string; busy?: boolean;
  run: (op: () => Promise<unknown>) => Promise<void>; open: (s: WorkspaceState) => void;
  sourceTask?: (id: string) => void; pick?: (s: ResourceSource) => Promise<void>;
}) {
  const [rows, setRows] = useState<ResourceView[]>([]), [path, setPath] = useState(''), [files, setFiles] = useState<ProjectFileList>();
  const [mode, setMode] = useState<'all' | 'files' | 'artifacts' | 'pins'>(project && !pick ? 'files' : 'all'), [query, setQuery] = useState(''), [error, setError] = useState(''), [tick, setTick] = useState(0);
  useEffect(() => { setPath(''); setRows([]); }, [project?.id]);
  useEffect(() => {
    let alive = true; setError(''); setFiles(undefined);
    const operation = mode === 'files' && project ? bridge.projectFiles({ id: project.id, path }).then(r => { if (alive) setFiles(r); })
      : bridge.listResources(project?.id).then(r => { if (alive) setRows(r); });
    void operation.catch(e => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [project?.id, project?.revision, version, mode, path, tick]);
  const pin = async (source?: ResourceSource) => {
    if (!project) return;
    const ticket = source ? undefined : await bridge.prepareMaterial();
    if (!source && !ticket) return;
    const context = await bridge.projectContext(project.id);
    await bridge.pinResource({ projectId: project.id, expectedRevision: context.revision, source, ticket: ticket?.ticket }); setTick(t => t + 1);
  };
  const changePin = async (pinId: string, remove: boolean) => {
    const context = await bridge.projectContext(project!.id);
    await bridge.updateProjectPin({ projectId: project!.id, expectedRevision: context.revision, pinId, remove }); setTick(t => t + 1);
  };
  const use = (source: ResourceSource) => void run(async () => { if (pick) await pick(source); else open(await bridge.openResource(source)); });
  const shown = rows.filter(r => (mode !== 'artifacts' || r.kind === 'artifact') && (mode !== 'pins' || r.pins.length) && r.name.toLowerCase().includes(query.toLowerCase()));
  return <section className={pick ? 'resource-browser resource-picker' : 'resource-browser'} aria-label={project ? '项目文件与成果' : '资源库列表'}>
    <div className="project-browser-heading"><strong>{pick ? '@ 选择资源' : project ? '项目资源' : '资源'}</strong>
      {(['all', ...(project ? ['files' as const] : []), 'artifacts', 'pins'] as const).map(m => <button key={m} className={mode === m ? 'text-button selected' : 'text-button'} onClick={() => setMode(m)}>{({ all: '全部', files: '目录文件', artifacts: '成果', pins: '固定材料' })[m]}</button>)}
      <button className="text-button" onClick={() => setTick(t => t + 1)}>刷新列表</button>
    </div>
    <p className="context-note">{pick ? '选择只加入待发送引用，不自动发送、不授权父目录。' : '同一资源入口；查看不入模，固定版本供新会话默认选择。'}</p>
    <label className="resource-search">查找<input aria-label="搜索资源" value={query} onChange={e => setQuery(e.target.value)} /></label>
    {project && !pick && <button className="text-button" disabled={busy || project.archived} onClick={() => void run(() => pin())}>固定文件到项目</button>}
    {error && <p role="status">{error}</p>}
    {mode === 'files' && project ? !project.rootEnabled ? <p>请在项目设置授权目录；固定材料与成果仍可查看。</p> : <>
      <div className="project-browser-path"><button className="text-button" disabled={!path} onClick={() => setPath(path.split('/').slice(0, -1).join('/'))}>上一级</button><span>{path || '项目目录'}</span></div>
      {files?.entries.filter(f => f.name.toLowerCase().includes(query.toLowerCase())).map(f => {
        const next = [path, f.name].filter(Boolean).join('/'), source: ResourceSource = { kind: 'projectFile', projectId: project.id, path: next };
        return <div className="resource-row" key={f.name}><button className="resource-open" disabled={busy} onClick={() => f.directory ? setPath(next) : use(source)}>{f.directory ? '目录' : '文件'}<span>{f.name}</span></button>
          {!f.directory && !pick && <button className="text-button" disabled={busy || project.archived} onClick={() => void run(() => pin(source))}>固定</button>}</div>;
      })}
      {files?.nextOffset !== undefined && <button className="text-button" onClick={() => void run(async () => { const next = await bridge.projectFiles({ id: project.id, path, offset: files.nextOffset }); setFiles({ ...next, entries: [...files.entries, ...next.entries] }); })}>加载更多</button>}
      {files && !files.entries.length && <p>此目录没有可显示的文件。</p>}
    </> : <>
      {shown.map(r => {
        const pinned = r.pins.find(p => p.projectId === project?.id);
        return <div className={r.kind === 'artifact' ? 'resource-row artifact-card' : 'resource-row'} key={`${r.key}:${r.sha256}`}>
          <button className="resource-open" disabled={busy} onClick={() => use(r.source)}><span>{r.name}</span><small>{r.kind === 'artifact' ? '成果' : '材料'} · {r.sha256.slice(0, 8)} · {r.bytes} B{r.pins.length ? ' · 已固定' : ''}{r.projectNames?.length ? ` · ${r.projectNames.join(' / ')}` : ''}</small>{['projectFile', 'taskFile'].includes(r.source.kind) && <small>工作文件：查看当前版，引用须匹配记录版；历史差异在来源轮次。</small>}</button>
          {!pick && r.taskId && sourceTask && <button className="text-button" onClick={() => sourceTask(r.taskId!)}>来源轮次</button>}
          {!pick && project && !project.archived && <button className="text-button" disabled={busy} onClick={() => void run(() => pinned ? changePin(pinned.pinId, true) : pin(r.source))}>{pinned ? '取消固定' : '固定'}</button>}
          {!pick && pinned && r.kind === 'material' && <button className="text-button" disabled={busy || project?.archived} onClick={() => void run(() => changePin(pinned.pinId, false))}>更新版本</button>}
        </div>;
      })}
      {!shown.length && <p>没有匹配资源。目录文件按需浏览，固定文件或保存成果后出现在这里。</p>}
    </>}
  </section>;
}
