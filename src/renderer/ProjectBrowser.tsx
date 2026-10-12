import type { ProjectView, TaskView, WorkspaceState } from '../shared/contracts';
import { ResourceBrowser } from './ResourceBrowser';
export function ProjectBrowser({ project, tasks, run, open, sourceTask }: { project: ProjectView; tasks: TaskView[]; run: (op: () => Promise<unknown>) => Promise<void>; open: (state: WorkspaceState) => void; sourceTask: (id: string) => void }) {
  return <ResourceBrowser project={project} version={tasks.map(t => `${t.id}:${t.projectId}:${t.artifacts.length}:${JSON.stringify(t.fileChanges)}`).join(',')} run={run} open={open} sourceTask={sourceTask} />;
}
