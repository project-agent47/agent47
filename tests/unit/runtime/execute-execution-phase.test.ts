import { describe, expect, it, vi } from 'vitest';
import { createEmptyDossier } from '@/lib/runtime/dossier';
import { executeExecutionPhase } from '@/lib/runtime/execute-execution-phase';

describe('executeExecutionPhase', () => {
  it('executes each approved step and writes packaged artifacts', async () => {
    const dossier = createEmptyDossier('Find the best frontend roadmap', ['Use local tools only']);
    dossier.proposedExecutionPlan = [
      'Open the research candidate in the browser',
      'Capture the final report summary',
      'Write the packaged artifacts',
    ];
    dossier.findings = ['Roadmap summary', 'Brief'];

    const browserTool = {
      inspect: vi.fn(),
      execute: vi
        .fn()
        .mockResolvedValueOnce('Executed browser step: Open the research candidate in the browser')
        .mockResolvedValueOnce('Executed browser step: Capture the final report summary')
        .mockResolvedValueOnce('Executed browser step: Write the packaged artifacts'),
    };
    const fileWriterTool = {
      writeArtifacts: vi.fn().mockResolvedValue([
        {
          id: 'artifact-1',
          name: 'research-report.md',
          kind: 'markdown',
          content: '# Report',
        },
        {
          id: 'artifact-2',
          name: 'result.json',
          kind: 'json',
          content: '{"findings":["Roadmap summary","Brief"]}',
        },
      ]),
    };

    const result = await executeExecutionPhase({
      runId: 'run-1',
      dossier,
      browserTool,
      fileWriterTool,
    });

    expect(browserTool.execute).toHaveBeenNthCalledWith(1, 'Open the research candidate in the browser');
    expect(browserTool.execute).toHaveBeenNthCalledWith(2, 'Capture the final report summary');
    expect(browserTool.execute).toHaveBeenNthCalledWith(3, 'Write the packaged artifacts');
    expect(fileWriterTool.writeArtifacts).toHaveBeenCalledWith('run-1', [
      {
        name: 'research-report.md',
        kind: 'markdown',
        content: '# Report\n\nRoadmap summary\nBrief',
      },
      {
        name: 'result.json',
        kind: 'json',
        content: JSON.stringify({ findings: ['Roadmap summary', 'Brief'] }, null, 2),
      },
    ]);
    expect(result.executionLog).toEqual([
      'Executed browser step: Open the research candidate in the browser',
      'Executed browser step: Capture the final report summary',
      'Executed browser step: Write the packaged artifacts',
    ]);
    expect(result.artifacts).toHaveLength(2);
  });
});
