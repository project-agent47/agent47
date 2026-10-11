# Unified decision dock

## Scope

First increment of the approved decision-input / split-workspace plan. The
artifact split viewer, Monaco, native webpage tabs and browser operation are not
part of this branch. The UI remains compact and DeepSeek-only.

## Interaction

- `askUser` accepts 1–6 related questions, each with a stable ID, header, prompt,
  single/multiple/text type, choices and custom text. Optional questions can be
  skipped. Answers are reviewed and submitted once, not sent as ordinary chat.
- Questions, tool/artifact approval, scoped consent, snapshot restore/undo and
  unknown-effect reconciliation occupy the viewport-bottom dock. History and
  decision content scroll independently; the decision footer stays reachable.
- Supplementary instructions are explicitly separate: preserve the answer form
  and unsent chat draft; normal messages queue. Promoting queued input while a
  decision is pending explicitly invalidates that decision.
- Approval offers exact-payload allow/deny, optional denial reason and explicit
  conversation scope. File scope retains automatic snapshots. Host scope
  requires the global host setting and a selected project.
- “开启可信对话” is in the task permission disclosure. Its consent enables host
  execution and grants file snapshot + host allow for this conversation and
  its follow-up runs. Other conversations are not granted host trust. Returning
  to per-call mode or globally disabling host execution revokes host scope.

## Durable contract

- Preserve legacy `askUser({question})` checkpoint identities on restart.
  New provider tool schema is a root object with optional `question` /
  `questions`; runtime requires exactly one. An object root is required by the
  tested DeepSeek route; a root union failed with HTTP 400.
- Bind decisions to task, original call ID, revision and SHA-256 of normalized
  questions. Reject stale, cross-task and mutated forms.
- Partial drafts use optimistic version checks; identical lost-ack retries are
  accepted. A submitted reply and its command receipt are persisted in one
  SQLite transaction. The same command with a different payload is rejected.
- Complete the original tool call with one result. A human-readable answer
  summary appears in history; it is not an additional model user turn.
  Denial reasons belong in the paired tool result, never between call/result.
- Chat drafts persist independently and never grant permissions or execute
  anything. Normal queued instructions cannot replace a just-submitted decision
  before its next model step.
- Malformed legacy questions return an invalid-tool-result and cannot prevent
  other saved tasks from opening. This is additive JSON checkpoint migration,
  not a database reset.

## Permission rationale and limits

Pi explicitly advertises no permission popups by default; its extension guide
states that extensions run with the process user's OS rights. Agent47 adopts
reduced interruption for explicitly trusted conversations, not an implied
sandbox ([Pi](https://pi.dev/),
[extension trust model](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)).
Question choices and skill instructions do not grant tool authority.

Trusted host code can access files and networks outside the project directory.
Snapshots cover only app file tools, not Shell/JS or remote operations. Secret
environment stripping, main-frame IPC checks, sensitive-file read boundaries,
unknown-effect recovery and non-replay guards remain in force. Global settings
and skill-management destructive confirmations retain their existing settings
UI; this increment unifies conversation decisions, not every system dialog.

## Verification

See [QA inventory](../decision-dock-qa.md). Run `npm test`,
`npm run test:preview`, `npm run build`, `npm run lint`,
`npm run design:check`, `npm run smoke:electron`, and with authorized transport
`npm run test:decisions:live`. Legacy live harnesses use the same decision UI.
Real-model testing is in a Linux Electron harness with only a synthetic native
folder picker replacement. Windows/macOS native installers, signing and system
credential storage require separate acceptance.
