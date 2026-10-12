import { useState } from 'react';
import { bridge } from './bridge';
import type { FolderGrant, ProjectView } from '../shared/contracts';
import { ProjectContextPanel } from './ProjectContextPanel';

export function ProjectControls({ project, busy, run }: { project: ProjectView; busy: boolean; run: (op: () => Promise<unknown>) => Promise<void> }) {
  const [name, setName] = useState(project.name), [folder, setFolder] = useState<FolderGrant>();
  return <div className="project-controls" aria-label="项目设置">
    <strong>{project.name}{project.archived ? ' · 已归档' : ''}</strong>
    <span className="project-root" title={project.root}>{project.rootEnabled ? project.root : '无目录授权 · 可直接讨论或引用材料'}</span>
    <ProjectContextPanel project={project} busy={busy} run={run} />
    <details><summary>项目设置</summary><div className="project-settings">
      <label>项目名称<input aria-label="项目名称" value={name} maxLength={96} onChange={e => setName(e.target.value)} /></label>
      <button className="secondary small-button" disabled={busy || !name.trim()} onClick={() => void run(() => bridge.updateProject({ id: project.id, expectedRevision: project.revision, name }))}>保存名称</button>
      <button className="text-button" disabled={busy} onClick={() => void run(() => bridge.updateProject({ id: project.id, expectedRevision: project.revision, pinned: !project.pinned }))}>{project.pinned ? '取消置顶' : '置顶项目'}</button>
      <button className="text-button" disabled={busy} onClick={() => void run(() => bridge.updateProject({ id: project.id, expectedRevision: project.revision, archived: !project.archived }))}>{project.archived ? '恢复项目' : '归档项目（保留数据）'}</button>
      <p>归档不删除文件或聊天，不停止已运行的任务。</p>
      <button className="secondary small-button" disabled={busy || project.archived} onClick={() => void run(async () => setFolder(await bridge.chooseFolder()))}>{project.rootEnabled ? '重新选择目录' : '选择项目目录'}</button>
      {folder && <div className="project-folder-confirm"><p>{folder.path}</p><p>授权本项目新会话在此目录内读取和修改，写入{folder.fileMode === 'ask' ? '逐次确认' : '自动快照、免逐文件确认'}。Shell／Node和网页可信权限不继承；不是OS沙箱。旧会话的目录不变。</p>
        <button className="primary small-button" disabled={busy} onClick={() => void run(async () => { await bridge.bindProjectFolder({ id: project.id, expectedRevision: project.revision, folderGrant: folder.id }); setFolder(undefined); })}>确认项目目录授权</button>
        <button className="text-button" onClick={() => setFolder(undefined)}>取消</button></div>}
      {project.rootEnabled && <button className="text-button" disabled={busy} onClick={() => void run(() => bridge.bindProjectFolder({ id: project.id, expectedRevision: project.revision, revoke: true }))}>撤销项目目录授权</button>}
    </div></details>
  </div>;
}
