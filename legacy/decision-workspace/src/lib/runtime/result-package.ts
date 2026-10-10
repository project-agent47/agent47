import type { Citation, ResultPackage, RunArtifact } from './types';

export interface ResultPackageInput {
  summary: string;
  recommendation: string;
  citations?: Citation[];
  attachments?: RunArtifact[];
  nextActions?: string[];
  confidence?: number;
  openQuestions?: string[];
}

export function buildResultPackage(input: ResultPackageInput): ResultPackage {
  return {
    summary: input.summary,
    recommendation: input.recommendation,
    citations: input.citations ?? [],
    attachments: input.attachments ?? [],
    nextActions: input.nextActions ?? ['Review the recommendation with the user'],
    confidence: input.confidence ?? 0.7,
    openQuestions: input.openQuestions ?? [],
  };
}
