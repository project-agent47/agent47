import { NextResponse } from 'next/server';
import { createWorkspaceRun, listRunsForWorkspace } from '@/lib/workspace-store';
import { executeRecipeWithProvider } from '@/lib/runtime/provider-execution';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return NextResponse.json({ runs: listRunsForWorkspace(workspaceId) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    recipe?: string;
    goal?: string;
    experience?: string;
    constraints?: string;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'Run title is required.' }, { status: 400 });
  }

  const recipeName = body.recipe ?? 'learning-path';
  const execution = await executeRecipeWithProvider({
    workspaceId,
    title: body.title.trim(),
    recipe: recipeName,
    goal: body.goal ?? 'unclear goal',
    experience: body.experience ?? 'beginner',
    constraints: body.constraints,
  });

  const run = createWorkspaceRun(workspaceId, {
    title: body.title.trim(),
    recipe: recipeName,
    status: 'completed',
    currentStep: 'done',
    resultPackage: execution.resultPackage,
    checkpoints: execution.checkpoints,
    sources: [body.goal ?? 'unclear goal'],
  });

  return NextResponse.json({ run });
}
