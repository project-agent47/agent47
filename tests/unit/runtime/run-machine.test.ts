import { describe, expect, it } from 'vitest';
import { createRunState, transitionRunState } from '@/lib/runtime/run-machine';

describe('run machine', () => {
  it('moves a run through research, approval, execution, and packaging', () => {
    const run = createRunState('run-1', 'Build a learning path');

    expect(run.currentPhase).toBe('intake');

    const research = transitionRunState(run, { type: 'start-research' });
    const approval = transitionRunState(research, { type: 'complete-research' });
    const execution = transitionRunState(approval, { type: 'approve' });
    const packaged = transitionRunState(execution, { type: 'complete-execution' });

    expect(research.currentPhase).toBe('research');
    expect(research.status).toBe('running');
    expect(approval.currentPhase).toBe('approval');
    expect(approval.status).toBe('awaiting_approval');
    expect(execution.currentPhase).toBe('execution');
    expect(execution.status).toBe('running');
    expect(packaged.currentPhase).toBe('package');
    expect(packaged.status).toBe('completed');
  });
});
