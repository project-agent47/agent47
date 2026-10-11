# Decision dock QA inventory

This increment changes conversation interactions, not the artifact split viewer.

| Claim / control | Functional check | Visual state / evidence |
| --- | --- | --- |
| Multiple questions, single/multi choice, custom text, optional skip | Preview and live Electron choices → review → one submit | Question light/dark, review screenshot |
| Back/progress navigation, local autosave | Preview back/edit; SQLite reopen unit/live checks | Selected choices after restart |
| Composer draft separate from answers | Supplement → draft → return → reopen | Dock form versus ordinary composer |
| Cancel, stale/duplicate response | Unit invalidation/idempotency; live cancel | Cancel control, no extra reply required |
| Permissions and artifacts in dock | Existing preview approval/denial; live file scope | Approval content, scope review |
| Explicit trusted conversation | Visible consent → actual Node/Shell; global revoke | Full OS-rights warning, no sandbox claim |
| Queue does not answer or grant | Preview delete/promote; runtime stale binding checks | Queue above decision, immediate-send invalidation |
| Compact fixed-bottom layout | Dock bounds at 1440×1000, 900×650, 375×812 | No horizontal clipping; independently scrolling body |
| Legacy questions and reconciliation | Runtime legacy migration; retained reconciliation dock | Existing labels remain usable |

Exploratory checks: switch between answers and an unsent chat draft repeatedly;
expand permission content with a queue present on the narrow viewport. Review
focus, footer reachability and long command/content scrolling independently of
document width checks. Preview fixtures are not model/runtime evidence.
