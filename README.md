# Agent47

A local-first Electron desktop task assistant, supporting the DeepSeek model family. The rebuilt root app replaces the archived Decision Workspace prototype with AI SDK `ToolLoopAgent`, a durable task host and explicit permissions.

## Development

Requires Node 22.12+ and npm. Windows/macOS are the intended desktop targets.

```sh
npm ci
npm run build
npm run desktop
```

The app starts without a credential. Configure your selected HTTPS DeepSeek-compatible Chat Completion base URL, DeepSeek model ID and key in Connection Settings. The default route is OpenCode Go / `deepseek-v4.1-flash`; no automatic non-DeepSeek fallback exists. Saving requires the OS encryption backend. Keys never leave main process through the IPC metadata APIs. Alternatively launch with `OPENCODE_API_TOKEN` in the app's environment for the default OpenCode endpoint; never commit this variable.

An explicitly enabled authenticated proxy can supply the default route's credential without exporting it into the app: set `AGENT47_AUTHENTICATED_PROXY=1` with `HTTPS_PROXY`. This does not create a model fixture or bypass remote authentication. The proxy must actually inject authorized credentials. No proxy URL or auth material is returned to the renderer.

```sh
npm run dev          # clearly labeled browser preview, example data only
npm run typecheck
npm run lint
npm test
npm run smoke:model  # real coding-agent API test; needs an approved key/transport
npm run smoke:electron
npm run test:desktop:live # real DeepSeek desktop acceptance, approved proxy required
npm run test:capabilities:live # real streaming, skills, edits, Node/Shell and compaction
npm run test:permissions:live # real zero-click file batch, nested directories, snapshot restore and scoped host trust
npm run test:decisions:live # real multi-question decision dock, restart drafts and explicit conversation trust
```

The Electron smoke script uses a deterministic model fixture and a temporary user-data directory. On a headless Linux CI host use `xvfb-run -a npm run smoke:electron`; that harness passes `--no-sandbox` only for the host test. Production app configuration keeps renderer sandboxing enabled.

## What is implemented

- Rebuilt task center, conversation, visible tool-permission controls, optional exact-content approval, artifact library, capability disclosure and settings.
- AI SDK `ToolLoopAgent.stream()`, separate provider reasoning, safe GFM Markdown and supplier input/output/cache usage (no billing or price estimates).
- Multi-run conversations, batch essential-input questions with choices/custom text, persistent draft/review and one submission, durable steering/follow-up queues and immutable finished runs.
- Bounded selected-folder reads, nested directory creation, hash-checked project writes/edits and app-owned artifacts. New tasks default to project authorization + automatic write-before snapshots, not per-file confirmation; manual review remains available.
- Reviewed `SKILL.md` text-bundle import, explicit enable/disable, metadata catalog and on-demand instructions/references/scripts. No automatic install or script execution.
- Optional host Shell and JavaScript using Electron's bundled Node utility process. **Not an OS security sandbox**; a visible Settings switch enables execution, then the conversation policy chooses exact-command review or explicitly trusted scoped execution. Application secret/proxy environment is not inherited.
- Automatic context summaries at safe closed-turn boundaries; full raw history remains stored and summary calls appear in token usage.
- SQLite task/message/action checkpoints, serial queue, restart recovery and cancellation.
- Isolated renderer/preload/main architecture; no unauthenticated HTTP API.

The compact workbench docks its conversation composer outside scrolling history. Active-run input enters a persistent, removable queue; messages join at the next tool boundary, or an explicit immediate-send interrupts only the model request. Skills support reviewed upgrades, inactive-by-default new versions, immutable per-conversation hash pins and unregistering without erasing history. The `readWeb` tool reads bounded public HTTPS HTML/text only from explicitly authorized origins; it has no cookies, credentials, JavaScript or browser action capability.

Pending questions and approvals replace the ordinary composer with a fixed-bottom decision panel. Answer one or several questions, navigate back, supply custom text, skip optional questions and submit all answers once. Chat drafts remain separate. Tool/artifact consent supports exact-payload review or explicit conversation scope; “开启可信对话” in task permissions enables host tools without repeated prompts after one clear OS-rights consent. It is not a sandbox or a grant to other conversations.

No full browser/desktop automation, scheduler, MCP, multi-agent coordination, OS tool sandbox, package marketplace or binary skill assets yet. No billing/price/monetary-budget feature is in scope. Do not mistake the preview fixture for external execution.

## Packaging

```sh
npm run package:win
npm run package:mac
```

Run each packaging command on its target OS with the required platform toolchain. The configuration is present, but signing, notarization, installers and native permissions require platform-specific validation. This development increment is not a signed production release.

## Documentation

- [Requirements and increment acceptance](docs/redesign/requirements.md)
- [Architecture, permission model and recovery](docs/redesign/architecture.md)
- [QA coverage](docs/redesign/qa-inventory.md)
- [Verification record and release gates](docs/redesign/verification.md)
- [Agent framework decision](docs/redesign/agent-framework-decision.md)
- [Real DeepSeek desktop E2E](docs/redesign/deepseek-desktop-e2e.md)
- [Conversation, tools, skills and context increment](docs/redesign/conversation-tools-skills.md)
- [Simplified permissions, directories and recoverable snapshots](docs/redesign/permissions-and-snapshots.md)
- [Whole-run file undo and opt-in snapshot retention](docs/redesign/run-undo-and-retention.md)
- [Compact workbench, queued input, skill lifecycle and public HTTPS reader](docs/redesign/compact-workbench.md)
- [Unified decision dock and scoped trust](docs/redesign/unified-decision-dock.md)
- [Design specification](docs/redesign/design-system.md)
- [Offline component showcase](docs/redesign/design-showcase.html)
- [Current workstate](.agents/workstate.md)
- [Archived original prototype](legacy/decision-workspace/README.md)
