# Decision Workspace Design

Date: 2026-06-29
Status: Draft for user review

## 1. Summary

This product is a **general agentic platform** with a deliberately narrow first product surface: **Decision Workspace**.

The core platform remains generic and composable, but the first market-facing experience is not "build your own agent." It is a user-facing workspace that helps people turn complex choices into clear, evidence-backed, actionable result packages.

The first hero scenario is **learning path planning**. Secondary launch recipes are **shopping comparison** and **career path planning**. All three are treated as variations of the same underlying decision pattern: define a goal, gather relevant information, compare options, form a recommendation, and produce a structured next-step plan.

## 2. Product thesis

### 2.1 Product truth

Decision Workspace helps users complete complex decisions and planning tasks that are too large for ordinary chat, too ambiguous for static templates, and too personal for generic automation.

### 2.2 Platform truth

Under the hood, the system is a general agentic runtime built around a small set of stable primitives:

- `Run`
- `Tool`
- `Resource`
- `Artifact`
- `Approval`
- `Policy`
- `ResultPackage`
- `Workspace`

The platform should be built generically, but marketed concretely.

### 2.3 Marketing truth

The first user does not buy "an agentic platform." The first user buys a faster path to clarity in a difficult decision.

Primary product promise:

> **Complex decisions, made clear.**

## 3. Why this product exists

Generic coding agents are optimized for repository-shaped work: files, commands, tools, patches, and execution loops.

The target user here has a different shape of work:

- messy goals rather than defined tasks
- web pages, PDFs, notes, and preferences rather than source code
- trade-offs and uncertainty rather than deterministic execution
- result packages rather than raw answers
- repeated review checkpoints rather than one autonomous run to completion

The product exists to serve users whose work is not coding, but whose decisions are still multi-step, evidence-heavy, and structurally agentic.

## 4. Target users and segmentation

### 4.1 Broad target user

People with high-stakes, multi-step decisions who do not have access to a personal analyst, coach, or consultant.

### 4.2 First product category

Decision Workspace is positioned as a product for **complex choices and path planning**, not as a generic chatbot or a no-code automation tool.

### 4.3 Segments considered

Initial exploration surfaced these user groups:

- career transition users
- on-the-job skill upgraders
- certificate / project-oriented learners
- interest-based learners
- comparison-heavy shoppers
- career path planners

### 4.4 Beachhead direction

The selected first hero scenario is **learning path planning**, because it combines:

- high information load
- many competing options
- strong need for constraints and personalization
- clear value in structured comparison
- natural follow-up work over time

### 4.5 Secondary recipe family

The platform will also support adjacent decision recipes with the same runtime shape:

- **Compare & Choose**: shopping recommendation, price comparison, option evaluation
- **Transition Planning**: career path planning

These are not separate products. They are recipe variants built on the same core runtime.

## 5. Positioning

### 5.1 What the product is

Decision Workspace is:

- a workspace for complex decisions
- an agentic system that gathers evidence and compares options
- a product that produces reusable result packages rather than disposable chat answers

### 5.2 What the product is not

Decision Workspace is not:

- a generic AI chat frontend
- a coding agent
- a raw workflow builder
- an expert marketplace

### 5.3 Core user benefits

The core benefits presented to users are:

1. **See complex choices more clearly**
2. **Spend less time on low-value information gathering**
3. **Get actionable outputs, not fragmented advice**
4. **Stay in control throughout the process**

## 6. Product architecture

### 6.1 Layered model

The system is intentionally layered:

1. **Core runtime layer**
   - general and composable
   - built for reuse across many recipes

2. **Recipe layer**
   - opinionated run patterns built on the runtime
   - the first recipe family is decision-making and path planning

3. **Workspace product layer**
   - user-facing interface for initiating, reviewing, revising, and reusing runs

### 6.2 Design principle

The system should **build generic, package specific, market concrete**.

That means:

- the runtime must stay broad enough to power many workflows
- the first visible product should stay focused enough to be understood immediately

### 6.3 User-facing product components

The first product surface should include a small set of visible components:

1. **Workspace home**
   - shows active decisions, past runs, templates, and saved artifacts

2. **Decision intake**
   - supports both chat-style task entry and structured recipe-based entry

3. **Run view**
   - shows current state, gathered sources, comparison progress, open questions, and approval points

4. **Checkpoint review**
   - lets the user confirm direction, add constraints, revise priorities, or stop the run

5. **Result package viewer**
   - presents the final recommendation, evidence, attachments, and next-step plan in a reusable format

6. **Template and follow-up layer**
   - lets users rerun similar decisions, turn outputs into recurring workflows, and update old decisions over time

## 7. Core runtime objects

### 7.1 Workspace

A workspace is a user-visible container that holds:

- user files
- historical runs
- reusable preferences
- recipe templates
- follow-up tasks
- artifacts

Workspace is a container, not the orchestration center.

### 7.2 Run

A run is the primary execution unit.

Each run has:

- a goal
- user constraints
- selected recipe
- runtime state
- tool access
- event history
- approval checkpoints
- final or partial result package

Runs must support pause, resume, retry, and replay.

### 7.3 Recipe

Recipes are opinionated orchestration patterns above the core runtime.

Recipes define:

- intake expectations
- major phases
- decision logic
- artifact templates
- approval points

Recipes are not kernel primitives. They are reusable compositions over the kernel.

### 7.4 Tool / Resource / Artifact

- **Tool**: an action the runtime can perform
- **Resource**: an input object used for reasoning
- **Artifact**: an output object produced during or after a run

This separation keeps data access, reasoning inputs, and final deliverables from collapsing into one vague abstraction.

### 7.5 Approval / Policy

- **Approval** governs human-in-the-loop checkpoints
- **Policy** governs runtime behavior such as budgets, provider limits, risk thresholds, and termination conditions

### 7.6 ResultPackage

All recipes should aim to end in a unified structured result:

- conclusions or recommendations
- key evidence and citations
- attachments
- next actions
- confidence and open questions
- completion state

## 8. Hero scenario: learning path planning

### 8.1 User problem

The user wants to learn a new domain, but does not know:

- what to focus on first
- which resources are worth using
- how to compare options
- what sequence makes sense
- how to turn intention into a real plan

### 8.2 Golden journey

1. The user describes a learning goal.
2. The system clarifies constraints:
   - budget
   - weekly time
   - current level
   - deadline
   - preferred learning style
3. The system gathers options:
   - courses
   - books
   - videos
   - communities
   - practice paths
4. The system compares options across relevant dimensions:
   - fit
   - cost
   - effort
   - time horizon
   - practical value
5. The system proposes a path.
6. The user reviews and adjusts direction.
7. The system outputs a **Learning Decision Pack**.
8. The workspace supports later follow-up and revision.

### 8.3 Learning Decision Pack

The default artifact should include:

- recommended path
- alternative paths
- resource shortlist
- comparison logic
- 30 / 60 / 90 day plan
- likely risks and friction points
- review checkpoints

## 9. Secondary recipes

### 9.1 Shopping comparison

This recipe helps users compare products, prices, and options under budget or preference constraints.

Typical outputs:

- comparison matrix
- recommended option
- trade-off explanation
- buying guidance

### 9.2 Career path planning

This recipe helps users compare career directions and create a transition plan.

Typical outputs:

- path comparison
- skill gap analysis
- sequencing suggestions
- execution roadmap

## 10. Runtime flow

All entry surfaces should collapse to the same run lifecycle.

### 10.1 Intake

Users start from either:

- chat
- a structured recipe form

Both forms normalize into a shared `TaskBrief`.

### 10.2 Clarify

Clarification is **policy-driven**, not capped at a fixed number of questions.

The runtime should keep asking only until the task is sufficiently bounded to continue.

Clarification policy may depend on:

- task complexity
- ambiguity
- user preferences
- risk level

### 10.3 Gather

The system gathers evidence through a provider-agnostic adapter layer.

### 10.4 Synthesize

The system organizes evidence into:

- option sets
- comparison tables
- risks
- missing information
- candidate recommendations

### 10.5 Checkpoint

Runs pause at meaningful points:

- before expensive or uncertain work continues
- before major recommendation changes
- before final output is finalized

### 10.6 Produce

The run produces a structured `ResultPackage` and one or more artifacts.

### 10.7 Persist

Runs write reusable information back into the workspace for future runs and follow-up work.

## 11. Provider strategy

The provider model is **hybrid**.

### 11.1 Default platform providers

The platform should include default providers so the product works out of the box.

### 11.2 BYOK support

Users can optionally bring their own search, fetch, or parsing providers.

### 11.3 Runtime abstraction

The runtime should treat default and BYOK providers uniformly through tool and resource adapters.

This preserves:

- a low-friction default experience
- vendor flexibility
- future-proof composition

## 12. Failure, recovery, and control

### 12.1 Run states

Runs must support more than `success` and `failure`.

Minimum meaningful states:

- `drafting`
- `running`
- `awaiting_input`
- `awaiting_approval`
- `partial_complete`
- `completed`
- `failed`
- `cancelled`

### 12.2 Partial completion

If the system can still produce useful intermediate value, it should do so.

The product should prefer:

- partial results with explicit gaps
- resumable state
- visible error causes

over opaque failure.

### 12.3 Failure semantics

Errors should be understandable to end users, such as:

- source unavailable
- insufficient evidence
- budget exhausted
- waiting for confirmation
- provider timeout

### 12.4 Risk model

The product should never quietly cross important trust boundaries.

High-cost, high-uncertainty, or high-impact actions should trigger approval or clarification.

## 13. Testing and quality gates

The system should be validated at four levels.

### 13.1 Kernel contract tests

Validate lifecycle and object-level behavior for:

- runs
- tools
- resources
- artifacts
- approvals
- result packages

### 13.2 Provider adapter tests

Every provider adapter should pass the same contract expectations:

- availability handling
- timeout handling
- normalized output
- error semantics

### 13.3 Recipe scenario tests

Run end-to-end tests against recipe behavior, not only object behavior.

Initial scenarios:

- learning path planning
- shopping comparison
- career path planning

### 13.4 Replay and resume tests

Validate paused, failed, retried, and resumed runs.

## 14. Launch scope and non-goals

### 14.1 V1 scope

V1 should prove all of the following:

- users can start the same run type from chat or form entry
- default providers work out of the box
- BYOK providers can replace default providers
- at least three recipes produce consistent result packages
- runs have visible state and meaningful recovery behavior

### 14.2 Non-goals

V1 should not attempt to become:

- a general workflow automation builder
- a multi-agent team platform
- a regulated advisory product for legal, medical, or investment decisions
- a broad consumer life assistant for every possible use case

## 15. Strategic consequence

The runtime remains a general agentic platform.

The product surface, however, should not lead with platform language. It should lead with user outcomes:

- clarity
- comparison
- recommendation
- next-step planning

The long-term platform story is preserved by the architecture.
The short-term market story is won by a concrete product: **Decision Workspace**.
