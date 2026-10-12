import { useEffect, useState } from 'react';
import type { ProjectFileList, ProjectView, TaskView, WorkspaceState } from '../shared/contracts';
import { bridge } from './bridge';

export function ProjectBrowser({ project, tasks, run, open, sourceTask }: { project: ProjectView; tasks: TaskView[]; run: (op: () => Promise<unknown>) => Promise<void>; open: (state: WorkspaceState) => void; sourceTask: (id: string) => void }) {
  const [path, setPath] = useState(''), [files, setFiles] = useState<ProjectFileList>(), [error, setError] = useState(''), [mode, setMode] = useState<'files' | 'artifacts'>('files');
  useEffect(() => {
    let alive = true; setFiles(undefined); setError('');
    if (project.rootEnabled && mode === 'files') void bridge.projectFiles({ id: project.id, path }).then(s => { if (alive) setFiles(s); }).catch(e => { if (alive) setError(String((e as Error).message)); });
    return () => { alive = false; };
  }, [project.id, project.rootRevision, path, mode]);
  return <section className="project-browser" aria-label="项目文件与成果">
    <div className="project-browser-heading"><strong>项目资料</strong><button className={mode === 'files' ? 'text-button selected' : 'text-button'} onClick={() => setMode('files')}>目录文件</button><button className={mode === 'artifacts' ? 'text-button selected' : 'text-button'} onClick={() => setMode('artifacts')}>项目成果</button></div>
    <p className="context-note">打开只查看；引用后按需读取，不自动交给模型。</p>
    {mode === 'files' ? <>
      {!project.rootEnabled ? <p>尚未授权目录；可以在项目设置里选择，或只用材料和对话。</p> : <>
        <div className="project-browser-path"><button className="text-button" disabled={!path} onClick={() => setPath(path.split('/').slice(0, -1).join('/'))}>上一级</button><span title={project.root}>{path || '项目目录'}</span><button className="text-button" onClick={() => void run(async () => setFiles(await bridge.projectFiles({ id: project.id, path })))}>刷新列表</button></div>
        {error && <p role="status">{error}</p>}
        {files?.entries.map(f => <button key={f.name} className="project-file-row" onClick={() => {
          const next = [path, f.name].filter(Boolean).join('/');
          if (f.directory) setPath(next);
          else void run(async () => open(await bridge.openProjectFile({ id: project.id, path: next })));
        }}>{f.directory ? '目录' : '文件'}<span>{f.name}</span></button>)}
        {files && !files.entries.length && <p>此目录没有可显示的文件。</p>}
        {files?.nextOffset !== undefined && <button className="secondary small-button" onClick={() => void run(async () => {
          const page = await bridge.projectFiles({ id: project.id, path, offset: files.nextOffset }); setFiles({ ...page, entries: [...files.entries, ...page.entries] });
        })}>加载更多</button>}
      </>}
    </> : <>
      {tasks.filter(t => t.projectId === project.id).flatMap(t => t.artifacts.map(a => <div className="project-file-row" key={`${t.id}:${a.id}`}><button className="text-button" onClick={() => void run(async () => open(await bridge.workspaceOpen({ kind: 'artifact', taskId: t.id, artifactId: a.id })))}>{a.name}</button><button className="text-button" onClick={() => sourceTask(t.id)}>回到原轮次</button></div>))}
      {!tasks.some(t => t.projectId === project.id && t.artifacts.length) && <p>项目成果会出现在这里；不会自动移动已有文件。</p>}
    </>}
  </section>;
}
