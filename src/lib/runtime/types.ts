export type RunStatus = 'draft' | 'running' | 'awaiting_approval' | 'completed' | 'failed';

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

export interface RunState {
  id: string;
  title: string;
  status: RunStatus;
  currentStep: string;
  artifacts: RunArtifact[];
  citations: Citation[];
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
