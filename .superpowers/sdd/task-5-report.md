Task 5 report

- Smoke flow kept in `tests/e2e/learning-path-flow.spec.ts`.
- Added lifecycle coverage in the same file for research → approval → execution → artifact output.
- Fixed `playwright.config.ts` so the Playwright webServer exports both `PLAYWRIGHT_TEST=1` and `DECISION_WORKSPACE_STORE_FILE=.storage/playwright-store.json` as required by the brief.
- Verification:
  - `npm run test:e2e -- tests/e2e/learning-path-flow.spec.ts`
  - `CI=1 npm test`
  - `npm run test:e2e -- tests/e2e/learning-path-flow.spec.ts` ✅
- Compliance-gap follow-up:
  - Added a real `Approve execution` control to the workbench inspector for runs waiting on approval.
  - Wired the control through `WorkbenchShell` to `POST /api/workspaces/[workspaceId]/runs/[runId]/approve` and replaced the selected run in local workbench state from the response.
  - Expanded the inspector to surface result-package recommendation and attachment names so the packaged output is visible in the UI after approval.
  - Updated the e2e approval flow to click the visible button, wait for the approval request, and assert the packaged summary/recommendation plus `research-report.md` in the inspector.
  - Added a focused unit test that proves the approval button calls the route and refreshes the visible packaged result.
- Follow-up verification:
  - `npm run test:unit -- tests/unit/workspaces/workbench-shell.test.tsx --run` ✅
  - `npm run test:e2e -- tests/e2e/learning-path-flow.spec.ts` ✅
