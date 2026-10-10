import type { ResearchDossier } from './types';

export function createEmptyDossier(goal: string, constraints: string[] = []): ResearchDossier {
  return {
    goal,
    constraints,
    searchSessions: [],
    pageNotes: [],
    documentNotes: [],
    findings: [],
    proposedExecutionPlan: [],
    openRisks: [],
  };
}
