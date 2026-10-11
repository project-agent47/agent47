# Current workstate

- Focus: tools/skills-first increment; bills, prices and budget-management products removed from scope by the owner.
- Branch: `feat/conversation-tools-skills`, based on merged master `eae7ed8`; this increment is not merged yet.
- Implementation: all conversation/tools/skills features plus simplified project authorization, automatic write-before snapshots, nested write/makeDirectory, UI restore, visible settings and scoped host trust. Existing tasks remain manual until explicitly changed.
- Verified: corrective real Electron + DeepSeek batch files/directories with Shell disabled and zero approval clicks; persisted UI undo after restart; visible host setting, actual Node/Shell under scoped trust and revoke/restart. Local unit/preview regression counts are recorded in the corrective delivery. Synthetic data only; native-picker stub, Linux test harness.
- Next: directly submit/update the feature PR as the owner instructed; inspect cross-platform CI without claiming installer/keychain certification, then target-platform runtime and skill lifecycle.
- Limits: host execution is not OS sandboxed; no browser/desktop automation, scheduler/MCP/multi-agent engine, binary skill assets/marketplace/upgrade/removal, full session-tree/rewind or exact model tokenizer. No signed Windows/macOS release or target-platform verification yet.
- Credentials: opaque approved Vault transport for sandbox tests only. Never commit raw credentials.
