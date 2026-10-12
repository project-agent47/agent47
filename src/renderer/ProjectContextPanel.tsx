import { useEffect, useState } from 'react';
import { bridge } from './bridge';
import type { ProjectContext, ProjectView } from '../shared/contracts';
export function ProjectContextPanel({ project, busy, run }: { project: ProjectView; busy: boolean; run: (op: () => Promise<unknown>) => Promise<void> }) {
  const [context, setContext] = useState<ProjectContext>(), [text, setText] = useState(''), [dirty, setDirty] = useState(false);
  useEffect(() => { let alive = true; void bridge.projectContext(project.id).then(c => { if (alive && !dirty) { setContext(c); setText(c.instructions); } }).catch(() => {}); return () => { alive = false; }; }, [project.id, project.revision, dirty]);
  return <details className="project-context-editor"><summary>项目上下文 · {context?.revision ?? 0}</summary><div className="project-settings">
    <label>项目说明<textarea aria-label="项目说明" value={text} rows={5} maxLength={6000} onChange={e => { setText(e.target.value); setDirty(true); }} /></label>
    <p>{text.length}/6000 字符；只影响下一轮，当前轮固定原版。不是工具授权或事实证据。</p>
    <button className="primary small-button" disabled={busy || !context || project.archived} onClick={() => void run(async () => { const next = await bridge.saveProjectInstructions({ id: project.id, expectedRevision: context!.revision, instructions: text }); setContext(next); setDirty(false); })}>保存项目说明</button>
    {dirty && <button className="text-button" onClick={() => setDirty(false)}>放弃草稿并重载</button>}
    <p>固定材料 {context?.pins.length ?? 0} 份，在统一资源列表管理；发送前可以移除本次引用。</p>
  </div></details>;
}
