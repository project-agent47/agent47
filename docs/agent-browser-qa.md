# Agent browser QA inventory

## Functional signoff

- Stable eight-tool catalog; main broker denies ungranted conversation/Tab/origin.
- Bottom-dock grant review, read/ask/allow modes, cancel and immediate revoke.
- Exact URL request approval for browserOpen; redirect origin does not auto-grant.
- Bounded text/controls, no password/file/value/hidden-field extraction.
- Native exact fill approval, denial has no effect, trusted click, actual DOM result.
- Fresh element refs, URL/WebContents/conversation identity, generation/expiry; stale and revoked approvals reject.
- Dispatch does not imply business success; durable unknown effect fence does not replay.
- Real DeepSeek chooses read/fill/read/click/read against controlled page fixture with random DOM result, no intent injection.
- Separate real public Pi + DeepSeek open/approval/read path; no model/page/IPC fixtures.
- Existing web capture, local artifacts, questions/queue/skills and original Electron isolation regressions.

## Visual states

- Desktop permission selector + grant decision dock.
- Actual native browser operation approval shows exact target and full input.
- Dark desktop and 375 px consent layout: actions remain visible; page never covers dock.
- Privacy and trusted interaction risk copy remain readable without giant headings.

## Off-happy-path

- Denied click cannot execute; revoked tab cannot be read.
- Readonly rejects click/fill and cross-origin navigation.
- Modified payload/URL/generation and old refs reject.
- Process interruption after possible remote dispatch requires reconciliation, not replay.

## Evidence labeling

Native fixture injects SDK-shaped intents into temporary test SQLite and uses fixture model/HTTPS response; actual DOM/IPC/broker/runtime/database remain real. Real-model controlled-page test does not inject intents, but page response is still fixture. Public-page test uses actual network, model and page. Linux harness uses --no-sandbox; production webPreferences remain sandbox=true. Native CI is not signed release/keychain/actual-model macOS or Windows acceptance.

## Local results

- 130 unit tests, build/typecheck/lint/design check passed; full npm audit0.
- Native browser tool fixture passed9 groups, including request/open, scope upgrade invalidation and revocation; original local viewer6 groups, web context6 groups and Electron isolation smoke passed.
- Real public Pi + DeepSeek:5 model steps, verified2026-10-11T09:37:16.682Z; no model/web/IPC fixtures or intent injection. Initial page content was lazy; Agent scrolled and read again.
- Real DeepSeek controlled-page interaction:6 model steps, verified2026-10-11T09:37:32.615Z; SDK calls, main broker, actual DOM, IPC/runtime/SQLite real, only HTTPS page response fixture. Random result appeared only after actual DOM click.
- Failed initial dynamic-tool-catalog acceptance and first-read-only test assertion are not counted as passes. Stable browser catalog fixed stale model inference; public evidence assertion checks all actual reads rather than assuming first loaded content contains lazy page sections.
- Preview desktop light/dark and375px dark grant dock inspected; no horizontal page overflow, confirm action within viewport.
- Superseded Windows CI failed in the original web-context fixture because it clicked capture after URL/visibility but before load completion; app correctly refused. Fixture now waits isLoading=false, including refresh. No application security check was relaxed; verify final head CI separately.
- The public-page harness checks title/URL and ordered actual DOM words, allowing opacity-zero navigation that the fixed reader excludes but innerText includes. Earlier fixed-phrase/contiguous-prefix assertion failures were not counted as passes; actual returned page evidence was inspected before correcting the harness.
