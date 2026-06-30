import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkspace, createWorkspaceRun, getWorkspaceRun, listRunsForWorkspace } from '@/lib/workspace-store';

afterEach(() => {
  delete process.env.DECISION_WORKSPACE_STORE_FILE;
  const store = globalThis as typeof globalThis & {
    __decisionWorkspaceStore?: unknown;
    __decisionWorkspaceStoreFile?: string;
  };
  delete store.__decisionWorkspaceStore;
  delete store.__decisionWorkspaceStoreFile;
  rmSync(join(process.cwd(), '.storage', 'task-1-tests'), { recursive: true, force: true });
  vi.resetModules();
});

describe('workspace store', () => {
  it('creates a workspace and a run for that workspace', () => {
    const storeDir = join(process.cwd(), '.storage', 'task-1-tests', randomUUID());
    const storeFile = join(storeDir, 'workspace-store.json');
    mkdirSync(storeDir, { recursive: true });
    process.env.DECISION_WORKSPACE_STORE_FILE = storeFile;

    const workspace = createWorkspace({ name: 'Research', slug: 'research' });
    const run = createWorkspaceRun(workspace.id, {
      title: 'Learn React',
      recipe: 'learning-path',
      status: 'draft',
      phase: 'research',
      dossier: {
        goal: 'Learn React',
        constraints: ['No external SaaS'],
        searchSessions: [],
        pageNotes: [],
        documentNotes: [],
        findings: [],
        proposedExecutionPlan: [],
        openRisks: [],
      },
      approval: {
        status: 'pending',
        summary: 'Research is ready for review.',
      },
      artifactBundle: null,
      resultPackage: {
        summary: 'A frontend learning path',
        recommendation: 'Start with React fundamentals',
        citations: [],
        attachments: [],
        nextActions: ['Ship one mini project'],
        confidence: 0.8,
        openQuestions: [],
      },
    });

    expect(run.workspaceId).toBe(workspace.id);
    expect(getWorkspaceRun(workspace.id, run.id)).toBeDefined();
    expect(listRunsForWorkspace(workspace.id)).toHaveLength(1);
    expect(getWorkspaceRun(workspace.id, run.id)?.phase).toBe('research');
    expect(getWorkspaceRun(workspace.id, run.id)?.dossier?.goal).toBe('Learn React');
    expect(getWorkspaceRun(workspace.id, run.id)?.approval?.status).toBe('pending');
  });

  it('migrates the legacy demo workspace to a clean primary workspace', async () => {
    const dir = join(process.cwd(), '.storage', 'task-1-tests', randomUUID());
    const file = join(dir, 'workspace-store.json');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({
        workspaces: [
          {
            id: 'workspace-demo',
            name: 'Demo Workspace',
            slug: 'demo-workspace',
            createdAt: '2026-06-30T00:00:00.000Z',
            updatedAt: '2026-06-30T00:00:00.000Z',
          },
        ],
        runs: [
          {
            id: 'run-1',
            workspaceId: 'workspace-demo',
            title: 'Plan my frontend growth',
            recipe: 'learning-path',
            status: 'completed',
            currentStep: 'done',
            artifacts: [],
            citations: [],
            resultPackage: {
              summary: 'old',
              recommendation: 'old',
              citations: [],
              attachments: [],
              nextActions: ['old'],
              confidence: 0.5,
              openQuestions: [],
            },
            checkpoints: ['Fallback recipe used'],
            sources: ['old'],
            createdAt: '2026-06-30T00:00:00.000Z',
            updatedAt: '2026-06-30T00:00:00.000Z',
          },
        ],
        providerSettings: [],
      }),
    );
    process.env.DECISION_WORKSPACE_STORE_FILE = file;

    const store = await import('@/lib/workspace-store');
    const workspaces = store.listWorkspaces();

    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]?.name).toBe('Workspace');
    expect(workspaces[0]?.slug).toBe('workspace');
    expect(store.listRunsForWorkspace(workspaces[0]!.id)).toHaveLength(0);
  });
});
