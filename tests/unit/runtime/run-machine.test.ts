import { describe, expect, it } from 'vitest';
import { buildResultPackage } from '@/lib/runtime/result-package';
import { createRunState, transitionRunState } from '@/lib/runtime/run-machine';

describe('run machine', () => {
  it('moves a draft run into a running state', () => {
    const run = createRunState('run-1', 'Build a learning path');

    const next = transitionRunState(run, { type: 'start' });

    expect(next.status).toBe('running');
    expect(next.currentStep).toBe('collecting-context');
  });

  it('requests approval before the result can be finalized', () => {
    const run = createRunState('run-2', 'Compare two learning options');
    const started = transitionRunState(run, { type: 'start' });
    const paused = transitionRunState(started, { type: 'request-approval' });

    expect(paused.status).toBe('awaiting_approval');
    expect(paused.currentStep).toBe('review');
  });

  it('builds a structured result package with defaults', () => {
    const pkg = buildResultPackage({
      summary: 'The best option is a bootcamp.',
      recommendation: 'Choose the bootcamp.',
      citations: [{ source: 'Coursera', title: 'Learning Path Overview' }],
    });

    expect(pkg.summary).toBe('The best option is a bootcamp.');
    expect(pkg.nextActions).toEqual(['Review the recommendation with the user']);
    expect(pkg.openQuestions).toEqual([]);
    expect(pkg.confidence).toBe(0.7);
  });
});
