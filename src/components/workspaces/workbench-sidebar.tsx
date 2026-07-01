'use client';

import Link from 'next/link';
import { RunStatusBadge } from '@/components/runs/run-status-badge';
import type { WorkspaceRecord, WorkspaceRunRecord } from '@/lib/workspace-store';

interface WorkbenchSidebarProps {
  workspace: WorkspaceRecord;
  workspaces: WorkspaceRecord[];
  runs: WorkspaceRunRecord[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}

export function WorkbenchSidebar({
  workspace,
  workspaces,
  runs,
  selectedRunId,
  onSelectRun,
}: WorkbenchSidebarProps) {
  return (
    <aside
      data-testid="workbench-sidebar"
      data-scroll-pane="sidebar"
      className="flex h-screen min-h-0 flex-col border-r px-4 py-5"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'var(--surface-bg)',
      }}
    >
      <div>
        <p className="text-[0.64rem] font-semibold uppercase tracking-[0.3em]" style={{ color: 'var(--text-muted)' }}>
          Workspace
        </p>
        <h1 className="mt-3 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          {workspace.name}
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          /{workspace.slug}
        </p>
      </div>

      <section className="mt-8">
        <p className="text-[0.64rem] font-semibold uppercase tracking-[0.3em]" style={{ color: 'var(--text-muted)' }}>
          Spaces
        </p>
        <div className="mt-3 space-y-2">
          {workspaces.map((item) => (
            <Link
              key={item.id}
              href={`/workspaces/${item.id}`}
              className="block rounded-xl border px-3 py-3 text-sm transition"
              style={{
                borderColor: item.id === workspace.id ? 'var(--border-strong)' : 'var(--border-subtle)',
                background: item.id === workspace.id ? 'var(--surface-muted)' : 'transparent',
                color: 'var(--text-primary)',
              }}
            >
              <span className="block font-medium">{item.name}</span>
              <span className="mt-1 block text-xs" style={{ color: 'var(--text-muted)' }}>
                /{item.slug}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 flex min-h-0 flex-1 flex-col">
        <p className="text-[0.64rem] font-semibold uppercase tracking-[0.3em]" style={{ color: 'var(--text-muted)' }}>
          Runs
        </p>
        <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
          {runs.length > 0 ? (
            runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => onSelectRun(run.id)}
                className="w-full rounded-xl border px-3 py-3 text-left transition"
                style={{
                  borderColor: selectedRunId === run.id ? 'var(--border-strong)' : 'transparent',
                  background: selectedRunId === run.id ? 'var(--surface-muted)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{run.title}</p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {run.execution.mode === 'provider' ? run.execution.model : 'fallback recipe'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className="rounded-full border px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em]"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          background: 'var(--surface-bg)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {run.phase ?? 'intake'}
                      </span>
                      {run.approval ? (
                        <span
                          className="rounded-full border px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em]"
                          style={{
                            borderColor: 'var(--border-subtle)',
                            background: run.approval.status === 'pending' ? 'var(--surface-muted)' : 'var(--surface-bg)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {run.approval.status === 'pending'
                            ? 'Awaiting approval'
                            : run.approval.status === 'approved'
                              ? 'Approved'
                              : 'Needs revision'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <RunStatusBadge status={run.status} />
                </div>
              </button>
            ))
          ) : (
            <div
              className="rounded-xl border border-dashed p-3 text-sm"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'var(--surface-muted)',
                color: 'var(--text-muted)',
              }}
            >
              No runs yet.
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}
