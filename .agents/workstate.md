# Current workstate

- Baseline: self-reviewed and merged PR #4 at master `b83311d35ff2920a02e2888ab9d0fe906881bbdd`, per owner approval. Previous PR #2/#3 baseline remains included.
- Active branch: `feat/artifact-split-workspace`. Submit the local viewer increment as a PR; do not auto-merge it.
- Implemented: persistent right-side tabs, artifact/proposal/user-file routing, isolated offline HTML `WebContentsView`, safe GFM Markdown, lazy readonly Monaco, explicit refresh, tab ordering/width and system-viewer fallback.
- Decisions remain in the fixed-bottom dock; previewing a proposal is not approval. Default project snapshots and trusted-conversation policies are unchanged.
- HTML has no app preload/IPC/Node and uses an ephemeral session. Inline scripts work; external resources, relative files, popups, forms, permissions and embedded frames are denied. Native layout requests are serialized and generation-bound to avoid resurrecting stale overlays.
- Viewing is local only: no automatic model context or paid requests. UTF-8 text <=1 MB; whitelisted unsupported docs <=20 MB; <=10 pinned tabs. No URL browser/page tools, resource bundles, code edit/LSP or automatic file-change detection yet.
- Evidence: `docs/workspace-qa.md`, native fixture `scripts/e2e-workspace-native.mjs`, real DeepSeek desktop `scripts/e2e-desktop-live.mjs`. Native security fixture and paid real-model acceptance are separate.
- DeepSeek askUser schemas need an object root, not a root union. Preserve runtime exclusivity and digest/idempotency boundaries.
- Limits: host tools retain system-user rights, not an OS sandbox; snapshots exclude Shell/JS and remote effects. No signed release/native real-model acceptance, scheduling/MCP/multi-agent, billing/prices or binary skill assets.
- Secrets: opaque approved Vault transport only, no committed/printed secrets. Synthetic test data only.
