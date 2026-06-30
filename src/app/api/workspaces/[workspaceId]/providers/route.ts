import { NextResponse } from 'next/server';
import { listProviderSettings, upsertProviderSetting } from '@/lib/workspace-store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return NextResponse.json({ workspaceId, settings: listProviderSettings(workspaceId) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    provider?: string;
    model?: string;
    apiKey?: string;
  };

  if (!body.provider || !body.model || !body.apiKey) {
    return NextResponse.json(
      { error: 'Provider, model, and API key are required.' },
      { status: 400 },
    );
  }

  const setting = upsertProviderSetting(workspaceId, {
    provider: body.provider,
    model: body.model,
    apiKey: body.apiKey,
  });

  return NextResponse.json({ setting });
}
