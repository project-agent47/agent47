# Agent framework decision: DeepSeek-first desktop

## Decision

Use AI SDK `ToolLoopAgent` as the standard Agent call/configuration surface, with the existing local `TaskRuntime` owning durable checkpoints, the permission broker and irreversible-action replay protection. Support only DeepSeek model IDs in the product; the chosen default endpoint remains OpenCode Go. Do not introduce a second full agent runtime solely to support more models.

This is a project-fit decision, not a universal ranking or a claim that the other frameworks are incapable. The alternatives were researched from official documentation, not benchmarked with the owner's credential.

## Comparison

| Candidate | Verified capabilities | Fit and decision for Agent47 |
|---|---|---|
| AI SDK ToolLoopAgent | Standard reusable Agent, tool loops, stopping conditions, step preparation, runtime/tool context and approval configuration ([API reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)). Core functions remain appropriate when explicit per-step control is required ([Agent overview](https://ai-sdk.dev/docs/agents/overview)). | Chosen. Already shares the application's TypeScript and provider stack; integrate without replacing the exact-content approval and disk ledger. Actual DeepSeek desktop acceptance performed. |
| AI SDK HarnessAgent | Wraps complete existing runtimes with their own history, workspace access, compaction and permission flows; harness packages are experimental ([Harness overview](https://ai-sdk.dev/docs/ai-sdk-harnesses/overview)). OpenCode, Pi and other adapters exist, with differing host/sandbox locations and built-in permission/filter capabilities ([Adapter table](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters)). | Defer as an optional worker adapter. A subscription/model route is not an OpenCode runtime; importing a whole harness now introduces another session/tool/permission owner and unnecessary runtime deployment work. Not rejected because it must use a costly model: that would be an incorrect assumption. |
| OpenAI Agents SDK for TypeScript | Supports custom providers, compatible base URLs, explicit Chat Completions and AI SDK-backed models ([Models](https://openai.github.io/openai-agents-js/guides/models/)). Its approval flow pauses with interruptions and serialized RunState, including handoffs and nested agents ([Human-in-the-loop](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)). AI SDK model adapter remains beta and excludes some Responses/programmatic/deferred tool flows ([Adapter](https://openai.github.io/openai-agents-js/extensions/ai-sdk/)). | Strong second choice if native handoff/agent-as-tool semantics become decisive. It can use DeepSeek; its name does not force OpenAI models. Today it adds another tool/state/stream representation without eliminating app-owned security and side-effect idempotency. Not live-tested here. |
| Google ADK | TypeScript 2.0 is GA and supports graph, dynamic and collaborative workflows ([ADK 2.0](https://adk.dev/2.0/)). Model integration is broader than Gemini ([Models](https://google.github.io/adk-docs/agents/models/)); the fetched OpenAI-compatible guide documents Go native clients and Python LiteLLM, not a verified TypeScript DeepSeek route ([OpenAI integration](https://adk.dev/agents/models/openai/)). | Worth reconsidering for graph-based multi-agent coordination. Current TypeScript DeepSeek endpoint compatibility is n.a. from the researched guide, not declared impossible. Replacing the host now would add graph/event/session migration while the product needs a small desktop loop. Not live-tested here. |
| Microsoft Agent Framework | Provides agents, harness agents, graph/functional workflows, sessions, middleware and MCP; current overview lists .NET, Python and Go, with Go in public preview ([Overview](https://learn.microsoft.com/en-us/agent-framework/overview/)). OpenAI client documentation covers C#/Python Chat Completions and Responses, with tool approval on both paths ([Provider documentation](https://learn.microsoft.com/en-us/agent-framework/agents/providers/openai)). | Prefer for .NET/Python-centric enterprise coordination. No native TypeScript Agent runtime or explicit DeepSeek endpoint guarantee was verified in these pages; both are n.a., not claims of impossibility. A separate language runtime is not justified for this Electron increment. Not live-tested here. |

## What changed from the first increment

Previously `sdkDriver` used `generateText` inside a real custom persistent loop; it was not an unimplemented loop. It did not use any of the named higher-level Agent classes.

Now it instantiates `ToolLoopAgent`, uses `instructions`, the application's typed tools and `stopWhen: isStepCount(1)`, then calls `agent.generate({ messages, abortSignal })`. The runtime remains responsible for repeated durable steps.

The one-step boundary is intentional:

1. The model emits its answer and tool intents through the maintained SDK.
2. The task host atomically saves messages and pending calls.
3. Read tools execute only inside the granted root.
4. Writes become exact-content approval records; there is no effect before a human decision.
5. An approved artifact is published idempotently and its result is appended.
6. The next Agent step sees actual tool outcomes and continues.

Attaching unrestricted `execute` functions to a long in-memory SDK loop would not, by itself, persist each intention before its effect or make an interrupted write exactly-once. The framework is not the OS permission or durable-execution boundary.

## Cost and model boundary

Product model selection is restricted to `deepseek-*` / `deepseek/...` IDs, with no automatic expensive-model fallback. Route selection and model-family selection are separate: OpenCode Go is the configured transport route, while DeepSeek is the actual model family.

No new subscription, hosted harness service, cloud orchestrator or additional model account was enabled. Cost accounting and context compaction are future product work; no unverified model-price comparison is used to justify the choice.

## Revisit conditions

- Use OpenAI Agents SDK only if its handoff/state mechanics materially remove more application code than the additional integration costs.
- Use ADK when graph-based coordination becomes the product's central runtime requirement and TypeScript DeepSeek compatibility has been tested.
- Add HarnessAgent as an isolated worker integration for an existing coding runtime, not as a replacement for the main permission ledger.
- Re-evaluate utility-process isolation, trace/usage accounting and context budgets before enabling browser, Shell or native desktop actions.
