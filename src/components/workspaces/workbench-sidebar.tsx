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
      className="flex min-h-screen flex-col border-r border-white/10 bg-black/20 px-4 py-5"
    >
      <div>
        <p className="text-[0.64rem] font-semibold uppercase tracking-[0.3em] text-slate-500">Workspace</p>
        <h1 className="mt-3 text-base font-semibold text-white">{workspace.name}</h1>
        <p className="mt-1 text-sm text-slate-500">/{workspace.slug}</p>
      </div>

      <section className="mt-8">
        <p className="text-[0.64rem] font-semibold uppercase tracking-[0.3em] text-slate-500">Spaces</p>
        <div className="mt-3 space-y-2">
          {workspaces.map((item) => (
            <Link
              key={item.id}
              href={`/workspaces/${item.id}`}
              className={`block rounded-xl border px-3 py-3 text-sm transition ${
                item.id === workspace.id
                  ? 'border-cyan-400/30 bg-cyan-400/10 text-white'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10'
              }`}
            >
              <span className="block font-medium">{item.name}</span>
              <span className="mt-1 block text-xs text-slate-500">/{item.slug}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 flex-1">
        <p className="text-[0.64rem] font-semibold uppercase tracking-[0.3em] text-slate-500">Runs</p>
        <div className="mt-3 space-y-2">
          {runs.length > 0 ? (
            runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => onSelectRun(run.id)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                  selectedRunId === run.id
                    ? 'border-white/15 bg-white/10 text-white'
                    : 'border-transparent bg-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{run.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{run.recipe}</p>
                  </div>
                  <RunStatusBadge status={run.status} />
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-3 text-sm text-slate-500">
              No runs yet.
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}
