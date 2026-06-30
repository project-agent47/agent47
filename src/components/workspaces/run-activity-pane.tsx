'use client';

import type { ReactNode } from 'react';
import { RunStatusBadge } from '@/components/runs/run-status-badge';
import type { WorkspaceRunRecord } from '@/lib/workspace-store';

interface RunActivityPaneProps {
  selectedRun: WorkspaceRunRecord | null;
  message: string;
  children: ReactNode;
}

export function RunActivityPane({ selectedRun, message, children }: RunActivityPaneProps) {
  return (
    <section data-testid="workbench-activity" className="flex min-h-screen flex-col">
      <div className="border-b border-white/10 px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.3em] text-slate-500">Active run</p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-white">
              {selectedRun?.title ?? 'No active run yet'}
            </h2>
            <p className="mt-2 text-sm text-slate-400">{message}</p>
          </div>
          {selectedRun ? <RunStatusBadge status={selectedRun.status} /> : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        {selectedRun ? (
          <div className="space-y-3">
            {selectedRun.checkpoints.map((checkpoint, index) => (
              <article key={`${selectedRun.id}-${checkpoint}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-semibold text-cyan-100">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-100">{checkpoint}</p>
                    <p className="mt-1 text-xs text-slate-500">Step {index + 1}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-slate-500">
            Start with one request. The run stream will appear here.
          </div>
        )}
      </div>

      {children}
    </section>
  );
}
