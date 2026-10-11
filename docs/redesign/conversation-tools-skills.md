# Conversation, tools, skills and context increment

The initial per-file approval and existing-parent-only restrictions described below are superseded by [the permission/snapshot corrective increment](permissions-and-snapshots.md). Current defaults allow explicitly authorized project edits with write-before snapshots; Shell trust is separately configurable. Historical acceptance evidence below remains evidence for its original commit, not the current permission UX.

## Scope change

The owner removed bills, prices and budget-management products from scope. Only supplier-reported input/output/cache usage is collected. Tool/skill capability is the priority, not an accounting platform. The earlier budget design is historical and not the implementation contract.

Implemented on `feat/conversation-tools-skills`, based on master `eae7ed8`. Development branch delivery does not imply a signed Windows/macOS release or OS-sandbox certification.

## Conversation and streaming

AI SDK `ToolLoopAgent.stream()` yields text and provider reasoning separately. Main-process drafts are transient, not tool authorization; only complete validated messages/calls are checkpointed and executed. IPC updates are coalesced, with short frame yields when a proxy batches SSE events. This is display scheduling, not proof that every transport forwards every network chunk immediately.

Final assistant text renders through react-markdown + GFM, without raw HTML, external images, embedded content or active external links. Reasoning details display only when the provider supplies them; they are not invented from final text. Raw code is never evaluated by rendering.

Existing task records now act as execution-run records. `conversationId`, `goalId`, `parentRunId` and `runNumber` link new continuations; completed/failed/cancelled runs are not resumed. Historical messages are copied into a successor's context, while the old record remains unchanged (except late effect/usage reconciliation when an operation was already in flight). This is an initial linked-run implementation, not Pi's full tree, rewind UI or normalized event store.

`sendMessage` uses a persistent unique clientMessageId. A completed run produces a new run; live steering waits for the current operation's safe boundary and closes remaining tool intents as superseded before appending the user message. A follow-up waits for the current run to complete. `askUser` persists an essential question and waits without model polling; the human answer becomes its tool result.

Steering does not undo an already-started approved effect. If an old response finishes, its usage is retained and its text may remain historical, but its pending tools are superseded before execution.

## Token response statistics

Usage rows contain request IDs, purpose (`turn` or `compaction`), input/output/total, cached reads, reasoning tokens and stream delta counts. No price table, cash estimate, bill sync, quota window or monetary reservation is implemented. SDK retries are disabled, so an invisible automatic retry is not hidden in successful-step statistics.

Input/output values only represent present supplier fields. Cache hit rate is the ratio of reported cache reads to reported input across entries with both fields; requests without cache detail do not pretend to have zero hits. Reasoning/cache are subsets, not added again to totals. Failed/aborted requests without final usage remain unknown. Summary calls are included; provider connection tests currently return connectivity text, not conversation statistics.

## Files and host tools

- **readFile/listFiles:** keep the canonical selected-root, traversal/secret/symlink and size guards. readFile returns a SHA-256 for mutation preconditions.
- **writeFile:** null expectedHash means a new path; otherwise full replacement requires the hash from a read. Parent directory must already exist. The entire new content is reviewed.
- **editFile:** oldText must occur exactly once and the current full-file hash must match. Review displays before content and full after content, rather than approving an opaque search/replace.
- **Project apply:** revalidates canonical path and original hash, writes a fsynced sibling temporary file then renames; replay accepts already-matching final content. This is not kernel-level race isolation against another same-user process.
- **runCode:** uses Electron's bundled Node utility process; JavaScript has require and normal Node capabilities. No extra Node/QuickJS distribution is required. Top-level await is not a special REPL feature; async programs can return a Promise.
- **runShell:** utility process launches the OS Shell (`/bin/sh` or Windows cmd); tools required by commands still need to be present on the host. Node is bundled, Python/Git/compiler toolchains are not.

Host execution is disabled by default. Enabling it requires a risk-labeled UI action; every full command/code and cwd still needs a distinct approval. Environment inheritance is allowlisted and excludes model keys and proxy credentials. Code can nevertheless access files and networking as the OS user: process separation is not containment or a secret vault.

Host stdout/stderr collection is capped at 64KiB, timeouts at 60 seconds. Shell process groups/tree termination are best effort; arbitrary approved JavaScript can spawn unmanaged descendants. Stop is not rollback. A durable `effectStarted` checkpoint precedes execution; a crash/timeout without result becomes awaiting_reconciliation and never automatically repeats the host command. Cancelled unknown effects must also be inspected before creating a successor run.

## Skill package management

The native picker selects a directory with SKILL.md and bounded UTF-8 text helper files. The review ticket stores an immutable in-memory snapshot; import installs that snapshot as disabled. User enable/disable updates the catalog. Skills are instructions/reference/script packages, not executable plugin modules or permission grants.

Startup metadata discovery exposes enabled skill ID, description and hash. `loadSkill` loads the full instructions; `readSkillFile` reads a bundled reference/script, without running it. Root escapes, symlinks, hidden files, binaries, oversized files, excess entries/depth, invalid frontmatter and duplicate skill IDs are rejected. Package dependencies are never automatically installed.

Current limits: 64KiB/file, 200 text files, 1MB total, 500 entries and depth ten. Binary assets, a marketplace, upgrading/removing packages, hot external-folder watches and custom native tool registration are not yet provided. Installed skill storage is local-user-owned, not tamper-proof.

Pi likewise discovers metadata and loads full skill instructions on demand, and warns that project skills may suggest scripts or file changes; those patterns inform this design, not automatic permission inheritance ([Pi skills reference](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)).

## Automatic context and turns

Context checking runs after pending tool calls are fully processed, before the next model request. An application heuristic estimates UTF-8 serialized bytes as a conservative token proxy; the default threshold is 32k, not a claim about the actual DeepSeek context window or an exact tokenizer.

Compaction chooses user/assistant boundaries only after prior tool calls have all their results. An oversized closed single turn can be summarized as one group. Original and latest user constraints stay pinned; raw history remains on disk, while summary + retained complete messages form the next projection.

Compression uses the same DeepSeek route with no tools, a 2048-output limit and thinking disabled via the compatible SDK provider option. Summary usage is separately tagged. A host continuation notice prevents interpreting the historical goal as a fresh request to repeat completed reads. This was checked with a random evidence marker present only in a 43KiB file.

Three compression requests per run cap repeated expansion. Oversized summary input (>96KiB), an unclosed giant tool chain, an empty/invalid summary or insufficient reduction fail visibly and preserve history rather than silently truncate. There is no full automatic provider-overflow recovery, branch summary, manual /compact UI or per-model tokenizer/window settings yet.

Pi's reference checks projected context between turns, retains recent complete groups, and never cuts a tool result away from its call; these principles were reused without importing its whole harness or copying its default window sizes ([Pi compaction reference](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/compaction.md)).

## Runtime choice

Electron utilityProcess supplies Node and message ports and accepts an explicit env/cwd; its API does not establish an OS sandbox for hostile JavaScript ([Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)). The chosen architecture uses that built-in runtime for approved host execution and keeps AI SDK + the application durable host for model/tools. QuickJS would require a separately designed capability broker to expose filesystem/Shell access; swapping the interpreter alone would not make those actions safe.

## Acceptance evidence

Real Electron + remote DeepSeek acceptance, synthetic inputs only, no model/IPC/store/tool mocks:

- Live text and reasoning drafts, GFM table/code, supplier usage, follow-up retaining a prior marker and unchanged completed run.
- Skill import as disabled, enable, actual loadSkill/readSkillFile, read→hash-bound edit, pending approval restored after restart and actual modified bytes.
- Exact reviewed JavaScript executed by bundled Node (`24.21.0` observed in this Electron build), and exact reviewed Shell command returned real stdout.
- askUser pause, human response, real model continuation.
- Automatic real-model summary after a closed tool batch, preservation of an unpredictable file-only marker, summary usage counted.

The final full capability run at `2026-10-10T11:09:44.234Z` returned `REAL_CAPABILITIES_E2E_OK`. It observed 349 text deltas and 117 reasoning deltas in the initial response, 1585 input and 467 output tokens. Native directory selection alone was stubbed; the Linux container harness used --no-sandbox. Windows/macOS behavior remains unverified.

Initial acceptance helpers had a collapsed-reasoning table locator ambiguity; compaction testing also exposed an assistant-only projection and repeat-read recovery problem. These were fixed before the successful full run. No failure was presented as passing, and unknown attempts remain recorded in isolated test data.
