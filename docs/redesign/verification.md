# First increment verification record

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
- **Provider scope:** OpenCode Go is designed for coding-agent traffic, expects a stable session header and identifiable user agent, and is not assumed to license every future assistant workload ([OpenCode Go documentation](https://opencode.ai/docs/go/)).

## Next increment

Run target-platform CI and native smoke tests, validate OS credential handling and installation, then decide utility-process separation and the first browser/desktop tool with its own permission and recovery acceptance tests. Do not merge or release based solely on the preview.
