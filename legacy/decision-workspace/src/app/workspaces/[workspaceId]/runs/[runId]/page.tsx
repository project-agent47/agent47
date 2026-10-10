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
    <main
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(148, 163, 184, 0.18), transparent 24%), var(--app-bg)',
      }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="panel-strong p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="eyebrow">Run detail</div>
              <h1 className="mt-3 display-font text-3xl sm:text-4xl" style={{ color: 'var(--text-primary)' }}>
                {run.title}
              </h1>
              <p className="mt-3 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                {run.recipe}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className="rounded-full border px-3 py-1.5 text-xs"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    background: 'var(--surface-muted)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {run.execution.provider}
                </span>
                <span
                  className="rounded-full border px-3 py-1.5 text-xs"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    background: 'var(--surface-muted)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {run.execution.model}
                </span>
                <span
                  className="rounded-full border px-3 py-1.5 text-xs"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    background: 'var(--surface-muted)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {run.execution.mode === 'provider' ? 'live provider' : 'fallback recipe'}
                </span>
                <span
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    background: 'var(--surface-bg)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {run.phase ?? 'intake'}
                </span>
              </div>
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
          <div>
            <div className="space-y-6">
              <ResultPackageView packageData={run.resultPackage} />
              <CheckpointCard checkpoints={run.activities.map((activity) => `${activity.title} — ${activity.detail}`)} />
              <section className="panel p-6">
                <div className="eyebrow">Research dossier</div>
                <h2 className="mt-3 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {run.dossier?.goal ?? 'The run did not record a dossier goal.'}
                </h2>
                {run.dossier ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
                        Findings
                      </p>
                      <ul className="mt-2 space-y-2">
                        {run.dossier.findings.map((finding) => (
                          <li key={finding} className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                            {finding}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
                        Proposed execution
                      </p>
                      <ul className="mt-2 space-y-2">
                        {run.dossier.proposedExecutionPlan.map((step) => (
                          <li key={step} className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                            {step}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                    This run predates the research dossier surface.
                  </p>
                )}
              </section>
            </div>
          </div>
          <div className="space-y-6">
            <SourceList
              sources={
                run.resultPackage.citations.length > 0
                  ? run.resultPackage.citations.map((citation) => `${citation.title} · ${citation.source}`)
                  : run.sources
              }
            />
            <section className="panel p-6">
              <div className="eyebrow">Execution</div>
              <h2 className="mt-3 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                Agent run state
              </h2>
              <p className="mt-3 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                This run was completed through {run.execution.provider} using {run.execution.model}. The activity stream on the left reflects the execution path that produced the current result package.
              </p>
            </section>
            <section className="panel p-6">
              <div className="eyebrow">Approval</div>
              <h2 className="mt-3 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                {run.approval?.status === 'pending'
                  ? 'Awaiting approval'
                  : run.approval?.status === 'approved'
                    ? 'Approved'
                    : run.approval?.status === 'rejected'
                      ? 'Needs revision'
                      : 'No approval state'}
              </h2>
              <p className="mt-3 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                {run.approval?.summary ?? 'This run does not include a recorded approval summary.'}
              </p>
            </section>
            <section className="panel p-6">
              <div className="eyebrow">Artifacts</div>
              <h2 className="mt-3 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                Generated outputs
              </h2>
              {run.artifactBundle?.generatedFileIds.length ? (
                <ul className="mt-3 space-y-2">
                  {run.artifactBundle.generatedFileIds.map((artifactId) => (
                    <li key={artifactId} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {artifactId}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                  No generated files were recorded for this run.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
