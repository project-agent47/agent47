# Desktop task agent: first increment

## Confirmed direction

The owner authorized local-first, single-user Electron development for Windows and macOS, a complete UI rebuild, replacement of problematic rigid workflows, and AI SDK model integration. The existing private repository remains the source of truth. The reference process is `kimmywork/skills`; use its increment, worklog and evidence-based verification practices, not a wholesale copy of its shell workflow engine.

## Scope and assumptions

- New task center, task detail, exact-content approval, artifact library, capability disclosure and provider settings.
- Goal-driven model/tool loop; no compulsory research → approval → packaging stages.
- Native folder picker grants bounded text reads. Model requests transmit selected text to the user-configured service.
- App-owned artifact writes only, with one approval per exact payload.
- SQLite checkpoints and restart recovery in one desktop process. Serial queue, not a distributed coordinator.
- AI SDK compatible provider. OpenCode Go configuration is a verified development target, not assumed licensing for all future assistant traffic.
- Preserve the original Decision Workspace source/tests in `legacy/decision-workspace`. Exclude it from active root build and packaging.
- No Windows/macOS desktop automation, browser tools, Shell, scheduler, MCP or multi-agent execution in this increment.

## Verifiable increments

| Increment | Result | Verification | Done when |
|---|---|---|---|
| Connection proof | Approved-Vault Chat Completion and AI SDK adapter | Synthetic coding task, no raw key in files/logs | Model responds, real SDK tool loop completes |
| Durable bounded runtime | SQLite checkpoints, tool broker, approved artifacts | Automated direct-answer, denial, expired approval, recovery, replay, cancellation and path tests | No fixed phases, no unapproved write, completed tasks never restart |
| New desktop shell and UI | Electron main/preload + rebuilt React renderer | Isolated Electron IPC smoke; preview navigation and interaction QA | Main process owns keys/tools; renderer lacks Node; all main UI controls work |
| Delivery evidence | Design spec, architecture, worklog and test record | Clean installation, type check, build, lint, tests, dependency audit | Private feature branch reviewable, limits clearly disclosed |

## Acceptance versus release readiness

The increment can pass on the Linux development host without implying target-platform readiness. Windows/macOS installation, signing/notarization, OS credential-backend checks, high-DPI/native menu behaviors and long-running task soak tests remain release gates. Built-in Node SQLite is currently experimental in the installed Node version; it is an implementation tradeoff, not a production stability guarantee.
