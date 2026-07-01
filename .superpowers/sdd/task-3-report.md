# Task 3 Report

## Summary
Implemented the research -> approval -> execution -> package runtime flow.

## What changed
- Added `executeResearchPhase` to build a dossier from search, browser, and document tools.
- Added `executeExecutionPhase` to execute approved plan steps and write artifacts.
- Added `packageRunOutput` to turn dossier + execution output into a result package and artifact bundle.
- Reworked `POST /api/workspaces/[workspaceId]/runs` to create an awaiting-approval run with a dossier.
- Added `POST /api/workspaces/[workspaceId]/runs/[runId]/approve` to execute an approved run and persist the packaged output.
- Kept `provider-execution.ts` as provider/model reasoning support for the existing provider-backed flow.

## Verification
Focused Task 3 unit tests passed:
- `tests/unit/runtime/execute-research-phase.test.ts`
- `tests/unit/runtime/execute-execution-phase.test.ts`
- `tests/unit/server/approve-run.test.ts`

## Notes
- Route tests use deterministic mocks and avoid real browser execution.
- The new runtime flow stores the dossier, approval state, artifacts, result package, and artifact bundle on the workspace run.

## Fix
- Rejected any approval payload where `approved !== true` before starting execution.
- Claimed the run by persisting the `awaiting_approval -> running` transition before execution side effects.
- Added focused tests for missing approval input and duplicate/concurrent approval handling.

## Verification
- `npm run test:unit -- --run tests/unit/server/approve-run.test.ts`
- `npm run test:unit -- --run tests/unit/runtime/execute-research-phase.test.ts tests/unit/runtime/execute-execution-phase.test.ts tests/unit/server/approve-run.test.ts`

All focused Task 3 tests passed.

## Follow-up fix
- Added minimal failure handling in `POST /api/workspaces/[workspaceId]/runs/[runId]/approve` so execution or packaging errors transition the claimed run into `failed` instead of leaving it stuck in `running/approved`.
- Preserved the dossier and approval state, and appended a failure checkpoint/activity so the run remains reviewable.

## Verification
- `npm run test:unit -- --run tests/unit/server/approve-run.test.ts`
- `npm run test:unit -- --run tests/unit/runtime/execute-research-phase.test.ts tests/unit/runtime/execute-execution-phase.test.ts tests/unit/server/approve-run.test.ts`

Focused Task 3 unit tests passed: 3 files, 8 tests.

## Latest fix
- Command: `npm run test:unit -- --run tests/unit/server/approve-run.test.ts`
- Command: `npm run test:unit -- --run tests/unit/runtime/execute-research-phase.test.ts tests/unit/runtime/execute-execution-phase.test.ts tests/unit/server/approve-run.test.ts`
- Summary: success approval now persists execution and packaging activities on the run, and all focused Task 3 tests pass.

## Review follow-up
- Command: `npm run test:unit -- --run tests/unit/runtime/execute-research-phase.test.ts tests/unit/runtime/execute-execution-phase.test.ts tests/unit/server/approve-run.test.ts`
- Summary: initial runs now stay provisional with `artifactBundle: null`, and approval uses an in-process lock so concurrent approvals for the same run do not both execute.

## Final cleanup
- Command: `npm run test:unit -- --run tests/unit/runtime/execute-research-phase.test.ts tests/unit/runtime/execute-execution-phase.test.ts tests/unit/server/approve-run.test.ts`
- Summary: execution plans now contain only post-approval actions, initial runs keep provisional result data with `artifactBundle: null`, approval uses a filesystem lock for duplicate protection, and all focused Task 3 tests pass cleanly.
- Note: `npx tsc --noEmit --pretty false` now only reports a pre-existing type error in `src/app/api/workspaces/[workspaceId]/runs/[runId]/resume/route.ts`, which is outside Task 3 scope.
- Final reviewer nits addressed: approval locks now use encoded workspace/run path segments, and pre-approval result-package next actions now stay at the review/approval layer instead of exposing execution steps.

## Traceability fix
- Stored research search session candidates as `title (url)` strings instead of titles alone so the dossier keeps a direct URL trace for each candidate.
- Added a focused assertion in `tests/unit/runtime/execute-research-phase.test.ts` to verify the stored candidate entry includes the URL.

## Verification
- `npm run test:unit -- --run tests/unit/runtime/execute-research-phase.test.ts`
