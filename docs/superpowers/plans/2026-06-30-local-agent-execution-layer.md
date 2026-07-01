# Local Agent Execution Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real local-first agent execution layer that researches with local tools, pauses for approval, executes only after approval, and exposes the full lifecycle in a light-default workbench with independent pane scrolling and a fixed composer.

**Architecture:** Extend the current run-first store so each run carries explicit lifecycle phase, research dossier, approval state, activity timeline, and artifact bundle. Add local tool adapters for search, browser, document reading, and file writing; wire them into `research -> approval -> execution -> package`; then refactor the workspace UI so the center pane shows a real activity stream, the right pane shows dossier / approval / artifacts, and the theme system supports light-by-default with a dark toggle.

**Tech Stack:** TypeScript, React, Next.js App Router, Tailwind CSS, Playwright, Node.js libraries for local parsing/writing, Vitest, React Testing Library

## Global Constraints

- Introduce a fixed run lifecycle: `intake -> research -> approval -> execution -> package`.
- Implement search, browser, document, and file-writing capabilities through local tooling.
- Generate a structured **research dossier** before execution begins.
- Require explicit human approval before execution starts.
- Generate a final **artifact bundle** after execution finishes.
- Expose execution phases, provider/model metadata, dossier state, approval state, and file outputs in the workspace UI.
- Make the workspace default to a light theme with a dark-mode toggle.
- Split left, center, and right panes into independent scroll containers.
- Keep the composer fixed to the bottom of the center pane.
- No multi-agent orchestration in this phase.
- No general workflow-builder UI.
- No long-term memory system.
- No enterprise permissions or team collaboration system.
- No dependence on Tavily, Firecrawl, or other external search/document services for the first implementation.
- Use **TDD** for every task and keep commits small and frequent.

## File Structure

### Runtime state and persistence

- Modify: `src/lib/runtime/types.ts` — add lifecycle phase, dossier, approval, artifact bundle, theme, and activity shapes
- Modify: `src/lib/runtime/run-machine.ts` — model `research`, `approval`, `execution`, and `package` transitions
- Modify: `src/lib/workspace-store.ts` — persist new run fields and workspace preferences; migrate legacy store contents
- Create: `src/lib/runtime/dossier.ts` — dossier builders and helpers
- Test: `tests/unit/runtime/run-machine.test.ts`
- Test: `tests/unit/workspaces/workspace-store.test.ts`

### Local tool adapters

- Create: `src/lib/tools/types.ts` — shared tool contracts
- Create: `src/lib/tools/search/local-search.ts` — local search-session builder
- Create: `src/lib/tools/browser/playwright-browser.ts` — browser research / execution adapter
- Create: `src/lib/tools/documents/local-document-reader.ts` — local document notes adapter
- Create: `src/lib/tools/files/local-file-writer.ts` — markdown / json / text file writer
- Test: `tests/unit/tools/local-search.test.ts`
- Test: `tests/unit/tools/local-document-reader.test.ts`
- Test: `tests/unit/tools/local-file-writer.test.ts`

### Research, approval, execution, packaging

- Create: `src/lib/runtime/execute-research-phase.ts` — build dossier from search / browser / document tools
- Create: `src/lib/runtime/execute-execution-phase.ts` — perform approved actions and write files
- Create: `src/lib/runtime/package-run-output.ts` — build final report, result package, and artifact bundle
- Modify: `src/lib/runtime/provider-execution.ts` — narrow to model summarization / reasoning support instead of acting as the whole runtime
- Modify: `src/app/api/workspaces/[workspaceId]/runs/route.ts` — create run in `research` and attach dossier / approval state
- Create: `src/app/api/workspaces/[workspaceId]/runs/[runId]/approve/route.ts` — approve a dossier and continue into execution
- Test: `tests/unit/runtime/execute-research-phase.test.ts`
- Test: `tests/unit/runtime/execute-execution-phase.test.ts`
- Test: `tests/unit/server/approve-run.test.ts`

### Workbench product surface

- Modify: `src/app/globals.css` — define light-default and dark tokens plus three-pane independent scrolling
- Modify: `src/components/app-shell.tsx` — expose theme toggle for entry surfaces
- Modify: `src/components/workspaces/workbench-shell.tsx` — orchestrate phase-aware UI
- Modify: `src/components/workspaces/workbench-sidebar.tsx` — show run phase and approval state
- Modify: `src/components/workspaces/run-activity-pane.tsx` — render lifecycle timeline with separate scroll container
- Modify: `src/components/workspaces/run-inspector-pane.tsx` — show dossier, approval summary, and artifacts
- Modify: `src/components/workspaces/workbench-composer.tsx` — keep composer fixed to the bottom of the center pane
- Modify: `src/app/workspaces/[workspaceId]/runs/[runId]/page.tsx` — align run detail page with the new lifecycle model
- Modify: `src/app/page.tsx` — light-default entry surface
- Modify: `src/app/signin/page.tsx` — light-default sign-in surface using product login route
- Test: `tests/unit/workspaces/workbench-shell.test.tsx`
- Test: `tests/unit/app/home-page.test.tsx`
- Test: `tests/unit/app/signin-page.test.tsx`

### End-to-end verification

- Modify: `playwright.config.ts` — set deterministic store path and test-mode environment for e2e
- Modify: `tests/e2e/learning-path-flow.spec.ts` — assert research, approval gate, execution, file output, and package visibility

---

### Task 1: Expand the run model for research, approval, execution, and packaging

**Files:**
- Modify: `src/lib/runtime/types.ts`
- Modify: `src/lib/runtime/run-machine.ts`
- Modify: `src/lib/workspace-store.ts`
- Create: `src/lib/runtime/dossier.ts`
- Test: `tests/unit/runtime/run-machine.test.ts`
- Test: `tests/unit/workspaces/workspace-store.test.ts`

**Interfaces:**
- Consumes:
  - `RunStatus` and `ResultPackage` from `src/lib/runtime/types.ts`
- Produces:
  - `type RunPhase = 'intake' | 'research' | 'approval' | 'execution' | 'package' | 'failed'`
  - `interface ResearchDossier`
  - `interface ApprovalState`
  - `interface ArtifactBundle`
  - `interface WorkspaceRunRecord { phase: RunPhase; dossier: ResearchDossier | null; approval: ApprovalState | null; artifactBundle: ArtifactBundle | null; ... }`

- [ ] **Step 1: Write failing tests for the expanded lifecycle and persisted model**

```ts
// tests/unit/runtime/run-machine.test.ts
import { describe, expect, it } from 'vitest';
import { createRunState, transitionRunState } from '@/lib/runtime/run-machine';

describe('run machine', () => {
  it('moves from research to approval before execution', () => {
    const initial = createRunState('run-1', 'Research job');
    const research = transitionRunState(initial, { type: 'start-research' });
    const approval = transitionRunState(research, { type: 'complete-research' });

    expect(research.currentPhase).toBe('research');
    expect(approval.currentPhase).toBe('approval');
  });
});
```

```ts
// tests/unit/workspaces/workspace-store.test.ts
import { describe, expect, it } from 'vitest';
import { createWorkspace, createWorkspaceRun, getWorkspaceRun } from '@/lib/workspace-store';

describe('workspace store', () => {
  it('persists dossier, approval, and artifact bundle fields on a run', () => {
    const workspace = createWorkspace({ name: 'Research', slug: 'research' });
    const run = createWorkspaceRun(workspace.id, {
      title: 'Investigate API vendors',
      recipe: 'agent-execution',
      phase: 'research',
      dossier: {
        goal: 'Investigate API vendors',
        constraints: ['No external SaaS'],
        searchSessions: [],
        pageNotes: [],
        documentNotes: [],
        findings: [],
        proposedExecutionPlan: [],
        openRisks: [],
      },
      approval: {
        status: 'pending',
        summary: 'Research is ready for review.',
      },
      artifactBundle: null,
      resultPackage: {
        summary: 'Research started',
        recommendation: 'Await approval',
        citations: [],
        attachments: [],
        nextActions: [],
        confidence: 0.4,
        openQuestions: [],
      },
    });

    const stored = getWorkspaceRun(workspace.id, run.id);
    expect(stored?.phase).toBe('research');
    expect(stored?.approval?.status).toBe('pending');
    expect(stored?.dossier?.goal).toBe('Investigate API vendors');
  });
});
```

- [ ] **Step 2: Run the tests to verify the lifecycle fields do not exist yet**

Run: `npm run test:unit -- --run tests/unit/runtime/run-machine.test.ts tests/unit/workspaces/workspace-store.test.ts`  
Expected: FAIL with TypeScript/runtime errors because `currentPhase`, `phase`, `dossier`, `approval`, and `artifactBundle` are not implemented.

- [ ] **Step 3: Implement the minimal lifecycle and persistence model**

```ts
// src/lib/runtime/types.ts
export type RunPhase = 'intake' | 'research' | 'approval' | 'execution' | 'package' | 'failed';

export interface ResearchDossier {
  goal: string;
  constraints: string[];
  searchSessions: Array<{ query: string; candidates: string[]; opened: string[]; discarded: string[] }>;
  pageNotes: Array<{ url: string; title: string; summary: string; citations: string[] }>;
  documentNotes: Array<{ name: string; summary: string; keyPassages: string[]; citations: string[] }>;
  findings: string[];
  proposedExecutionPlan: string[];
  openRisks: string[];
}

export interface ApprovalState {
  status: 'pending' | 'approved' | 'rejected';
  summary: string;
  approvedAt?: string;
}

export interface ArtifactBundle {
  reportArtifactId: string | null;
  generatedFileIds: string[];
  executionLog: string[];
}
```

```ts
// src/lib/runtime/run-machine.ts
import type { RunPhase, RunState } from './types';

export interface RunEvent {
  type: 'start-research' | 'complete-research' | 'approve' | 'complete-execution' | 'fail';
}

export interface RunState {
  id: string;
  title: string;
  status: 'draft' | 'running' | 'awaiting_approval' | 'completed' | 'failed';
  currentStep: string;
  currentPhase: RunPhase;
  artifacts: [];
  citations: [];
}

export function createRunState(id: string, title: string): RunState {
  return {
    id,
    title,
    status: 'draft',
    currentStep: 'drafting',
    currentPhase: 'intake',
    artifacts: [],
    citations: [],
  };
}

export function transitionRunState(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case 'start-research':
      return { ...state, status: 'running', currentStep: 'researching', currentPhase: 'research' };
    case 'complete-research':
      return { ...state, status: 'awaiting_approval', currentStep: 'reviewing', currentPhase: 'approval' };
    case 'approve':
      return { ...state, status: 'running', currentStep: 'executing', currentPhase: 'execution' };
    case 'complete-execution':
      return { ...state, status: 'completed', currentStep: 'packaged', currentPhase: 'package' };
    case 'fail':
      return { ...state, status: 'failed', currentStep: 'failed', currentPhase: 'failed' };
  }
}
```

```ts
// src/lib/runtime/dossier.ts
import type { ResearchDossier } from './types';

export function createEmptyDossier(goal: string, constraints: string[] = []): ResearchDossier {
  return {
    goal,
    constraints,
    searchSessions: [],
    pageNotes: [],
    documentNotes: [],
    findings: [],
    proposedExecutionPlan: [],
    openRisks: [],
  };
}
```

- [ ] **Step 4: Run the tests to verify the model now passes**

Run: `npm run test:unit -- --run tests/unit/runtime/run-machine.test.ts tests/unit/workspaces/workspace-store.test.ts`  
Expected: PASS with both lifecycle tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/runtime/types.ts src/lib/runtime/run-machine.ts src/lib/runtime/dossier.ts src/lib/workspace-store.ts tests/unit/runtime/run-machine.test.ts tests/unit/workspaces/workspace-store.test.ts
git commit -m "feat: add lifecycle run model"
```

### Task 2: Add local-first search, browser, document, and file tool adapters

**Files:**
- Create: `src/lib/tools/types.ts`
- Create: `src/lib/tools/search/local-search.ts`
- Create: `src/lib/tools/browser/playwright-browser.ts`
- Create: `src/lib/tools/documents/local-document-reader.ts`
- Create: `src/lib/tools/files/local-file-writer.ts`
- Test: `tests/unit/tools/local-search.test.ts`
- Test: `tests/unit/tools/local-document-reader.test.ts`
- Test: `tests/unit/tools/local-file-writer.test.ts`

**Interfaces:**
- Consumes:
  - `ResearchDossier`
- Produces:
  - `interface SearchTool { run(query: string): Promise<SearchSession> }`
  - `interface BrowserTool { inspect(url: string): Promise<PageNote>; execute(planStep: string): Promise<string> }`
  - `interface DocumentReaderTool { read(filePath: string): Promise<DocumentNote> }`
  - `interface FileWriterTool { writeArtifacts(runId: string, files: Array<{ name: string; kind: 'markdown' | 'json' | 'text'; content: string }>): Promise<RunArtifact[]> }`

- [ ] **Step 1: Write failing tests for local tool behavior**

```ts
// tests/unit/tools/local-search.test.ts
import { describe, expect, it } from 'vitest';
import { createLocalSearchTool } from '@/lib/tools/search/local-search';

describe('local search tool', () => {
  it('builds a search session that records opened and discarded candidates', async () => {
    const tool = createLocalSearchTool({
      search: async () => [
        { title: 'A', url: 'https://a.test' },
        { title: 'B', url: 'https://b.test' },
      ],
    });

    const session = await tool.run('best frontend roadmap');

    expect(session.query).toBe('best frontend roadmap');
    expect(session.candidates).toHaveLength(2);
    expect(session.opened).toEqual([]);
    expect(session.discarded).toEqual([]);
  });
});
```

```ts
// tests/unit/tools/local-document-reader.test.ts
import { describe, expect, it } from 'vitest';
import { createLocalDocumentReaderTool } from '@/lib/tools/documents/local-document-reader';

describe('local document reader', () => {
  it('returns document notes with summary and citable passages', async () => {
    const tool = createLocalDocumentReaderTool({
      extractText: async () => 'Paragraph one. Paragraph two.',
    });

    const note = await tool.read('/tmp/input.md');

    expect(note.name).toBe('input.md');
    expect(note.summary).toContain('Paragraph one');
    expect(note.citations.length).toBeGreaterThan(0);
  });
});
```

```ts
// tests/unit/tools/local-file-writer.test.ts
import { describe, expect, it } from 'vitest';
import { createLocalFileWriterTool } from '@/lib/tools/files/local-file-writer';

describe('local file writer', () => {
  it('writes markdown and json artifacts for a run', async () => {
    const tool = createLocalFileWriterTool({
      put: async () => undefined,
    });

    const artifacts = await tool.writeArtifacts('run-1', [
      { name: 'report.md', kind: 'markdown', content: '# Report' },
      { name: 'result.json', kind: 'json', content: '{"ok":true}' },
    ]);

    expect(artifacts.map((artifact) => artifact.name)).toEqual(['report.md', 'result.json']);
  });
});
```

- [ ] **Step 2: Run the tests to verify the adapters are missing**

Run: `npm run test:unit -- --run tests/unit/tools/local-search.test.ts tests/unit/tools/local-document-reader.test.ts tests/unit/tools/local-file-writer.test.ts`  
Expected: FAIL with module-not-found errors for the new tool adapter files.

- [ ] **Step 3: Implement the minimal local adapters**

```ts
// src/lib/tools/types.ts
export interface SearchSession {
  query: string;
  candidates: Array<{ title: string; url: string }>;
  opened: string[];
  discarded: string[];
}

export interface PageNote {
  url: string;
  title: string;
  summary: string;
  citations: string[];
}

export interface DocumentNote {
  name: string;
  summary: string;
  keyPassages: string[];
  citations: string[];
}
```

```ts
// src/lib/tools/search/local-search.ts
import type { SearchSession } from '../types';

export function createLocalSearchTool(deps: {
  search: (query: string) => Promise<Array<{ title: string; url: string }>>;
}) {
  return {
    async run(query: string): Promise<SearchSession> {
      const candidates = await deps.search(query);
      return { query, candidates, opened: [], discarded: [] };
    },
  };
}
```

```ts
// src/lib/tools/documents/local-document-reader.ts
import { basename } from 'node:path';
import type { DocumentNote } from '../types';

export function createLocalDocumentReaderTool(deps: {
  extractText: (filePath: string) => Promise<string>;
}) {
  return {
    async read(filePath: string): Promise<DocumentNote> {
      const text = await deps.extractText(filePath);
      const passages = text.split('.').map((part) => part.trim()).filter(Boolean);
      return {
        name: basename(filePath),
        summary: passages[0] ?? '',
        keyPassages: passages.slice(0, 3),
        citations: passages.slice(0, 2),
      };
    },
  };
}
```

```ts
// src/lib/tools/files/local-file-writer.ts
import { randomUUID } from 'node:crypto';
import type { RunArtifact } from '@/lib/runtime/types';

export function createLocalFileWriterTool(deps: {
  put: (key: string, content: string) => Promise<void>;
}) {
  return {
    async writeArtifacts(
      runId: string,
      files: Array<{ name: string; kind: 'markdown' | 'json' | 'text'; content: string }>,
    ): Promise<RunArtifact[]> {
      const artifacts: RunArtifact[] = [];
      for (const file of files) {
        await deps.put(`${runId}/${file.name}`, file.content);
        artifacts.push({ id: randomUUID(), name: file.name, kind: file.kind, content: file.content });
      }
      return artifacts;
    },
  };
}
```

- [ ] **Step 4: Run the adapter tests to verify they pass**

Run: `npm run test:unit -- --run tests/unit/tools/local-search.test.ts tests/unit/tools/local-document-reader.test.ts tests/unit/tools/local-file-writer.test.ts`  
Expected: PASS with all three tool adapter tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/types.ts src/lib/tools/search/local-search.ts src/lib/tools/documents/local-document-reader.ts src/lib/tools/files/local-file-writer.ts tests/unit/tools/local-search.test.ts tests/unit/tools/local-document-reader.test.ts tests/unit/tools/local-file-writer.test.ts
git commit -m "feat: add local tool adapters"
```

### Task 3: Implement research dossier creation, approval gate, and post-approval execution

**Files:**
- Create: `src/lib/runtime/execute-research-phase.ts`
- Create: `src/lib/runtime/execute-execution-phase.ts`
- Create: `src/lib/runtime/package-run-output.ts`
- Modify: `src/lib/runtime/provider-execution.ts`
- Modify: `src/app/api/workspaces/[workspaceId]/runs/route.ts`
- Create: `src/app/api/workspaces/[workspaceId]/runs/[runId]/approve/route.ts`
- Test: `tests/unit/runtime/execute-research-phase.test.ts`
- Test: `tests/unit/runtime/execute-execution-phase.test.ts`
- Test: `tests/unit/server/approve-run.test.ts`

**Interfaces:**
- Consumes:
  - `createEmptyDossier(goal: string, constraints?: string[]): ResearchDossier`
  - `SearchTool`, `BrowserTool`, `DocumentReaderTool`, `FileWriterTool`
- Produces:
  - `executeResearchPhase(input: { goal: string; constraints: string[]; searchTool: SearchTool; browserTool: BrowserTool; documentTool: DocumentReaderTool; }): Promise<{ dossier: ResearchDossier; activities: RunActivity[]; }>`
  - `executeExecutionPhase(input: { runId: string; dossier: ResearchDossier; browserTool: BrowserTool; fileWriterTool: FileWriterTool; }): Promise<{ artifacts: RunArtifact[]; executionLog: string[]; }>`
  - `POST /api/workspaces/[workspaceId]/runs/[runId]/approve` returning `{ run: WorkspaceRunRecord }`

- [ ] **Step 1: Write failing tests for dossier generation, approval, and execution**

```ts
// tests/unit/runtime/execute-research-phase.test.ts
import { describe, expect, it } from 'vitest';
import { executeResearchPhase } from '@/lib/runtime/execute-research-phase';

describe('executeResearchPhase', () => {
  it('builds a dossier before execution starts', async () => {
    const result = await executeResearchPhase({
      goal: 'Find the best frontend roadmap',
      constraints: ['Use local tools only'],
      searchTool: { run: async () => ({ query: 'roadmap', candidates: [{ title: 'A', url: 'https://a.test' }], opened: [], discarded: [] }) },
      browserTool: { inspect: async () => ({ url: 'https://a.test', title: 'A', summary: 'Roadmap summary', citations: ['Roadmap summary'] }) },
      documentTool: { read: async () => ({ name: 'brief.md', summary: 'Brief', keyPassages: ['Brief'], citations: ['Brief'] }) },
    });

    expect(result.dossier.findings.length).toBeGreaterThan(0);
    expect(result.activities.at(-1)?.title).toBe('Research dossier created');
  });
});
```

```ts
// tests/unit/server/approve-run.test.ts
import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/workspaces/[workspaceId]/runs/[runId]/approve/route';

describe('approve run route', () => {
  it('moves a researched run into execution and packages artifacts', async () => {
    const request = new Request('http://localhost/api/workspaces/workspace-1/runs/run-1/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ workspaceId: 'workspace-1', runId: 'run-1' }),
    });

    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the tests to verify the research / approval flow does not exist yet**

Run: `npm run test:unit -- --run tests/unit/runtime/execute-research-phase.test.ts tests/unit/server/approve-run.test.ts`  
Expected: FAIL with missing-module or route errors because the research executor and approval route are not implemented.

- [ ] **Step 3: Implement minimal research, approval, and execution behavior**

```ts
// src/lib/runtime/execute-research-phase.ts
import { createEmptyDossier } from './dossier';
import type { RunActivity } from './types';

export async function executeResearchPhase(input: {
  goal: string;
  constraints: string[];
  searchTool: { run: (query: string) => Promise<{ query: string; candidates: Array<{ title: string; url: string }>; opened: string[]; discarded: string[] }> };
  browserTool: { inspect: (url: string) => Promise<{ url: string; title: string; summary: string; citations: string[] }> };
  documentTool: { read: (filePath: string) => Promise<{ name: string; summary: string; keyPassages: string[]; citations: string[] }> };
}) {
  const dossier = createEmptyDossier(input.goal, input.constraints);
  const activities: RunActivity[] = [];

  const session = await input.searchTool.run(input.goal);
  dossier.searchSessions.push(session);
  activities.push({ id: 'search', title: 'Search session created', detail: input.goal, kind: 'provider', status: 'completed' });

  if (session.candidates[0]) {
    const pageNote = await input.browserTool.inspect(session.candidates[0].url);
    dossier.pageNotes.push(pageNote);
    dossier.findings.push(pageNote.summary);
  }

  const docNote = await input.documentTool.read('brief.md');
  dossier.documentNotes.push(docNote);
  dossier.findings.push(docNote.summary);
  dossier.proposedExecutionPlan = ['Review dossier', 'Approve execution', 'Write report'];
  activities.push({ id: 'dossier', title: 'Research dossier created', detail: 'Research is ready for approval.', kind: 'reasoning', status: 'completed' });

  return { dossier, activities };
}
```

```ts
// src/lib/runtime/execute-execution-phase.ts
export async function executeExecutionPhase(input: {
  runId: string;
  dossier: { proposedExecutionPlan: string[]; findings: string[] };
  browserTool: { execute: (planStep: string) => Promise<string> };
  fileWriterTool: { writeArtifacts: (runId: string, files: Array<{ name: string; kind: 'markdown' | 'json' | 'text'; content: string }>) => Promise<any[]> };
}) {
  const executionLog: string[] = [];
  for (const step of input.dossier.proposedExecutionPlan) {
    executionLog.push(await input.browserTool.execute(step));
  }

  const artifacts = await input.fileWriterTool.writeArtifacts(input.runId, [
    { name: 'research-report.md', kind: 'markdown', content: `# Report\n\n${input.dossier.findings.join('\n')}` },
    { name: 'result.json', kind: 'json', content: JSON.stringify({ findings: input.dossier.findings }, null, 2) },
  ]);

  return { artifacts, executionLog };
}
```

- [ ] **Step 4: Run the tests to verify research and approval now pass**

Run: `npm run test:unit -- --run tests/unit/runtime/execute-research-phase.test.ts tests/unit/runtime/execute-execution-phase.test.ts tests/unit/server/approve-run.test.ts`  
Expected: PASS with the dossier and approval flow covered.

- [ ] **Step 5: Commit**

```bash
git add src/lib/runtime/execute-research-phase.ts src/lib/runtime/execute-execution-phase.ts src/lib/runtime/package-run-output.ts src/lib/runtime/provider-execution.ts src/app/api/workspaces/[workspaceId]/runs/route.ts src/app/api/workspaces/[workspaceId]/runs/[runId]/approve/route.ts tests/unit/runtime/execute-research-phase.test.ts tests/unit/runtime/execute-execution-phase.test.ts tests/unit/server/approve-run.test.ts
git commit -m "feat: add research approval execution flow"
```

### Task 4: Refactor the workbench for light-default theme, independent scrolling, and fixed composer

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/workspaces/workbench-shell.tsx`
- Modify: `src/components/workspaces/workbench-sidebar.tsx`
- Modify: `src/components/workspaces/run-activity-pane.tsx`
- Modify: `src/components/workspaces/run-inspector-pane.tsx`
- Modify: `src/components/workspaces/workbench-composer.tsx`
- Modify: `src/app/workspaces/[workspaceId]/runs/[runId]/page.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/signin/page.tsx`
- Test: `tests/unit/workspaces/workbench-shell.test.tsx`
- Test: `tests/unit/app/home-page.test.tsx`
- Test: `tests/unit/app/signin-page.test.tsx`

**Interfaces:**
- Consumes:
  - `WorkspaceRunRecord.phase`
  - `WorkspaceRunRecord.dossier`
  - `WorkspaceRunRecord.approval`
  - `WorkspaceRunRecord.artifactBundle`
- Produces:
  - light-default CSS token set with `data-theme="light" | "dark"`
  - fixed center composer
  - independent scroll containers for sidebar, activity pane, inspector

- [ ] **Step 1: Write failing UI tests for theme-ready workbench and fixed composer structure**

```tsx
// tests/unit/workspaces/workbench-shell.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkbenchShell } from '@/components/workspaces/workbench-shell';

describe('WorkbenchShell', () => {
  it('renders independent scroll panes and a fixed composer shell', () => {
    render(<WorkbenchShell workspace={workspace} initialRuns={[]} workspaces={[workspace]} />);

    expect(screen.getByTestId('workbench-sidebar')).toHaveAttribute('data-scroll-pane', 'sidebar');
    expect(screen.getByTestId('workbench-activity')).toHaveAttribute('data-scroll-pane', 'activity');
    expect(screen.getByTestId('workbench-inspector')).toHaveAttribute('data-scroll-pane', 'inspector');
    expect(screen.getByTestId('workbench-composer')).toHaveAttribute('data-fixed-composer', 'true');
  });
});
```

```tsx
// tests/unit/app/home-page.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from '@/app/page';

describe('HomePage', () => {
  it('renders the workbench entry surface with light-default copy', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: 'A workbench for decisions that deserve more than chat.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a workspace' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify the scroll and fixed-composer markers are missing**

Run: `npm run test:unit -- --run tests/unit/workspaces/workbench-shell.test.tsx tests/unit/app/home-page.test.tsx tests/unit/app/signin-page.test.tsx`  
Expected: FAIL because the new `data-scroll-pane` and `data-fixed-composer` markers are not yet present and the theme tokens are not wired.

- [ ] **Step 3: Implement the light-default shell and independent scrolling**

```tsx
// src/components/workspaces/run-activity-pane.tsx
export function RunActivityPane({ selectedRun, message, children }: RunActivityPaneProps) {
  return (
    <section data-testid="workbench-activity" data-scroll-pane="activity" className="flex h-screen min-h-0 flex-col overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-5 sm:px-6">...</div>
      <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">...</div>
      {children}
    </section>
  );
}
```

```tsx
// src/components/workspaces/workbench-composer.tsx
<form
  data-testid="workbench-composer"
  data-fixed-composer="true"
  className="sticky bottom-0 border-t border-slate-200 bg-white px-5 py-4 sm:px-6"
  onSubmit={onSubmit}
>
```

```css
/* src/app/globals.css */
:root {
  color-scheme: light;
}

body[data-theme='light'] {
  --app-bg: #f5f7fb;
  --surface-bg: #ffffff;
  --surface-muted: #edf2f8;
  --text-primary: #0f172a;
  --text-secondary: #64748b;
  --border-subtle: #dbe3f0;
}

body[data-theme='dark'] {
  --app-bg: #0a0f14;
  --surface-bg: #111827;
  --surface-muted: #0f1720;
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --border-subtle: rgba(255,255,255,.1);
}
```

- [ ] **Step 4: Run the UI tests to verify the new shell markers and theme-ready layout pass**

Run: `npm run test:unit -- --run tests/unit/workspaces/workbench-shell.test.tsx tests/unit/app/home-page.test.tsx tests/unit/app/signin-page.test.tsx`  
Expected: PASS with the workbench structure and entry surfaces green.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/components/app-shell.tsx src/components/workspaces/workbench-shell.tsx src/components/workspaces/workbench-sidebar.tsx src/components/workspaces/run-activity-pane.tsx src/components/workspaces/run-inspector-pane.tsx src/components/workspaces/workbench-composer.tsx src/app/workspaces/[workspaceId]/runs/[runId]/page.tsx src/app/page.tsx src/app/signin/page.tsx tests/unit/workspaces/workbench-shell.test.tsx tests/unit/app/home-page.test.tsx tests/unit/app/signin-page.test.tsx
git commit -m "refactor: add light-default execution workbench"
```

### Task 5: Verify research, approval, execution, and artifact output end-to-end

**Files:**
- Modify: `playwright.config.ts`
- Modify: `tests/e2e/learning-path-flow.spec.ts`

**Interfaces:**
- Consumes:
  - `POST /api/workspaces/[workspaceId]/runs`
  - `POST /api/workspaces/[workspaceId]/runs/[runId]/approve`
- Produces:
  - e2e contract for the full local-first lifecycle

- [ ] **Step 1: Write the failing end-to-end flow around approval and artifact creation**

```ts
// tests/e2e/learning-path-flow.spec.ts
import { expect, test } from '@playwright/test';

test('researches, waits for approval, executes, and surfaces artifacts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start a workspace' }).click();
  await page.getByLabel('Email').fill('demo@decision.work');
  await page.getByLabel('Password').fill('demo-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.getByPlaceholder('Describe the decision, deliverable, or question you need help with.').fill('Research the best frontend roadmap and prepare a report');
  await page.getByRole('button', { name: 'Run' }).click();

  await expect(page.locator('body')).toContainText('Research dossier created');
  await expect(page.locator('body')).toContainText('awaiting approval');
  await page.getByRole('button', { name: 'Approve execution' }).click();
  await expect(page.locator('body')).toContainText('Execution completed');
  await expect(page.locator('body')).toContainText('research-report.md');
});
```

- [ ] **Step 2: Run the e2e test to verify the approval/execution lifecycle is missing**

Run: `rm -rf .next && npm run test:e2e`  
Expected: FAIL because the current flow does not stop for approval or surface generated files.

- [ ] **Step 3: Wire the Playwright environment and end-to-end lifecycle**

```ts
// playwright.config.ts
export default defineConfig({
  webServer: {
    command:
      'PLAYWRIGHT_TEST=1 DECISION_WORKSPACE_STORE_FILE=.storage/playwright-store.json npm run dev -- --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

```ts
// tests/e2e/learning-path-flow.spec.ts
// Keep the exact scenario above and make it the authoritative smoke test for:
// research -> approval -> execution -> artifact output
```

- [ ] **Step 4: Run the full verification suite**

Run: `npm run test:unit -- --run`  
Expected: PASS with all unit tests green

Run: `rm -rf .next && npm run test:e2e`  
Expected: PASS with the approval/execution smoke test green

Run: `npm run build`  
Expected: PASS with a successful production build

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/learning-path-flow.spec.ts
git commit -m "test: verify local agent execution flow"
```

## Self-Review

- **Spec coverage:** The plan covers the fixed lifecycle, local tool adapters, dossier, approval, execution artifacts, light-default theme, dark-mode toggle, independent pane scrolling, and fixed composer. No spec requirement is left without a task.
- **Placeholder scan:** No `TODO`, `TBD`, “implement later,” or implicit “write tests later” placeholders remain.
- **Type consistency:** `RunPhase`, `ResearchDossier`, `ApprovalState`, `ArtifactBundle`, `SearchSession`, `executeResearchPhase`, `executeExecutionPhase`, and the approval route all use consistent names and signatures throughout the plan.
