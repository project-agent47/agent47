# Current workstate

- Focus: DeepSeek-only desktop acceptance and Agent framework selection, followed by the owner's authorized development merge.
- Branch: merged into `master` by authorized fast-forward; implementation commit `ffd9f497c199416703ef98bead564cf62531c1fa`, based on `d1e2cd0`.
- Implementation: new root app and core runtime; legacy preserved but excluded from root builds.
- Implementation follow-up: AI SDK ToolLoopAgent provides one model step; TaskRuntime retains durable orchestration and approval/effect boundaries. Product accepts DeepSeek model IDs only.
- Verified: clean installation, build/type check, lint, 27 tests, three preview E2E scenarios, 42 contrast pairs and token drift rejection, real DeepSeek Electron approval/restart/save, direct answer, denial and stop/restart scenarios. Electron isolation fixture smoke and earlier Linux unpacked packaging pass. Full dependency audit reports zero vulnerabilities.
- Next: native Windows/macOS CI, encryption/install acceptance, continuous conversation/context and usage-budget design, then utility-process/tool extension design.
- Limits: no native desktop/browser/shell tools, no scheduler/MCP/multi-agent engine; no signed Windows/macOS release or target-platform verification yet.
- Credentials: opaque approved Vault transport for sandbox tests only. Never commit raw credentials.
