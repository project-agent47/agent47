# Fullscreen Workbench Refactor Design

Date: 2026-06-30
Status: Draft for user review

## 1. Summary

This refactor turns the current Decision Workspace from a website-shaped dashboard into a full-screen, product-native AI workbench.

The target feel is closer to **Linear as a working tool** than a landing page inside a shell:

- no outer website chrome around the workspace
- no floating page card composition
- no hero-style content inside the product surface
- a direct, dense, full-viewport operating environment

The workspace remains a three-column layout, but the hierarchy changes:

- **left** = navigation and run selection
- **center** = active run process stream
- **right** = inspector for summary, artifacts, and detail
- **bottom composer** = the main input surface for new work and follow-up prompts

The homepage and sign-in page are also redesigned so they feel like product entry points rather than a separate marketing shell.

## 2. Problem statement

The current UI has the right broad idea but the wrong product shape.

### 2.1 Current problems

1. The workspace still sits inside a generic `AppShell`, so it feels embedded inside a website rather than being the product itself.
2. The three columns still read as stacked cards and page sections, not as a single operating surface.
3. The center pane gives too much attention to the large prompt box and not enough to the run that is already in progress.
4. The right pane behaves like another content card instead of a true inspector.
5. The homepage and sign-in flow have a different visual language from the workspace, which reinforces the feeling of “outer shell + inner tool.”

### 2.2 User expectation

The desired experience is:

> Open the app and immediately feel inside a serious AI workbench, not inside a web page that happens to contain one.

## 3. Goals and non-goals

### 3.1 Goals

- Make `/workspaces/[workspaceId]` a true full-screen route
- Remove website-like chrome from the workspace route
- Make the active run process the visual and interaction center
- Move task entry into a persistent bottom composer
- Turn the right pane into a focused inspector
- Align homepage and sign-in with the same product family while keeping them minimal
- Preserve the current working flow: sign in, enter workspace, create run, inspect result

### 3.2 Non-goals

- No runtime architecture rewrite
- No recipe model redesign
- No auth model redesign
- No new collaboration features
- No major persistence schema change

This is a **product-surface refactor**, not a platform rewrite.

## 4. Design principles

### 4.1 Product first, webpage second

Workspace routes should not look like documents or promotional pages. The product surface is the page.

### 4.2 Density with control

The interface should feel sharper and denser, but never chaotic. Information is compact, not cramped.

### 4.3 One dominant surface

The center pane is where the user spends time. It should show the live run process, not just an intake form.

### 4.4 Sidebars are tools, not content areas

Left and right columns exist to support the work in the center, not compete with it.

### 4.5 Visual restraint

The UI should avoid large radii, decorative card stacks, soft “dashboard” shadows, or marketing-style highlights.

## 5. Route and shell architecture

### 5.1 Split shell model

The application will use two top-level presentation modes:

1. **Entry mode**
   - used by `/` and `/signin`
   - minimal product-entry layout
   - still branded, but not marketing-heavy

2. **Workbench mode**
   - used by `/workspaces/*`
   - full viewport
   - no outer `AppShell`
   - no centered page container
   - no floating site header

### 5.2 Implementation boundary

The route-level shell decision should live above page components, so workbench pages do not need to manually fight global spacing, max widths, or sticky headers inherited from the default shell.

That means the root layout should select a shell by route, or the current `AppShell` should become shell-aware enough to render nothing around workspace routes.

## 6. Layout design

## 6.1 Overall frame

The workspace occupies the entire viewport from the very top edge.

```text
+----------------------------------------------------------------------------------+
| left rail              | active run / process stream            | inspector      |
|------------------------|----------------------------------------|----------------|
| workspaces             | run title / status / context           | summary        |
| runs                   |----------------------------------------| artifacts      |
| filters / shortcuts    | timeline / checkpoints / activity      | citations      |
|                        | timeline / intermediate output         | detail view    |
|                        | timeline / approvals / transitions     |                |
|                        |                                        |                |
|                        |----------------------------------------|----------------|
|                        | bottom composer                                          |
+----------------------------------------------------------------------------------+
```

### 6.2 Left rail

The left rail is a narrow operational sidebar.

It contains:

- workspace identity
- workspace switching
- run list
- lightweight run state markers

It does **not** contain large section cards, explanatory copy, or hero content.

### 6.3 Center pane

The center pane is the primary work surface.

It contains:

- current run title
- active status
- process stream / checkpoints
- intermediate state and progress indicators
- empty-state guidance when no run exists

The center pane should feel like a timeline or execution surface rather than a form page.

### 6.4 Bottom composer

The input area becomes a persistent bottom composer inside the center pane.

It supports:

- creating a new run when nothing is active
- issuing the next task or follow-up prompt when a run exists
- quick starter prompt insertion

The composer should feel anchored and ready, not like a large landing-page textarea.

### 6.5 Right inspector

The right column becomes an inspector, not a second narrative page.

It contains:

- summary
- recommendation
- artifacts
- citations
- selected detail

The tone is “inspect the selected thing,” not “read another content card.”

## 7. Visual direction

## 7.1 Tone

The visual reference is **Linear-like product sharpness**, not a literal clone of Linear UI.

The product should feel:

- technical
- focused
- quiet
- high-signal

It should not feel:

- warm editorial
- marketing-driven
- soft dashboard-like
- chat-first

## 7.2 Palette

The palette is restrained and tool-oriented:

- **Obsidian** `#0A0F14`
- **Graphite** `#111827`
- **Steel** `#1F2937`
- **Mist** `#94A3B8`
- **Ice** `#E2E8F0`
- **Signal cyan** `#67E8F9`

Use of cyan is limited to:

- focus state
- active selection
- live/running indicators
- critical interaction highlights

## 7.3 Shape and surfaces

- panel corners become smaller and firmer
- shadows are minimal
- separators matter more than cards
- large rounded “widget” blocks are reduced or removed
- the layout reads as one continuous tool with internal partitions

## 7.4 Typography

Typography should be compact and structured:

- tighter heading tracking
- smaller metadata text
- stronger hierarchy through weight and spacing, not oversized display copy

No display-style hero treatment should appear inside the workspace.

## 8. Page-by-page behavior

### 8.1 Homepage

Homepage becomes a minimal product-entry page.

It should include:

- a single product statement
- one primary action
- optional secondary action

It should not include:

- a feature grid pretending to be marketing
- long explanatory sections
- ornamental panels that are absent from the product itself

### 8.2 Sign-in page

Sign-in becomes a narrow, product-native entry surface.

It should feel like entering the tool, not visiting a separate auth microsite.

### 8.3 Workspace page

The workspace page becomes the full-screen workbench and is the main focus of this refactor.

## 9. Component refactor plan

### 9.1 Shell layer

- separate entry layout and workbench layout responsibilities
- remove workspace dependence on the current generic `AppShell`

### 9.2 Workbench composition

Refactor the current `workbench-shell.tsx` into clearer subregions:

- `SidebarRail`
- `RunActivityPane`
- `RunInspectorPane`
- `WorkbenchComposer`

These may remain in one file initially, but the UI structure should be designed around these boundaries.

### 9.3 Styling system

Global styling should support two modes:

- entry surfaces
- workbench surfaces

This prevents homepage/sign-in constraints from leaking into the workspace and vice versa.

## 10. Data and interaction flow

The runtime flow does not fundamentally change:

1. user signs in
2. user lands in workspace
3. user submits a task
4. run is created
5. run process appears in center pane
6. summary/details appear in right inspector

The main change is **where emphasis sits in the UI**, not how the backend run creation works.

## 11. Error handling and empty states

### 11.1 Empty workspace

When no run exists:

- center pane shows a clear empty process state
- bottom composer remains available
- right inspector shows a neutral placeholder

### 11.2 Failed run creation

If run creation fails:

- the composer remains available
- the error appears close to the composer
- no fake success states are shown

### 11.3 Sparse data

If artifacts or citations are absent:

- the inspector should show explicit absence states
- the pane should not collapse into awkward blank cards

## 12. Testing impact

The refactor must preserve the current verified path:

1. open app
2. sign in
3. land in workspace
4. submit a task
5. observe run creation
6. inspect the resulting output

Tests should be updated to assert:

- workspace routes render full-screen workbench structure
- the composer is available in the new position
- the active run remains visible after creation
- summary content remains reachable from the inspector

## 13. Success criteria

The refactor is successful when:

1. The workspace no longer looks like a page inside a shell.
2. The center pane is clearly the active run surface.
3. The composer feels persistent and operational.
4. The right column reads as an inspector, not another content block.
5. Homepage and sign-in feel like product entry points, not a separate visual system.
6. Existing run creation behavior still works end to end.

## 14. Final recommendation

This refactor should be executed as a **route-shell refactor plus workbench-surface refactor**, not as a CSS-only pass.

If the shell remains website-shaped, the product will continue to feel website-shaped no matter how much styling changes inside the three columns.

The key decision is therefore:

> treat the workspace as a full-screen application surface with its own shell model.
