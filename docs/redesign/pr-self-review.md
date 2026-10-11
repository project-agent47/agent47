# PR #1 self-review and merge gate

Reviewed the complete conversation/tools/skills diff and the corrective permission increment, with emphasis on effect durability, revocation, root scope and restore retry semantics. This is author self-review, not an independent security audit.

## Findings fixed before merge

- Restore could finish on disk and then crash before TaskStore acknowledgement. A repeat previously rejected the restored manifest. It now idempotently acknowledges the disk commit without changing a subsequently edited file.
- A cancelled run can still have an already-started file effect. Restore previously checked the selected run's active state, not every overlapping run. All active, queued or unknown-effect tasks for the same or overlapping selected roots now block restore.
- Awaited effect planning or reads could save stale task permissions over a concurrently revoked setting. The runtime re-reads the durable task after I/O before persisting results/plans.
- A valid multibyte write could exceed one million bytes within the tool's one-million-character limit; replay rejected it. Replay/restoration now use the matching four-million-byte maximum.

Regression evidence includes two deliberately failing restore tests before their fixes, plus overlapping-root, awaited-revocation and large-UTF8 replay tests. Existing scopes, hash preconditions, approval integrity, native settings controls, streaming, skills and full tool-pair context behavior remain covered.

Native Windows review CI exposed the old five-second unit harness deadline in the twelve-step persisted-loop test on a heavily slowed runner. The test still asserts exactly twelve steps; the Windows harness now allows 45 seconds of polling and 60 seconds per test. No application model/host timeout, step cap or correctness assertion was relaxed. This is test-host accommodation, not a claim that synchronous database checkpoint performance has been optimized.

## Explicit limitations, not hidden merge claims

Host execution is not an OS sandbox. Same-user filesystem race isolation is best effort, and file snapshots do not include Shell/network/remote changes. File snapshots are local plaintext protected by app/user permissions. Target-native CI runs fixtures, not paid model calls, signed installers or OS keychain certification.

The next increment is batch run undo and opt-in backup retention/cleanup. It must not automatically delete usable backup data under a newly invented default, nor label a sequential multi-file restore as an atomic filesystem transaction.
