'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
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
  const [message, setMessage] = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<DetailItem | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  );

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  const detailItems = useMemo<DetailItem[]>(() => {
    if (!selectedRun) {
      return [];
    }

    const citations =
      selectedRun.resultPackage.citations.length > 0 ? selectedRun.resultPackage.citations : selectedRun.citations;

    const items: DetailItem[] = [
      { id: 'summary', title: 'Summary', body: selectedRun.resultPackage.summary },
      { id: 'recommendation', title: 'Recommendation', body: selectedRun.resultPackage.recommendation },
    ];

    selectedRun.resultPackage.nextActions.forEach((action, index) => {
      items.push({ id: `action-${index}`, title: `Next action ${index + 1}`, body: action });
    });

    citations.forEach((citation, index) => {
      items.push({
        id: `citation-${index}`,
        title: citation.title || `Source ${index + 1}`,
        body: citation.url ? `${citation.source} · ${citation.url}` : citation.source,
      });
    });

    selectedRun.resultPackage.openQuestions.forEach((question, index) => {
      items.push({
        id: `question-${index}`,
        title: `Open question ${index + 1}`,
        body: question,
      });
    });

    selectedRun.dossier?.findings.forEach((finding, index) => {
      items.push({
        id: `finding-${index}`,
        title: `Finding ${index + 1}`,
        body: finding,
      });
    });

    selectedRun.dossier?.proposedExecutionPlan.forEach((step, index) => {
      items.push({
        id: `plan-${index}`,
        title: `Execution step ${index + 1}`,
        body: step,
      });
    });

    selectedRun.artifactBundle?.executionLog.forEach((entry, index) => {
      items.push({
        id: `artifact-log-${index}`,
        title: `Artifact log ${index + 1}`,
        body: entry,
      });
    });

    return items;
  }, [selectedRun]);

  const resolvedDetail =
    detailItems.find((item) => item.id === activeDetail?.id) ?? detailItems[0] ?? null;

  const resolvedMessage =
    message ??
    (selectedRun
      ? selectedRun.execution.mode === 'provider'
        ? `Completed with ${selectedRun.execution.model} via ${selectedRun.execution.provider}.`
        : 'This run used the local fallback recipe.'
      : 'Start with a single request.');

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
    setActiveDetail({
      id: 'summary',
      title: 'Summary',
      body: data.run.resultPackage.summary,
    });
    setDraft('');
    setMessage(
      data.run.execution.mode === 'provider'
        ? `Run created with ${data.run.execution.model}. Review the evidence and next steps on the right.`
        : 'Run created with the fallback recipe. Review the evidence and next steps on the right.',
    );
    setIsSubmitting(false);
  }

  return (
    <main
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(148, 163, 184, 0.18), transparent 26%), var(--app-bg)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="grid h-screen min-h-screen min-w-0 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        <WorkbenchSidebar
          workspace={workspace}
          workspaces={workspaces}
          runs={runs}
          selectedRunId={selectedRunId}
          onSelectRun={(runId) => {
            setSelectedRunId(runId);
            setActiveDetail(null);
            setMessage(null);
          }}
        />

        <RunActivityPane
          selectedRun={selectedRun}
          message={resolvedMessage}
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
        >
          <WorkbenchComposer
            draft={draft}
            isSubmitting={isSubmitting}
            starterPrompts={starterPrompts}
            message={resolvedMessage}
            onDraftChange={setDraft}
            onSubmit={handleSubmit}
            onUsePrompt={setDraft}
          />
        </RunActivityPane>

        <RunInspectorPane
          workspaceId={workspace.id}
          selectedRun={selectedRun}
          activeDetail={resolvedDetail}
          detailItems={detailItems}
          onSelectDetail={setActiveDetail}
        />
      </div>
    </main>
  );
}
