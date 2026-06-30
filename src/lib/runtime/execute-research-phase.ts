import { createEmptyDossier } from './dossier';
import type { ResearchDossier, RunActivity } from './types';
import type { BrowserTool, DocumentReaderTool, SearchTool } from '@/lib/tools/types';

function recordSearchSession(dossier: ResearchDossier, session: Awaited<ReturnType<SearchTool['run']>>): void {
  dossier.searchSessions.push({
    query: session.query,
    candidates: session.candidates.map((candidate) => candidate.title),
    opened: session.opened,
    discarded: session.discarded,
  });
}

export async function executeResearchPhase(input: {
  goal: string;
  constraints: string[];
  searchTool: SearchTool;
  browserTool: BrowserTool;
  documentTool: DocumentReaderTool;
}): Promise<{ dossier: ResearchDossier; activities: RunActivity[] }> {
  const dossier = createEmptyDossier(input.goal, input.constraints);
  const activities: RunActivity[] = [];

  const session = await input.searchTool.run(input.goal);
  recordSearchSession(dossier, session);
  activities.push({
    id: 'search-session',
    title: 'Search session created',
    detail: input.goal,
    kind: 'provider',
    status: 'completed',
  });

  const candidate = session.candidates[0];
  if (candidate) {
    const pageNote = await input.browserTool.inspect(candidate.url);
    dossier.pageNotes.push(pageNote);
    if (pageNote.summary.trim()) {
      dossier.findings.push(pageNote.summary.trim());
    }
  }

  const documentNote = await input.documentTool.read('brief.md');
  dossier.documentNotes.push(documentNote);
  if (documentNote.summary.trim()) {
    dossier.findings.push(documentNote.summary.trim());
  }

  dossier.proposedExecutionPlan = [
    'Open the research candidate in the browser',
    'Capture the final report summary',
    'Write the packaged artifacts',
  ];

  activities.push({
    id: 'research-dossier',
    title: 'Research dossier created',
    detail: 'Research is ready for approval.',
    kind: 'reasoning',
    status: 'completed',
  });

  return { dossier, activities };
}
