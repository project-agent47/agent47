import type { RunState, RunStatus } from './types';

export interface RunEvent {
  type:
    | 'start'
    | 'start-research'
    | 'request-approval'
    | 'complete-research'
    | 'approve'
    | 'reject'
    | 'complete'
    | 'complete-execution'
    | 'fail';
}

export function createRunState(id: string, title: string): RunState {
  return {
    id,
    title,
    status: 'draft',
    currentStep: 'drafting',
    currentPhase: 'intake',
    artifacts: [],
    citations: [],
    dossier: null,
    approval: null,
    artifactBundle: null,
  };
}

export function transitionRunState(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case 'start':
    case 'start-research':
      return {
        ...state,
        status: 'running',
        currentStep: 'collecting-context',
        currentPhase: 'research',
      };
    case 'request-approval':
    case 'complete-research':
      return {
        ...state,
        status: 'awaiting_approval',
        currentStep: 'review',
        currentPhase: 'approval',
      };
    case 'approve':
      return {
        ...state,
        status: 'running',
        currentStep: 'executing',
        currentPhase: 'execution',
      };
    case 'reject':
      return {
        ...state,
        status: 'draft',
        currentStep: 'revising',
        currentPhase: 'intake',
      };
    case 'complete':
    case 'complete-execution':
      return {
        ...state,
        status: 'completed',
        currentStep: 'packaged',
        currentPhase: 'package',
      };
    case 'fail':
      return {
        ...state,
        status: 'failed',
        currentStep: 'failed',
        currentPhase: 'failed',
      };
    default:
      return state;
  }
}

export function nextStatusFor(state: RunState): RunStatus {
  if (state.status === 'draft' || state.currentPhase === 'intake') {
    return 'running';
  }

  return state.status;
}
