import type { RunArtifact } from '@/lib/runtime/types';

export interface SearchCandidate {
  title: string;
  url: string;
}

export interface SearchSession {
  query: string;
  candidates: SearchCandidate[];
  opened: string[];
  discarded: string[];
}

export interface SearchTool {
  run(query: string): Promise<SearchSession>;
}

export interface PageNote {
  url: string;
  title: string;
  summary: string;
  citations: string[];
}

export interface BrowserTool {
  inspect(url: string): Promise<PageNote>;
  execute(planStep: string): Promise<string>;
}

export interface DocumentNote {
  name: string;
  summary: string;
  keyPassages: string[];
  citations: string[];
}

export interface DocumentReaderTool {
  read(filePath: string): Promise<DocumentNote>;
}

export interface FileArtifactInput {
  name: string;
  kind: RunArtifact['kind'];
  content: string;
}

export interface FileWriterTool {
  writeArtifacts(runId: string, files: FileArtifactInput[]): Promise<RunArtifact[]>;
}
