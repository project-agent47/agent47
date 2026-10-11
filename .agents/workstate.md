# Current workstate

- Focus: tools/skills-first increment; bills, prices and budget-management products removed from scope by the owner.
- Baseline: self-reviewed PR #1 merged into master `594e6e4`; final head `331434d` passed all four cross-platform/preview checks.
- Branch: `feat/compact-workbench-queue-skills`, stacked on PR #2 (`fff93ec`), not merged to master.
- Implementation: all conversation/tools/skills features plus simplified project authorization, automatic write-before snapshots, nested write/makeDirectory, UI restore, visible settings and scoped host trust. Existing tasks remain manual until explicitly changed.
- Verified: corrective real Electron + DeepSeek batch files/directories with Shell disabled and zero approval clicks; persisted UI undo after restart; visible host setting, actual Node/Shell under scoped trust and revoke/restart. Local unit/preview regression counts are recorded in the corrective delivery. Synthetic data only; native-picker stub, Linux test harness.
- New increment: whole-run reverse-order file undo, conflict-aware progress/retry, default keep-all and explicit 7/30/90-day snapshot retention, protected cleanup with audit tombstones, visible stats.
- Verified new increment: 72 unit tests, six UI scenarios, build/lint/isolation/design checks, real Electron + DeepSeek run undo after restart and retention cleanup of artificially aged disposable SQLite fixtures.
- Current increment: compact DeepSeek-only workbench, viewport-bottom composer, persistent removable input queue, abort-model/safe-tool-boundary delivery, skill reviewed upgrades/unregister/immutable pins, authorized public HTTPS readWeb (not browser automation).
- Verified current: 90 unit regressions, nine preview cases, real Electron + DeepSeek interruption/deletion/approval invalidation/default queue after actual Node tool, explicit skill update button/restart pins/new conversation/UI uninstall and actual HTTPS evidence/revoke; scripts report REAL_WORKBENCH_E2E_OK. Native picker only is stubbed, synthetic materials, Linux no-sandbox test harness.
- Next: directly submit stacked PR and inspect CI; no PR #2 or new-feature merge assumed.
- Limits: host execution is not OS sandboxed; no full browser/desktop automation, scheduler/MCP/multi-agent engine, binary skill assets/marketplace/archive GC, full session-tree/rewind or exact model tokenizer. No signed Windows/macOS release or real-model target-platform verification yet.
- Credentials: opaque approved Vault transport for sandbox tests only. Never commit raw credentials.
