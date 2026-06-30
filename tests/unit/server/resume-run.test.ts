import { describe, expect, it } from 'vitest';
import { resumeRun } from '@/server/runs/resume-run';
import { exportResultPackage } from '@/server/runs/export-result-package';
import { createRunState } from '@/lib/runtime/run-machine';

describe('resume and export', () => {
  it('moves a run into awaiting approval when resumed', () => {
    const run = createRunState('run-1', 'Plan a career shift');
    const resumed = resumeRun(run);

    expect(resumed.status).toBe('awaiting_approval');
  });

  it('exports a markdown package with the summary and next actions', () => {
    const markdown = exportResultPackage({
      summary: 'A clear plan exists.',
      recommendation: 'Take the bootcamp path.',
      citations: [],
      attachments: [],
      nextActions: ['Ship a portfolio project'],
      confidence: 0.8,
      openQuestions: [],
    });

    expect(markdown).toContain('## Summary');
    expect(markdown).toContain('Ship a portfolio project');
  });
});
