import { NextResponse } from 'next/server';
import { createWorkspaceRun, listRunsForWorkspace } from '@/lib/workspace-store';
import { executeResearchPhase } from '@/lib/runtime/execute-research-phase';
import { buildResultPackage } from '@/lib/runtime/result-package';
import { createLocalDocumentReaderTool } from '@/lib/tools/documents/local-document-reader';
import { createLocalSearchTool } from '@/lib/tools/search/local-search';
import { createPlaywrightBrowser } from '@/lib/tools/browser/playwright-browser';

function splitConstraints(constraints?: string): string[] {
  return constraints
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean) ?? [];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildResearchUrl(title: string, goal: string, constraints: string[]): string {
  const markup = `
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
      </head>
      <body>
        <main>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(goal)}</p>
          <ul>${constraints.map((constraint) => `<li>${escapeHtml(constraint)}</li>`).join('')}</ul>
        </main>
      </body>
    </html>
  `;

  return `data:text/html;charset=utf-8,${encodeURIComponent(markup)}`;
}

function buildBrowserTool() {
  if (process.env.PLAYWRIGHT_TEST === '1') {
    return {
      async inspect(url: string) {
        return {
          url,
          title: 'Local research candidate',
          summary: 'Local research candidate prepared for approval.',
          citations: [url],
        };
      },
      async execute(planStep: string) {
        return `Executed browser step: ${planStep}`;
      },
    };
  }

  return createPlaywrightBrowser();
}

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

  const title = body.title.trim();
  const goal = body.goal?.trim() || 'unclear goal';
  const constraints = splitConstraints(body.constraints);
  const browserTool = buildBrowserTool();
  const searchTool = createLocalSearchTool({
    search: async (query: string) => [
      {
        title: `${title} research note`,
        url: buildResearchUrl(title, query, constraints),
      },
    ],
  });
  const documentTool = createLocalDocumentReaderTool({
    extractText: async (filePath: string) =>
      `Goal: ${goal}\nConstraints: ${constraints.join(', ') || 'none'}\nSource: ${filePath}`,
  });

  const research = await executeResearchPhase({
    goal,
    constraints,
    searchTool,
    browserTool,
    documentTool,
  });

  const resultPackage = buildResultPackage({
    summary: research.dossier.findings.join(' ') || 'Research dossier ready for approval.',
    recommendation: 'Review the dossier and approve execution when ready.',
    citations: research.dossier.pageNotes.map((note) => ({
      source: note.title,
      title: note.summary,
      url: note.url,
    })),
    nextActions: ['Review the dossier', 'Approve execution if the plan looks right'],
    confidence: research.dossier.findings.length > 0 ? 0.8 : 0.6,
  });

  const run = createWorkspaceRun(workspaceId, {
    title,
    recipe: body.recipe ?? 'learning-path',
    status: 'awaiting_approval',
    currentStep: 'reviewing',
    phase: 'approval',
    dossier: research.dossier,
    approval: {
      status: 'pending',
      summary: 'Research dossier ready for approval.',
    },
    artifactBundle: null,
    artifacts: [],
    citations: resultPackage.citations,
    resultPackage,
    checkpoints: research.activities.map((activity) => activity.title),
    sources: [goal],
    execution: {
      provider: 'local-research',
      model: 'research-dossier',
      mode: 'fallback',
    },
    activities: research.activities,
  });

  return NextResponse.json({ run });
}
