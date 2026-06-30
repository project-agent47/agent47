'use client';

import { type FormEvent, useMemo, useState } from 'react';
import type { WorkspaceRecord, WorkspaceRunRecord } from '@/lib/workspace-store';
import { RunActivityPane } from './run-activity-pane';
import { type DetailItem, RunInspectorPane } from './run-inspector-pane';
import { WorkbenchComposer } from './workbench-composer';
import { WorkbenchSidebar } from './workbench-sidebar';

interface WorkbenchShellProps {
  workspace: WorkspaceRecord;
  initialRuns: WorkspaceRunRecord[];
  workspaces: WorkspaceRecord[];
}

const starterPrompts = ['Plan a launch brief', 'Review a hiring decision', 'Map a learning path'];

export function WorkbenchShell({ workspace, initialRuns, workspaces }: WorkbenchShellProps) {
  const [runs, setRuns] = useState(initialRuns);
  const [selectedRunId, setSelectedRunId] = useState(initialRuns[0]?.id ?? null);
  const [draft, setDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('No active run yet. Start with a single request.');
  const [activeDetail, setActiveDetail] = useState<DetailItem | null>(null);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  );

  const detailItems = useMemo<DetailItem[]>(() => {
    if (!selectedRun) {
      return [];
    }

    const items: DetailItem[] = [
      { id: 'summary', title: 'Summary', body: selectedRun.resultPackage.summary },
      { id: 'recommendation', title: 'Recommendation', body: selectedRun.resultPackage.recommendation },
    ];

    selectedRun.resultPackage.nextActions.forEach((action, index) => {
      items.push({ id: `action-${index}`, title: 'Next action', body: action });
    });

    selectedRun.citations.forEach((citation, index) => {
      items.push({
        id: `citation-${index}`,
        title: citation.title || 'Citation',
        body: citation.url ? `${citation.source} · ${citation.url}` : citation.source,
      });
    });

    return items;
  }, [selectedRun]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.trim()) {
      setMessage('Add a concrete request so the workspace can create a draft.');
      return;
    }

    setIsSubmitting(true);
    setMessage('Creating a fresh run…');

    const response = await fetch(`/api/workspaces/${workspace.id}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: draft.trim(),
        recipe: 'learning-path',
        goal: draft.trim(),
        experience: 'beginner',
        constraints: 'Keep it concise and directly actionable.',
      }),
    });

    if (!response.ok) {
      setMessage('The workspace could not create that run.');
      setIsSubmitting(false);
      return;
    }

    const data = (await response.json()) as { run: WorkspaceRunRecord };
    setRuns((current) => [data.run, ...current]);
    setSelectedRunId(data.run.id);
    setActiveDetail(null);
    setDraft('');
    setMessage('Run created. Review the brief and the next steps on the right.');
    setIsSubmitting(false);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_24%),linear-gradient(135deg,_#071018_0%,_#0c1723_46%,_#060b11_100%)] text-slate-100">
      <div className="grid min-h-screen xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        <WorkbenchSidebar
          workspace={workspace}
          workspaces={workspaces}
          runs={runs}
          selectedRunId={selectedRunId}
          onSelectRun={(runId) => {
            setSelectedRunId(runId);
            setActiveDetail(null);
          }}
        />

        <RunActivityPane selectedRun={selectedRun} message={message}>
          <WorkbenchComposer
            draft={draft}
            isSubmitting={isSubmitting}
            starterPrompts={starterPrompts}
            message={message}
            onDraftChange={setDraft}
            onSubmit={handleSubmit}
            onUsePrompt={setDraft}
          />
        </RunActivityPane>

        <RunInspectorPane
          workspaceId={workspace.id}
          selectedRun={selectedRun}
          activeDetail={activeDetail}
          detailItems={detailItems}
          onSelectDetail={setActiveDetail}
        />
      </div>
    </main>
  );
}
