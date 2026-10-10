# Real DeepSeek desktop end-to-end acceptance

## Result

`REAL_DEEPSEEK_ELECTRON_E2E_OK`, verified at `2026-10-10T09:21:10.584Z` on the Linux development host. Actual Electron renderer, preload, main-process IPC, SQLite host, AI SDK `ToolLoopAgent`, remote `deepseek-v4.1-flash`, filesystem reads, approval and artifact publication participated.

No model, IPC, database or tool result was mocked. The native folder chooser alone was replaced by a deterministic selection of a synthetic temporary project, because this is a headless test. The Linux launch harness used `--no-sandbox`; production renderer configuration still requests sandboxing, and target OS enforcement remains a separate gate.

## Cases

| Case | Observed result |
|---|---|
| Two-file synthesis | Read `requirements.md` and `constraints.md`; output included unpredictable markers generated in those files and not present in the user prompt |
| Before approval | No artifact file existed on disk |
| Restart while waiting | Closed and relaunched the app with the same isolated userData; status, approval ID, digest and exact content were unchanged |
| Approve and continue | UI approval wrote exactly the reviewed content, appended tool result, then the real model replied; task completed in 3 model steps |
| Artifact review | Actual desktop artifact dialog displayed both evidence markers |
| Direct answer | Real model returned `SIMPLE_E2E_OK` in one step, with no approval or file, proving no forced research/package workflow |
| Human denial | Real model consumed the rejected write result and completed; 4 model steps, no denied file created |
| Stop and terminal restart | Cancelled task remained cancelled; completed task retained its original step count and single artifact after another restart |
| Credentials | Approved Vault auth was injected upstream; no `provider.json` or raw API key was written in the isolated app data |

Approved artifact SHA-256: `f4a2f7d4cde44324f5eaa2bee78360ba49e44af1a294a301e07674fbb2de2f4f`.

## Reproduction

```sh
npm ci
npm run build
AGENT47_AUTHENTICATED_PROXY=1 xvfb-run -a npm run test:desktop:live
```

The command requires an authorized HTTPS proxy capable of injecting the selected OpenCode credential. Inside Computer, attach the owner's approved Vault handle to the command. Do not copy a token into the script. Outside this environment, installed apps use their own OS-encrypted DeepSeek key; the script is not claiming to export the owner's Vault.

Raw acceptance JSON and screenshots are generated under ignored `.qa/`; the script prints only safe status/step/hash metadata.

## Verification boundaries

This supersedes the earlier split evidence of CLI real-model plus Electron fixture: the main chain now has actual desktop real-model acceptance. It does not certify Windows/macOS installers, keychain/DPAPI backend behavior, native dialogs, signing, native OS automation or long-running distributed orchestration.

The SDK Agent step is bounded to one model invocation so the durable task host checkpoints pending calls before tool effects. The complete multi-step flow is real; the host is still application-owned and not falsely described as fully delegated to an in-memory SDK loop.

The initial browser-context polling helper misclassified a still-running task. The final harness directly polls actual IPC responses from the test host; the failed attempts did not save artifacts or represent model failures.
