# First increment verification record

Historical baseline and framework follow-up. Current tools/skills increment evidence and boundaries are in `conversation-tools-skills.md`; old capability exclusions below describe their original verification dates.

## Scope and verdict

Conditional pass for a development increment on the Linux host, not a production or Windows/macOS release certification. The author performed this review; it is not an independent external security audit.

Object: the new root Electron app on `refactor/desktop-task-runtime`, based on `d1e2cd0`. Original source is preserved separately, never counted as implementation of new capabilities.

## Evidence

| Check | Result | Meaning and limits |
|---|---|---|
| Clean `npm ci` under Node 22.23.3 | Pass | No legacy peer-dependency bypass |
| Type check and production renderer/main build | Pass | New root app compiles |
| ESLint | Pass | Noninteractive, explicit root config |
| Vitest | 23 tests pass | Runtime, filesystem, duplicate calls and credential metadata/storage semantics |
| Preview Playwright | 3 scenarios pass | Real controls for composition, filters, context, guidance, stop, approve/deny, artifact/source/download, settings, theme and mobile bounds |
| Design spec/showcase consistency | Pass | Token mutation is rejected |
| Controlled text contrast | 42 pairs pass, min 4.70:1 | Shorthand colors normalized; non-finite calculations fail |
| Direct Chat Completion | Pass | Coding test replied `AGENT47_API_OK` using approved Vault transport |
| Real AI SDK tool loop | Pass | `deepseek-v4.1-flash` read synthetic requirements, proposed artifact, waited for approval, saved and replied; 3 model steps |
| Electron isolated process | Pass | Fixture model only; main/preload/renderer IPC works, Node/process absent from renderer, provider metadata contains no key |
| Linux unpacked packaging | Pass | Packaging layout check with installed Electron distribution; no Windows/macOS installer claim |
| Dependency audit | 0 reported vulnerabilities, including dev dependencies | Registry advisory result at verification time, not proof of no exploitable defects |

The real SDK artifact was `verification.md`, SHA-256 `a161d1788860bb12ed247bb394e4f5f66aa90ae58813c98f7324f9f016ced1e0`. Only synthetic coding material and a temporary local artifact directory were used; no real project data or external-account actions.

The safeStorage tests use a fake backend to test application policy, not native encryption. The Electron harness disables the Linux OS sandbox via a test launch flag because of the container environment; production `BrowserWindow` settings still request renderer sandboxing. Native sandbox enforcement is not certified by this harness.

## Dependency adjustment

The initially resolved packaging chain reported eight moderate transitive entries from a `global-agent` → logging/formatting dependency chain. The only used integration in the installed Electron downloader was `require('global-agent').bootstrap()`. An explicit `global-agent@4.1.3` override removed the vulnerable chain; its bootstrap API, clean install, Electron launch and unpacked packaging were tested. Keep the override reviewable, and remove it when upstream resolves the constraint.

## Visual and interaction checks

Screenshots reviewed: light/dark home, light/dark approval, inspector, light/dark settings, mobile home/task/settings/capabilities and actual Electron fixture task. The main composer, scope notice, task status and decision controls are visible in their intended states. Long source content uses an explicitly scrollable review region; mobile stacks without horizontal overflow.

Exploratory cases included nonmatching search, zero matching active tasks, stopped simulated work, denial without file creation, modal Escape/keyboard focus cycle, and route changes from a scrolled list. Route changes now reset scroll position rather than hiding the task header.

No observed page exceptions, horizontal overflow, unreadable enabled-token contrast or misplaced permission labels in covered states. Screenshots fast-forward entrance animations so transient opacity is not mistaken for final contrast.

## Known limitations and release gates

- **Native target validation:** Windows/macOS installers, signing/notarization, native encryption, accessibility/high-contrast behavior and long-running soak tests have not run here. Added CI matrix is configuration, not evidence of completed CI runs.
- **SQLite maturity:** built-in Node SQLite emits an experimental warning in this Node version. Task history is plaintext on disk protected by owner-only modes and OS account/disk security, not database encryption.
- **Runtime scope:** one serial worker, no distributed lease/coordinator, scheduler, browser, Shell, desktop automation or MCP.
- **Interruptions:** checkpointed artifact effect is idempotent; interrupted model calls can incur repeat billing. Cancel does not undo already started approved filesystem I/O.
- **Filesystem isolation:** path policy is a broker defense, not complete kernel isolation against hostile same-user filesystem races.
- **Credentials:** Computer Vault is a development transport, not bundled desktop credentials. Installed users configure keys separately.
- **Legacy:** archived APIs remain unsafe and disabled; automatic plaintext-key/history migration is deliberately not implemented.
- **Product model scope:** The owner selected DeepSeek-only support through the configured compatible endpoint. No automatic fallback to other model families is enabled; the endpoint route is distinct from an agent harness.

## Next increment

Run target-platform CI and native smoke tests, validate OS credential handling and installation, then decide utility-process separation and the first browser/desktop tool with its own permission and recovery acceptance tests. A development merge is distinct from a target-platform release.

## DeepSeek desktop follow-up: 2026-10-10

This follow-up supersedes the earlier fixture-only desktop limitation for the covered Linux application flows, not the Windows/macOS release gates. The owner authorized merging after a complete real-model agentic flow and requested DeepSeek-only support.

The model layer now uses AI SDK `ToolLoopAgent` with a one-step boundary; the durable `TaskRuntime` still owns checkpoints, bounded tools, exact-content approval and the artifact ledger. See `agent-framework-decision.md` for the researched alternatives and the explicit framework/runtime split.

Real Electron acceptance completed at `2026-10-10T09:21:10.584Z` using `deepseek-v4.1-flash`, without model, IPC, store or tool mocks. Only the native folder picker was stubbed to return an isolated synthetic project. Two unpredictable markers in two input files were verified in the proposed and saved artifact. Restart preserved the exact pending approval, approval saved one file, and the model continued to completion in three steps. Direct answer completed in one step; denial completed with no write; stopped and completed tasks did not replay after restart. Credential values were not stored by the test app.

Artifact SHA-256: `f4a2f7d4cde44324f5eaa2bee78360ba49e44af1a294a301e07674fbb2de2f4f`. Reproduction and test limitations are in `deepseek-desktop-e2e.md`.

Final regression: clean `npm ci`, type check/production build, lint, 27 unit tests, three preview scenarios, 42 contrast pairs with minimum 4.70:1, negative token-drift check, zero full dependency-audit findings, and Electron isolation fixture smoke all passed. Intentional user cancellation no longer emits a model-failure diagnostic; diagnostic metadata never contains raw response bodies, headers or credentials.

## Tools/skills follow-up: 2026-10-10

Clean installation, production build/type check, lint, 42 unit tests, four preview scenarios, contrast/token-drift checks, full audit with zero findings and Electron isolation fixture smoke passed. Real DeepSeek capability acceptance completed at `2026-10-10T11:15:05.952Z`; original real-desktop regression completed at `2026-10-10T11:15:25.468Z`. The latter artifact hash is `26fd729333f3c2c61162012ac006b36021ef975895b35cda4c2d9af7271be521`.

The latest short Markdown response yielded 16 text and 7 reasoning deltas, 1671 input and 107 output tokens; its reasoning draft was observed, while text completed before the poll observed a draft. An earlier longer acceptance at 11:09 observed both live text and reasoning drafts. Do not equate display pacing or a proxy-batched short reply with a guaranteed token-by-token network latency result.

Actual skills/reference/project edit and approval restart, bundled Node JavaScript, OS Shell, clarification and random-marker automatic compaction passed without model/tool/IPC/store mocks. Details and remaining host privilege, context projection and native-platform gates are in `conversation-tools-skills.md`.
