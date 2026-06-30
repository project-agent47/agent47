import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckpointCard } from '@/components/runs/checkpoint-card';
import { ResultPackageView } from '@/components/runs/result-package-view';
import { RunStatusBadge } from '@/components/runs/run-status-badge';
import { SourceList } from '@/components/runs/source-list';
import { getWorkspace, getWorkspaceRun } from '@/lib/workspace-store';

export default async function RunDetailPage({ params }: { params: Promise<{ workspaceId: string; runId: string }> }) {
  const { workspaceId, runId } = await params;
  const workspace = getWorkspace(workspaceId);
  const run = getWorkspaceRun(workspaceId, runId);

  if (!workspace || !run) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-2 py-6 sm:px-6 lg:px-8">
      <section className="panel-strong p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="eyebrow">Run detail</div>
            <h1 className="mt-3 display-font text-3xl text-white sm:text-4xl">{run.title}</h1>
            <p className="mt-3 text-sm leading-7 text-slate-400">{run.recipe}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <RunStatusBadge status={run.status} />
            <Link href={`/api/workspaces/${workspace.id}/runs/${run.id}/export`} className="btn-secondary">
              Export markdown
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <ResultPackageView packageData={run.resultPackage} />
          <CheckpointCard checkpoints={run.checkpoints} />
        </div>
        <div className="space-y-6">
          <SourceList sources={run.sources} />
          <section className="panel p-6">
            <div className="eyebrow">Next steps</div>
            <h2 className="mt-3 text-xl font-semibold text-white">Resume or hand off</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">The run can be resumed for review, exported as markdown for handoff, or used as a basis for the next decision cycle.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
