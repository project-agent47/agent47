# Public web workspace QA

- Scope: public HTTPS URL tabs in the existing right pane, independent ephemeral
  native browser sessions, explicit user-reviewed snapshot delivery to DeepSeek.
- No new plugins, extension SDK, MCP, custom provider or browser automation tools.
- References: Pi.dev/Codex/OpenCode workflow only; official DeepSeek Harness UI
  baseline. Do not pick a same-name community Desktop fork as official evidence.
- Verify gateway authentication, DNS validation+pinning, reserved/loopback/IP/
  HTTP denial, TLS passthrough, navigation isolation, no preload/IPC/Node.
- Verify browsing without model requests, full excerpt review in bottom dock,
  cancel with no message, digest/expiry/URL/stop/close binding, queue/follow-up,
  restart pauses web tabs without network/session restoration.
- Verify capture excludes scripts/forms/input values/hidden nodes/frames, bounded
  plain text, current URL/title metadata; hostile page instructions are evidence.
- Native fixture and real-model acceptance must be separate. Real site network
  check must not be called offline/synthetic evidence; TLS gateway unit dial is a
  controlled localhost mapping and is not a production bypass.
- Preserve previous local HTML/Markdown/Monaco/queue/decisions regressions.
- Visual: desktop light/dark, 900x650, narrow fallback, dock and right split,
  long URL/excerpt, browser failure/paused/retry, no clipped consent buttons.
