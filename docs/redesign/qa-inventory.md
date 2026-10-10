# QA inventory

## User-visible claims and checks

| Claim/control | Functional check | Visual state/evidence |
|---|---|---|
| Completely rebuilt UI | Home/task/artifacts/capabilities/settings navigation | Desktop and 375px mobile screens |
| New task, no fixed workflow | Empty goal disables submit; input + submit creates running then completed preview task | Composer and task detail |
| Folder context | Choose and remove simulated grant; native picker code/guard checked separately | Attached context chip |
| Task guidance | All three starters and skill select change composition mode | Starter and capability cards |
| Search/filter | All/active/approval tabs and nonmatching search | Matching and empty states |
| Action-specific approval | Approve and deny separate fresh demo sessions | Full content, saved artifact or denial |
| Cancellation | Cancel during simulated work; Electron/core tests fence late output | Cancelled task and new-task handoff |
| Execution details | Toggle inspector open/closed | Task timeline and permissions |
| Artifact review | Open/close dialog, source task, preview file download | Artifact library and modal |
| Connection state | Preview key inputs disabled; connection test explicitly simulated | Settings result and disabled save |
| Actual SDK execution | Real approved-Vault coding task reads, proposes, approves and saves | Separate CLI record, not preview |
| Desktop isolation | Actual Electron process bridges task execution with fixture model | IPC response no Node/process/key exposure |
| Theme | Light → dark → light | Home, detail and settings states |
| Off-happy paths | Nonmatching search; empty/long goal; denied approval; stop task | No overflow or misleading completion |

## Scope of signoff

Preview uses only explicit example data and does not call the provider. CLI real-model validation and Electron fixture validation are separate evidence. A successful preview does not prove real model or native OS automation.

Check page/region horizontal bounds, clipping, text legibility, focus states, reduced-motion styles and color contrast. Verify desktop and mobile navigation; supported desktop app minimum is 900×650. 375px preview is a responsive review convenience, not a promised mobile app.

Windows/macOS native installation and safeStorage behavior are excluded from Linux-host signoff and remain open acceptance gates.
