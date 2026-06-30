# Local Agent Execution Layer Design

Date: 2026-06-30
Status: Draft for user review

## 1. Summary

This design defines the next major sub-project for Decision Workspace: a **real local-first agent execution layer** that can:

- research with search, browser, and document tools
- pause for human approval
- continue into execution only after approval
- produce a final report, structured result package, and generated files

The system will not depend on external search or document SaaS providers in its first implementation. Instead, it will use **Playwright and Node.js libraries** as the concrete tool layer.

This design also updates the workspace product surface so the execution system is visible:

- default **light theme**
- real **dark mode toggle**
- three panes that **scroll independently**
- a center-pane composer that stays **fixed at the bottom**

## 2. Problem statement

The current application can create runs and show result packages, but it still behaves like a simplified demo:

1. research, approval, and execution are not separate phases
2. external capabilities are not modeled as real tool behavior
3. the UI does not clearly show what the agent is doing
4. the product can fall back to local recipe generation without a clear execution architecture
5. the current workbench still presents activity as a thin event list instead of a true lifecycle

The next step is not “more styling.” It is a proper execution core with a product surface that exposes that core.

## 3. Goals and non-goals

### 3.1 Goals

- Introduce a fixed run lifecycle: `intake -> research -> approval -> execution -> package`
- Implement search, browser, document, and file-writing capabilities through local tooling
- Generate a structured **research dossier** before execution begins
- Require explicit human approval before execution starts
- Generate a final **artifact bundle** after execution finishes
- Expose execution phases, provider/model metadata, dossier state, approval state, and file outputs in the workspace UI
- Make the workspace default to a light theme with a dark-mode toggle
- Split left, center, and right panes into independent scroll containers
- Keep the composer fixed to the bottom of the center pane

### 3.2 Non-goals

- No multi-agent orchestration in this phase
- No general workflow-builder UI
- No long-term memory system
- No enterprise permissions or team collaboration system
- No dependence on Tavily, Firecrawl, or other external search/document services for the first implementation

## 4. Product principle

This phase should make the product feel like a real agent workbench, not a templated reporting interface.

The critical rule is:

> The user must be able to see what the system researched, why it stopped for approval, what it executed next, and what it produced.

## 5. Runtime architecture

## 5.1 Fixed lifecycle

Every run follows the same five-phase state machine:

1. **Intake**
   - normalize the user request
   - capture constraints
   - choose the execution path

2. **Research**
   - run search queries
   - open and inspect web pages in the browser
   - parse provided documents
   - collect notes and candidate actions
   - produce a research dossier

3. **Approval**
   - stop execution automatically
   - present the dossier, evidence, risk notes, and proposed next actions
   - wait for the user to approve or revise direction

4. **Execution**
   - perform the approved actions
   - generate files and structured outputs
   - record intermediate execution events

5. **Package**
   - assemble final report
   - assemble structured result package
   - attach generated files
   - preserve execution history

This lifecycle is fixed because it provides predictability and makes the UI easier to reason about.

## 5.2 Core units

The execution layer is split into four clear units.

### A. Run machine

The run machine owns state transitions only.

It decides:

- when research begins
- when approval is required
- when execution is unlocked
- when the run is packaged
- when the run stops in failure

It does not implement browser behavior, search behavior, or document parsing directly.

### B. Tool adapters

Each external capability is wrapped in a tool adapter with a stable interface:

- `search`
- `browser`
- `document-reader`
- `file-writer`

This lets the runtime call tools consistently while keeping the implementation swappable.

### C. Research dossier

Research does not go straight into the final result package.

It first creates a dossier that contains:

- search sessions
- visited pages
- extracted notes
- document findings
- structured findings
- proposed execution plan
- open risks and unknowns

The dossier is the approval object.

### D. Execution artifact bundle

After approval, execution produces an artifact bundle that contains:

- generated files
- execution log
- final report
- final result package
- references back to the dossier

## 6. Local-first tool behavior

## 6.1 Search

Search is implemented locally, not as a thin placeholder.

The first implementation should create a **search session** object that records:

- query
- candidate results
- which result pages were opened
- which result pages were discarded
- why a page was rejected or selected

Search should not simply return “top 5 links.” It must feed the dossier.

## 6.2 Browser

The browser capability uses Playwright and supports two modes:

### Research mode

- open chosen result pages
- inspect the rendered page
- extract headings, text blocks, tables, or other relevant content
- paginate or expand content when necessary
- record which pages were actually used

### Execution mode

- navigate through approved target flows
- trigger downloads or generation actions
- interact with forms or multi-step pages when explicitly required by the approved plan
- write back browser actions into the execution log

The browser is not just for screenshots. It is a real agent tool.

## 6.3 Document reader

Document reading uses local Node.js libraries rather than external document APIs.

The first implementation should produce **document notes** with:

- document metadata
- extracted summary
- key passages
- citable excerpts
- relevance to the user’s goal

These notes become part of the dossier and can later be surfaced in the UI and result package.

## 6.4 File writer

The file writer creates generated outputs during execution.

The initial output types should support:

- markdown report
- JSON structured output
- plain-text working files

These outputs are attached to the artifact bundle and shown in the inspector.

## 7. Research dossier

The dossier is the product’s central new object in this phase.

It must include:

- goal
- constraints
- search sessions
- page notes
- document notes
- synthesized findings
- recommendation before execution
- proposed execution plan
- risks and unresolved questions

The dossier is not the final answer. It is the research package the user reviews before allowing execution.

## 8. Approval model

Approval happens exactly once in the first implementation:

- after research
- before execution

The approval screen/state must show:

- research summary
- supporting evidence
- proposed execution plan
- risk or ambiguity notes
- explicit action to continue execution

Execution must not start before approval. This is a hard rule.

## 9. Final outputs

The completion state for this phase is:

1. **Research report**
   - human-readable summary of the research stage

2. **Structured result package**
   - recommendation
   - evidence
   - next actions
   - confidence
   - open questions

3. **Attachment files**
   - one or more generated files created during execution

4. **Execution log**
   - phase-by-phase activity record

## 10. Workspace UI behavior

## 10.1 Theme system

The workspace should use:

- **light theme by default**
- **dark mode toggle**

This must be one token system with two modes, not two independent UI implementations.

## 10.2 Independent scrolling

The three workspace panes must scroll independently:

- **left rail** scrolls workspace/run navigation
- **center pane** scrolls activity stream content only
- **right inspector** scrolls dossier, approval, and artifact content only

The entire page should not move as one document once the workbench is loaded.

## 10.3 Fixed composer

The center composer stays fixed to the bottom of the center pane.

It remains visible while:

- reviewing research activity
- reading approval content
- watching execution progress
- adding follow-up instructions after approval

It must not scroll away with the main center content.

## 10.4 Timeline behavior

The center pane becomes a true execution timeline.

Each item should represent a real lifecycle event such as:

- search query issued
- browser page opened
- document parsed
- dossier updated
- awaiting approval
- execution started
- file generated
- package completed

This replaces the feel of static placeholder checkpoints.

## 10.5 Inspector structure

The right inspector should have four stable sections:

1. execution metadata
   - provider
   - model
   - mode

2. research dossier
   - findings
   - evidence
   - proposed plan

3. approval state
   - current decision point
   - risk notes
   - approval decision

4. artifacts
   - generated files
   - reports
   - downloadable outputs

## 11. Data model changes

The runtime and persisted run model need to gain explicit fields for:

- phase
- execution metadata
- activity timeline
- dossier
- approval status
- artifact bundle

The current `resultPackage` remains important, but it becomes only one part of the full run state.

## 12. Error handling

### 12.1 Research failure

If research fails:

- stop in the research phase
- preserve all collected partial evidence
- show the failure event in the timeline
- do not enter approval or execution

### 12.2 Approval block

If approval is not granted:

- preserve the dossier
- allow revision or follow-up prompting
- do not start execution

### 12.3 Execution failure

If execution fails:

- preserve the dossier
- preserve completed artifacts
- preserve partial execution log
- allow resume from execution if safe

## 13. Validation requirements

## 13.1 Unit coverage

Unit tests should cover:

- run machine transitions
- tool adapter contracts
- dossier assembly
- approval gating
- file-writing behavior
- store persistence and migration behavior

## 13.2 End-to-end coverage

The main e2e path should prove:

1. user enters a task
2. research phase runs
3. dossier appears
4. approval is required
5. approval continues execution
6. files are generated
7. final result package is visible

## 14. Success criteria

This phase is successful when:

1. the app can really research before it executes
2. research, approval, and execution are distinct states
3. search, browser, document, and file tools are truly implemented through local capabilities
4. the user can see a dossier before approving execution
5. the workspace visibly shows provider/model/activity/artifact state
6. the workbench uses independent pane scrolling and a fixed composer
7. the default theme is light and dark mode can be toggled

## 15. Final recommendation

The next implementation phase should focus on a **single strong local-first execution core** rather than broad feature expansion.

The product needs one reliable agent lifecycle that users can understand and trust:

> research first, approve next, execute last, package everything visibly

That is the clearest path from “AI-flavored workspace” to a real agent product.
