export type TaskStatus = 'queued' | 'running' | 'awaiting_approval' | 'awaiting_input' | 'awaiting_reconciliation' | 'completed' | 'failed' | 'cancelled';
export type SkillId = 'general' | 'review' | 'deliver';
export interface TaskEvent { id: string; at: string; kind: 'user' | 'assistant' | 'reasoning' | 'tool' | 'system' | 'error'; text: string }
export interface Artifact { id: string; name: string; content: string; sha256: string }
export interface Approval { id: string; name: string; content: string; digest: string; expiresAt: string; state: 'pending' | 'approved' | 'applied' | 'denied'; kind?: 'project_write' | 'directory' | 'shell' | 'code'; payload?: Record<string, unknown>; root?: string; before?: string }
export interface TokenUsage { id: string; at: string; purpose: 'turn' | 'compaction'; state: 'pending' | 'reported' | 'partial' | 'unknown'; input?: number; output?: number; total?: number; cacheRead?: number; reasoning?: number; textDeltas?: number; reasoningDeltas?: number }
export interface SkillView { id: string; name: string; description: string; enabled: boolean; hash: string; files: string[] }
export interface SkillImport { ticket: string; skill: SkillView; instructions: string }
export interface ExecutionSettings { hostExecution: boolean; fileMode?: 'snapshot' | 'ask' }
export interface FileChange { id: string; path: string; state: 'saved' | 'restored' | 'cleaned'; cleanedFrom?: 'saved' | 'restored' }
export interface RunUndo { state: 'running' | 'completed' | 'partial'; restored: number; conflicts: { path: string; error: string }[]; startedAt: string }
export interface SnapshotSettings { retentionDays: 0 | 7 | 30 | 90; count: number; bytes: number; storagePath: string }
export interface TaskView {
  id: string; goal: string; skill: SkillId; root?: string; status: TaskStatus;
  createdAt: string; updatedAt: string; events: TaskEvent[]; artifacts: Artifact[];
  approval?: Approval; steps: number;
  conversationId?: string; goalId?: string; parentRunId?: string; runNumber?: number;
  usage?: TokenUsage[]; draft?: { text: string; reasoning: string };
  question?: { id: string; text: string }; queuedInput?: { id: string; text: string; mode: 'steer' | 'followup' }[];
  context?: { compactions: number; estimatedTokens: number; keptFrom: number };
  unknownEffect?: boolean;
  fileMode?: 'snapshot' | 'ask'; hostMode?: 'ask' | 'allow';
  fileChanges?: FileChange[];
  undo?: RunUndo;
}
export interface ProviderInput { baseURL: string; model: string; apiKey?: string }
export interface ProviderView { baseURL: string; model: string; configured: boolean; secureStorage: boolean }
export interface CreateInput { goal: string; skill: SkillId; folderGrant?: string }
export interface FolderGrant { id: string; path: string; fileMode?: 'snapshot' | 'ask' }
export interface AgentBridge {
  preview: boolean;
  listTasks(): Promise<TaskView[]>;
  createTask(input: CreateInput): Promise<TaskView>;
  cancelTask(id: string): Promise<void>;
  sendMessage(input: { taskId: string; text: string; mode: 'steer' | 'followup'; clientMessageId: string }): Promise<TaskView>;
  resolveUnknown(taskId: string): Promise<void>;
  decide(input: { taskId: string; approvalId: string; digest: string; approve: boolean }): Promise<void>;
  chooseFolder(): Promise<FolderGrant | undefined>;
  provider(): Promise<ProviderView>;
  saveProvider(input: ProviderInput): Promise<void>;
  testProvider(): Promise<string>;
  openArtifact(input: { taskId: string; artifactId: string }): Promise<void>;
  listSkills(): Promise<SkillView[]>;
  previewSkill(): Promise<SkillImport | undefined>;
  installSkill(ticket: string): Promise<void>;
  setSkill(input: { id: string; enabled: boolean }): Promise<void>;
  executionSettings(): Promise<ExecutionSettings>;
  setExecutionSettings(input: Partial<ExecutionSettings>): Promise<void>;
  setTaskPermissions(input: { taskId: string; fileMode: 'snapshot' | 'ask'; hostMode: 'ask' | 'allow' }): Promise<void>;
  restoreFile(input: { taskId: string; snapshotId: string }): Promise<void>;
  undoRun(taskId: string): Promise<RunUndo>;
  snapshotSettings(): Promise<SnapshotSettings>;
  setSnapshotRetention(days: 0 | 7 | 30 | 90): Promise<void>;
  cleanSnapshots(): Promise<{ cleaned: number; errors: number }>;
  onChange(callback: () => void): () => void;
}
declare global { interface Window { agent47?: AgentBridge } }
