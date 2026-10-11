# Current workstate

- Baseline: PR #5 self-reviewed and merged per owner approval, master `d22a51e57b10b0dd8d341edce5a5e0d3f7665752`; all previous increments remain included.
- Active branch: `feat/agent-web-workspace`, based on OPEN PR #6 `85947b9`. Submit Agent browser increment as a stacked PR against `feat/workspace-web-context`; do not auto-merge either PR.
- Implemented: persistent right-side tabs, artifact/proposal/user-file routing, isolated offline HTML `WebContentsView`, safe GFM Markdown, lazy readonly Monaco, explicit refresh, tab ordering/width and system-viewer fallback.
- Decisions remain in the fixed-bottom dock; previewing a proposal is not approval. Default project snapshots and trusted-conversation policies are unchanged.
- HTML has no app preload/IPC/Node and uses an ephemeral session. Inline scripts work; external resources, relative files, popups, forms, permissions and embedded frames are denied. Native layout requests are serialized and generation-bound to avoid resurrecting stale overlays.
- Local viewing remains offline/no automatic model calls. New URL tabs are public HTTPS native browsers with per-tab ephemeral sessions and authenticated DNS-pinned CONNECT gateways. Never expose gateway credentials or model transport to pages; no app preload/Node/IPC.
- User-triggered capture runs a constant isolated-world program, bounded 8000-char text, excludes forms/scripts/hidden nodes/frames, then bottom-dock review. Only exact ticket/digest/URL/expiry/context binding sends to runtime. Running conversations use the existing queue.
- New Agent tools: browserOpen/Tabs/Activate/Read/Navigate/Scroll/Click/Fill; SDK intents only, durable runtime and main broker execute. Conversation+Tab+origin grants, modes read/ask/allow, visible toolbar and bottom consent, ephemeral/revocable; read-only does not permit clicks/fills. No arbitrary JS/selectors/secrets/uploads/frames. DOM refs expire2min and are tied to actual elements/URL/WebContents/conversation; effects checkpointed, unknown results never auto-replay.
- Trusted web interaction is explicitly broad: button/input events can have arbitrary remote effects. Do not claim automatic semantic irreversible-action detection. Dispatch is not business success; re-read afterward.
- Design `docs/redesign/agent-browser-tools.md`; fixture and real-model controlled-page tests explicitly distinguish intent/model/page/network mocks.
- Web tabs restore paused without reconnecting or restoring cookies. Stop/refresh/close invalidates tickets. Native revision fixes same-content refresh; keep layout generations and snapshot behavior.
- References are now Pi.dev/Codex/OpenCode workflow and DeepSeek Harness desktop/UI only. No new extension SDK, plugin marketplace or third-party interfaces; existing SKILL.md functionality is retained, not expanded.
- Evidence: `docs/web-context-qa.md`, fixture `scripts/e2e-web-workspace-native.mjs`, real `scripts/e2e-web-context-live.mjs`. Gateway unit dial is mapped only in unit fixtures; native HTTPS response fixture and real external website/model evidence must stay distinct.
- DeepSeek askUser schemas need an object root, not a root union. Preserve runtime exclusivity and digest/idempotency boundaries.
- Limits: host tools retain system-user rights, not an OS sandbox; snapshots exclude Shell/JS and remote effects. No signed release/native real-model acceptance, scheduling/MCP/multi-agent, billing/prices or binary skill assets.
- Secrets: opaque approved Vault transport only, no committed/printed secrets. Synthetic test data only.
