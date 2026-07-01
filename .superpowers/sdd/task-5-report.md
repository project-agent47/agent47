Task 5 report

- Smoke flow kept in `tests/e2e/learning-path-flow.spec.ts`.
- Added lifecycle coverage in the same file for research → approval → execution → artifact output.
- Fixed `playwright.config.ts` so the Playwright webServer exports both `PLAYWRIGHT_TEST=1` and `DECISION_WORKSPACE_STORE_FILE=.storage/playwright-store.json` as required by the brief.
- Verification:
  - `npm run test:e2e -- tests/e2e/learning-path-flow.spec.ts`
  - `CI=1 npm test`
  - `npm run test:e2e -- tests/e2e/learning-path-flow.spec.ts` ✅
