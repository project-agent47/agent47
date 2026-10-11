# Run undo and opt-in snapshot retention

## Baseline

PR #1 was self-reviewed, corrected and merged into master as `594e6e4579c1a2c9ecc01541ee5fe912025f890e` at 2026-10-11 02:01:24 UTC. Its final reviewed head `331434d2cc96b76642f2200d7383806edf7fa250` passed Ubuntu, Windows, macOS and preview CI. See [PR #1](https://github.com/project-agent47/agent47/pull/1) and `pr-self-review.md`; intermediate failed CI is not passing evidence.

This follow-up is on `feat/run-undo-snapshot-retention`. A new PR is reviewable separately; authorization to merge PR #1 is not assumed to cover this follow-up.

## Whole-run file undo

Each run with saved file-tool changes has one **撤销第 N 轮文件改动** button. The single confirmation shows the selected root, count and non-atomic/Shell/remote limitations. Changes are restored in reverse order, including multiple modifications to the same file.

An external conflict is preserved. Older versions of that same path are skipped so they cannot accidentally overwrite a conflict; independent files can still undo. macOS/Windows path comparisons are conservatively case-folded (this can over-block two distinct case-sensitive paths, but does not loosen overwrite guards). Purged unresolved versions also block older versions.

RunUndo state is durably saved before effects and progress is acknowledged per restored file. Crash/restart marks interrupted undo partial, without automatically continuing. A retry uses restored snapshot tombstones to reconcile disk commits whose TaskStore acknowledgement was interrupted; no completed restore is executed twice.

The lock covers the complete operation and overlapping selected roots, including cancelled tasks with effects still running. All affected tasks must be terminal with no active/unknown effects. Chat history stays intact, but the newest conversation context receives a restoration notice requiring fresh reads and forbidding old-action replay.

This is sequential supported-file undo, not an atomic multi-file transaction, full session-tree rewind, Git history manipulation or reversal of Shell/network/remote actions. Result UI clearly reports completed/partial, restored count and conflicting paths. Users can resolve a conflict and retry the remaining items.

## Retention and cleanup

- Default **保留全部** (`0`) means no automatic expiry or deletion.
- Explicit user choices are 7, 30 or 90 days after a run's last activity.
- Confirmation names the actual app snapshot directory and says backup original content will be permanently removed. This is not a new default applied to old data without consent.
- Under a saved opt-in policy, cleanup checks at startup, once per day while the app runs, or via **清理过期快照**.
- Only ended, idle, known-result runs are eligible; overlapping active/unknown tasks, prepared manifests and interrupted restoration are protected.
- Cleanup atomically replaces snapshot backup contents with small audit tombstones and updates file-change status to cleaned. Original project files, artifacts, messages and SQLite history are not removed.
- Tombstones make interrupted cleanup acknowledgement retryable and prevent old-effect replay. They are intentionally not deleted by this increment.
- Count and bytes show readable retained backup manifests, including metadata, not total app/SQLite disk usage. Missing/corrupt manifests are not silently reset or deleted.

This is restore-point retention, not secure erasure: originals may also be present in the deliberately preserved conversation/model history. Cleanup does not provide a total storage quota, and tombstone/history growth still needs later lifecycle design.

## Acceptance

72 local unit tests, six preview scenarios, build/typecheck, lint, isolated Electron settings/IPC smoke and design checks passed. Full dependency audit is separately checked without the OpenCode-only proxy.

Actual Electron + DeepSeek acceptance returned `REAL_RUN_UNDO_RETENTION_E2E_OK` at `2026-10-11T02:06:53.915Z`: a real model edited root README, wrote missing-parent governance README and made an empty folder; restart and one UI confirmation restored all three; the visible retention control protected fresh backups, then real cleanup purged three artificially aged disposable manifests while keeping project text. Only the native directory picker was stubbed, and fixture SQLite timestamps were aged to exercise retention; model, filesystem, runtime, IPC and database were not replaced.

It also exercised actual trusted Node/Shell execution and global revocation persistence. The first retention test helper attempted a dynamic import unsupported by Playwright's Electron evaluation VM; it was corrected to Node's getBuiltinModule before the successful run. No failed helper run is counted as successful.

Target-native CI fixtures are separate from real-model Linux acceptance, signed installer/native keychain testing and OS sandbox certification.
