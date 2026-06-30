import { describe, expect, it } from 'vitest';
import {
  createWorkspace,
  createWorkspaceRun,
  getWorkspaceRun,
  listRunsForWorkspace,
} from '@/lib/workspace-store';

describe('workspace store', () => {
  it('creates a workspace and a run for that workspace', () => {
    const workspace = createWorkspace({ name: 'Research', slug: 'research' });
    const run = createWorkspaceRun(workspace.id, {
      title: 'Learn React',
      recipe: 'learning-path',
      status: 'draft',
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
  });
});
