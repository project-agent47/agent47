# Current workstate

- Baseline: PR #2 and #3 self-reviewed and merged in dependency order; master `656ee54`.
- Active branch: `feat/unified-decision-dock`, first increment of the approved Chinese decision-dock / split-workspace plan. Submit a PR; do not assume authorization to merge it.
- Implemented: batch askUser choices/custom answers, progress/review/skip/cancel, persistent question and chat drafts, digest-bound idempotent replies, fixed-bottom tool/artifact approvals and explicit scoped trust. Keep default project snapshots and safe tool-boundary queue semantics.
- DeepSeek integration: askUser schema must have an object root. Enforce legacy-versus-batch exclusivity in runtime validation; a root union was rejected by the actual provider.
- Verified: real Electron + DeepSeek multi-question answers and restart, cancel, scope-approved artifact batch, visible trusted conversation followed by actual Node/Shell and global revoke; original real desktop approval/restart/read/save/denial/stop regression passed.
- QA inventory: `docs/decision-dock-qa.md`; live harness: `scripts/e2e-decisions-live.mjs`. Use Node 22+, `xvfb-run` on headless Linux, approved opaque Vault transport for live tests.
- Next increment: HTML/Markdown/code split viewer and tab workspace, then webpage capabilities in that workspace. None is implemented in this branch.
- Limits: host execution has system-user rights, not an OS sandbox; snapshots do not cover Shell/JS or remote effects. No signed native release, Windows/macOS real-model acceptance, browser automation, scheduler/MCP/multi-agent engine, billing/prices or binary skill assets.
- Secrets: never commit or print credentials. Synthetic test materials only; real-model evidence must stay distinct from preview/smoke fixtures.
