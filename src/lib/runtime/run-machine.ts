import type { RunState, RunStatus } from './types';

export interface RunEvent {
  type: 'start' | 'request-approval' | 'approve' | 'reject' | 'complete' | 'fail';
}

export function createRunState(id: string, title: string): RunState {
  return {
    id,
    title,
    status: 'draft',
    currentStep: 'drafting',
    artifacts: [],
    citations: [],
  };
}

export function transitionRunState(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case 'start':
      return { ...state, status: 'running', currentStep: 'collecting-context' };
    case 'request-approval':
      return { ...state, status: 'awaiting_approval', currentStep: 'review' };
    case 'approve':
      return { ...state, status: 'completed', currentStep: 'done' };
    case 'reject':
      return { ...state, status: 'draft', currentStep: 'revising' };
    case 'complete':
      return { ...state, status: 'completed', currentStep: 'done' };
    case 'fail':
      return { ...state, status: 'failed', currentStep: 'failed' };
    default:
      return state;
  }
}

export function nextStatusFor(state: RunState): RunStatus {
  if (state.status === 'draft') {
    return 'running';
  }

  return state.status;
}
