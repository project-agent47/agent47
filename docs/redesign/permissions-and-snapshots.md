# Simplified permissions and recoverable project changes

## Problem and current behavior

The owner tested macOS and found that writeFile could not create `governance/README.md` without an existing parent; disabled Shell/JS provided no workaround. Per-file exact approvals made multi-file tasks impractical, and opt-in controls were not discoverable. This corrective increment changes implementation and adds regressions, rather than documenting the limitations as acceptable.

The initial design confused approval with recovery. Current default for NEW tasks is `snapshot`: native project selection explicitly grants project read/write access, and supported local file edits run without individual approval dialogs. `ask` remains available. Historical tasks lacking a policy remain in manual review; changing the global default does not silently escalate existing tasks or a previously read-only folder grant.

## Permission UX

- Settings navigation is named **连接设置与工具**. Tool settings precede credential fields, not a disabled control buried in capability disclosure.
- The home composer links to tool settings and shows file/host state. Project selection labels disclose read/write and provider transmission.
- Each conversation shows its selected root, `snapshot`/`ask` file policy and `ask`/`allow` host policy.
- Shell/JS defaults to disabled. Enabling requires a risk acknowledgement, then commands default to exact review. The user can explicitly authorize a trusted conversation without repeated command approval; its root and conversation lineage are bound in the main-process task record.
- Global host disable revokes all stored `allow` policies. Re-enabling does not silently resurrect them. Existing running effects may already have happened; Stop and disable are not rollback.
- Preview controls can simulate policy changes and clearly disclose that no actual model/host/filesystem runs. Credential and real file import remain unavailable in the preview for a reason, not as unexplained disabled product features.
- Browser/desktop automation, MCP and scheduling are not implemented, rather than tools waiting behind an opt-in.

This follows the separation between an edit-accepting mode and host permissions seen in [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes), rather than copying its entire command auto-approval list.

## Files and snapshots

`writeFile` creates missing parents, and `makeDirectory` creates empty nested directories. Neither needs Shell/JavaScript. `editFile` preserves its original-hash and unique-match requirements. Complete path validation runs before any directory creation: no root escape, absolute paths, known secret paths, symlinks or hard-linked mutation targets.

Before a project mutation, FileSnapshots writes a private, fsynced, atomic write-ahead manifest under the app's `userData/snapshots/<run>/<call-hash>.json`. It includes the canonical project root, original content/permissions (or absent-file state), intended content hash and newly created parent directories. Backup failure prevents project effects. Snapshots are separate from Git, do not auto-commit or modify a user's Git history, and also work in non-Git folders.

Project writes preserve existing file permission bits and use a fsynced sibling file plus rename. Replay checks final hashes and preserves the original backup; it never replaces the original snapshot with the already-modified content.

**文件改动与恢复点** in the task shows changes across conversation runs. After all tasks for that root are terminal and there are no unresolved host effects, the user can restore an individual change:

- existing text returns to its original content and mode;
- newly created files are removed;
- only created, still-empty directories are removed;
- if file content has changed since the Agent write, restore refuses to overwrite it;
- repeated edits to one file restore from newest to oldest;
- original conversation/history remains, with an application notice in the next model context requiring a fresh read and prohibiting automatic replay.

App-owned artifacts are immutable, idempotently published and need no repeated confirmation in snapshot mode. They are not project-file snapshots and remain in the artifact library.

## Honest recovery limits

This is individual supported-file-tool recovery, not an atomic whole-project/OS snapshot, Git replacement, full Pi conversational rewind, retention/GC system or kernel sandbox. Shell/JavaScript mutations, database/network effects and unrelated user edits are NOT covered. A batch restore UI, storage quota/retention and sophisticated diff viewer are future increments; currently individual restore points are available without individual write approvals.

This intentionally follows the limitation in [Claude Code checkpoints](https://code.claude.com/docs/en/checkpointing): native file-tool edits can be checkpointed, but arbitrary Bash changes and remote effects cannot be described as rewindable. Local snapshots contain project text; they depend on user account/disk protections and are not encrypted backup storage.

## Verification

- Local production build/type check, lint, 57 unit tests, five preview scenarios, isolated Electron settings/IPC smoke, design token/contrast checks and full audit zero findings passed.
- `tests/snapshots.test.ts` checks nested writes with host disabled, restored existing content/modes, crash/restart replay preservation, conflicting human changes, empty directory undo, no destructive nonempty-directory restore, backup failure before effects, unsafe paths/links, repeated edits in reverse order, automatic artifact delivery, context updates after restoration, trusted-host scope and live-run restore rejection.
- `scripts/e2e-permissions-live.mjs` uses real Electron, DeepSeek, tools, SQLite and IPC. Only native directory selection points to disposable material. It edits the root README, creates `governance/README.md` and `governance/empty` with host disabled and zero approval clicks; restarts, restores via UI, enables host through visible settings, executes real Node/Shell under scoped trust, disables and verifies revocation persistence.
- The final live corrective acceptance returned `REAL_PERMISSIONS_SNAPSHOTS_E2E_OK` on Linux at `2026-10-11T01:08:15.558Z`. Original manual-review desktop regression passed at `01:08:18.658Z`; the streaming/skills/Node/Shell/compaction regression passed at `01:08:50.685Z`. This UTC date is still October 10 in the owner's timezone.
- The PR workflow now includes native Electron fixture/IPC/settings smoke on Windows/macOS in addition to cross-platform unit/build tests. It does not send paid model requests or prove signing, native encrypted storage behavior, or hostile-code sandboxing.

No Windows/macOS live DeepSeek execution, installer signing/notarization or OS tool sandbox certification is claimed from Linux results. Development delivery is a PR, not an authorized merge.
