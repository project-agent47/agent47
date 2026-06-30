import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ResultPackage } from '@/lib/runtime/types';

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
  status: 'draft' | 'running' | 'awaiting_approval' | 'completed' | 'failed';
  currentStep: string;
  artifacts: Array<{ id: string; name: string; content: string; kind: 'markdown' | 'json' | 'text' }>;
  citations: Array<{ source: string; title: string; url?: string }>;
  resultPackage: ResultPackage;
  checkpoints: string[];
  sources: string[];
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
        id: 'workspace-demo',
        name: 'Demo Workspace',
        slug: 'demo-workspace',
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

function normalizeStore(store: Partial<DecisionWorkspaceStore> | undefined): DecisionWorkspaceStore {
  const defaultStore = createDefaultStore();
  return {
    workspaces: Array.isArray(store?.workspaces) ? store?.workspaces ?? [] : defaultStore.workspaces,
    runs: Array.isArray(store?.runs) ? store?.runs ?? [] : defaultStore.runs,
    providerSettings: Array.isArray(store?.providerSettings) ? store?.providerSettings ?? [] : defaultStore.providerSettings,
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
    return normalizeStore(parsed);
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
  if (!globalStore.__decisionWorkspaceStore) {
    const filePath = getStoreFilePath();
    globalStore.__decisionWorkspaceStore = readStoreFromDisk(filePath);
    globalStore.__decisionWorkspaceStoreFile = filePath;
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
    artifacts: input.artifacts ?? [],
    citations: input.citations ?? [],
    resultPackage: input.resultPackage,
    checkpoints: input.checkpoints ?? [],
    sources: input.sources ?? [],
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
