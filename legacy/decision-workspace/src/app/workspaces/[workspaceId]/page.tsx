import { notFound } from 'next/navigation';
import { WorkbenchShell } from '@/components/workspaces/workbench-shell';
import { getWorkspace, listRunsForWorkspace, listWorkspaces } from '@/lib/workspace-store';

export default async function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const workspace = getWorkspace(workspaceId);

  if (!workspace) {
    notFound();
  }

  const runs = listRunsForWorkspace(workspaceId);
  const workspaces = listWorkspaces();

  return <WorkbenchShell workspace={workspace} initialRuns={runs} workspaces={workspaces} />;
}
