'use client';

import type { ReactNode } from 'react';
import { RunStatusBadge } from '@/components/runs/run-status-badge';
import type { WorkspaceRunRecord } from '@/lib/workspace-store';

interface RunActivityPaneProps {
  selectedRun: WorkspaceRunRecord | null;
  message: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  children: ReactNode;
}

const lifecycleSteps = [
  { id: 'research', label: 'Research' },
  { id: 'approval', label: 'Approval' },
  { id: 'execution', label: 'Execution' },
  { id: 'package', label: 'Package' },
] as const;

const phaseOrder = ['intake', 'research', 'approval', 'execution', 'package', 'failed'] as const;

export function RunActivityPane({ selectedRun, message, theme, onToggleTheme, children }: RunActivityPaneProps) {
  const activities = selectedRun?.activities ?? [];
  const selectedPhase = selectedRun?.phase ?? 'intake';
  const selectedPhaseIndex = phaseOrder.indexOf(selectedPhase);
  const reachedPhaseIndex =
    selectedPhase === 'failed'
      ? phaseOrder.indexOf(selectedRun?.approval?.status === 'approved' ? 'execution' : 'approval')
      : selectedPhaseIndex;

  return (
    <section
      data-testid="workbench-activity"
      data-scroll-pane="activity"
      className="flex h-screen min-h-0 flex-col overflow-hidden"
      style={{ background: 'var(--app-bg)' }}
    >
      <div className="border-b px-5 py-5 sm:px-6" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.3em]" style={{ color: 'var(--text-muted)' }}>
              Active run
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em]" style={{ color: 'var(--text-primary)' }}>
              {selectedRun?.title ?? 'No active run yet'}
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {message}
            </p>
            {selectedRun ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span
                  className="rounded-full border px-2.5 py-1 uppercase tracking-[0.18em]"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    background: 'var(--surface-bg)',
                  }}
                >
                  {selectedRun.execution.mode === 'provider' ? 'live model' : 'fallback'}
                </span>
                <span
                  className="rounded-full border px-2.5 py-1"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    background: 'var(--surface-bg)',
                  }}
                >
                  {selectedRun.execution.provider}
                </span>
                <span
                  className="rounded-full border px-2.5 py-1"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    background: 'var(--surface-bg)',
                  }}
                >
                  {selectedRun.execution.model}
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              className="rounded-full border px-4 py-2 text-sm font-medium transition"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'var(--surface-bg)',
                color: 'var(--text-primary)',
              }}
              onClick={onToggleTheme}
            >
              {theme === 'light' ? 'Use dark theme' : 'Use light theme'}
            </button>
            {selectedRun ? <RunStatusBadge status={selectedRun.status} /> : null}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        <section
          className="mb-5 rounded-2xl border p-4"
          style={{
            borderColor: 'var(--border-subtle)',
            background: 'var(--surface-bg)',
          }}
        >
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--text-muted)' }}>
            Lifecycle
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {lifecycleSteps.map((step, index) => {
              const stepIndex = phaseOrder.indexOf(step.id);
              const isActive = selectedPhase === step.id;
              const isComplete = reachedPhaseIndex > stepIndex;

              return (
                <div
                  key={step.id}
                  className="rounded-2xl border px-3 py-3"
                  style={{
                    borderColor: isActive ? 'var(--border-strong)' : 'var(--border-subtle)',
                    background: isActive || isComplete ? 'var(--surface-muted)' : 'transparent',
                  }}
                >
                  <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
                    Step {index + 1}
                  </p>
                  <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {step.label}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {isActive ? 'In focus now' : isComplete ? 'Captured in this run' : 'Waiting'}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {selectedRun ? (
          <div className="space-y-3">
            {activities.map((activity, index) => (
              <article
                key={activity.id}
                className="rounded-2xl border p-4"
                style={{
                  borderColor: 'var(--border-subtle)',
                  background: 'var(--surface-bg)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                    style={{
                      background: activity.status === 'warning' ? '#fef3c7' : 'var(--surface-muted)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {activity.title}
                      </p>
                      <span className="text-[0.68rem] uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
                        {activity.kind}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                      {activity.detail}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div
            className="rounded-2xl border border-dashed p-5 text-sm"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'var(--surface-bg)',
              color: 'var(--text-muted)',
            }}
          >
            Start with one request. The run stream will appear here.
          </div>
        )}
      </div>

      {children}
    </section>
  );
}
