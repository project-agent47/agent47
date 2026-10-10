# Current workstate

- Focus: first local-first Electron increment, full UI rebuild, removal of forced recipe workflows, AI SDK integration.
- Branch: `refactor/desktop-task-runtime`, based on `d1e2cd0`.
- Implementation: new root app and core runtime; legacy preserved but excluded from root builds.
- Verified: clean installation, build/type check, lint, 23 tests, three preview E2E scenarios, 42 contrast pairs and token drift rejection, approved-Vault real AI SDK tool loop, isolated Electron fixture smoke and Linux unpacked packaging. Full dependency audit reports zero vulnerabilities.
- Next: finish feature-branch delivery, then native Windows/macOS CI, encryption/install acceptance and utility-process/tool extension design.
- Limits: no native desktop/browser/shell tools, no scheduler/MCP/multi-agent engine; no signed Windows/macOS release or target-platform verification yet.
- Credentials: opaque approved Vault transport for sandbox tests only. Never commit raw credentials.
