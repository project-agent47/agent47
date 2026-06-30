import { NextResponse } from 'next/server';
import { resumeRun } from '@/server/runs/resume-run';
import { getWorkspaceRun, updateWorkspaceRun } from '@/lib/workspace-store';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; runId: string }> },
) {
  const { workspaceId, runId } = await params;
  const run = getWorkspaceRun(workspaceId, runId);

  if (!run) {
    return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
  }

  const next = resumeRun({
    id: run.id,
    title: run.title,
    status: run.status,
    currentStep: run.currentStep,
    artifacts: run.artifacts,
    citations: run.citations,
  });

  const updated = updateWorkspaceRun(workspaceId, runId, {
    status: next.status,
    currentStep: next.currentStep,
    checkpoints: [...run.checkpoints, 'Resumed for review'],
  });

  return NextResponse.json({ run: updated });
}
