import { NextResponse } from 'next/server';
import { createWorkspace, listWorkspaces } from '@/lib/workspace-store';

export async function GET() {
  return NextResponse.json({ workspaces: listWorkspaces() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string; slug?: string };
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: 'Workspace name is required.' }, { status: 400 });
  }

  const workspace = createWorkspace({ name, slug: body.slug });
  return NextResponse.json({ workspace });
}
