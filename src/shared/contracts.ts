export type TaskStatus = 'queued' | 'running' | 'awaiting_approval' | 'awaiting_input' | 'awaiting_reconciliation' | 'completed' | 'failed' | 'cancelled';
export type SkillId = 'general' | 'review' | 'deliver';
export interface TaskEvent { id: string; at: string; kind: 'user' | 'assistant' | 'reasoning' | 'tool' | 'system' | 'error'; text: string }
export interface Artifact { id: string; name: string; content: string; sha256: string }
export interface Approval { id: string; name: string; content: string; digest: string; expiresAt: string; state: 'pending' | 'approved' | 'applied' | 'denied'; kind?: 'project_write' | 'directory' | 'shell' | 'code'; payload?: Record<string, unknown>; root?: string; before?: string; denialReason?: string }
export interface TokenUsage { id: string; at: string; purpose: 'turn' | 'compaction'; state: 'pending' | 'reported' | 'partial' | 'unknown'; input?: number; output?: number; total?: number; cacheRead?: number; reasoning?: number; textDeltas?: number; reasoningDeltas?: number }
export interface SkillView { id: string; name: string; description: string; enabled: boolean; hash: string; files: string[] }
export interface SkillImport { ticket: string; skill: SkillView; instructions: string; replaces?: string; resources?: Record<string, string> }
export interface ExecutionSettings { hostExecution: boolean; fileMode?: 'snapshot' | 'ask' }
export interface FileChange { id: string; path: string; state: 'saved' | 'restored' | 'cleaned'; cleanedFrom?: 'saved' | 'restored' }
export interface RunUndo { state: 'running' | 'completed' | 'partial'; restored: number; conflicts: { path: string; error: string }[]; startedAt: string }
export interface SnapshotSettings { retentionDays: 0 | 7 | 30 | 90; count: number; bytes: number; storagePath: string }
export interface QuestionItem {
  id: string; header: string; prompt: string; type: 'single' | 'multiple' | 'text'; required: boolean;
  options: { id: string; label: string; description?: string }[]; allowCustom: boolean;
}
export interface QuestionAnswer { questionId: string; selectedOptionIds: string[]; customText?: string; skipped?: boolean }
export interface QuestionDraft { answers: QuestionAnswer[]; step: number; version: number }
export interface UserQuestion {
  id: string; text: string; questions?: QuestionItem[]; revision?: number; digest?: string; legacy?: boolean; draft?: QuestionDraft;
}
export interface QuestionBinding { taskId: string; questionId: string; revision: number; digest: string }
export interface QuestionReply extends QuestionBinding {
  clientCommandId: string; result: 'answers' | 'cancel'; answers: QuestionAnswer[];
}
export interface QuestionDraftInput extends QuestionBinding { answers: QuestionAnswer[]; step: number; expectedVersion: number }
export interface TaskView {
  id: string; goal: string; skill: SkillId; root?: string; status: TaskStatus;
  createdAt: string; updatedAt: string; events: TaskEvent[]; artifacts: Artifact[];
  approval?: Approval; steps: number;
  conversationId?: string; goalId?: string; parentRunId?: string; runNumber?: number;
  usage?: TokenUsage[]; draft?: { text: string; reasoning: string };
  question?: UserQuestion; queuedInput?: { id: string; text: string; mode: 'queue' | 'steer' | 'followup' }[];
  composerDraft?: string;
  skillPins?: Record<string, string>;
  webOrigins?: string[];
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
  sendMessage(input: { taskId: string; text: string; mode: 'queue' | 'steer' | 'followup'; clientMessageId: string; instruction?: boolean }): Promise<TaskView>;
  manageQueue(input: { taskId: string; messageId: string; action: 'delete' | 'send' }): Promise<TaskView>;
  saveQuestionDraft(input: QuestionDraftInput): Promise<QuestionDraft>;
  respondQuestion(input: QuestionReply): Promise<TaskView>;
  saveComposerDraft(input: { taskId: string; text: string }): Promise<void>;
  resolveUnknown(taskId: string): Promise<void>;
  decide(input: { taskId: string; approvalId: string; digest: string; approve: boolean; scope?: 'files' | 'host'; reason?: string }): Promise<void>;
  chooseFolder(): Promise<FolderGrant | undefined>;
  provider(): Promise<ProviderView>;
  saveProvider(input: ProviderInput): Promise<void>;
  testProvider(): Promise<string>;
  openArtifact(input: { taskId: string; artifactId: string }): Promise<void>;
  listSkills(): Promise<SkillView[]>;
  previewSkill(): Promise<SkillImport | undefined>;
  installSkill(ticket: string): Promise<void>;
  setSkill(input: { id: string; enabled: boolean }): Promise<void>;
  removeSkill(id: string): Promise<void>;
  setWebOrigins(input: { taskId: string; origins: string[] }): Promise<void>;
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
