# Artifact workspace QA inventory

- Claims: persistent multi-tab split pane; local-only HTML/Markdown/code view;
  read-only Monaco; safe system-viewer fallback; decisions stay in bottom dock.
- Controls: file picker, artifact/proposal open, tab switch/close/reorder,
  hide/reopen, splitter mouse/keyboard, source/render, refresh, system open.
- Layout checks: desktop light/dark, 900×650 minimum, narrow 375×812 fallback.
- Real native checks: user imports HTML/Markdown/code/PDF, JS interaction, iframe/
  network/file/IPC/popup denial, resize/hidden native view, restart version pins,
  close teardown, no model invocation merely for viewing.
- Real model check: DeepSeek writes HTML artifact then open/render/proposal;
  input/decision flow remains usable. Fixture native security test is separate.
- Off-path: external file change does not silently replace pinned snapshot;
  malformed workspace state does not overwrite durable data; code models/workers
  disposed on close; HTML crash/stop remains recoverable.
- Known first-split limit: single selected file only; no relative resource bundle
  or page-control tools, code edits or automatic model context attachment.
