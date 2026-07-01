import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeResearchPhaseMock: vi.fn(),
  executeExecutionPhaseMock: vi.fn(),
  packageRunOutputMock: vi.fn(),
  createWorkspaceRunMock: vi.fn(),
  getWorkspaceRunMock: vi.fn(),
  updateWorkspaceRunMock: vi.fn(),
}));

vi.mock('@/lib/runtime/execute-research-phase', () => ({
  executeResearchPhase: mocks.executeResearchPhaseMock,
}));

vi.mock('@/lib/runtime/execute-execution-phase', () => ({
  executeExecutionPhase: mocks.executeExecutionPhaseMock,
}));

vi.mock('@/lib/runtime/package-run-output', () => ({
  packageRunOutput: mocks.packageRunOutputMock,
}));

vi.mock('@/lib/workspace-store', () => ({
  createWorkspaceRun: mocks.createWorkspaceRunMock,
  getWorkspaceRun: mocks.getWorkspaceRunMock,
  updateWorkspaceRun: mocks.updateWorkspaceRunMock,
  listRunsForWorkspace: vi.fn(() => []),
}));

import { createEmptyDossier } from '@/lib/runtime/dossier';
import { POST as createRunPOST } from '@/app/api/workspaces/[workspaceId]/runs/route';
import { POST as approveRunPOST } from '@/app/api/workspaces/[workspaceId]/runs/[runId]/approve/route';

const approvalLockRoot = path.join(process.cwd(), '.storage', 'approval-locks');

describe('run approval flow', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.PLAYWRIGHT_TEST = '1';
    await fsPromises.rm(approvalLockRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    delete process.env.PLAYWRIGHT_TEST;
    vi.restoreAllMocks();
    await fsPromises.rm(approvalLockRoot, { recursive: true, force: true });
  });

  it('creates a researched run that waits for approval', async () => {
    const dossier = createEmptyDossier('Find the best frontend roadmap', ['Use local tools only']);
    dossier.findings = ['Roadmap summary', 'Brief'];

    mocks.executeResearchPhaseMock.mockResolvedValue({
      dossier,
      activities: [
        {
          id: 'search',
          title: 'Search session created',
          detail: 'Find the best frontend roadmap',
          kind: 'provider',
          status: 'completed',
        },
        {
          id: 'dossier',
          title: 'Research dossier created',
          detail: 'Research is ready for approval.',
          kind: 'reasoning',
          status: 'completed',
        },
      ],
    });
    mocks.packageRunOutputMock.mockReturnValue({
      resultPackage: {
        summary: 'Research dossier ready for approval.',
        recommendation: 'Approve execution.',
        citations: [],
        attachments: [],
        nextActions: ['Approve execution'],
        confidence: 0.8,
        openQuestions: [],
      },
      artifactBundle: {
        reportArtifactId: null,
        generatedFileIds: [],
        executionLog: [],
      },
    });
    mocks.createWorkspaceRunMock.mockReturnValue({ id: 'run-1' });

    const response = await createRunPOST(
      new Request('http://localhost/api/workspaces/workspace-1/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Plan a frontend learning path',
          recipe: 'learning-path',
          goal: 'Find the best frontend roadmap',
          experience: 'beginner',
          constraints: 'Use local tools only',
        }),
      }),
      { params: Promise.resolve({ workspaceId: 'workspace-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.createWorkspaceRunMock).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({
        status: 'awaiting_approval',
        currentStep: 'reviewing',
        phase: 'approval',
        dossier,
        approval: expect.objectContaining({ status: 'pending' }),
        artifactBundle: null,
        activities: [
          expect.objectContaining({
            kind: 'intake',
            title: 'Intake captured',
          }),
          ...[
            {
              id: 'search',
              title: 'Search session created',
              detail: 'Find the best frontend roadmap',
              kind: 'provider',
              status: 'completed',
            },
            {
              id: 'dossier',
              title: 'Research dossier created',
              detail: 'Research is ready for approval.',
              kind: 'reasoning',
              status: 'completed',
            },
          ],
        ],
      }),
    );
  });

  it('executes an approved run and packages the output', async () => {
    const dossier = createEmptyDossier('Find the best frontend roadmap', ['Use local tools only']);
    dossier.proposedExecutionPlan = ['Review dossier', 'Approve execution', 'Write report'];
    dossier.findings = ['Roadmap summary', 'Brief'];
    const researchActivities = [
      {
        id: 'search',
        title: 'Search session created',
        detail: 'Find the best frontend roadmap',
        kind: 'provider',
        status: 'completed',
      },
      {
        id: 'dossier',
        title: 'Research dossier created',
        detail: 'Research is ready for approval.',
        kind: 'reasoning',
        status: 'completed',
      },
    ] as const;

    const existingRun = {
      id: 'run-1',
      workspaceId: 'workspace-1',
      title: 'Plan a frontend learning path',
      recipe: 'learning-path',
      status: 'awaiting_approval',
      currentStep: 'reviewing',
      phase: 'approval',
      dossier,
      approval: { status: 'pending', summary: 'Research dossier ready for approval.' },
      artifactBundle: null,
      artifacts: [],
      citations: [],
      resultPackage: {
        summary: 'Research dossier ready for approval.',
        recommendation: 'Approve execution.',
        citations: [],
        attachments: [],
        nextActions: ['Approve execution'],
        confidence: 0.8,
        openQuestions: [],
      },
      checkpoints: ['Search session created', 'Research dossier created'],
      sources: ['Find the best frontend roadmap'],
      execution: {
        provider: 'fallback',
        model: 'fallback-recipe',
        mode: 'fallback',
      },
      activities: [...researchActivities],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mocks.executeExecutionPhaseMock.mockResolvedValue({
      artifacts: [
        { id: 'artifact-1', name: 'research-report.md', kind: 'markdown', content: '# Report' },
        { id: 'artifact-2', name: 'result.json', kind: 'json', content: '{"findings":[]}' },
      ],
      executionLog: ['Executed browser step: Review dossier'],
    });
    mocks.packageRunOutputMock.mockReturnValue({
      resultPackage: {
        summary: 'Execution finished.',
        recommendation: 'Review the packaged report.',
        citations: [],
        attachments: [],
        nextActions: ['Review the packaged report'],
        confidence: 0.95,
        openQuestions: [],
      },
      artifactBundle: {
        reportArtifactId: 'artifact-1',
        generatedFileIds: ['artifact-1', 'artifact-2'],
        executionLog: ['Executed browser step: Review dossier'],
      },
    });
    mocks.getWorkspaceRunMock.mockReturnValue(existingRun);
    mocks.updateWorkspaceRunMock.mockImplementation((_workspaceId, _runId, updates) => {
      Object.assign(existingRun, updates, { updatedAt: new Date().toISOString() });
      return existingRun;
    });

    const response = await approveRunPOST(
      new Request('http://localhost/api/workspaces/workspace-1/runs/run-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      }),
      { params: Promise.resolve({ workspaceId: 'workspace-1', runId: 'run-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.executeExecutionPhaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        dossier,
      }),
    );
    expect(mocks.updateWorkspaceRunMock).toHaveBeenNthCalledWith(
      1,
      'workspace-1',
      'run-1',
      expect.objectContaining({
        status: 'running',
        currentStep: 'executing',
        phase: 'execution',
        approval: expect.objectContaining({ status: 'approved' }),
      }),
    );
    expect(mocks.updateWorkspaceRunMock).toHaveBeenNthCalledWith(
      2,
      'workspace-1',
      'run-1',
      expect.objectContaining({
        status: 'completed',
        currentStep: 'packaged',
        phase: 'package',
        approval: expect.objectContaining({ status: 'approved' }),
        artifactBundle: expect.objectContaining({ reportArtifactId: 'artifact-1' }),
          activities: expect.arrayContaining([
            ...researchActivities,
          expect.objectContaining({
            id: 'run-1-execution',
            title: 'Execution completed',
            kind: 'provider',
            status: 'completed',
          }),
          expect.objectContaining({
            id: 'run-1-package',
            title: 'Execution packaged',
            kind: 'artifact',
            status: 'completed',
          }),
          ]),
      }),
    );
  });

  it('marks the run failed when execution throws after the run is claimed', async () => {
    const dossier = createEmptyDossier('Find the best frontend roadmap', ['Use local tools only']);
    dossier.proposedExecutionPlan = ['Review dossier', 'Approve execution', 'Write report'];
    dossier.findings = ['Roadmap summary', 'Brief'];

    const existingRun = {
      id: 'run-1',
      workspaceId: 'workspace-1',
      title: 'Plan a frontend learning path',
      recipe: 'learning-path',
      status: 'awaiting_approval',
      currentStep: 'reviewing',
      phase: 'approval',
      dossier,
      approval: { status: 'pending', summary: 'Research dossier ready for approval.' },
      artifactBundle: null,
      artifacts: [],
      citations: [],
      resultPackage: {
        summary: 'Research dossier ready for approval.',
        recommendation: 'Approve execution.',
        citations: [],
        attachments: [],
        nextActions: ['Approve execution'],
        confidence: 0.8,
        openQuestions: [],
      },
      checkpoints: ['Search session created', 'Research dossier created'],
      sources: ['Find the best frontend roadmap'],
      execution: {
        provider: 'fallback',
        model: 'fallback-recipe',
        mode: 'fallback',
      },
      activities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mocks.getWorkspaceRunMock.mockReturnValue(existingRun);
    mocks.updateWorkspaceRunMock.mockImplementation((_workspaceId, _runId, updates) => {
      Object.assign(existingRun, updates, { updatedAt: new Date().toISOString() });
      return existingRun;
    });
    mocks.executeExecutionPhaseMock.mockRejectedValue(new Error('execution boom'));

    const response = await approveRunPOST(
      new Request('http://localhost/api/workspaces/workspace-1/runs/run-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      }),
      { params: Promise.resolve({ workspaceId: 'workspace-1', runId: 'run-1' }) },
    );

    expect(response.status).toBe(500);
    expect(mocks.updateWorkspaceRunMock).toHaveBeenNthCalledWith(
      1,
      'workspace-1',
      'run-1',
      expect.objectContaining({
        status: 'running',
        currentStep: 'executing',
        phase: 'execution',
        approval: expect.objectContaining({ status: 'approved' }),
      }),
    );
    expect(mocks.updateWorkspaceRunMock).toHaveBeenNthCalledWith(
      2,
      'workspace-1',
      'run-1',
      expect.objectContaining({
        status: 'failed',
        currentStep: 'failed',
        phase: 'failed',
        checkpoints: ['Search session created', 'Research dossier created', 'Execution failed'],
      }),
    );

    const body = (await response.json()) as { error: string; run: { status: string; currentStep: string; phase: string } };
    expect(body.error).toBe('Run execution failed.');
    expect(body.run).toMatchObject({ status: 'failed', currentStep: 'failed', phase: 'failed' });
    expect(mocks.packageRunOutputMock).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'missing approved value', body: {} },
    { label: 'non-boolean approved value', body: { approved: 'true' } },
  ])('rejects $label before execution starts', async ({ body }) => {
    const dossier = createEmptyDossier('Find the best frontend roadmap', ['Use local tools only']);
    const existingRun = {
      id: 'run-1',
      workspaceId: 'workspace-1',
      title: 'Plan a frontend learning path',
      recipe: 'learning-path',
      status: 'awaiting_approval',
      currentStep: 'reviewing',
      phase: 'approval',
      dossier,
      approval: { status: 'pending', summary: 'Research dossier ready for approval.' },
      artifactBundle: null,
      artifacts: [],
      citations: [],
      resultPackage: {
        summary: 'Research dossier ready for approval.',
        recommendation: 'Approve execution.',
        citations: [],
        attachments: [],
        nextActions: ['Approve execution'],
        confidence: 0.8,
        openQuestions: [],
      },
      checkpoints: ['Search session created', 'Research dossier created'],
      sources: ['Find the best frontend roadmap'],
      execution: {
        provider: 'fallback',
        model: 'fallback-recipe',
        mode: 'fallback',
      },
      activities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mocks.getWorkspaceRunMock.mockReturnValue(existingRun);

    const response = await approveRunPOST(
      new Request('http://localhost/api/workspaces/workspace-1/runs/run-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ workspaceId: 'workspace-1', runId: 'run-1' }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.executeExecutionPhaseMock).not.toHaveBeenCalled();
    expect(mocks.updateWorkspaceRunMock).not.toHaveBeenCalled();
  });

  it('claims execution before side effects so duplicate approvals are rejected', async () => {
    const dossier = createEmptyDossier('Find the best frontend roadmap', ['Use local tools only']);
    dossier.proposedExecutionPlan = ['Review dossier', 'Approve execution', 'Write report'];
    dossier.findings = ['Roadmap summary', 'Brief'];

    const existingRun = {
      id: 'run-1',
      workspaceId: 'workspace-1',
      title: 'Plan a frontend learning path',
      recipe: 'learning-path',
      status: 'awaiting_approval',
      currentStep: 'reviewing',
      phase: 'approval',
      dossier,
      approval: { status: 'pending', summary: 'Research dossier ready for approval.' },
      artifactBundle: null,
      artifacts: [],
      citations: [],
      resultPackage: {
        summary: 'Research dossier ready for approval.',
        recommendation: 'Approve execution.',
        citations: [],
        attachments: [],
        nextActions: ['Approve execution'],
        confidence: 0.8,
        openQuestions: [],
      },
      checkpoints: ['Search session created', 'Research dossier created'],
      sources: ['Find the best frontend roadmap'],
      execution: {
        provider: 'fallback',
        model: 'fallback-recipe',
        mode: 'fallback',
      },
      activities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let resolveExecution: ((value: { artifacts: Array<{ id: string; name: string; kind: 'markdown' | 'json' | 'text'; content: string }>; executionLog: string[] }) => void) | undefined;
    const executionPromise = new Promise<{ artifacts: Array<{ id: string; name: string; kind: 'markdown' | 'json' | 'text'; content: string }>; executionLog: string[] }>((resolve) => {
      resolveExecution = resolve;
    });

    mocks.getWorkspaceRunMock.mockImplementation(() => existingRun);
    mocks.updateWorkspaceRunMock.mockImplementation((_workspaceId, _runId, updates) => {
      Object.assign(existingRun, updates, { updatedAt: new Date().toISOString() });
      return existingRun;
    });
    mocks.executeExecutionPhaseMock.mockReturnValue(executionPromise);
    mocks.packageRunOutputMock.mockReturnValue({
      resultPackage: {
        summary: 'Execution finished.',
        recommendation: 'Review the packaged report.',
        citations: [],
        attachments: [],
        nextActions: ['Review the packaged report'],
        confidence: 0.95,
        openQuestions: [],
      },
      artifactBundle: {
        reportArtifactId: 'artifact-1',
        generatedFileIds: ['artifact-1', 'artifact-2'],
        executionLog: ['Executed browser step: Review dossier'],
      },
    });

    let resolveApprovalBody: (() => void) | undefined;
    const approvalBodyGate = new Promise<void>((resolve) => {
      resolveApprovalBody = resolve;
    });

    const firstRequest = {
      async json() {
        await approvalBodyGate;
        return { approved: true };
      },
    } as unknown as Request;

    const firstApproval = approveRunPOST(
      firstRequest,
      { params: Promise.resolve({ workspaceId: 'workspace-1', runId: 'run-1' }) },
    );

    const duplicateResponse = await approveRunPOST(
      new Request('http://localhost/api/workspaces/workspace-1/runs/run-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      }),
      { params: Promise.resolve({ workspaceId: 'workspace-1', runId: 'run-1' }) },
    );

    expect(duplicateResponse.status).toBe(409);

    resolveApprovalBody?.();
    resolveExecution?.({
      artifacts: [
        { id: 'artifact-1', name: 'research-report.md', kind: 'markdown', content: '# Report' },
        { id: 'artifact-2', name: 'result.json', kind: 'json', content: '{"findings":[]}' },
      ],
      executionLog: ['Executed browser step: Review dossier'],
    });

    await firstApproval;

    expect(mocks.updateWorkspaceRunMock).toHaveBeenCalledWith(
      'workspace-1',
      'run-1',
      expect.objectContaining({
        status: 'running',
        currentStep: 'executing',
        phase: 'execution',
        approval: expect.objectContaining({ status: 'approved' }),
      }),
    );
    expect(mocks.executeExecutionPhaseMock).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight approval marker when lock acquisition throws', async () => {
    const lockCollisionPath = path.join(approvalLockRoot, 'workspace-1');
    await fsPromises.mkdir(approvalLockRoot, { recursive: true });
    await fsPromises.writeFile(lockCollisionPath, 'collision');

    const firstApproval = approveRunPOST(
      new Request('http://localhost/api/workspaces/workspace-1/runs/run-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      }),
      { params: Promise.resolve({ workspaceId: 'workspace-1', runId: 'run-1' }) },
    );

    await expect(firstApproval).rejects.toThrow();

    await fsPromises.rm(lockCollisionPath, { force: true });

    const secondResponse = await approveRunPOST(
      new Request('http://localhost/api/workspaces/workspace-1/runs/run-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      }),
      { params: Promise.resolve({ workspaceId: 'workspace-1', runId: 'run-1' }) },
    );
    expect(secondResponse.status).toBe(404);
    expect(secondResponse.status).toBe(404);
  });
});
