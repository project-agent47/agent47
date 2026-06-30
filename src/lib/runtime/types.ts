export type RunStatus = 'draft' | 'running' | 'awaiting_approval' | 'completed' | 'failed';
export type RunPhase = 'intake' | 'research' | 'approval' | 'execution' | 'package' | 'failed';

export interface Citation {
  source: string;
  title: string;
  url?: string;
}

export interface RunArtifact {
  id: string;
  name: string;
  content: string;
  kind: 'markdown' | 'json' | 'text';
}

export type RunActivityKind = 'intake' | 'provider' | 'reasoning' | 'artifact' | 'warning';

export type RunActivityStatus = 'completed' | 'running' | 'warning';

export interface RunActivity {
  id: string;
  title: string;
  detail: string;
  kind: RunActivityKind;
  status: RunActivityStatus;
}

export interface RunExecutionMetadata {
  provider: string;
  model: string;
  mode: 'provider' | 'fallback';
}

export interface ResearchDossier {
  goal: string;
  constraints: string[];
  searchSessions: Array<{ query: string; candidates: string[]; opened: string[]; discarded: string[] }>;
  pageNotes: Array<{ url: string; title: string; summary: string; citations: string[] }>;
  documentNotes: Array<{ name: string; summary: string; keyPassages: string[]; citations: string[] }>;
  findings: string[];
  proposedExecutionPlan: string[];
  openRisks: string[];
}

export interface ApprovalState {
  status: 'pending' | 'approved' | 'rejected';
  summary: string;
  approvedAt?: string;
}

export interface ArtifactBundle {
  reportArtifactId: string | null;
  generatedFileIds: string[];
  executionLog: string[];
}

export interface RunState {
  id: string;
  title: string;
  status: RunStatus;
  currentStep: string;
  currentPhase: RunPhase;
  artifacts: RunArtifact[];
  citations: Citation[];
  dossier: ResearchDossier | null;
  approval: ApprovalState | null;
  artifactBundle: ArtifactBundle | null;
}

export interface ResultPackage {
  summary: string;
  recommendation: string;
  citations: Citation[];
  attachments: RunArtifact[];
  nextActions: string[];
  confidence: number;
  openQuestions: string[];
}
