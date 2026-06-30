import { describe, expect, it, vi } from 'vitest';
import { executeResearchPhase } from '@/lib/runtime/execute-research-phase';

describe('executeResearchPhase', () => {
  it('builds a dossier before execution starts', async () => {
    const searchTool = {
      run: vi.fn().mockResolvedValue({
        query: 'Find the best frontend roadmap',
        candidates: [{ title: 'A', url: 'https://a.test' }],
        opened: ['https://a.test'],
        discarded: [],
      }),
    };
    const browserTool = {
      inspect: vi.fn().mockResolvedValue({
        url: 'https://a.test',
        title: 'A',
        summary: 'Roadmap summary',
        citations: ['Roadmap summary'],
      }),
      execute: vi.fn(),
    };
    const documentTool = {
      read: vi.fn().mockResolvedValue({
        name: 'brief.md',
        summary: 'Brief',
        keyPassages: ['Brief'],
        citations: ['Brief'],
      }),
    };

    const result = await executeResearchPhase({
      goal: 'Find the best frontend roadmap',
      constraints: ['Use local tools only'],
      searchTool,
      browserTool,
      documentTool,
    });

    expect(searchTool.run).toHaveBeenCalledWith('Find the best frontend roadmap');
    expect(browserTool.inspect).toHaveBeenCalledWith('https://a.test');
    expect(documentTool.read).toHaveBeenCalledWith('brief.md');
    expect(result.dossier.goal).toBe('Find the best frontend roadmap');
    expect(result.dossier.findings).toEqual(['Roadmap summary', 'Brief']);
    expect(result.dossier.proposedExecutionPlan).toEqual([
      'Open the research candidate in the browser',
      'Capture the final report summary',
      'Write the packaged artifacts',
    ]);
    expect(result.activities.map((activity) => activity.title)).toEqual([
      'Search session created',
      'Research dossier created',
    ]);
  });
});
