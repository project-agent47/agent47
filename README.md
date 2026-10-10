# Agent47

A local-first Electron desktop task assistant. The rebuilt root app replaces the archived Decision Workspace prototype with a goal-driven AI SDK runtime and explicit permissions.

## Development

Requires Node 22.12+ and npm. Windows/macOS are the intended desktop targets.

```sh
npm ci
npm run build
npm run desktop
```

The app starts without a credential. Configure an HTTPS OpenAI-compatible API base URL, model and key in Connection Settings. Saving requires the OS encryption backend. Keys never leave main process through the IPC metadata APIs. Alternatively launch with `OPENCODE_API_TOKEN` in the app's environment for the default OpenCode endpoint; never commit this variable.

```sh
npm run dev          # clearly labeled browser preview, example data only
npm run typecheck
npm run lint
npm test
npm run smoke:model  # real coding-agent API test; needs an approved key/transport
npm run smoke:electron
```

The Electron smoke script uses a deterministic model fixture and a temporary user-data directory. On a headless Linux CI host use `xvfb-run -a npm run smoke:electron`; that harness passes `--no-sandbox` only for the host test. Production app configuration keeps renderer sandboxing enabled.

## What is implemented

- Rebuilt task center, conversation, exact-content approval, artifact library, capability disclosure and settings.
- AI SDK compatible-provider integration with task-stable session headers.
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
- [Design specification](docs/redesign/design-system.md)
- [Offline component showcase](docs/redesign/design-showcase.html)
- [Current workstate](.agents/workstate.md)
- [Archived original prototype](legacy/decision-workspace/README.md)
