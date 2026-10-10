# Architecture and workflow replacement

## Data and process boundaries

```text
React renderer
  └─ frozen contextBridge (typed narrow methods)
       └─ authenticated top-frame IPC + Zod input validation
            ├─ native folder picker → opaque in-memory folder grant
            ├─ CredentialStore → OS safeStorage ciphertext, main process only
            └─ TaskRuntime
                 ├─ TaskStore → SQLite WAL checkpoints
                 ├─ sdkDriver → AI SDK generateText + compatible provider
                 └─ broker
                      ├─ listFiles / readFile (selected root only)
                      └─ writeArtifact (intent → exact-content approval → atomic publication)
```

No Next.js HTTP API runs in the new app. This removes the original unauthenticated task and provider-key API entrypoints from the active surface; it does not retrospectively repair the archived demo. Renderer navigation and popups are blocked, arbitrary Electron APIs are not exposed, and CSP blocks frames, objects and remote scripts.

Main/preload are bundled separately. Main imports Node filesystem and SQLite; renderer does not. Packaged assets use a restricted `agent47://app/` scheme. IPC accepts only the owned window's top frame at the exact app URL.

## Runtime semantics

```text
queued → running → completed
            │          (terminal; no resume endpoint)
            ├─ proposed artifact → awaiting_approval
            │                        ├─ approve → queued → apply → next model step
            │                        └─ deny → queued → tool error → next model step
            ├─ failure → failed (terminal)
            └─ stop → cancelled (terminal)
```

A model step contains no SDK `execute` callbacks. The runtime owns tool execution, checkpoints the assistant response plus pending calls before any side effect, and appends tool-result messages itself. AI SDK owns protocol serialization and response parsing; the application does not hand-write Chat Completion HTTP integration.

Every model request is bounded by 90 seconds, one SDK retry and 4096 output tokens. Tasks have a 12-step model budget. A single serial worker executes ready tasks; pending approval releases the worker so other tasks can proceed. These are deliberate minimal semantics, not general multi-agent orchestration.

On startup only interrupted `running` tasks become queued. Pending approval stays pending. Approved artifact intent replays against a deterministic path, checking the existing content hash rather than creating a second file. Model requests interrupted before a durable checkpoint can be reissued and billed again; exactly-once model billing is not claimed.

The artifact publication path uses task ID and hashed tool-call ID. A complete temporary file is fsynced and linked exclusively to the final path. Approval binds task ID, call ID, filename and full content via SHA-256. A modified or conflicting existing file causes failure, never overwrite.

Cancellation fences late model/read outputs. An already-approved filesystem operation that has begun may finish after Stop; its saved artifact is recorded and the task stays cancelled. Cancellation is not rollback.

## Permission boundaries

| Tool/action | Permission | Constraint |
|---|---|---|
| Model call | Configured user provider | Task and selected text sent to that service |
| List directory | Native folder-picker grant | Relative paths, 200-entry response cap, no hidden files or symlinks |
| Read text | Same explicit root grant | Regular UTF-8 text, max 64 KiB, no hidden/known-secret/key/database files |
| Artifact proposal | No side effect | Full content stored for review |
| Artifact publication | Fresh bound approval | Max 1M characters, Markdown/text/JSON only, app library only, no overwrite |
| Open artifact | Existing artifact ID | Recompute content hash, resolve owned path, OS default app |
| Provider configuration | Owned UI only | HTTPS base URL, OS encryption available, host switch requires fresh key |

Directory selection is read consent, including consent to transmit those files to the provider. Secrets cannot be identified perfectly by filenames; users must not select directories containing sensitive material they do not intend to share.

Symlinks, traversal, absolute paths, Windows alternate stream syntax and common secret names are denied. Path checks and `O_NOFOLLOW` reduce attacks, but this is not a kernel filesystem sandbox. A malicious same-user process racing directory replacement is not fully contained on every OS. Do not add arbitrary project writes or Shell until an OS isolation design is separately validated.

## Credentials

The development test uses the owner's approved opaque Vault handle; it is not exported into the repository or desktop package. Installed apps use a user-entered API key encrypted through Electron `safeStorage`, or an explicitly supplied startup environment variable. The API key is not returned by any IPC metadata method.

When OS encryption is unavailable, especially Linux's `basic_text` backend, saving is refused. Provider JSON stores metadata and ciphertext only. SQLite contains task history and selected-file excerpts; it is not encrypted, so OS account/disk security still matters. Files use owner-only modes where supported.

A saved credential cannot silently follow an endpoint change: changing the base URL requires a fresh API key. The application also blocks provider changes while unfinished tasks exist, preventing an approved continuation from switching services mid-task.

## Reuse and migration

- Preserve original source, tests and Prisma schema in the archived directory for reference.
- Carry forward the useful concepts of a workspace, auditable actions, human review and portable Markdown deliverables.
- Replace original fixed recipes, synthetic search/dossier runner, fake browser execute, fake session login and JSON default-reset store as active components.
- Do not automatically migrate historical JSON. That store can contain plaintext provider keys and ambiguous run states; migration needs a dedicated redaction/validation utility and user review.
- Adopt skills as advisory instructions, never as permission grants. The three initial guidance profiles are intentionally small and do not claim arbitrary skill loading or a Loopy-compatible scheduler.

## Deferred platform work

Move long-running runtime work into a utility/worker process before wider coordination. Add encrypted secret references, versioned skill loading, approved-browser actions, OS-specific automation, durable triggers and worker leases as separately verifiable increments. Electron is the desktop shell, not the automation or coordination engine.
