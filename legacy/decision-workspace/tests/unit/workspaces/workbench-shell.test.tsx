import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkbenchShell } from '@/components/workspaces/workbench-shell';
import type { WorkspaceRecord, WorkspaceRunRecord } from '@/lib/workspace-store';

const workspace: WorkspaceRecord = {
  id: 'workspace-1',
  name: 'Design review',
  slug: 'design-review',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('WorkbenchShell', () => {
  it('renders independent scroll panes, a fixed composer shell, and a workspace theme toggle', () => {
    render(<WorkbenchShell workspace={workspace} initialRuns={[]} workspaces={[workspace]} />);

    expect(screen.getByTestId('workbench-sidebar')).toHaveAttribute('data-scroll-pane', 'sidebar');
    expect(screen.getByTestId('workbench-activity')).toHaveAttribute('data-scroll-pane', 'activity');
    expect(screen.getByTestId('workbench-inspector')).toHaveAttribute('data-scroll-pane', 'inspector');
    expect(screen.getByTestId('workbench-composer')).toHaveAttribute('data-fixed-composer', 'true');
    expect(document.body).toHaveAttribute('data-theme', 'light');

    fireEvent.click(screen.getByRole('button', { name: 'Use dark theme' }));

    expect(document.body).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('button', { name: 'Use light theme' })).toBeInTheDocument();
  });

  it('renders lifecycle, dossier, approval, and artifact details for a real run', () => {
    const run: WorkspaceRunRecord = {
      id: 'run-1',
      workspaceId: workspace.id,
      title: 'Plan my frontend growth',
      recipe: 'learning-path',
      status: 'completed',
      currentStep: 'done',
      phase: 'approval',
      dossier: {
        goal: 'Plan my frontend growth',
        constraints: ['Keep the plan practical'],
        searchSessions: [],
        pageNotes: [],
        documentNotes: [],
        findings: ['Prioritize HTML, CSS, and JavaScript first.'],
        proposedExecutionPlan: ['Build one landing page before choosing a framework.'],
        openRisks: ['Time available each week is still unknown.'],
      },
      approval: {
        status: 'pending',
        summary: 'Research is ready for review before execution starts.',
      },
      artifactBundle: {
        reportArtifactId: 'artifact-1',
        generatedFileIds: ['artifact-plan-md'],
        executionLog: ['Prepared the research dossier.'],
      },
      artifacts: [],
      citations: [{ source: 'DeepSeek', title: 'Curriculum note' }],
      resultPackage: {
        summary: 'Structured plan',
        recommendation: 'Start with HTML, CSS, and JavaScript.',
        citations: [{ source: 'DeepSeek', title: 'Curriculum note' }],
        attachments: [],
        nextActions: ['Build one landing page'],
        confidence: 0.94,
        openQuestions: ['How much time do you have each week?'],
      },
      checkpoints: ['Intake captured', 'Provider response received'],
      sources: ['Plan my frontend growth'],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      execution: {
        provider: 'openai-compatible',
        model: 'deepseek-v4-flash',
        mode: 'provider',
      },
      activities: [
        {
          id: 'activity-1',
          title: 'Provider response received',
          detail: 'deepseek-v4-flash returned a structured result package.',
          kind: 'provider',
          status: 'completed',
        },
      ],
    };

    render(<WorkbenchShell workspace={workspace} initialRuns={[run]} workspaces={[workspace]} />);

    expect(screen.getAllByText('deepseek-v4-flash').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Awaiting approval').length).toBeGreaterThan(0);
    expect(screen.getByText('Research dossier')).toBeInTheDocument();
    expect(screen.getByText('Research is ready for review before execution starts.')).toBeInTheDocument();
    expect(screen.getByText('Build one landing page before choosing a framework.')).toBeInTheDocument();
    expect(screen.getByText('artifact-plan-md')).toBeInTheDocument();
  });

  it('keeps all detail items reachable, preserves citation fallback, and does not overstate failed phases', () => {
    const failedRun: WorkspaceRunRecord = {
      id: 'run-2',
      workspaceId: workspace.id,
      title: 'Investigate failure handling',
      recipe: 'learning-path',
      status: 'failed',
      currentStep: 'failed',
      phase: 'failed',
      dossier: {
        goal: 'Investigate failure handling',
        constraints: ['Keep the plan practical'],
        searchSessions: [],
        pageNotes: [],
        documentNotes: [],
        findings: ['Record one finding'],
        proposedExecutionPlan: ['Attempt the first step', 'Attempt the second step'],
        openRisks: ['The package step did not complete.'],
      },
      approval: {
        status: 'approved',
        summary: 'Approval was granted before execution failed.',
      },
      artifactBundle: {
        reportArtifactId: null,
        generatedFileIds: [],
        executionLog: ['Execution stopped before packaging.'],
      },
      artifacts: [],
      citations: [{ source: 'Fallback source', title: 'Fallback citation' }],
      resultPackage: {
        summary: 'Execution failed before packaging.',
        recommendation: 'Retry after fixing the blocking issue.',
        citations: [],
        attachments: [],
        nextActions: ['Retry once the failure is resolved'],
        confidence: 0.2,
        openQuestions: ['What caused the failure?'],
      },
      checkpoints: ['Research ready', 'Execution failed'],
      sources: ['Fallback citation'],
      execution: {
        provider: 'openai-compatible',
        model: 'deepseek-v4-flash',
        mode: 'provider',
      },
      activities: [
        {
          id: 'activity-2',
          title: 'Execution failed',
          detail: 'The run failed before the package phase could complete.',
          kind: 'warning',
          status: 'warning',
        },
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    render(<WorkbenchShell workspace={workspace} initialRuns={[failedRun]} workspaces={[workspace]} />);

    expect(screen.getByRole('button', { name: 'Open question 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finding 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Execution step 1' })).toBeInTheDocument();
    expect(screen.getAllByText('Fallback citation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Waiting').length).toBeGreaterThan(0);
  });

  it('approves a pending run from the workbench and shows the packaged result', async () => {
    const run: WorkspaceRunRecord = {
      id: 'run-approve',
      workspaceId: workspace.id,
      title: 'Research a frontend learning path',
      recipe: 'learning-path',
      status: 'awaiting_approval',
      currentStep: 'awaiting approval',
      phase: 'approval',
      dossier: {
        goal: 'Research a frontend learning path',
        constraints: ['Keep it concise and directly actionable.'],
        searchSessions: [],
        pageNotes: [],
        documentNotes: [],
        findings: ['Start with the web fundamentals before specializing.'],
        proposedExecutionPlan: ['Package the findings into a small report.'],
        openRisks: ['Available study time per week is still unknown.'],
      },
      approval: {
        status: 'pending',
        summary: 'Research dossier ready for approval.',
      },
      artifactBundle: null,
      artifacts: [],
      citations: [],
      resultPackage: {
        summary: 'Research dossier prepared for Research a frontend learning path.',
        recommendation: 'Approve execution to continue.',
        citations: [],
        attachments: [],
        nextActions: ['Review the research dossier', 'Approve execution'],
        confidence: 0.8,
        openQuestions: ['Available study time per week is still unknown.'],
      },
      checkpoints: ['Research dossier ready'],
      sources: ['Research a frontend learning path'],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      execution: {
        provider: 'openai-compatible',
        model: 'deepseek-v4-flash',
        mode: 'provider',
      },
      activities: [],
    };

    const approvedRun: WorkspaceRunRecord = {
      ...run,
      status: 'completed',
      currentStep: 'done',
      phase: 'package',
      approval: {
        status: 'approved',
        summary: 'Research dossier ready for approval.',
        approvedAt: '2024-01-01T00:05:00.000Z',
      },
      artifactBundle: {
        reportArtifactId: 'artifact-report',
        generatedFileIds: ['artifact-report', 'artifact-result'],
        executionLog: ['Executed browser step: Package the findings into a small report.'],
      },
      artifacts: [
        {
          id: 'artifact-report',
          name: 'research-report.md',
          kind: 'markdown',
          content: '# Report',
        },
        {
          id: 'artifact-result',
          name: 'result.json',
          kind: 'json',
          content: '{"findings":["Start with the web fundamentals before specializing."]}',
        },
      ],
      resultPackage: {
        summary: 'Execution finished for Research a frontend learning path.',
        recommendation: 'Review the packaged output.',
        citations: [],
        attachments: [
          {
            id: 'artifact-report',
            name: 'research-report.md',
            kind: 'markdown',
            content: '# Report',
          },
          {
            id: 'artifact-result',
            name: 'result.json',
            kind: 'json',
            content: '{"findings":["Start with the web fundamentals before specializing."]}',
          },
        ],
        nextActions: ['Review the packaged report'],
        confidence: 0.95,
        openQuestions: ['Available study time per week is still unknown.'],
      },
      activities: [
        {
          id: 'run-approve-execution',
          title: 'Execution completed',
          detail: 'Executed browser step: Package the findings into a small report.',
          kind: 'provider',
          status: 'completed',
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ run: approvedRun }),
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<WorkbenchShell workspace={workspace} initialRuns={[run]} workspaces={[workspace]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve execution' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/workspaces/${workspace.id}/runs/${run.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      }),
    );

    await waitFor(() => expect(screen.getAllByText('Approved for execution').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Execution finished for Research a frontend learning path.').length).toBeGreaterThan(0);
    expect(screen.getByText('Review the packaged output.')).toBeInTheDocument();
    expect(screen.getByText('research-report.md')).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
