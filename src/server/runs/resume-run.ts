import { transitionRunState } from '@/lib/runtime/run-machine';
import type { RunState } from '@/lib/runtime/types';

export function resumeRun(run: RunState): RunState {
  return transitionRunState(run, { type: 'request-approval' });
}
