# Current workstate

- Focus: tools/skills-first increment; bills, prices and budget-management products removed from scope by the owner.
- Branch: `feat/conversation-tools-skills`, based on merged master `eae7ed8`; this increment is not merged yet.
- Implementation: AI SDK streaming/reasoning, safe GFM, linked multi-run conversation, askUser, durable steer/follow-up, reported token usage, approved project write/edit, opt-in host Node/Shell utility process, skill import/enable/disable/lazy reads and automatic safe-turn compaction.
- Verified: clean npm ci, build/type check, lint, 42 unit tests, four preview scenarios, 42 contrast pairs/token drift rejection, full audit zero findings, isolated Electron smoke. Real Electron + DeepSeek original flows and new capability flows passed; synthetic data and only native-picker stub.
- Next: finish branch delivery, review target-platform install/native storage/utility-process behavior, then skill lifecycle and context projection scaling.
- Limits: host execution is not OS sandboxed; no browser/desktop automation, scheduler/MCP/multi-agent engine, binary skill assets/marketplace/upgrade/removal, full session-tree/rewind or exact model tokenizer. No signed Windows/macOS release or target-platform verification yet.
- Credentials: opaque approved Vault transport for sandbox tests only. Never commit raw credentials.
