import { buildResultPackage } from './result-package';
import type { ArtifactBundle, Citation, ResearchDossier, ResultPackage, RunArtifact } from './types';

export interface PackageRunOutputInput {
  runId: string;
  dossier: ResearchDossier;
  executionLog?: string[];
  artifacts?: RunArtifact[];
}

export interface PackageRunOutputResult {
  resultPackage: ResultPackage;
  artifactBundle: ArtifactBundle;
}

function collectCitations(dossier: ResearchDossier): Citation[] {
  const citations: Citation[] = [];

  for (const note of dossier.pageNotes) {
    for (const citation of note.citations) {
      citations.push({ source: note.title, title: citation, url: note.url });
    }
  }

  for (const note of dossier.documentNotes) {
    for (const citation of note.citations) {
      citations.push({ source: note.name, title: citation });
    }
  }

  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = JSON.stringify(citation);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function packageRunOutput(input: PackageRunOutputInput): PackageRunOutputResult {
  const artifacts = input.artifacts ?? [];
  const executionLog = input.executionLog ?? [];
  const finalStage = executionLog.length > 0 || artifacts.length > 0;
  const citations = collectCitations(input.dossier);

  const resultPackage = buildResultPackage({
    summary: finalStage
      ? `Execution finished for ${input.dossier.goal}.`
      : `Research dossier prepared for ${input.dossier.goal}.`,
    recommendation: finalStage
      ? 'Review the packaged output.'
      : 'Approve execution to continue.',
    citations,
    attachments: artifacts,
    nextActions: finalStage
      ? ['Review the packaged report']
      : ['Review the research dossier', 'Approve execution'],
    confidence: finalStage ? 0.95 : 0.8,
    openQuestions: input.dossier.openRisks,
  });

  const artifactBundle: ArtifactBundle = {
    reportArtifactId: artifacts.find((artifact) => artifact.kind === 'markdown')?.id ?? null,
    generatedFileIds: artifacts.map((artifact) => artifact.id),
    executionLog,
  };

  return { resultPackage, artifactBundle };
}
