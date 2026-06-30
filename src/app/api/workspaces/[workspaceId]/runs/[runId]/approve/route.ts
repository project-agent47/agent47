import { mkdir, open, rm } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { executeExecutionPhase } from '@/lib/runtime/execute-execution-phase';
import { packageRunOutput } from '@/lib/runtime/package-run-output';
import { transitionRunState } from '@/lib/runtime/run-machine';
import { createLocalFileWriterTool } from '@/lib/tools/files/local-file-writer';
import { createPlaywrightBrowser } from '@/lib/tools/browser/playwright-browser';
import { getWorkspaceRun, updateWorkspaceRun } from '@/lib/workspace-store';
import type { RunState } from '@/lib/runtime/types';

const inFlightApprovals = new Set<string>();

function buildBrowserTool() {
  if (process.env.PLAYWRIGHT_TEST === '1') {
    return {
      async inspect(url: string) {
        return { url, title: url, summary: url, citations: [url] };
      },
      async execute(planStep: string) {
        return `Executed browser step: ${planStep}`;
      },
    };
  }

  return createPlaywrightBrowser();
}

function buildApprovalLockPath(workspaceId: string, runId: string): string {
  return path.join(
    process.cwd(),
    '.storage',
    'approval-locks',
    encodeURIComponent(workspaceId),
    `${encodeURIComponent(runId)}.lock`,
  );
}

async function acquireApprovalLock(workspaceId: string, runId: string): Promise<(() => Promise<void>) | null> {
  const lockPath = buildApprovalLockPath(workspaceId, runId);
  await mkdir(path.dirname(lockPath), { recursive: true });

  try {
    const handle = await open(lockPath, 'wx');
    return async () => {
      await handle.close().catch(() => undefined);
      await rm(lockPath, { force: true }).catch(() => undefined);
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      return null;
    }

    throw error;
  }
}

function toRunState(run: {
  id: string;
  title: string;
  status: RunState['status'];
  currentStep: string;
  phase?: RunState['currentPhase'];
  artifacts: RunState['artifacts'];
  citations: RunState['citations'];
  dossier?: RunState['dossier'];
  approval?: RunState['approval'];
  artifactBundle?: RunState['artifactBundle'];
}): RunState {
  return {
    id: run.id,
    title: run.title,
    status: run.status,
    currentStep: run.currentStep,
    currentPhase: run.phase ?? 'approval',
    artifacts: run.artifacts,
    citations: run.citations,
    dossier: run.dossier ?? null,
    approval: run.approval ?? null,
    artifactBundle: run.artifactBundle ?? null,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; runId: string }> },
) {
  const { workspaceId, runId } = await params;
  const approvalKey = `${workspaceId}:${runId}`;
  if (inFlightApprovals.has(approvalKey)) {
    return NextResponse.json({ error: 'Run approval is already in progress.' }, { status: 409 });
  }

  inFlightApprovals.add(approvalKey);
  const releaseLock = await acquireApprovalLock(workspaceId, runId);
  if (!releaseLock) {
    inFlightApprovals.delete(approvalKey);
    return NextResponse.json({ error: 'Run approval is already in progress.' }, { status: 409 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { approved?: boolean };
    if (body.approved !== true) {
      return NextResponse.json({ error: 'Approval was not granted.' }, { status: 400 });
    }

    const run = getWorkspaceRun(workspaceId, runId);

    if (!run) {
      return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
    }

    if (run.status !== 'awaiting_approval' || !run.dossier) {
      return NextResponse.json({ error: 'Run is not waiting for approval.' }, { status: 409 });
    }
    const dossier = run.dossier;

    const executionStart = transitionRunState(toRunState(run), { type: 'approve' });

    const claimedRun = updateWorkspaceRun(workspaceId, runId, {
      status: executionStart.status,
      currentStep: executionStart.currentStep,
      phase: executionStart.currentPhase,
      approval: {
        status: 'approved',
        summary: run.approval?.summary ?? 'Research dossier approved.',
        approvedAt: new Date().toISOString(),
      },
    });

    if (!claimedRun) {
      return NextResponse.json({ error: 'Run is not waiting for approval.' }, { status: 409 });
    }

    const browserTool = buildBrowserTool();
    const fileWriterTool = createLocalFileWriterTool();
    try {
      const execution = await executeExecutionPhase({
        runId,
        dossier,
        browserTool,
        fileWriterTool,
      });

      const packaged = packageRunOutput({
        runId,
        dossier,
        executionLog: execution.executionLog,
        artifacts: execution.artifacts,
      });

      const completedState = transitionRunState(toRunState({ ...claimedRun, dossier }), { type: 'complete-execution' });
      const executionActivities = [
        {
          id: `${runId}-execution`,
          title: 'Execution completed',
          detail:
            execution.executionLog.length > 0
              ? execution.executionLog.join(' · ')
              : 'Approved execution ran the execution phase.',
          kind: 'provider' as const,
          status: 'completed' as const,
        },
        {
          id: `${runId}-package`,
          title: 'Execution packaged',
          detail: 'Artifacts and result package were persisted on the run.',
          kind: 'artifact' as const,
          status: 'completed' as const,
        },
      ];
      const updated = updateWorkspaceRun(workspaceId, runId, {
        status: completedState.status,
        currentStep: completedState.currentStep,
        phase: completedState.currentPhase,
        approval: claimedRun.approval ?? {
          status: 'approved',
          summary: run.approval?.summary ?? 'Research dossier approved.',
          approvedAt: new Date().toISOString(),
        },
        dossier,
        artifacts: execution.artifacts,
        citations: packaged.resultPackage.citations,
        artifactBundle: packaged.artifactBundle,
        resultPackage: packaged.resultPackage,
        checkpoints: [...run.checkpoints, ...execution.executionLog, 'Execution completed'],
        execution: {
          provider: 'local-execution',
          model: 'execution-phase',
          mode: 'fallback',
        },
        activities: [...claimedRun.activities, ...executionActivities],
      });

      if (!updated) {
        return NextResponse.json({ error: 'Run execution failed.' }, { status: 500 });
      }

      return NextResponse.json({ run: updated });
    } catch {
      const failedState = transitionRunState(toRunState({ ...claimedRun, dossier: claimedRun.dossier ?? null }), { type: 'fail' });
      const failedRun = updateWorkspaceRun(workspaceId, runId, {
        status: failedState.status,
        currentStep: failedState.currentStep,
        phase: failedState.currentPhase,
        approval: claimedRun.approval ?? {
          status: 'approved',
          summary: run.approval?.summary ?? 'Research dossier approved.',
          approvedAt: new Date().toISOString(),
        },
        dossier: claimedRun.dossier,
        checkpoints: [...run.checkpoints, 'Execution failed'],
        activities: [
          ...run.activities,
          {
            id: `${runId}-execution-failed`,
            title: 'Execution failed',
            detail: 'The approved run failed while executing or packaging output.',
            kind: 'warning',
            status: 'warning',
          },
        ],
      });

      if (!failedRun) {
        return NextResponse.json({ error: 'Run execution failed.' }, { status: 500 });
      }

      return NextResponse.json({ error: 'Run execution failed.', run: failedRun }, { status: 500 });
    }
  } finally {
    inFlightApprovals.delete(approvalKey);
    await releaseLock();
  }
}
