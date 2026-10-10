# Agent47 desktop design system

## Context and scope

Rebuild mode. A single-user desktop assistant for frequent task handoff, progress review and exact-content approval. This system governs the React renderer and responsive review preview, not native OS dialogs or the contents of user-owned files. Designed tokens below are implemented in `src/renderer/style.css`; they are not recovered from the legacy UI.

The product UI and this offline showcase intentionally share all renderer tokens. They do not change OS colors or model-generated artifact content.

## Principles and rationale

- **Goal first:** the composer is the initial primary action; the user should not need to select a workflow to ask a question.
- **State before spectacle:** concise status labels, event timestamps and visible permission summaries make progress understandable without fictional activity.
- **Approve the actual change:** show filename and complete content adjacent to the decision, because a generic approve-stage button hides consequences.
- **Quiet technical workspace:** neutral green-gray surfaces, forest accent and packaged Geist fonts support long sessions without marketing decoration.
- **Honest empty states:** no saved artifacts means an explanation, not fake productivity metrics; preview data is explicitly labeled.

## Complete foundations

Values are designed. Color is semantic and mode-aware; type and spacing are shared. Native dialogs remain OS-owned.

| Token | Light | Dark |
|---|---|---|
| `--color-bg` | `#f5f6f4` | `#191e1a` |
| `--color-surface` | `#fff` | `#202621` |
| `--color-surface-2` | `#eff1ed` | `#28312a` |
| `--color-text` | `#202720` | `#e2e8de` |
| `--color-muted` | `#626d62` | `#a1aea0` |
| `--color-faint` | `#626c60` | `#92a18f` |
| `--color-border` | `#dce1d9` | `#394439` |
| `--color-divider` | `#e9ede5` | `#303a30` |
| `--color-primary` | `#315b3d` | `#9ab78e` |
| `--color-primary-hover` | `#25482f` | `#bad0b1` |
| `--color-primary-highlight` | `#e8eee5` | `#293d2d` |
| `--color-inverse` | `#fff` | `#172018` |
| `--color-sidebar` | `#edf0e9` | `#151b16` |
| `--color-warning` | `#805a21` | `#e0ba72` |
| `--color-warning-bg` | `#f5eddc` | `#3b3322` |
| `--color-error` | `#9d3737` | `#ee9a9a` |
| `--color-error-bg` | `#faeded` | `#3a2727` |
| `--shadow-card` | `0 4px 20px #20272006` | `0 4px 20px #0001` |
| `--shadow-modal` | `0 24px 100px #0003` | `0 24px 100px #0008` |
| `--font-body` | `'Geist', 'PingFang SC', 'Microsoft YaHei', sans-serif` | `'Geist', 'PingFang SC', 'Microsoft YaHei', sans-serif` |
| `--font-display` | `var(--font-body)` | `var(--font-body)` |
| `--font-mono` | `'Geist Mono', monospace` | `'Geist Mono', monospace` |
| `--text-xs` | `clamp(.75rem, .73rem + .1vw, .8125rem)` | `clamp(.75rem, .73rem + .1vw, .8125rem)` |
| `--text-sm` | `clamp(.875rem, .85rem + .12vw, .9375rem)` | `clamp(.875rem, .85rem + .12vw, .9375rem)` |
| `--text-base` | `clamp(1rem, .96rem + .15vw, 1.0625rem)` | `clamp(1rem, .96rem + .15vw, 1.0625rem)` |
| `--text-lg` | `clamp(1.125rem, 1.05rem + .3vw, 1.3125rem)` | `clamp(1.125rem, 1.05rem + .3vw, 1.3125rem)` |
| `--text-xl` | `clamp(1.5rem, 1.15rem + 1.1vw, 2rem)` | `clamp(1.5rem, 1.15rem + 1.1vw, 2rem)` |
| `--space-1` | `.25rem` | `.25rem` |
| `--space-2` | `.5rem` | `.5rem` |
| `--space-3` | `.75rem` | `.75rem` |
| `--space-4` | `1rem` | `1rem` |
| `--space-5` | `1.25rem` | `1.25rem` |
| `--space-6` | `1.5rem` | `1.5rem` |
| `--space-8` | `2rem` | `2rem` |
| `--space-10` | `2.5rem` | `2.5rem` |
| `--space-12` | `3rem` | `3rem` |
| `--space-16` | `4rem` | `4rem` |
| `--radius-sm` | `6px` | `6px` |
| `--radius-md` | `10px` | `10px` |
| `--radius-lg` | `14px` | `14px` |
| `--radius-xl` | `18px` | `18px` |
| `--transition` | `160ms ease` | `160ms ease` |

## Vocabulary

| Term | Use | Avoid | Rationale |
|---|---|---|---|
| 任务 | Goal-scoped unit | Recipe / mandatory workflow | Goal determines the necessary steps |
| 待你审阅 | Pending exact-content action | Awaiting general stage approval | The user sees what is blocked |
| 批准创建 | One new artifact payload | Execute everything | Limited permission is explicit |
| 拒绝写入 | Refuse proposed creation | Skip approval | Denial is not bypass |
| 停止任务 | Stop future work | Roll back | In-flight approved I/O may finish |
| 成果 | Approved portable file | Fake browser output | Deliverable is traceable |
| 交互预览 | In-memory demo | Live agent | Avoid misleading capability claims |

## Layout and components

Desktop: 236px navigation rail, 65px header, fluid task content with 1040px reading canvas. Below 1150px the optional inspector stacks; below 760px navigation compresses and cards stack. Desktop application minimum: 900×650. Mobile 375px is preview accessibility, not a mobile application target.

- **Composer:** goal textarea, optional folder context, guidance selector, one submit action. Empty input disables submit; Ctrl/Cmd+Enter submits.
- **Navigation:** current page indication plus recent tasks. Ctrl/Cmd+N creates a new composition; no forced workflow menu.
- **Task row:** semantic status text, title, guidance and folder metadata; status never depends on color alone.
- **Approval:** warning top rule, exact filename, full scrollable source content, explicit scope, expiry, paired reject/approve actions.
- **Conversation:** text rendered safely, never raw HTML; assistant and user roles separated by labels and icons.
- **Inspector:** optional activity timeline and permission summary. It is not a permanently required third panel.
- **Artifact:** inspect before open/download; source task remains navigable.
- **Settings:** HTTPS base URL, model ID, password key field, storage availability, test status. Demo key input disabled.
- **Feedback:** loading spinner plus text; local error banner dismissible; empty states explain next action.
- **Modal:** content review, close button and Escape. Native desktop support follows browser interaction patterns.

## Motion and accessibility

Functional 160–180ms transitions; no background animation. Honor reduced motion. Use visible keyboard focus, explicit labels and disabled states; the core task path is keyboard-operable. Status text accompanies color. Source text wraps, and layout stacks at narrow widths.

Controlled text pairs are computed from the exact hex tokens. All listed enabled text pairs pass WCAG AA 4.5:1. Disabled controls are excluded from the normal contrast requirement. The showcase falls back to readable system fonts offline; production renderer bundles Geist fonts. Native high-contrast modes remain OS-owned and require separate platform validation.

Artifact dialog keyboard focus is managed in the product. 200% zoom and native screen-reader validation remain explicit platform acceptance checks rather than assumed passes.

## Computed contrast

| Mode | Foreground / background | Ratio |
|---|---|---|
| light | text / bg | 14.11:1 |
| light | text / surface | 15.30:1 |
| light | text / surface-2 | 13.46:1 |
| light | text / sidebar | 13.29:1 |
| light | muted / bg | 4.99:1 |
| light | muted / surface | 5.41:1 |
| light | muted / surface-2 | 4.76:1 |
| light | muted / sidebar | 4.70:1 |
| light | faint / bg | 5.05:1 |
| light | faint / surface | 5.48:1 |
| light | faint / surface-2 | 4.82:1 |
| light | faint / sidebar | 4.76:1 |
| light | primary / bg | 7.19:1 |
| light | primary / surface | 7.79:1 |
| light | primary / surface-2 | 6.86:1 |
| light | primary / sidebar | 6.77:1 |
| light | primary / primary-highlight | 6.60:1 |
| light | inverse / primary | 7.79:1 |
| light | inverse / primary-hover | 10.26:1 |
| light | warning / warning-bg | 5.30:1 |
| light | error / error-bg | 6.06:1 |
| dark | text / bg | 13.55:1 |
| dark | text / surface | 12.37:1 |
| dark | text / surface-2 | 10.77:1 |
| dark | text / sidebar | 14.02:1 |
| dark | muted / bg | 7.31:1 |
| dark | muted / surface | 6.67:1 |
| dark | muted / surface-2 | 5.81:1 |
| dark | muted / sidebar | 7.56:1 |
| dark | faint / bg | 6.21:1 |
| dark | faint / surface | 5.67:1 |
| dark | faint / surface-2 | 4.94:1 |
| dark | faint / sidebar | 6.43:1 |
| dark | primary / bg | 7.68:1 |
| dark | primary / surface | 7.01:1 |
| dark | primary / surface-2 | 6.10:1 |
| dark | primary / sidebar | 7.95:1 |
| dark | primary / primary-highlight | 5.30:1 |
| dark | inverse / primary | 7.59:1 |
| dark | inverse / primary-hover | 10.15:1 |
| dark | warning / warning-bg | 6.80:1 |
| dark | error / error-bg | 6.49:1 |

## To confirm

Windows/macOS native menus, app icon exports, high-DPI behavior, OS high-contrast mode, target-platform screen-reader behavior, localization policy and brand naming remain open.

<!-- TOKENS_JSON {"light":{"--color-bg":"#f5f6f4","--color-surface":"#fff","--color-surface-2":"#eff1ed","--color-text":"#202720","--color-muted":"#626d62","--color-faint":"#626c60","--color-border":"#dce1d9","--color-divider":"#e9ede5","--color-primary":"#315b3d","--color-primary-hover":"#25482f","--color-primary-highlight":"#e8eee5","--color-inverse":"#fff","--color-sidebar":"#edf0e9","--color-warning":"#805a21","--color-warning-bg":"#f5eddc","--color-error":"#9d3737","--color-error-bg":"#faeded","--shadow-card":"0 4px 20px #20272006","--shadow-modal":"0 24px 100px #0003","--font-body":"'Geist', 'PingFang SC', 'Microsoft YaHei', sans-serif","--font-display":"var(--font-body)","--font-mono":"'Geist Mono', monospace","--text-xs":"clamp(.75rem, .73rem + .1vw, .8125rem)","--text-sm":"clamp(.875rem, .85rem + .12vw, .9375rem)","--text-base":"clamp(1rem, .96rem + .15vw, 1.0625rem)","--text-lg":"clamp(1.125rem, 1.05rem + .3vw, 1.3125rem)","--text-xl":"clamp(1.5rem, 1.15rem + 1.1vw, 2rem)","--space-1":".25rem","--space-2":".5rem","--space-3":".75rem","--space-4":"1rem","--space-5":"1.25rem","--space-6":"1.5rem","--space-8":"2rem","--space-10":"2.5rem","--space-12":"3rem","--space-16":"4rem","--radius-sm":"6px","--radius-md":"10px","--radius-lg":"14px","--radius-xl":"18px","--transition":"160ms ease"},"dark":{"--color-bg":"#191e1a","--color-surface":"#202621","--color-surface-2":"#28312a","--color-text":"#e2e8de","--color-muted":"#a1aea0","--color-faint":"#92a18f","--color-border":"#394439","--color-divider":"#303a30","--color-primary":"#9ab78e","--color-primary-hover":"#bad0b1","--color-primary-highlight":"#293d2d","--color-inverse":"#172018","--color-sidebar":"#151b16","--color-warning":"#e0ba72","--color-warning-bg":"#3b3322","--color-error":"#ee9a9a","--color-error-bg":"#3a2727","--shadow-card":"0 4px 20px #0001","--shadow-modal":"0 24px 100px #0008","--font-body":"'Geist', 'PingFang SC', 'Microsoft YaHei', sans-serif","--font-display":"var(--font-body)","--font-mono":"'Geist Mono', monospace","--text-xs":"clamp(.75rem, .73rem + .1vw, .8125rem)","--text-sm":"clamp(.875rem, .85rem + .12vw, .9375rem)","--text-base":"clamp(1rem, .96rem + .15vw, 1.0625rem)","--text-lg":"clamp(1.125rem, 1.05rem + .3vw, 1.3125rem)","--text-xl":"clamp(1.5rem, 1.15rem + 1.1vw, 2rem)","--space-1":".25rem","--space-2":".5rem","--space-3":".75rem","--space-4":"1rem","--space-5":"1.25rem","--space-6":"1.5rem","--space-8":"2rem","--space-10":"2.5rem","--space-12":"3rem","--space-16":"4rem","--radius-sm":"6px","--radius-md":"10px","--radius-lg":"14px","--radius-xl":"18px","--transition":"160ms ease"}} -->
