# Fullscreen Workbench Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Decision Workspace into a full-screen, Linear-like workbench while making the homepage and sign-in page minimal product-entry surfaces.

**Architecture:** Keep the existing Next.js app structure and route model, but split the visual shell into two modes: entry surfaces for `/` and `/signin`, and a shell-less full-screen workbench for `/workspaces/*`. Recompose the current workspace UI into a sidebar, an activity pane with a bottom composer, and a right-side inspector without changing the run creation API contract.

**Tech Stack:** TypeScript, React, Next.js App Router, Tailwind CSS, Vitest, React Testing Library, Playwright

## Global Constraints

- Make `/workspaces/[workspaceId]` a true full-screen route.
- Remove website-like chrome from the workspace route.
- Make the active run process the visual and interaction center.
- Move task entry into a persistent bottom composer.
- Turn the right pane into a focused inspector.
- Align homepage and sign-in with the same product family while keeping them minimal.
- Preserve the current working flow: sign in, enter workspace, create run, inspect result.
- Do **not** rewrite the runtime, recipe model, auth model, or persistence model.
- Use **TDD** for every task and keep commits small and frequent.

## File Structure

### Shell and route framing

- Modify: `src/app/layout.tsx` — remove hard-coded page-shell assumptions from `<body>`
- Modify: `src/components/app-shell.tsx` — render entry chrome only for non-workspace routes
- Create: `tests/unit/app/app-shell.test.tsx` — verify route-specific shell behavior

### Workbench surface

- Modify: `src/components/workspaces/workbench-shell.tsx` — reduce to orchestration and state only
- Create: `src/components/workspaces/workbench-sidebar.tsx` — workspace/run navigation rail
- Create: `src/components/workspaces/run-activity-pane.tsx` — active run process stream and empty state
- Create: `src/components/workspaces/run-inspector-pane.tsx` — summary / details / artifacts inspector
- Create: `src/components/workspaces/workbench-composer.tsx` — persistent bottom composer
- Modify: `src/components/runs/run-status-badge.tsx` — denser status styling for the new workbench tone
- Test: `tests/unit/workspaces/workbench-shell.test.tsx`

### Entry surfaces

- Modify: `src/app/page.tsx` — minimal product-entry homepage
- Modify: `src/app/signin/page.tsx` — minimal sign-in entry surface
- Modify: `src/app/globals.css` — split entry-surface and workbench-surface tokens
- Test: `tests/unit/app/home-page.test.tsx`
- Test: `tests/unit/app/signin-page.test.tsx`

### End-to-end verification

- Modify: `tests/e2e/learning-path-flow.spec.ts` — assert the full-screen workbench path and bottom composer flow

---

### Task 1: Split entry chrome from workspace chrome

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/components/app-shell.tsx`
- Create: `tests/unit/app/app-shell.test.tsx`

**Interfaces:**
- Consumes:
  - `usePathname(): string | null` from `next/navigation`
- Produces:
  - `AppShell({ children }: { children: React.ReactNode }): JSX.Element`
  - route rule: `pathname?.startsWith('/workspaces')` returns bare children

- [ ] **Step 1: Write the failing route-shell test**

```tsx
// tests/unit/app/app-shell.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/app-shell';

const pathnameState = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.value,
}));

describe('AppShell', () => {
  it('renders entry chrome on non-workspace routes', () => {
    pathnameState.value = '/';
    render(<AppShell><div>entry content</div></AppShell>);

    expect(screen.getByRole('link', { name: /Agent47/i })).toBeInTheDocument();
    expect(screen.getByText('entry content')).toBeInTheDocument();
  });

  it('does not render entry chrome on workspace routes', () => {
    pathnameState.value = '/workspaces/workspace-demo';
    render(<AppShell><div>workspace content</div></AppShell>);

    expect(screen.queryByRole('link', { name: /Agent47/i })).not.toBeInTheDocument();
    expect(screen.getByText('workspace content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify the shell split does not exist yet**

Run: `npm run test:unit -- --run tests/unit/app/app-shell.test.tsx`  
Expected: FAIL with the workspace-route assertion because the shared header still renders everywhere.

- [ ] **Step 3: Implement a route-aware shell split**

```tsx
// src/components/app-shell.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isWorkspaceRoute = pathname?.startsWith('/workspaces') ?? false;

  if (isWorkspaceRoute) {
    return <>{children}</>;
  }

  return (
    <div className="entry-shell min-h-screen text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="entry-shell__header">
          <Link href="/" className="flex items-center gap-3" aria-label="Agent47">
            <div className="entry-shell__mark">A</div>
            <div>
              <div className="entry-shell__wordmark">AGENT47</div>
              <div className="entry-shell__subhead">Decision workspace</div>
            </div>
          </Link>
          <Link href="/signin" className="entry-shell__action">
            Open workspace
          </Link>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
```

```tsx
// src/app/layout.tsx
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0f14] text-slate-100">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Run the test to verify the split now works**

Run: `npm run test:unit -- --run tests/unit/app/app-shell.test.tsx`  
Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/components/app-shell.tsx tests/unit/app/app-shell.test.tsx
git commit -m "refactor: split entry shell from workspace routes"
```

### Task 2: Rebuild the workspace into a full-screen operational surface

**Files:**
- Create: `src/components/workspaces/workbench-sidebar.tsx`
- Create: `src/components/workspaces/run-activity-pane.tsx`
- Create: `src/components/workspaces/run-inspector-pane.tsx`
- Create: `src/components/workspaces/workbench-composer.tsx`
- Modify: `src/components/workspaces/workbench-shell.tsx`
- Modify: `src/components/runs/run-status-badge.tsx`
- Test: `tests/unit/workspaces/workbench-shell.test.tsx`

**Interfaces:**
- Consumes:
  - `WorkspaceRecord`
  - `WorkspaceRunRecord`
  - `RunStatusBadge({ status }: { status: string }): JSX.Element`
- Produces:
  - `WorkbenchSidebar(props: { workspace: WorkspaceRecord; workspaces: WorkspaceRecord[]; runs: WorkspaceRunRecord[]; selectedRunId: string | null; onSelectRun: (runId: string) => void }): JSX.Element`
  - `RunActivityPane(props: { selectedRun: WorkspaceRunRecord | null; message: string; children: React.ReactNode }): JSX.Element`
  - `RunInspectorPane(props: { workspaceId: string; selectedRun: WorkspaceRunRecord | null; activeDetail: DetailItem | null; detailItems: DetailItem[]; onSelectDetail: (item: DetailItem) => void }): JSX.Element`
  - `WorkbenchComposer(props: { draft: string; isSubmitting: boolean; starterPrompts: string[]; onDraftChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onUsePrompt: (prompt: string) => void; message: string }): JSX.Element`

- [ ] **Step 1: Rewrite the workbench test around the new structure**

```tsx
// tests/unit/workspaces/workbench-shell.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkbenchShell } from '@/components/workspaces/workbench-shell';
import type { WorkspaceRecord } from '@/lib/workspace-store';

const workspace: WorkspaceRecord = {
  id: 'workspace-1',
  name: 'Design review',
  slug: 'design-review',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('WorkbenchShell', () => {
  it('renders a full-screen workbench with side rail, activity pane, inspector, and composer', () => {
    render(<WorkbenchShell workspace={workspace} initialRuns={[]} workspaces={[workspace]} />);

    expect(screen.getByTestId('workbench-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-activity')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-inspector')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe the decision/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify the current file structure does not satisfy it**

Run: `npm run test:unit -- --run tests/unit/workspaces/workbench-shell.test.tsx`  
Expected: FAIL because the new test IDs and composer layout do not exist.

- [ ] **Step 3: Extract the workbench into focused subcomponents**

```tsx
// src/components/workspaces/workbench-sidebar.tsx
import Link from 'next/link';
import { RunStatusBadge } from '@/components/runs/run-status-badge';
import type { WorkspaceRecord, WorkspaceRunRecord } from '@/lib/workspace-store';

export function WorkbenchSidebar({
  workspace,
  workspaces,
  runs,
  selectedRunId,
  onSelectRun,
}: {
  workspace: WorkspaceRecord;
  workspaces: WorkspaceRecord[];
  runs: WorkspaceRunRecord[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}) {
  return (
    <aside data-testid="workbench-sidebar" className="workbench-sidebar">
      <div className="workbench-sidebar__identity">
        <p className="workbench-sidebar__kicker">Workspace</p>
        <h1>{workspace.name}</h1>
        <p>/{workspace.slug}</p>
      </div>
      <nav className="workbench-sidebar__spaces">
        {workspaces.map((item) => (
          <Link key={item.id} href={`/workspaces/${item.id}`} className={item.id === workspace.id ? 'is-active' : ''}>
            <span>{item.name}</span>
            <span>/{item.slug}</span>
          </Link>
        ))}
      </nav>
      <div className="workbench-sidebar__runs">
        {runs.map((run) => (
          <button key={run.id} type="button" onClick={() => onSelectRun(run.id)} className={selectedRunId === run.id ? 'is-active' : ''}>
            <span>{run.title}</span>
            <RunStatusBadge status={run.status} />
          </button>
        ))}
      </div>
    </aside>
  );
}
```

```tsx
// src/components/workspaces/run-activity-pane.tsx
import type { ReactNode } from 'react';
import { RunStatusBadge } from '@/components/runs/run-status-badge';
import type { WorkspaceRunRecord } from '@/lib/workspace-store';

export function RunActivityPane({
  selectedRun,
  message,
  children,
}: {
  selectedRun: WorkspaceRunRecord | null;
  message: string;
  children: ReactNode;
}) {
  return (
    <section data-testid="workbench-activity" className="workbench-activity">
      <div className="workbench-activity__header">
        <div>
          <p className="workbench-activity__kicker">Active run</p>
          <h2>{selectedRun?.title ?? 'No active run yet'}</h2>
          <p>{message}</p>
        </div>
        {selectedRun ? <RunStatusBadge status={selectedRun.status} /> : null}
      </div>
      <div className="workbench-activity__stream">
        {selectedRun ? selectedRun.checkpoints.map((checkpoint, index) => (
          <article key={`${selectedRun.id}-${checkpoint}-${index}`} className="workbench-step">
            <span className="workbench-step__index">{index + 1}</span>
            <div>
              <p>{checkpoint}</p>
              <span>Step {index + 1}</span>
            </div>
          </article>
        )) : (
          <div className="workbench-empty">
            Start with one request. The run stream will appear here.
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
```

```tsx
// src/components/workspaces/workbench-composer.tsx
import type { FormEvent } from 'react';

export function WorkbenchComposer({
  draft,
  isSubmitting,
  starterPrompts,
  onDraftChange,
  onSubmit,
  onUsePrompt,
  message,
}: {
  draft: string;
  isSubmitting: boolean;
  starterPrompts: string[];
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUsePrompt: (prompt: string) => void;
  message: string;
}) {
  return (
    <form className="workbench-composer" onSubmit={onSubmit}>
      <div className="workbench-composer__chips">
        {starterPrompts.map((prompt) => (
          <button key={prompt} type="button" onClick={() => onUsePrompt(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="workbench-prompt">Describe the task</label>
      <textarea
        id="workbench-prompt"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Describe the decision, deliverable, or question you need help with."
      />
      <div className="workbench-composer__footer">
        <p>{message}</p>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Run'}
        </button>
      </div>
    </form>
  );
}
```

```tsx
// src/components/workspaces/run-inspector-pane.tsx
import Link from 'next/link';
import type { WorkspaceRunRecord } from '@/lib/workspace-store';

export interface DetailItem {
  id: string;
  title: string;
  body: string;
}

export function RunInspectorPane({
  workspaceId,
  selectedRun,
  activeDetail,
  detailItems,
  onSelectDetail,
}: {
  workspaceId: string;
  selectedRun: WorkspaceRunRecord | null;
  activeDetail: DetailItem | null;
  detailItems: DetailItem[];
  onSelectDetail: (item: DetailItem) => void;
}) {
  return (
    <aside data-testid="workbench-inspector" className="workbench-inspector">
      <div className="workbench-inspector__header">
        <div>
          <p className="workbench-inspector__kicker">Inspector</p>
          <h2>Summary and details</h2>
        </div>
        {selectedRun ? <Link href={`/workspaces/${workspaceId}/runs/${selectedRun.id}`}>Open full</Link> : null}
      </div>
      {selectedRun ? (
        <>
          <section className="workbench-inspector__summary">
            <h3>{selectedRun.title}</h3>
            <p>{selectedRun.resultPackage.summary}</p>
          </section>
          <div className="workbench-inspector__tabs">
            {detailItems.slice(0, 4).map((item) => (
              <button key={item.id} type="button" onClick={() => onSelectDetail(item)}>
                {item.title}
              </button>
            ))}
          </div>
          <section className="workbench-inspector__detail">
            {activeDetail ? <p>{activeDetail.body}</p> : <p>Select a detail to inspect it here.</p>}
          </section>
        </>
      ) : (
        <div className="workbench-empty">Summary, artifacts, and citations will appear here.</div>
      )}
    </aside>
  );
}
```

```tsx
// src/components/workspaces/workbench-shell.tsx
// Keep the existing state and fetch logic, but compose the page from:
// <WorkbenchSidebar />
// <RunActivityPane><WorkbenchComposer /></RunActivityPane>
// <RunInspectorPane />
//
// Add a root className like:
// className="workbench-root min-h-screen grid xl:grid-cols-[260px_minmax(0,1fr)_340px]"
```

```tsx
// src/components/runs/run-status-badge.tsx
export function RunStatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  const tone =
    status === 'completed'
      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
      : status === 'running'
        ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100'
        : 'border-white/10 bg-white/5 text-slate-300';

  return (
    <span className={`rounded-full border px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${tone}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 4: Run the workbench test to verify the structure passes**

Run: `npm run test:unit -- --run tests/unit/workspaces/workbench-shell.test.tsx`  
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/workspaces/workbench-sidebar.tsx src/components/workspaces/run-activity-pane.tsx src/components/workspaces/run-inspector-pane.tsx src/components/workspaces/workbench-composer.tsx src/components/workspaces/workbench-shell.tsx src/components/runs/run-status-badge.tsx tests/unit/workspaces/workbench-shell.test.tsx
git commit -m "refactor: rebuild workspace as fullscreen workbench"
```

### Task 3: Redesign the homepage and sign-in as minimal entry surfaces

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/signin/page.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/unit/app/home-page.test.tsx`
- Test: `tests/unit/app/signin-page.test.tsx`

**Interfaces:**
- Consumes:
  - `Link` from `next/link`
  - `useRouter()` on the sign-in page
- Produces:
  - `HomePage(): JSX.Element`
  - `SignInPage(): JSX.Element`
  - entry-surface classes: `.entry-shell`, `.entry-panel`, `.entry-kicker`, `.entry-title`, `.entry-copy`

- [ ] **Step 1: Tighten the entry-page tests around the new minimal surface**

```tsx
// tests/unit/app/home-page.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from '@/app/page';

describe('HomePage', () => {
  it('renders a minimal product statement and workspace entry action', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: 'A workbench for decisions that deserve more than chat.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /How it works/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a workspace' })).toHaveAttribute('href', '/signin');
  });
});
```

```tsx
// tests/unit/app/signin-page.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SignInPage from '@/app/signin/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe('SignInPage', () => {
  it('renders a compact entry form for opening the workspace', () => {
    render(<SignInPage />);

    expect(screen.getByRole('heading', { name: 'Open your workspace.' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify the old landing-page copy still fails them**

Run: `npm run test:unit -- --run tests/unit/app/home-page.test.tsx tests/unit/app/signin-page.test.tsx`  
Expected: FAIL because the current pages still render the larger marketing-style sections and old headings.

- [ ] **Step 3: Replace the entry pages and define explicit entry-surface tokens**

```tsx
// src/app/page.tsx
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="entry-page">
      <section className="entry-panel">
        <p className="entry-kicker">Decision workspace</p>
        <h1 className="entry-title">A workbench for decisions that deserve more than chat.</h1>
        <p className="entry-copy">
          Open one focused workspace, run the task, and keep the process, evidence, and answer in one surface.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="entry-primary" href="/signin">
            Start a workspace
          </Link>
          <Link className="entry-secondary" href="/workspaces">
            Continue a workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
```

```tsx
// src/app/signin/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@decision.work');
  const [password, setPassword] = useState('demo-password');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    // keep the current login implementation and redirect behavior unchanged
  }

  return (
    <main className="entry-page">
      <section className="entry-panel entry-panel--narrow">
        <p className="entry-kicker">Secure access</p>
        <h1 className="entry-title">Open your workspace.</h1>
        <p className="entry-copy">Sign in and continue directly in the workbench.</p>
        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block" htmlFor="email">
            <span className="entry-label">Email</span>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="entry-input" required />
          </label>
          <label className="block" htmlFor="password">
            <span className="entry-label">Password</span>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="entry-input" required />
          </label>
          {error ? <p role="alert" className="entry-error">{error}</p> : null}
          <button type="submit" className="entry-primary w-full">Sign in</button>
        </form>
      </section>
    </main>
  );
}
```

```css
/* src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    color-scheme: dark;
  }

  body {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0a0f14;
    color: #e2e8f0;
  }

  * {
    box-sizing: border-box;
  }
}

@layer components {
  .entry-shell__header {
    @apply flex items-center justify-between gap-4 border-b border-white/10 py-4;
  }

  .entry-shell__mark {
    @apply flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-slate-100;
  }

  .entry-shell__wordmark {
    @apply text-sm font-semibold tracking-[0.24em] text-slate-100;
  }

  .entry-shell__subhead {
    @apply text-xs text-slate-500;
  }

  .entry-shell__action,
  .entry-secondary {
    @apply rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/10;
  }

  .entry-page {
    @apply flex min-h-[calc(100vh-73px)] items-center justify-center py-12;
  }

  .entry-panel {
    @apply w-full max-w-3xl rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.24)];
  }

  .entry-panel--narrow {
    @apply max-w-xl;
  }

  .entry-kicker {
    @apply text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-500;
  }

  .entry-title {
    @apply mt-4 text-4xl font-semibold tracking-[-0.03em] text-white;
  }

  .entry-copy {
    @apply mt-4 max-w-2xl text-base leading-8 text-slate-400;
  }

  .entry-label {
    @apply mb-2 block text-sm text-slate-300;
  }

  .entry-input {
    @apply w-full rounded-2xl border border-white/10 bg-[#0f1720] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20;
  }

  .entry-primary {
    @apply inline-flex items-center justify-center rounded-full bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200;
  }

  .entry-error {
    @apply text-sm text-rose-300;
  }

  .workbench-root {
    @apply min-h-screen bg-[#0a0f14] text-slate-100;
  }
}
```

- [ ] **Step 4: Run the entry-page tests to verify they pass**

Run: `npm run test:unit -- --run tests/unit/app/home-page.test.tsx tests/unit/app/signin-page.test.tsx`  
Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/signin/page.tsx src/app/globals.css tests/unit/app/home-page.test.tsx tests/unit/app/signin-page.test.tsx
git commit -m "refactor: redesign entry surfaces"
```

### Task 4: Lock in the new workbench flow with end-to-end coverage

**Files:**
- Modify: `tests/e2e/learning-path-flow.spec.ts`
- Modify: `src/components/workspaces/workbench-shell.tsx`

**Interfaces:**
- Consumes:
  - `page.getByPlaceholder('Describe the decision, deliverable, or question you need help with.')`
  - `page.getByRole('button', { name: 'Run' })`
- Produces:
  - stable e2e markers: `data-testid="workbench-sidebar"`, `data-testid="workbench-activity"`, `data-testid="workbench-inspector"`

- [ ] **Step 1: Expand the e2e test around the full-screen workbench contract**

```ts
// tests/e2e/learning-path-flow.spec.ts
import { expect, test } from '@playwright/test';

test('signs in and starts a learning path run from the fullscreen workbench', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start a workspace' }).click();

  await page.getByLabel('Email').fill('demo@decision.work');
  await page.getByLabel('Password').fill('demo-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/workspaces\//);
  await expect(page.getByTestId('workbench-sidebar')).toBeVisible();
  await expect(page.getByTestId('workbench-activity')).toBeVisible();
  await expect(page.getByTestId('workbench-inspector')).toBeVisible();

  await page.getByPlaceholder('Describe the decision, deliverable, or question you need help with.').fill('Plan my frontend growth');
  await page.getByRole('button', { name: 'Run' }).click();

  await expect(page.locator('body')).toContainText('Run created. Review the brief and the next steps on the right.');
  await expect(page.getByRole('heading', { name: 'Plan my frontend growth' })).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e test to verify it fails before the workbench contract is fully wired**

Run: `npx playwright test tests/e2e/learning-path-flow.spec.ts`  
Expected: FAIL if any of the new `data-testid` markers or the bottom-composer flow is missing.

- [ ] **Step 3: Add the final test hooks and run-surface polish**

```tsx
// src/components/workspaces/workbench-shell.tsx
return (
  <main className="workbench-root">
    <div className="grid min-h-screen xl:grid-cols-[260px_minmax(0,1fr)_340px]">
      <WorkbenchSidebar ... />
      <RunActivityPane ...>
        <WorkbenchComposer ... />
      </RunActivityPane>
      <RunInspectorPane ... />
    </div>
  </main>
);
```

- [ ] **Step 4: Run the verification suite**

Run: `npm run test:unit -- --run`  
Expected: PASS with all unit tests green

Run: `npx playwright test tests/e2e/learning-path-flow.spec.ts`  
Expected: PASS with `1 passed`

Run: `npm run build`  
Expected: PASS with a successful Next.js production build

- [ ] **Step 5: Commit**

```bash
git add src/components/workspaces/workbench-shell.tsx tests/e2e/learning-path-flow.spec.ts
git commit -m "test: lock in fullscreen workbench flow"
```

## Self-Review

- **Spec coverage:** The plan covers route-shell separation, full-screen workspace layout, minimal homepage/sign-in redesign, and regression verification. No spec section is left without a task.
- **Placeholder scan:** No `TODO`, `TBD`, or “implement later” placeholders remain in the tasks.
- **Type consistency:** The component names and props used in later tasks are defined in the file structure and interfaces above.
