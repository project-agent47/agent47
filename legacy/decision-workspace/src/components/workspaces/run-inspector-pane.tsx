'use client';

import Link from 'next/link';
import type { WorkspaceRunRecord } from '@/lib/workspace-store';

export interface DetailItem {
  id: string;
  title: string;
  body: string;
}

interface RunInspectorPaneProps {
  workspaceId: string;
  selectedRun: WorkspaceRunRecord | null;
  activeDetail: DetailItem | null;
  detailItems: DetailItem[];
  onSelectDetail: (item: DetailItem) => void;
  isApproving: boolean;
  onApproveExecution: () => void;
}

export function RunInspectorPane({
  workspaceId,
  selectedRun,
  activeDetail,
  detailItems,
  onSelectDetail,
  isApproving,
  onApproveExecution,
}: RunInspectorPaneProps) {
  const citations =
    selectedRun && selectedRun.resultPackage.citations.length > 0
      ? selectedRun.resultPackage.citations
      : selectedRun?.citations ?? [];

  return (
    <aside
      data-testid="workbench-inspector"
      data-scroll-pane="inspector"
      className="flex h-screen min-h-0 flex-col overflow-hidden border-l px-4 py-5"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'var(--surface-bg)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.3em]" style={{ color: 'var(--text-muted)' }}>
            Inspector
          </p>
          <h2 className="mt-3 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Execution and details
          </h2>
        </div>
        {selectedRun ? (
          <Link
            href={`/workspaces/${workspaceId}/runs/${selectedRun.id}`}
            className="text-sm transition"
            style={{ color: 'var(--text-secondary)' }}
          >
            Open full
          </Link>
        ) : null}
      </div>

      {selectedRun ? (
        <div className="mt-5 flex-1 space-y-4 overflow-y-auto pr-1">
          <section
            className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-3"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'var(--surface-muted)',
            }}
          >
            <div>
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
                Mode
              </p>
              <p className="mt-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {selectedRun.execution.mode === 'provider' ? 'Live provider' : 'Fallback recipe'}
              </p>
            </div>
            <div>
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
                Provider
              </p>
              <p className="mt-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {selectedRun.execution.provider}
              </p>
            </div>
            <div>
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
                Model
              </p>
              <p className="mt-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {selectedRun.execution.model}
              </p>
            </div>
          </section>

          <section
            className="rounded-2xl border p-4"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'var(--surface-bg)',
            }}
          >
            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--text-muted)' }}>
              Summary
            </p>
            <h3 className="mt-3 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {selectedRun.title}
            </h3>
            <p className="mt-3 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
              {selectedRun.resultPackage.summary}
            </p>
          </section>

          <section
            className="rounded-2xl border p-4"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'var(--surface-bg)',
            }}
          >
            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--text-muted)' }}>
              Research dossier
            </p>
            <p className="mt-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {selectedRun.dossier?.goal ?? 'The run will capture a dossier after research begins.'}
            </p>
            {selectedRun.dossier ? (
              <>
                <ul className="mt-3 space-y-2">
                  {selectedRun.dossier.findings.slice(0, 2).map((finding) => (
                    <li key={finding} className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                      {finding}
                    </li>
                  ))}
                </ul>
                {selectedRun.dossier.proposedExecutionPlan.length > 0 ? (
                  <div className="mt-3 rounded-2xl p-3" style={{ background: 'var(--surface-muted)' }}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
                      Proposed execution
                    </p>
                    <p className="mt-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                      {selectedRun.dossier.proposedExecutionPlan[0]}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Research findings, notes, and risks will appear here.
              </p>
            )}
          </section>

          <section
            className="rounded-2xl border p-4"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'var(--surface-bg)',
            }}
          >
            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--text-muted)' }}>
              Approval state
            </p>
            <p className="mt-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {selectedRun.approval?.status === 'pending'
                ? 'Awaiting approval'
                : selectedRun.approval?.status === 'approved'
                  ? 'Approved for execution'
                  : selectedRun.approval?.status === 'rejected'
                    ? 'Needs revision'
                    : 'No approval state yet'}
            </p>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              {selectedRun.approval?.summary ?? 'The workbench will pause here once research is ready for review.'}
            </p>
            {selectedRun.approval?.status === 'pending' ? (
              <button
                type="button"
                onClick={onApproveExecution}
                disabled={isApproving}
                className="mt-4 inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: 'var(--border-subtle)',
                  background: 'var(--surface-muted)',
                  color: 'var(--text-primary)',
                }}
              >
                {isApproving ? 'Approving execution…' : 'Approve execution'}
              </button>
            ) : null}
          </section>

          <section
            className="rounded-2xl border p-4"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'var(--surface-bg)',
            }}
          >
            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--text-muted)' }}>
              Artifacts
            </p>
            {selectedRun.artifactBundle?.generatedFileIds.length ? (
              <ul className="mt-3 space-y-2">
                {selectedRun.artifactBundle.generatedFileIds.map((artifactId) => (
                  <li key={artifactId} className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {artifactId}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Files and generated outputs will appear after execution finishes.
              </p>
            )}
          </section>

          <section
            className="rounded-2xl border p-4"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'var(--surface-bg)',
            }}
          >
            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--text-muted)' }}>
              Result package
            </p>
            <p className="mt-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {selectedRun.resultPackage.recommendation}
            </p>
            {selectedRun.resultPackage.nextActions.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {selectedRun.resultPackage.nextActions.map((action) => (
                  <li key={action} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {action}
                  </li>
                ))}
              </ul>
            ) : null}
            {selectedRun.resultPackage.attachments.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {selectedRun.resultPackage.attachments.map((attachment) => (
                  <li key={attachment.id} className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {attachment.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <div className="flex flex-wrap gap-2">
            {detailItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectDetail(item)}
                className="rounded-full border px-3 py-2 text-sm transition"
                style={{
                  borderColor: 'var(--border-subtle)',
                  background: activeDetail?.id === item.id ? 'var(--surface-muted)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
              >
                {item.title}
              </button>
            ))}
          </div>

          {citations.length > 0 ? (
            <section
              className="rounded-2xl border p-4"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'var(--surface-bg)',
              }}
            >
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--text-muted)' }}>
                Sources
              </p>
              <ul className="mt-3 space-y-2">
                {citations.map((citation, index) => (
                  <li key={`${citation.title}-${index}`} className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {citation.title}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}> · {citation.source}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section
            className="rounded-2xl border p-4"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'var(--surface-muted)',
            }}
          >
            {activeDetail ? (
              <>
                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--text-muted)' }}>
                  {activeDetail.title}
                </p>
                <p className="mt-3 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                  {activeDetail.body}
                </p>
              </>
            ) : (
              <p className="text-sm leading-7" style={{ color: 'var(--text-muted)' }}>
                Select a detail to inspect it here.
              </p>
            )}
          </section>
        </div>
      ) : (
        <div
          className="mt-5 rounded-2xl border border-dashed p-4 text-sm"
          style={{
            borderColor: 'var(--border-subtle)',
            background: 'var(--surface-muted)',
            color: 'var(--text-muted)',
          }}
        >
          Summary, artifacts, and citations will appear here.
        </div>
      )}
    </aside>
  );
}
