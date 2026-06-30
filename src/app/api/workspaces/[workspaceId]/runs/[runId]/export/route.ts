import { NextResponse } from 'next/server';
import { getWorkspaceRun } from '@/lib/workspace-store';
import { exportResultPackage } from '@/server/runs/export-result-package';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; runId: string }> },
) {
  const { workspaceId, runId } = await params;
  const run = getWorkspaceRun(workspaceId, runId);

  if (!run) {
    return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
  }

  const markdown = exportResultPackage(run.resultPackage);
  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${run.id}.md"`,
    },
  });
}
