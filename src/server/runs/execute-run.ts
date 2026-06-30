import { transitionRunState } from '@/lib/runtime/run-machine';
import type { RunState } from '@/lib/runtime/types';

export interface ExecuteRunInput {
  run: RunState;
  action: 'start' | 'request-approval' | 'approve' | 'reject' | 'complete' | 'fail';
}

export function executeRun(input: ExecuteRunInput): RunState {
  return transitionRunState(input.run, { type: input.action });
}
