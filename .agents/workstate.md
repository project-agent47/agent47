# Current workstate

- Master baseline bdff026: owner-authorized review/merge of PR #6 and #7 completed, final CI38132820000 Windows/macOS/Ubuntu/preview all success.
- Owner approved proposal A1. Active branch feat/conversation-materials; submit a PR, do not automatically merge this new increment.
- A1: stable first-turn conversation title, latest-run sidebar, run history and explicit latest dock; versioned material references from first prompt, native single-file picker and saved workspace text/artifacts.
- Bodies/pointers in main-owned checkpoints only. Model metadata only for sent versions, bounded readMaterial with immutable hash/byte validation, queue-bound versions, explicit source checks/refresh; selection/viewing is not model context and grants no parent directory.
- Old checkpoints migrate titles additively; completed runs never replay. Material snapshots and sent-message links persist across rounds/restarts; new-task unsubmitted tickets expire10min/restart. 1MB/version,10selected,5MB version archive cap.
- Validation: unit/preview and native fixture/live acceptance in docs/conversation-materials.md and scripts/e2e-materials-native.mjs. Keep current final results distinct from superseded attempts.
- Do not mix A2 (long task pause/resume/progress guards) or B (web wait/scoped reads) into A1. Existing12-step protection remains.
- Reference policy: workflow ONLY Pi.dev/Codex/OpenCode; desktop DeepSeek Harness Desktop repository unspecified. No new extensions/MCP/marketplace/providers or billing; DeepSeek-only with token usage stats.
- Existing browser tools/ephemeral grants, bottom decision dock, queue steering, skill versions, file snapshots and run undo remain. Dispatch is not business success; unknown effects never replay. Trusted host execution is OS-user rights, not sandbox; snapshots exclude host/remote actions.
- Real model evidence is Linux with --no-sandbox test harness only. Native Windows/macOS fixtures are not signing/install/secure-storage or real-model native acceptance.
- Never commit credentials, test databases, proxy tokens or private headers. Only synthetic materials and labeled evidence.
