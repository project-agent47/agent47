import type { RunState } from './types';

export interface RuntimePolicy {
  requireApprovalBeforeCompletion: boolean;
}

export const defaultPolicy: RuntimePolicy = {
  requireApprovalBeforeCompletion: true,
};

export function shouldWaitForApproval(state: RunState, policy: RuntimePolicy = defaultPolicy) {
  return policy.requireApprovalBeforeCompletion && state.status === 'running';
}
