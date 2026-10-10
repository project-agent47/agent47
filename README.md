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
```

The Electron smoke script uses a deterministic model fixture and a temporary user-data directory. On a headless Linux CI host use `xvfb-run -a npm run smoke:electron`; that harness passes `--no-sandbox` only for the host test. Production app configuration keeps renderer sandboxing enabled.

## What is implemented

- Rebuilt task center, conversation, exact-content approval, artifact library, capability disclosure and settings.
- AI SDK `ToolLoopAgent` and compatible-provider integration with task-stable session headers.
- Bounded selected-folder text tools and human-approved app-owned artifact creation.
- SQLite task/message/action checkpoints, serial queue, restart recovery and cancellation.
- Isolated renderer/preload/main architecture; no unauthenticated HTTP API.

No Shell/browser/desktop automation, scheduler, MCP, arbitrary skill import or multi-agent execution yet. Do not mistake the preview fixture for external execution.

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
- [Design specification](docs/redesign/design-system.md)
- [Offline component showcase](docs/redesign/design-showcase.html)
- [Current workstate](.agents/workstate.md)
- [Archived original prototype](legacy/decision-workspace/README.md)
