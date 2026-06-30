import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  ApprovalState,
  ArtifactBundle,
  Citation,
  ResearchDossier,
  ResultPackage,
  RunActivity,
  RunExecutionMetadata,
  RunPhase,
  RunStatus,
  RunArtifact,
} from '@/lib/runtime/types';

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceRunRecord {
  id: string;
  workspaceId: string;
  title: string;
  recipe: string;
  status: RunStatus;
  currentStep: string;
  phase?: RunPhase;
  dossier?: ResearchDossier | null;
  approval?: ApprovalState | null;
  artifactBundle?: ArtifactBundle | null;
  artifacts: RunArtifact[];
  citations: Citation[];
  resultPackage: ResultPackage;
  checkpoints: string[];
  sources: string[];
  execution: RunExecutionMetadata;
  activities: RunActivity[];
  createdAt: string;
  updatedAt: string;
}

export interface ProviderSettingRecord {
  id: string;
  workspaceId: string;
  provider: string;
  model: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
}

interface DecisionWorkspaceStore {
  workspaces: WorkspaceRecord[];
  runs: WorkspaceRunRecord[];
  providerSettings: ProviderSettingRecord[];
}

const globalStore = globalThis as typeof globalThis & {
  __decisionWorkspaceStore?: DecisionWorkspaceStore;
  __decisionWorkspaceStoreFile?: string;
};

function createDefaultStore(): DecisionWorkspaceStore {
  return {
    workspaces: [
      {
        id: 'workspace-primary',
        name: 'Workspace',
        slug: 'workspace',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    runs: [],
    providerSettings: [],
  };
}

function getStoreFilePath(): string {
  const explicitPath = process.env.DECISION_WORKSPACE_STORE_FILE;
  if (explicitPath) {
    return explicitPath;
  }

  const rootDir = process.env.DECISION_WORKSPACE_STORE_DIR ?? join(process.cwd(), '.storage');
  const fileName = process.env.NODE_ENV === 'test' ? 'workspace-store.test.json' : 'workspace-store.json';
  return join(rootDir, fileName);
}

function isLegacyDemoWorkspace(workspace: WorkspaceRecord): boolean {
  return (
    workspace.id === 'workspace-demo' ||
    workspace.name === 'Demo Workspace' ||
    workspace.slug === 'demo-workspace'
  );
}

function normalizeActivities(run: Partial<WorkspaceRunRecord>): RunActivity[] {
  if (Array.isArray(run.activities) && run.activities.length > 0) {
    return run.activities;
  }

  return (run.checkpoints ?? []).map((checkpoint, index) => ({
    id: `${run.id ?? 'run'}-activity-${index + 1}`,
    title: checkpoint,
    detail: checkpoint,
    kind: checkpoint.toLowerCase().includes('fallback')
      ? 'warning'
      : checkpoint.toLowerCase().includes('provider')
        ? 'provider'
        : 'intake',
    status: checkpoint.toLowerCase().includes('fallback') ? 'warning' : 'completed',
  }));
}

function normalizeRunPhase(run: Partial<WorkspaceRunRecord>): RunPhase {
  if (run.phase) {
    return run.phase;
  }

  const status = run.status;
  const currentStep = (run.currentStep ?? '').toLowerCase();

  if (status === 'failed' || currentStep === 'failed') {
    return 'failed';
  }

  if (currentStep.includes('packag') || currentStep === 'done' || status === 'completed') {
    return 'package';
  }

  if (currentStep.includes('review') || currentStep.includes('approval') || status === 'awaiting_approval') {
    return 'approval';
  }

  if (currentStep.includes('execut')) {
    return 'execution';
  }

  if (currentStep.includes('research') || currentStep.includes('context')) {
    return 'research';
  }

  if (currentStep.includes('draft') || currentStep.includes('revis')) {
    return 'intake';
  }

  if (status === 'running') {
    return 'research';
  }

  return 'intake';
}

function normalizeExecution(run: Partial<WorkspaceRunRecord>): RunExecutionMetadata {
  if (run.execution) {
    return run.execution;
  }

  const usedFallback = (run.checkpoints ?? []).some((checkpoint) =>
    checkpoint.toLowerCase().includes('fallback'),
  );

  return {
    provider: usedFallback ? 'fallback' : 'openai-compatible',
    model: usedFallback ? 'fallback-recipe' : 'deepseek-v4-flash',
    mode: usedFallback ? 'fallback' : 'provider',
  };
}

function normalizeRunRecord(run: Partial<WorkspaceRunRecord>): WorkspaceRunRecord {
  const now = new Date().toISOString();

  return {
    id: run.id ?? randomUUID(),
    workspaceId: run.workspaceId ?? 'workspace-primary',
    title: run.title ?? 'Untitled run',
    recipe: run.recipe ?? 'learning-path',
    status: run.status ?? 'draft',
    currentStep: run.currentStep ?? 'drafting',
    phase: normalizeRunPhase(run),
    dossier: run.dossier ?? null,
    approval: run.approval ?? null,
    artifactBundle: run.artifactBundle ?? null,
    artifacts: run.artifacts ?? [],
    citations: run.citations?.length ? run.citations : run.resultPackage?.citations ?? [],
    resultPackage:
      run.resultPackage ??
      ({
        summary: '',
        recommendation: '',
        citations: [],
        attachments: [],
        nextActions: [],
        confidence: 0,
        openQuestions: [],
      } satisfies ResultPackage),
    checkpoints: run.checkpoints ?? [],
    sources: run.sources ?? [],
    execution: normalizeExecution(run),
    activities: normalizeActivities(run),
    createdAt: run.createdAt ?? now,
    updatedAt: run.updatedAt ?? now,
  };
}

function normalizeStore(store: Partial<DecisionWorkspaceStore> | undefined): DecisionWorkspaceStore {
  const defaultStore = createDefaultStore();
  const sourceWorkspaces = Array.isArray(store?.workspaces)
    ? (store?.workspaces ?? [])
    : defaultStore.workspaces;
  const sourceRuns = Array.isArray(store?.runs) ? (store?.runs ?? []) : defaultStore.runs;
  const sourceProviderSettings = Array.isArray(store?.providerSettings)
    ? (store?.providerSettings ?? [])
    : defaultStore.providerSettings;

  const legacyWorkspaceIds = sourceWorkspaces
    .filter(isLegacyDemoWorkspace)
    .map((workspace) => workspace.id);

  if (sourceWorkspaces.length === 1 && sourceWorkspaces[0] && isLegacyDemoWorkspace(sourceWorkspaces[0])) {
    const legacyWorkspace = sourceWorkspaces[0];

    return {
      workspaces: [
        {
          ...legacyWorkspace,
          name: 'Workspace',
          slug: 'workspace',
          updatedAt: new Date().toISOString(),
        },
      ],
      runs: [],
      providerSettings: sourceProviderSettings,
    };
  }

  const normalizedWorkspaces = sourceWorkspaces.filter(
    (workspace) => !legacyWorkspaceIds.includes(workspace.id),
  );

  return {
    workspaces: normalizedWorkspaces.length > 0 ? normalizedWorkspaces : defaultStore.workspaces,
    runs: sourceRuns
      .filter((run) => !legacyWorkspaceIds.includes(run.workspaceId ?? ''))
      .map(normalizeRunRecord),
    providerSettings: sourceProviderSettings.filter(
      (setting) => !legacyWorkspaceIds.includes(setting.workspaceId),
    ),
  };
}

function readStoreFromDisk(filePath: string): DecisionWorkspaceStore {
  if (!existsSync(filePath)) {
    const store = createDefaultStore();
    writeStoreToDisk(store, filePath);
    return store;
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content) as Partial<DecisionWorkspaceStore>;
    const normalized = normalizeStore(parsed);
    writeStoreToDisk(normalized, filePath);
    return normalized;
  } catch {
    const store = createDefaultStore();
    writeStoreToDisk(store, filePath);
    return store;
  }
}

function writeStoreToDisk(store: DecisionWorkspaceStore, filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(store, null, 2));
}

function persistStore(store: DecisionWorkspaceStore): void {
  const filePath = globalStore.__decisionWorkspaceStoreFile ?? getStoreFilePath();
  writeStoreToDisk(store, filePath);
  globalStore.__decisionWorkspaceStoreFile = filePath;
}

function getStore(): DecisionWorkspaceStore {
  const filePath = getStoreFilePath();

  if (
    !globalStore.__decisionWorkspaceStore ||
    globalStore.__decisionWorkspaceStoreFile !== filePath
  ) {
    globalStore.__decisionWorkspaceStore = readStoreFromDisk(filePath);
    globalStore.__decisionWorkspaceStoreFile = filePath;
  }

  const normalized = normalizeStore(globalStore.__decisionWorkspaceStore);

  if (JSON.stringify(normalized) !== JSON.stringify(globalStore.__decisionWorkspaceStore)) {
    globalStore.__decisionWorkspaceStore = normalized;
    persistStore(normalized);
  }

  return globalStore.__decisionWorkspaceStore;
}

export function listWorkspaces(): WorkspaceRecord[] {
  return getStore().workspaces.slice().reverse();
}

export function createWorkspace(input: { name: string; slug?: string }): WorkspaceRecord {
  const store = getStore();
  const now = new Date().toISOString();
  const workspace: WorkspaceRecord = {
    id: randomUUID(),
    name: input.name,
    slug: input.slug ?? input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    createdAt: now,
    updatedAt: now,
  };

  store.workspaces.unshift(workspace);
  persistStore(store);
  return workspace;
}

export function getWorkspace(workspaceIdOrSlug: string): WorkspaceRecord | undefined {
  return getStore().workspaces.find(
    (workspace) => workspace.id === workspaceIdOrSlug || workspace.slug === workspaceIdOrSlug,
  );
}

export function createWorkspaceRun(
  workspaceId: string,
  input: Partial<WorkspaceRunRecord> & { title: string; recipe: string; status?: WorkspaceRunRecord['status']; resultPackage: ResultPackage },
): WorkspaceRunRecord {
  const store = getStore();
  const now = new Date().toISOString();
  const run: WorkspaceRunRecord = {
    id: randomUUID(),
    workspaceId,
    title: input.title,
    recipe: input.recipe,
    status: input.status ?? 'draft',
    currentStep: input.currentStep ?? 'drafting',
    phase: input.phase ?? normalizeRunPhase(input),
    dossier: input.dossier ?? null,
    approval: input.approval ?? null,
    artifactBundle: input.artifactBundle ?? null,
    artifacts: input.artifacts ?? [],
    citations: input.citations ?? [],
    resultPackage: input.resultPackage,
    checkpoints: input.checkpoints ?? [],
    sources: input.sources ?? [],
    execution: input.execution ?? {
      provider: 'fallback',
      model: 'fallback-recipe',
      mode: 'fallback',
    },
    activities: input.activities ?? normalizeActivities(input),
    createdAt: now,
    updatedAt: now,
  };

  store.runs.unshift(run);
  persistStore(store);
  return run;
}

export function listRunsForWorkspace(workspaceId: string): WorkspaceRunRecord[] {
  return getStore()
    .runs.filter((run) => run.workspaceId === workspaceId)
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function getWorkspaceRun(workspaceId: string, runId: string): WorkspaceRunRecord | undefined {
  return getStore().runs.find((run) => run.workspaceId === workspaceId && run.id === runId);
}

export function updateWorkspaceRun(
  workspaceId: string,
  runId: string,
  updates: Partial<WorkspaceRunRecord>,
): WorkspaceRunRecord | undefined {
  const store = getStore();
  const run = store.runs.find((item) => item.workspaceId === workspaceId && item.id === runId);

  if (!run) {
    return undefined;
  }

  Object.assign(run, updates, { updatedAt: new Date().toISOString() });
  persistStore(store);
  return run;
}

export function upsertProviderSetting(
  workspaceId: string,
  input: { provider: string; model: string; apiKey: string },
): ProviderSettingRecord {
  const store = getStore();
  const existing = store.providerSettings.find(
    (setting) => setting.workspaceId === workspaceId && setting.provider === input.provider,
  );
  const now = new Date().toISOString();

  if (existing) {
    existing.model = input.model;
    existing.apiKey = input.apiKey;
    existing.updatedAt = now;
    persistStore(store);
    return existing;
  }

  const setting: ProviderSettingRecord = {
    id: randomUUID(),
    workspaceId,
    provider: input.provider,
    model: input.model,
    apiKey: input.apiKey,
    createdAt: now,
    updatedAt: now,
  };

  store.providerSettings.unshift(setting);
  persistStore(store);
  return setting;
}

export function listProviderSettings(workspaceId: string): ProviderSettingRecord[] {
  return getStore()
    .providerSettings.filter((setting) => setting.workspaceId === workspaceId)
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
