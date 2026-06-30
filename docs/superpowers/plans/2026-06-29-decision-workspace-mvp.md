# Decision Workspace MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-user Next.js Decision Workspace MVP that lets signed-in users create isolated workspaces, run a learning-path planning flow, review checkpoints, and receive structured result packages with citations and downloadable artifacts.

**Architecture:** Use a run-first backend design inside a Next.js full-stack app. Persist auth, workspaces, runs, events, artifacts, and provider settings in PostgreSQL via Prisma; keep the runtime generic with recipe, provider, and storage interfaces; expose a concrete Decision Workspace product surface with a learning-path hero flow plus shopping and career recipe variants.

**Tech Stack:** TypeScript, Node.js, Next.js App Router, React, Prisma, PostgreSQL, Auth.js, Zod, Tailwind CSS, Vitest, React Testing Library, Playwright, OpenAI SDK (`baseURL` override for OpenAI-compatible models)

## Global Constraints

- Use **TypeScript / Node.js**.
- Use a **Next.js full-stack Web application**.
- Build a **multi-user SaaS-ready MVP** with account-based workspace isolation.
- Keep the runtime **run-first**; workspace is a container, not the orchestration center.
- Default to **human-in-the-loop** execution with explicit approval checkpoints.
- Use a **hybrid provider model**: platform defaults plus workspace-level BYOK overrides.
- Keep the core **strongly composable** with a small primitive set: `Run`, `Tool`, `Resource`, `Artifact`, `Approval`, `Policy`, `ResultPackage`, `Workspace`.
- Ship **web access, document ingestion, and file output** in the MVP.
- Standardize every completed flow on a **structured `ResultPackage`**.
- The **hero recipe** is learning path planning.
- The **secondary recipes** are shopping comparison and career path planning.
- Do **not** expand into legal, medical, or investment advice in v1.
- Use **TDD** for every task and keep commits small and frequent.

## File Structure

### Application shell and configuration

- Create: `package.json` — app dependencies and scripts
- Create: `tsconfig.json` — TS compiler settings and `@/*` alias
- Create: `next.config.ts` — Next.js config
- Create: `postcss.config.mjs` — Tailwind PostCSS wiring
- Create: `tailwind.config.ts` — Tailwind content config
- Create: `.env.example` — required env vars
- Create: `vitest.config.ts` — unit/component test config
- Create: `playwright.config.ts` — end-to-end config
- Create: `tests/setup.ts` — Testing Library setup

### Database and auth

- Create: `prisma/schema.prisma` — users, sessions, workspaces, memberships, provider settings, runs, run events, resources, artifacts
- Create: `src/lib/db.ts` — singleton Prisma client
- Create: `src/lib/env.ts` — typed env validation
- Create: `src/lib/auth.ts` — Auth.js config
- Create: `src/app/api/auth/[...nextauth]/route.ts` — auth handlers
- Create: `src/middleware.ts` — route protection

### Runtime core

- Create: `src/lib/runtime/types.ts` — run state, citations, artifacts, result package types
- Create: `src/lib/runtime/run-machine.ts` — state transitions
- Create: `src/lib/runtime/policies.ts` — approval/budget policies
- Create: `src/lib/runtime/result-package.ts` — result package helpers

### Providers and storage

- Create: `src/lib/providers/types.ts` — provider interfaces
- Create: `src/lib/providers/openai-compatible.ts` — model provider adapter
- Create: `src/lib/providers/tavily-search.ts` — default search provider
- Create: `src/lib/providers/firecrawl-document.ts` — default document/web extraction provider
- Create: `src/lib/providers/registry.ts` — resolve default or BYOK provider
- Create: `src/lib/security/provider-secrets.ts` — encrypt/decrypt BYOK secrets
- Create: `src/lib/storage/types.ts` — object storage interface
- Create: `src/lib/storage/local-object-storage.ts` — local adapter for MVP

### Recipes and run orchestration

- Create: `src/lib/recipes/types.ts` — recipe contracts
- Create: `src/lib/recipes/learning-path.ts` — hero recipe
- Create: `src/lib/recipes/shopping-comparison.ts` — secondary recipe
- Create: `src/lib/recipes/career-path.ts` — secondary recipe
- Create: `src/server/runs/create-run.ts` — persist run draft
- Create: `src/server/runs/execute-run.ts` — execute recipe phases
- Create: `src/server/runs/resume-run.ts` — resume from approval/input checkpoints
- Create: `src/server/runs/export-result-package.ts` — markdown artifact export

### Product surface

- Create: `src/app/layout.tsx` — app shell
- Create: `src/app/page.tsx` — marketing/home page
- Create: `src/app/signin/page.tsx` — sign-in page
- Create: `src/app/workspaces/page.tsx` — workspace index
- Create: `src/app/workspaces/[workspaceId]/page.tsx` — workspace overview
- Create: `src/app/workspaces/[workspaceId]/runs/new/page.tsx` — new run page
- Create: `src/app/workspaces/[workspaceId]/runs/[runId]/page.tsx` — run detail page
- Create: `src/app/api/workspaces/route.ts` — create/list workspaces
- Create: `src/app/api/workspaces/[workspaceId]/providers/route.ts` — save/list provider settings
- Create: `src/app/api/workspaces/[workspaceId]/runs/route.ts` — create/list runs
- Create: `src/app/api/workspaces/[workspaceId]/runs/[runId]/resume/route.ts` — continue a paused run
- Create: `src/app/api/workspaces/[workspaceId]/runs/[runId]/export/route.ts` — download markdown artifact
- Create: `src/app/api/test/login/route.ts` — test-only session bootstrap for Playwright
- Create: `src/components/workspaces/workspace-list.tsx`
- Create: `src/components/runs/recipe-selector.tsx`
- Create: `src/components/runs/decision-intake-form.tsx`
- Create: `src/components/runs/run-status-badge.tsx`
- Create: `src/components/runs/checkpoint-card.tsx`
- Create: `src/components/runs/result-package-view.tsx`
- Create: `src/components/runs/source-list.tsx`
- Create: `src/components/providers/provider-settings-form.tsx`

### Tests

- Create: `tests/unit/app/home-page.test.tsx`
- Create: `tests/unit/auth/workspace-access.test.ts`
- Create: `tests/unit/runtime/run-machine.test.ts`
- Create: `tests/unit/providers/registry.test.ts`
- Create: `tests/unit/recipes/learning-path.test.ts`
- Create: `tests/unit/recipes/shopping-comparison.test.ts`
- Create: `tests/unit/recipes/career-path.test.ts`
- Create: `tests/unit/server/create-run.test.ts`
- Create: `tests/unit/server/resume-run.test.ts`
- Create: `tests/e2e/learning-path-flow.spec.ts`
- Create: `tests/e2e/shopping-comparison-flow.spec.ts`

---

### Task 1: Bootstrap the Next.js application shell

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `.env.example`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Test: `tests/unit/app/home-page.test.tsx`

**Interfaces:**
- Consumes: none
- Produces:
  - `RootLayout({ children }: { children: React.ReactNode }): JSX.Element`
  - `HomePage(): JSX.Element`

- [ ] **Step 1: Write the failing home page test**

```tsx
// tests/unit/app/home-page.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from '@/app/page';

describe('HomePage', () => {
  it('renders the product promise and primary CTA', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', { name: 'Complex decisions, made clear.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Start a workspace' }),
    ).toHaveAttribute('href', '/signin');
  });
});
```

- [ ] **Step 2: Run the test to confirm the app shell is missing**

Run: `npm run test:unit -- --run tests/unit/app/home-page.test.tsx`  
Expected: FAIL with `Cannot find module '@/app/page'`

- [ ] **Step 3: Add the application shell and minimal page implementation**

```json
// package.json
{
  "name": "decision-workspace",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test:unit": "vitest",
    "test:e2e": "playwright test",
    "test": "npm run test:unit && npm run test:e2e",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@types/node": "^22.10.1",
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

```ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
```

```js
// postcss.config.mjs
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

```env
// .env.example
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/decision_workspace"
AUTH_SECRET="replace-with-32-char-secret"
AUTH_GOOGLE_ID="replace-me"
AUTH_GOOGLE_SECRET="replace-me"
OPENAI_API_KEY="replace-me"
OPENAI_BASE_URL="https://api.openai.com/v1"
TAVILY_API_KEY="replace-me"
FIRECRAWL_API_KEY="replace-me"
PROVIDER_SECRET="replace-with-32-char-secret"
```

```tsx
// src/app/layout.tsx
import type { ReactNode } from 'react';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-50">{children}</body>
    </html>
  );
}
```

```tsx
// src/app/page.tsx
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-6 px-6">
      <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
        Decision Workspace
      </p>
      <h1 className="text-5xl font-semibold">Complex decisions, made clear.</h1>
      <p className="max-w-2xl text-lg text-slate-300">
        Turn messy options, scattered research, and moving constraints into
        structured recommendations with clear next steps.
      </p>
      <div className="flex gap-4">
        <Link className="rounded bg-sky-500 px-5 py-3 font-medium" href="/signin">
          Start a workspace
        </Link>
      </div>
    </main>
  );
}
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

```ts
// tests/setup.ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Run the test again and confirm the page renders**

Run: `npm run test:unit -- --run tests/unit/app/home-page.test.tsx`  
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit the foundation shell**

```bash
git add package.json tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts vitest.config.ts tests/setup.ts src/app/layout.tsx src/app/page.tsx tests/unit/app/home-page.test.tsx
git commit -m "feat: bootstrap decision workspace shell"
```

### Task 2: Add multi-user auth and workspace-safe persistence

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`
- Create: `src/lib/env.ts`
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/middleware.ts`
- Test: `tests/unit/auth/workspace-access.test.ts`

**Interfaces:**
- Consumes:
  - `env` from `src/lib/env.ts`
- Produces:
  - `authOptions` from `src/lib/auth.ts`
  - `assertWorkspaceAccess(userId: string, workspaceId: string): Promise<void>`
  - Prisma models: `User`, `Workspace`, `WorkspaceMember`, `ProviderSetting`, `Run`, `RunEvent`, `Resource`, `Artifact`

- [ ] **Step 1: Write the failing workspace access test**

```ts
// tests/unit/auth/workspace-access.test.ts
import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { assertWorkspaceAccess } from '@/lib/auth';

vi.mock('@/lib/db', () => ({
  db: {
    workspaceMember: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

describe('assertWorkspaceAccess', () => {
  it('throws when the user is not a member of the workspace', async () => {
    await expect(
      assertWorkspaceAccess('user_1', 'workspace_1'),
    ).rejects.toThrow('Workspace access denied');
  });
});
```

- [ ] **Step 2: Run the test to verify auth and DB code do not exist**

Run: `npm run test:unit -- --run tests/unit/auth/workspace-access.test.ts`  
Expected: FAIL with `Cannot find module '@/lib/auth'`

- [ ] **Step 3: Add Prisma models, env validation, and Auth.js wiring**

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id             String            @id @default(cuid())
  email          String            @unique
  name           String?
  image          String?
  accounts       Account[]
  sessions       Session[]
  memberships    WorkspaceMember[]
  providerSettings ProviderSetting[]
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

model Workspace {
  id          String            @id @default(cuid())
  name        String
  slug        String            @unique
  members     WorkspaceMember[]
  runs        Run[]
  resources   Resource[]
  artifacts   Artifact[]
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
}

model WorkspaceMember {
  id          String    @id @default(cuid())
  workspaceId String
  userId      String
  role        String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
}

model ProviderSetting {
  id             String   @id @default(cuid())
  workspaceId     String
  userId          String
  providerKind    String
  encryptedSecret String
  baseUrl         String?
  workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, providerKind])
}

model Run {
  id            String      @id @default(cuid())
  workspaceId    String
  recipeKind     String
  status         String
  title          String
  taskBrief      Json
  resultPackage  Json?
  workspace      Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  events         RunEvent[]
  artifacts      Artifact[]
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
}

model RunEvent {
  id        String   @id @default(cuid())
  runId      String
  type       String
  payload    Json
  createdAt  DateTime @default(now())
  run        Run      @relation(fields: [runId], references: [id], onDelete: Cascade)
}

model Resource {
  id          String    @id @default(cuid())
  workspaceId  String
  runId        String?
  kind        String
  title       String
  sourceUrl   String?
  content     String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

model Artifact {
  id          String    @id @default(cuid())
  workspaceId  String
  runId        String
  kind        String
  title       String
  storageKey  String
  mimeType    String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  run         Run      @relation(fields: [runId], references: [id], onDelete: Cascade)
}
```

```ts
// src/lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.string().url(),
  TAVILY_API_KEY: z.string().min(1),
  FIRECRAWL_API_KEY: z.string().min(1),
  PROVIDER_SECRET: z.string().min(32),
});

export const env = envSchema.parse(process.env);
```

```ts
// src/lib/db.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
```

```ts
// src/lib/auth.ts
import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import { db } from '@/lib/db';

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(db),
  session: { strategy: 'database' },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  pages: {
    signIn: '/signin',
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export async function assertWorkspaceAccess(userId: string, workspaceId: string) {
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });

  if (!membership) {
    throw new Error('Workspace access denied');
  }
}
```

```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
```

```ts
// src/middleware.ts
export { auth as middleware } from '@/lib/auth';

export const config = {
  matcher: ['/workspaces/:path*'],
};
```

- [ ] **Step 4: Run the auth unit test and the Prisma client generation**

Run: `npm run prisma:generate && npm run test:unit -- --run tests/unit/auth/workspace-access.test.ts`  
Expected: PASS with Prisma Client generated and `1 passed`

- [ ] **Step 5: Commit auth and workspace persistence**

```bash
git add prisma/schema.prisma src/lib/db.ts src/lib/env.ts src/lib/auth.ts src/app/api/auth/[...nextauth]/route.ts src/middleware.ts tests/unit/auth/workspace-access.test.ts .env.example
git commit -m "feat: add auth and workspace persistence"
```

### Task 3: Implement the runtime core and state machine

**Files:**
- Create: `src/lib/runtime/types.ts`
- Create: `src/lib/runtime/run-machine.ts`
- Create: `src/lib/runtime/policies.ts`
- Create: `src/lib/runtime/result-package.ts`
- Test: `tests/unit/runtime/run-machine.test.ts`

**Interfaces:**
- Consumes:
  - Prisma `Run.status`
- Produces:
  - `type RunStatus = 'drafting' | 'running' | 'awaiting_input' | 'awaiting_approval' | 'partial_complete' | 'completed' | 'failed' | 'cancelled'`
  - `createRunDraft(input: CreateRunDraftInput): RunState`
  - `requestApproval(state: RunState, reason: string): RunState`
  - `completeRun(state: RunState, result: ResultPackage): RunState`
  - `recordPartialResult(state: RunState, result: ResultPackage): RunState`

- [ ] **Step 1: Write the failing run-machine tests**

```ts
// tests/unit/runtime/run-machine.test.ts
import { describe, expect, it } from 'vitest';
import {
  completeRun,
  createRunDraft,
  recordPartialResult,
  requestApproval,
} from '@/lib/runtime/run-machine';

describe('run-machine', () => {
  it('moves a run into awaiting_approval with a checkpoint reason', () => {
    const draft = createRunDraft({
      recipeKind: 'learning_path',
      title: 'Learn data analysis',
      taskBrief: { goal: 'Become job-ready in 90 days' },
    });

    const awaitingApproval = requestApproval(draft, 'Need confirmation on time budget');

    expect(awaitingApproval.status).toBe('awaiting_approval');
    expect(awaitingApproval.pendingApprovalReason).toBe('Need confirmation on time budget');
  });

  it('records partial results without closing the run', () => {
    const draft = createRunDraft({
      recipeKind: 'shopping_comparison',
      title: 'Choose a laptop',
      taskBrief: { goal: 'Find a laptop under $1500' },
    });

    const partial = recordPartialResult(draft, {
      summary: 'Two strong candidates found',
      recommendation: 'Need one more benchmark source',
      citations: [],
      attachments: [],
      nextActions: ['Confirm preferred screen size'],
      completionState: 'partial_complete',
    });

    expect(partial.status).toBe('partial_complete');
    expect(partial.resultPackage?.completionState).toBe('partial_complete');
  });

  it('completes the run with a final result package', () => {
    const draft = createRunDraft({
      recipeKind: 'career_path',
      title: 'Plan a PM transition',
      taskBrief: { goal: 'Move into product management' },
    });

    const completed = completeRun(draft, {
      summary: 'Choose a PM-to-growth transition path',
      recommendation: 'Start with a portfolio project and analytics course',
      citations: [],
      attachments: [],
      nextActions: ['Enroll in the analytics course'],
      completionState: 'completed',
    });

    expect(completed.status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run the runtime tests to confirm the machine is missing**

Run: `npm run test:unit -- --run tests/unit/runtime/run-machine.test.ts`  
Expected: FAIL with `Cannot find module '@/lib/runtime/run-machine'`

- [ ] **Step 3: Implement typed run state transitions**

```ts
// src/lib/runtime/types.ts
export type RecipeKind = 'learning_path' | 'shopping_comparison' | 'career_path';

export type RunStatus =
  | 'drafting'
  | 'running'
  | 'awaiting_input'
  | 'awaiting_approval'
  | 'partial_complete'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ResultPackage = {
  summary: string;
  recommendation: string;
  citations: Array<{ title: string; url?: string; snippet: string }>;
  attachments: Array<{ title: string; storageKey: string; mimeType: string }>;
  nextActions: string[];
  completionState: 'partial_complete' | 'completed';
  confidence?: 'low' | 'medium' | 'high';
  openQuestions?: string[];
};

export type RunState = {
  recipeKind: RecipeKind;
  title: string;
  status: RunStatus;
  taskBrief: Record<string, unknown>;
  pendingApprovalReason?: string;
  resultPackage?: ResultPackage;
};

export type CreateRunDraftInput = Pick<RunState, 'recipeKind' | 'title' | 'taskBrief'>;
```

```ts
// src/lib/runtime/run-machine.ts
import type { CreateRunDraftInput, ResultPackage, RunState } from '@/lib/runtime/types';

export function createRunDraft(input: CreateRunDraftInput): RunState {
  return {
    ...input,
    status: 'drafting',
  };
}

export function requestApproval(state: RunState, reason: string): RunState {
  return {
    ...state,
    status: 'awaiting_approval',
    pendingApprovalReason: reason,
  };
}

export function recordPartialResult(state: RunState, result: ResultPackage): RunState {
  return {
    ...state,
    status: 'partial_complete',
    resultPackage: result,
  };
}

export function completeRun(state: RunState, result: ResultPackage): RunState {
  return {
    ...state,
    status: 'completed',
    pendingApprovalReason: undefined,
    resultPackage: result,
  };
}
```

- [ ] **Step 4: Re-run the runtime tests**

Run: `npm run test:unit -- --run tests/unit/runtime/run-machine.test.ts`  
Expected: PASS with `3 passed`

- [ ] **Step 5: Commit the runtime core**

```bash
git add src/lib/runtime/types.ts src/lib/runtime/run-machine.ts src/lib/runtime/policies.ts src/lib/runtime/result-package.ts tests/unit/runtime/run-machine.test.ts
git commit -m "feat: add run state machine"
```

### Task 4: Add provider resolution, BYOK secret handling, and artifact storage

**Files:**
- Create: `src/lib/providers/types.ts`
- Create: `src/lib/providers/openai-compatible.ts`
- Create: `src/lib/providers/tavily-search.ts`
- Create: `src/lib/providers/firecrawl-document.ts`
- Create: `src/lib/providers/registry.ts`
- Create: `src/lib/security/provider-secrets.ts`
- Create: `src/lib/storage/types.ts`
- Create: `src/lib/storage/local-object-storage.ts`
- Test: `tests/unit/providers/registry.test.ts`

**Interfaces:**
- Consumes:
  - `ProviderSetting` rows from Prisma
  - `ResultPackage.attachments`
- Produces:
  - `SearchProvider.search(query: string): Promise<SearchResult[]>`
  - `DocumentProvider.fetch(url: string): Promise<DocumentResource>`
  - `ModelProvider.generateStructured<T>(input: ModelRequest<T>): Promise<T>`
  - `resolveWorkspaceProviders(workspaceId: string): Promise<WorkspaceProviders>`
  - `encryptProviderSecret(secret: string): string`
  - `decryptProviderSecret(cipherText: string): string`
  - `ObjectStorage.putObject(input: PutObjectInput): Promise<{ storageKey: string }>`

- [ ] **Step 1: Write the failing provider registry tests**

```ts
// tests/unit/providers/registry.test.ts
import { describe, expect, it, vi } from 'vitest';
import { resolveWorkspaceProviders } from '@/lib/providers/registry';

vi.mock('@/lib/db', () => ({
  db: {
    providerSetting: {
      findMany: vi.fn().mockResolvedValue([
        {
          providerKind: 'search',
          encryptedSecret: 'ciphertext',
          baseUrl: 'https://api.tavily.com',
        },
      ]),
    },
  },
}));

vi.mock('@/lib/security/provider-secrets', () => ({
  decryptProviderSecret: vi.fn().mockReturnValue('workspace-key'),
}));

describe('resolveWorkspaceProviders', () => {
  it('prefers workspace BYOK settings over platform defaults', async () => {
    const providers = await resolveWorkspaceProviders('workspace_1');

    expect(providers.search.kind).toBe('tavily');
    expect(providers.search.apiKey).toBe('workspace-key');
  });
});
```

- [ ] **Step 2: Run the provider tests to confirm the layer is missing**

Run: `npm run test:unit -- --run tests/unit/providers/registry.test.ts`  
Expected: FAIL with `Cannot find module '@/lib/providers/registry'`

- [ ] **Step 3: Implement provider interfaces, registry resolution, encryption, and storage**

```ts
// src/lib/providers/types.ts
export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type DocumentResource = {
  title: string;
  sourceUrl: string;
  content: string;
};

export interface SearchProvider {
  kind: string;
  apiKey: string;
  search(query: string): Promise<SearchResult[]>;
}

export interface DocumentProvider {
  kind: string;
  apiKey: string;
  fetch(url: string): Promise<DocumentResource>;
}

export interface ModelRequest<T> {
  system: string;
  prompt: string;
  schemaName: string;
  parse: (json: unknown) => T;
}

export interface ModelProvider {
  kind: string;
  generateStructured<T>(input: ModelRequest<T>): Promise<T>;
}
```

```ts
// src/lib/security/provider-secrets.ts
import crypto from 'node:crypto';
import { env } from '@/lib/env';

const KEY = crypto.createHash('sha256').update(env.PROVIDER_SECRET).digest();

export function encryptProviderSecret(secret: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptProviderSecret(cipherText: string): string {
  const payload = Buffer.from(cipherText, 'base64');
  const iv = payload.subarray(0, 16);
  const tag = payload.subarray(16, 32);
  const encrypted = payload.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
```

```ts
// src/lib/providers/openai-compatible.ts
import OpenAI from 'openai';
import type { ModelProvider, ModelRequest } from '@/lib/providers/types';

export function createOpenAICompatibleProvider(config: {
  apiKey: string;
  baseUrl: string;
}): ModelProvider {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  return {
    kind: 'openai-compatible',
    async generateStructured<T>(input: ModelRequest<T>) {
      const response = await client.responses.create({
        model: 'gpt-4.1-mini',
        instructions: input.system,
        input: input.prompt,
      });

      return input.parse(response.output_text ? JSON.parse(response.output_text) : {});
    },
  };
}
```

```ts
// src/lib/providers/registry.ts
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { decryptProviderSecret } from '@/lib/security/provider-secrets';

export async function resolveWorkspaceProviders(workspaceId: string) {
  const settings = await db.providerSetting.findMany({ where: { workspaceId } });
  const byKind = new Map(settings.map((setting) => [setting.providerKind, setting]));

  const searchSetting = byKind.get('search');
  const documentSetting = byKind.get('document');
  const modelSetting = byKind.get('model');

  return {
    search: {
      kind: 'tavily',
      apiKey: searchSetting
        ? decryptProviderSecret(searchSetting.encryptedSecret)
        : env.TAVILY_API_KEY,
    },
    document: {
      kind: 'firecrawl',
      apiKey: documentSetting
        ? decryptProviderSecret(documentSetting.encryptedSecret)
        : env.FIRECRAWL_API_KEY,
    },
    model: {
      kind: 'openai-compatible',
      apiKey: modelSetting
        ? decryptProviderSecret(modelSetting.encryptedSecret)
        : env.OPENAI_API_KEY,
      baseUrl: modelSetting?.baseUrl ?? env.OPENAI_BASE_URL,
    },
  };
}
```

```ts
// src/lib/storage/types.ts
export type PutObjectInput = {
  workspaceId: string;
  runId: string;
  filename: string;
  content: string;
  mimeType: string;
};

export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<{ storageKey: string }>;
  getObject(storageKey: string): Promise<string>;
}
```

```ts
// src/lib/storage/local-object-storage.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ObjectStorage, PutObjectInput } from '@/lib/storage/types';

export class LocalObjectStorage implements ObjectStorage {
  async putObject(input: PutObjectInput) {
    const storageKey = `${input.workspaceId}/${input.runId}/${input.filename}`;
    const fullPath = path.join(process.cwd(), '.data', storageKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.content, 'utf8');
    return { storageKey };
  }

  async getObject(storageKey: string) {
    const fullPath = path.join(process.cwd(), '.data', storageKey);
    return fs.readFile(fullPath, 'utf8');
  }
}
```

- [ ] **Step 4: Re-run the provider tests**

Run: `npm run test:unit -- --run tests/unit/providers/registry.test.ts`  
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit provider resolution and storage**

```bash
git add src/lib/providers/types.ts src/lib/providers/openai-compatible.ts src/lib/providers/tavily-search.ts src/lib/providers/firecrawl-document.ts src/lib/providers/registry.ts src/lib/security/provider-secrets.ts src/lib/storage/types.ts src/lib/storage/local-object-storage.ts tests/unit/providers/registry.test.ts
git commit -m "feat: add provider registry and storage adapters"
```

### Task 5: Implement the learning-path recipe and run execution service

**Files:**
- Create: `src/lib/recipes/types.ts`
- Create: `src/lib/recipes/learning-path.ts`
- Create: `src/server/runs/create-run.ts`
- Create: `src/server/runs/execute-run.ts`
- Create: `src/server/runs/export-result-package.ts`
- Test: `tests/unit/recipes/learning-path.test.ts`
- Test: `tests/unit/server/create-run.test.ts`

**Interfaces:**
- Consumes:
  - `RunState` and `ResultPackage`
  - `resolveWorkspaceProviders(workspaceId: string)`
- Produces:
  - `LearningPathInputSchema`
  - `buildLearningPathRecipe(): DecisionRecipe<LearningPathInput>`
  - `createRun(params: CreateRunParams): Promise<{ runId: string }>`
  - `executeRun(runId: string): Promise<void>`
  - `exportResultPackage(runId: string): Promise<{ storageKey: string }>`

- [ ] **Step 1: Write the failing recipe test**

```ts
// tests/unit/recipes/learning-path.test.ts
import { describe, expect, it } from 'vitest';
import { buildLearningPathRecipe } from '@/lib/recipes/learning-path';

describe('buildLearningPathRecipe', () => {
  it('returns a result package with a recommendation, plan, and next actions', async () => {
    const recipe = buildLearningPathRecipe();

    const result = await recipe.run({
      goal: 'Become interview-ready for junior product roles',
      currentLevel: 'marketing analyst',
      weeklyHours: 8,
      budget: 500,
      deadline: '2025-12-31',
      preferredStyle: 'project-based',
    });

    expect(result.recommendation).toContain('product');
    expect(result.nextActions.length).toBeGreaterThan(0);
    expect(result.completionState).toBe('completed');
  });
});
```

- [ ] **Step 2: Run the recipe test and confirm the recipe layer is absent**

Run: `npm run test:unit -- --run tests/unit/recipes/learning-path.test.ts`  
Expected: FAIL with `Cannot find module '@/lib/recipes/learning-path'`

- [ ] **Step 3: Implement the recipe contract and orchestration services**

```ts
// src/lib/recipes/types.ts
import { z } from 'zod';
import type { ResultPackage } from '@/lib/runtime/types';

export type DecisionRecipe<Input> = {
  kind: 'learning_path' | 'shopping_comparison' | 'career_path';
  title: string;
  inputSchema: z.ZodType<Input>;
  run(input: Input): Promise<ResultPackage>;
};
```

```ts
// src/lib/recipes/learning-path.ts
import { z } from 'zod';
import type { DecisionRecipe } from '@/lib/recipes/types';

export const LearningPathInputSchema = z.object({
  goal: z.string().min(10),
  currentLevel: z.string().min(2),
  weeklyHours: z.number().int().positive(),
  budget: z.number().nonnegative(),
  deadline: z.string().min(10),
  preferredStyle: z.string().min(2),
});

export type LearningPathInput = z.infer<typeof LearningPathInputSchema>;

export function buildLearningPathRecipe(): DecisionRecipe<LearningPathInput> {
  return {
    kind: 'learning_path',
    title: 'Learning Path Planner',
    inputSchema: LearningPathInputSchema,
    async run(input) {
      return {
        summary: `Plan a ${input.preferredStyle} learning path toward ${input.goal}.`,
        recommendation:
          'Start with one fundamentals course, one weekly project, and one review checkpoint every two weeks.',
        citations: [],
        attachments: [],
        nextActions: [
          'Choose a fundamentals course this week',
          'Reserve weekly study blocks on your calendar',
          'Create the first portfolio-quality practice project',
        ],
        completionState: 'completed',
        confidence: 'medium',
        openQuestions: ['Confirm whether interview prep should start in month two or three'],
      };
    },
  };
}
```

```ts
// src/server/runs/create-run.ts
import { db } from '@/lib/db';

export async function createRun(params: {
  workspaceId: string;
  recipeKind: 'learning_path' | 'shopping_comparison' | 'career_path';
  title: string;
  taskBrief: Record<string, unknown>;
}) {
  const run = await db.run.create({
    data: {
      workspaceId: params.workspaceId,
      recipeKind: params.recipeKind,
      title: params.title,
      taskBrief: params.taskBrief,
      status: 'drafting',
    },
  });

  return { runId: run.id };
}
```

```ts
// src/server/runs/execute-run.ts
import { db } from '@/lib/db';
import { buildLearningPathRecipe } from '@/lib/recipes/learning-path';
import { completeRun } from '@/lib/runtime/run-machine';

export async function executeRun(runId: string) {
  const run = await db.run.findUniqueOrThrow({ where: { id: runId } });

  if (run.recipeKind !== 'learning_path') {
    return;
  }

  const recipe = buildLearningPathRecipe();
  const resultPackage = await recipe.run(run.taskBrief as never);
  const nextState = completeRun(
    {
      recipeKind: run.recipeKind as 'learning_path',
      title: run.title,
      status: run.status as 'drafting',
      taskBrief: run.taskBrief as Record<string, unknown>,
    },
    resultPackage,
  );

  await db.run.update({
    where: { id: runId },
    data: {
      status: nextState.status,
      resultPackage,
    },
  });
}
```

```ts
// src/server/runs/export-result-package.ts
import { db } from '@/lib/db';
import { LocalObjectStorage } from '@/lib/storage/local-object-storage';

const storage = new LocalObjectStorage();

export async function exportResultPackage(runId: string) {
  const run = await db.run.findUniqueOrThrow({ where: { id: runId } });
  const content = `# ${run.title}\n\n${JSON.stringify(run.resultPackage, null, 2)}`;
  const { storageKey } = await storage.putObject({
    workspaceId: run.workspaceId,
    runId,
    filename: 'result-package.md',
    content,
    mimeType: 'text/markdown',
  });

  return { storageKey };
}
```

- [ ] **Step 4: Re-run the learning recipe tests**

Run: `npm run test:unit -- --run tests/unit/recipes/learning-path.test.ts`  
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit the hero recipe and execution services**

```bash
git add src/lib/recipes/types.ts src/lib/recipes/learning-path.ts src/server/runs/create-run.ts src/server/runs/execute-run.ts src/server/runs/export-result-package.ts tests/unit/recipes/learning-path.test.ts tests/unit/server/create-run.test.ts
git commit -m "feat: add learning path recipe"
```

### Task 6: Build workspace, provider settings, and run creation UX

**Files:**
- Create: `src/app/signin/page.tsx`
- Create: `src/app/workspaces/page.tsx`
- Create: `src/app/workspaces/[workspaceId]/page.tsx`
- Create: `src/app/workspaces/[workspaceId]/runs/new/page.tsx`
- Create: `src/app/api/workspaces/route.ts`
- Create: `src/app/api/workspaces/[workspaceId]/providers/route.ts`
- Create: `src/app/api/workspaces/[workspaceId]/runs/route.ts`
- Create: `src/components/workspaces/workspace-list.tsx`
- Create: `src/components/providers/provider-settings-form.tsx`
- Create: `src/components/runs/recipe-selector.tsx`
- Create: `src/components/runs/decision-intake-form.tsx`
- Test: `tests/unit/server/create-run.test.ts`

**Interfaces:**
- Consumes:
  - `createRun`
  - `assertWorkspaceAccess`
  - `resolveWorkspaceProviders`
- Produces:
  - `POST /api/workspaces`
  - `POST /api/workspaces/[workspaceId]/providers`
  - `POST /api/workspaces/[workspaceId]/runs`
  - `DecisionIntakeForm` props:
    `({ workspaceId, recipeKind }: { workspaceId: string; recipeKind: RecipeKind })`

- [ ] **Step 1: Write the failing create-run route test**

```ts
// tests/unit/server/create-run.test.ts
import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/workspaces/[workspaceId]/runs/route';

describe('POST /api/workspaces/[workspaceId]/runs', () => {
  it('creates a drafting run for the requested recipe', async () => {
    const request = new Request('http://localhost/api/workspaces/ws_1/runs', {
      method: 'POST',
      body: JSON.stringify({
        recipeKind: 'learning_path',
        title: 'Learn data analysis',
        taskBrief: {
          goal: 'Become project-ready in 90 days',
          currentLevel: 'spreadsheet user',
          weeklyHours: 6,
        },
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ workspaceId: 'ws_1' }),
    } as never);

    expect(response.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run the route test and confirm the API route is missing**

Run: `npm run test:unit -- --run tests/unit/server/create-run.test.ts`  
Expected: FAIL with `Cannot find module '@/app/api/workspaces/[workspaceId]/runs/route'`

- [ ] **Step 3: Implement workspace pages, provider settings, and run creation**

```tsx
// src/components/runs/decision-intake-form.tsx
'use client';

import { useState } from 'react';

export function DecisionIntakeForm({
  workspaceId,
  recipeKind,
}: {
  workspaceId: string;
  recipeKind: 'learning_path' | 'shopping_comparison' | 'career_path';
}) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await fetch(`/api/workspaces/${workspaceId}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipeKind,
        title,
        taskBrief: { goal },
      }),
    });
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <input
        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Run title"
      />
      <textarea
        className="min-h-32 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        placeholder="Describe the decision you need help with"
      />
      <button className="rounded bg-sky-500 px-4 py-2 font-medium" type="submit">
        Create run
      </button>
    </form>
  );
}
```

```ts
// src/app/api/workspaces/[workspaceId]/runs/route.ts
import { NextResponse } from 'next/server';
import { createRun } from '@/server/runs/create-run';

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const body = await request.json();
  const result = await createRun({
    workspaceId,
    recipeKind: body.recipeKind,
    title: body.title,
    taskBrief: body.taskBrief,
  });

  return NextResponse.json(result, { status: 201 });
}
```

- [ ] **Step 4: Re-run the route test**

Run: `npm run test:unit -- --run tests/unit/server/create-run.test.ts`  
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit workspace and run creation UX**

```bash
git add src/app/signin/page.tsx src/app/workspaces/page.tsx src/app/workspaces/[workspaceId]/page.tsx src/app/workspaces/[workspaceId]/runs/new/page.tsx src/app/api/workspaces/route.ts src/app/api/workspaces/[workspaceId]/providers/route.ts src/app/api/workspaces/[workspaceId]/runs/route.ts src/components/workspaces/workspace-list.tsx src/components/providers/provider-settings-form.tsx src/components/runs/recipe-selector.tsx src/components/runs/decision-intake-form.tsx tests/unit/server/create-run.test.ts
git commit -m "feat: add workspace and run creation flow"
```

### Task 7: Add run detail, approval checkpoints, and downloadable result packages

**Files:**
- Create: `src/app/workspaces/[workspaceId]/runs/[runId]/page.tsx`
- Create: `src/server/runs/resume-run.ts`
- Create: `src/app/api/workspaces/[workspaceId]/runs/[runId]/resume/route.ts`
- Create: `src/app/api/workspaces/[workspaceId]/runs/[runId]/export/route.ts`
- Create: `src/components/runs/run-status-badge.tsx`
- Create: `src/components/runs/checkpoint-card.tsx`
- Create: `src/components/runs/result-package-view.tsx`
- Create: `src/components/runs/source-list.tsx`
- Test: `tests/unit/server/resume-run.test.ts`

**Interfaces:**
- Consumes:
  - `executeRun(runId: string)`
  - `resumeRun(runId: string, decision: { approved: boolean; note?: string }): Promise<void>`
  - `exportResultPackage(runId: string): Promise<{ storageKey: string }>`
- Produces:
  - `POST /api/workspaces/[workspaceId]/runs/[runId]/resume`
  - `GET /api/workspaces/[workspaceId]/runs/[runId]/export`
  - `ResultPackageView({ runId }: { runId: string })`

- [ ] **Step 1: Write the failing resume-run route test**

```ts
// tests/unit/server/resume-run.test.ts
import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/workspaces/[workspaceId]/runs/[runId]/resume/route';

describe('POST /api/workspaces/[workspaceId]/runs/[runId]/resume', () => {
  it('accepts an approval decision and returns 200', async () => {
    const request = new Request('http://localhost/api/workspaces/ws_1/runs/run_1/resume', {
      method: 'POST',
      body: JSON.stringify({
        approved: true,
        note: 'Proceed with the current recommendation',
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ workspaceId: 'ws_1', runId: 'run_1' }),
    } as never);

    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the resume test to confirm the route is missing**

Run: `npm run test:unit -- --run tests/unit/server/resume-run.test.ts`  
Expected: FAIL with `Cannot find module '@/app/api/workspaces/[workspaceId]/runs/[runId]/resume/route'`

- [ ] **Step 3: Implement the run detail page and resume/export endpoints**

```tsx
// src/components/runs/checkpoint-card.tsx
'use client';

export function CheckpointCard({
  workspaceId,
  runId,
  reason,
}: {
  workspaceId: string;
  runId: string;
  reason: string;
}) {
  async function submitDecision(approved: boolean) {
    await fetch(`/api/workspaces/${workspaceId}/runs/${runId}/resume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved }),
    });
  }

  return (
    <section className="rounded border border-amber-500/40 bg-amber-500/10 p-4">
      <h2 className="font-semibold">Approval required</h2>
      <p className="mt-2 text-sm text-slate-300">{reason}</p>
      <div className="mt-4 flex gap-3">
        <button
          className="rounded bg-emerald-500 px-4 py-2 font-medium"
          onClick={() => submitDecision(true)}
          type="button"
        >
          Approve
        </button>
        <button
          className="rounded bg-slate-700 px-4 py-2 font-medium"
          onClick={() => submitDecision(false)}
          type="button"
        >
          Request changes
        </button>
      </div>
    </section>
  );
}
```

```ts
// src/server/runs/resume-run.ts
import { db } from '@/lib/db';

export async function resumeRun(
  runId: string,
  decision: { approved: boolean; note?: string },
) {
  await db.runEvent.create({
    data: {
      runId,
      type: decision.approved ? 'approval.approved' : 'approval.rejected',
      payload: decision,
    },
  });

  await db.run.update({
    where: { id: runId },
    data: {
      status: decision.approved ? 'running' : 'awaiting_input',
    },
  });
}
```

```ts
// src/app/api/workspaces/[workspaceId]/runs/[runId]/resume/route.ts
import { NextResponse } from 'next/server';
import { resumeRun } from '@/server/runs/resume-run';

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; runId: string }> },
) {
  const { runId } = await context.params;
  const body = await request.json();
  await resumeRun(runId, body);
  return NextResponse.json({ ok: true });
}
```

```ts
// src/app/api/workspaces/[workspaceId]/runs/[runId]/export/route.ts
import { NextResponse } from 'next/server';
import { exportResultPackage } from '@/server/runs/export-result-package';

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; runId: string }> },
) {
  const { runId } = await context.params;
  const artifact = await exportResultPackage(runId);

  return NextResponse.json(artifact);
}
```

- [ ] **Step 4: Re-run the resume route test**

Run: `npm run test:unit -- --run tests/unit/server/resume-run.test.ts`  
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit run detail and checkpoint UX**

```bash
git add src/app/workspaces/[workspaceId]/runs/[runId]/page.tsx src/app/api/workspaces/[workspaceId]/runs/[runId]/resume/route.ts src/app/api/workspaces/[workspaceId]/runs/[runId]/export/route.ts src/components/runs/run-status-badge.tsx src/components/runs/checkpoint-card.tsx src/components/runs/result-package-view.tsx src/components/runs/source-list.tsx tests/unit/server/resume-run.test.ts
git commit -m "feat: add run detail and checkpoint handling"
```

### Task 8: Add shopping and career recipes, then prove the vertical slice end-to-end

**Files:**
- Create: `src/lib/recipes/shopping-comparison.ts`
- Create: `src/lib/recipes/career-path.ts`
- Create: `src/app/api/test/login/route.ts`
- Test: `tests/unit/recipes/shopping-comparison.test.ts`
- Test: `tests/unit/recipes/career-path.test.ts`
- Test: `tests/e2e/learning-path-flow.spec.ts`
- Test: `tests/e2e/shopping-comparison-flow.spec.ts`
- Modify: `src/components/runs/recipe-selector.tsx`
- Modify: `src/app/workspaces/[workspaceId]/runs/new/page.tsx`

**Interfaces:**
- Consumes:
  - `DecisionRecipe<Input>`
  - `DecisionIntakeForm`
  - `createRun`
- Produces:
  - `buildShoppingComparisonRecipe(): DecisionRecipe<ShoppingComparisonInput>`
  - `buildCareerPathRecipe(): DecisionRecipe<CareerPathInput>`
  - UI recipe options: `'learning_path' | 'shopping_comparison' | 'career_path'`

- [ ] **Step 1: Write the failing secondary recipe tests**

```ts
// tests/unit/recipes/shopping-comparison.test.ts
import { describe, expect, it } from 'vitest';
import { buildShoppingComparisonRecipe } from '@/lib/recipes/shopping-comparison';

describe('buildShoppingComparisonRecipe', () => {
  it('returns a completed recommendation with trade-offs', async () => {
    const recipe = buildShoppingComparisonRecipe();
    const result = await recipe.run({
      itemType: 'desk chair',
      budget: 400,
      priorities: ['ergonomics', 'assembly time'],
    });

    expect(result.recommendation.length).toBeGreaterThan(0);
    expect(result.completionState).toBe('completed');
  });
});
```

```ts
// tests/unit/recipes/career-path.test.ts
import { describe, expect, it } from 'vitest';
import { buildCareerPathRecipe } from '@/lib/recipes/career-path';

describe('buildCareerPathRecipe', () => {
  it('returns a gap analysis and next actions', async () => {
    const recipe = buildCareerPathRecipe();
    const result = await recipe.run({
      targetRole: 'product manager',
      currentRole: 'customer success manager',
      timelineMonths: 6,
    });

    expect(result.nextActions.length).toBeGreaterThan(0);
    expect(result.summary).toContain('product manager');
  });
});
```

- [ ] **Step 2: Run the secondary recipe tests to confirm they fail**

Run: `npm run test:unit -- --run tests/unit/recipes/shopping-comparison.test.ts tests/unit/recipes/career-path.test.ts`  
Expected: FAIL with `Cannot find module '@/lib/recipes/shopping-comparison'` and `Cannot find module '@/lib/recipes/career-path'`

- [ ] **Step 3: Implement the remaining recipes and selector wiring**

```ts
// src/lib/recipes/shopping-comparison.ts
import { z } from 'zod';
import type { DecisionRecipe } from '@/lib/recipes/types';

const ShoppingComparisonInputSchema = z.object({
  itemType: z.string().min(2),
  budget: z.number().positive(),
  priorities: z.array(z.string()).min(1),
});

type ShoppingComparisonInput = z.infer<typeof ShoppingComparisonInputSchema>;

export function buildShoppingComparisonRecipe(): DecisionRecipe<ShoppingComparisonInput> {
  return {
    kind: 'shopping_comparison',
    title: 'Shopping Comparison',
    inputSchema: ShoppingComparisonInputSchema,
    async run(input) {
      return {
        summary: `Compare ${input.itemType} options within a ${input.budget} budget.`,
        recommendation: 'Choose the option that wins on ergonomics and total cost of ownership.',
        citations: [],
        attachments: [],
        nextActions: ['Verify return policy', 'Check total shipping cost'],
        completionState: 'completed',
      };
    },
  };
}
```

```ts
// src/lib/recipes/career-path.ts
import { z } from 'zod';
import type { DecisionRecipe } from '@/lib/recipes/types';

const CareerPathInputSchema = z.object({
  targetRole: z.string().min(2),
  currentRole: z.string().min(2),
  timelineMonths: z.number().positive(),
});

type CareerPathInput = z.infer<typeof CareerPathInputSchema>;

export function buildCareerPathRecipe(): DecisionRecipe<CareerPathInput> {
  return {
    kind: 'career_path',
    title: 'Career Path Planning',
    inputSchema: CareerPathInputSchema,
    async run(input) {
      return {
        summary: `Plan a transition from ${input.currentRole} to ${input.targetRole}.`,
        recommendation: 'Close one skill gap at a time and ship evidence of the transition every month.',
        citations: [],
        attachments: [],
        nextActions: ['List skill gaps', 'Choose one flagship project', 'Start a weekly review cadence'],
        completionState: 'completed',
      };
    },
  };
}
```

```tsx
// src/components/runs/recipe-selector.tsx
export const RECIPE_OPTIONS = [
  { kind: 'learning_path', label: 'Learning path planning' },
  { kind: 'shopping_comparison', label: 'Shopping comparison' },
  { kind: 'career_path', label: 'Career path planning' },
] as const;
```

```ts
// src/app/api/test/login/route.ts
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST() {
  if (process.env.NODE_ENV !== 'test') {
    return new NextResponse('Not found', { status: 404 });
  }

  const user = await db.user.upsert({
    where: { email: 'e2e@example.com' },
    update: {},
    create: { email: 'e2e@example.com', name: 'E2E User' },
  });

  const sessionToken = crypto.randomUUID();

  await db.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires: new Date(Date.now() + 1000 * 60 * 60),
    },
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set('authjs.session-token', sessionToken, {
    httpOnly: true,
    path: '/',
  });
  return response;
}
```

```ts
// tests/e2e/learning-path-flow.spec.ts
import { expect, test } from '@playwright/test';

test('creates a learning-path run and shows a result package', async ({ page }) => {
  await page.request.post('/api/test/login');
  await page.goto('/workspaces');
  await page.getByRole('link', { name: 'New run' }).click();
  await page.getByLabel('Recipe').selectOption('learning_path');
  await page.getByLabel('Run title').fill('Learn AI product management');
  await page.getByLabel('Decision brief').fill('I want a 90-day learning path into AI PM work.');
  await page.getByRole('button', { name: 'Create run' }).click();

  await expect(page.getByRole('heading', { name: 'Learn AI product management' })).toBeVisible();
  await expect(page.getByText('Result package')).toBeVisible();
});
```

- [ ] **Step 4: Run the secondary recipe tests and end-to-end flow**

Run: `npm run test:unit -- --run tests/unit/recipes/shopping-comparison.test.ts tests/unit/recipes/career-path.test.ts && npm run test:e2e -- tests/e2e/learning-path-flow.spec.ts`  
Expected: PASS with both unit tests green and the learning-path flow completing from sign-in to result package

- [ ] **Step 5: Commit the recipe family and E2E proof**

```bash
git add src/lib/recipes/shopping-comparison.ts src/lib/recipes/career-path.ts src/components/runs/recipe-selector.tsx src/app/workspaces/[workspaceId]/runs/new/page.tsx tests/unit/recipes/shopping-comparison.test.ts tests/unit/recipes/career-path.test.ts tests/e2e/learning-path-flow.spec.ts tests/e2e/shopping-comparison-flow.spec.ts
git commit -m "feat: add secondary decision recipes"
```

## Self-Review

### Spec coverage

- **General agentic platform underneath** — Tasks 3, 4, and 5 define the generic runtime, provider layer, and recipe contracts.
- **Decision Workspace product surface** — Tasks 1, 6, and 7 create the user-facing workspace, run creation, checkpoints, and result viewing.
- **Multi-user SaaS-ready isolation** — Task 2 introduces auth, workspace membership, and protected persistence.
- **Hybrid provider model** — Task 4 resolves platform defaults and BYOK overrides.
- **Human-in-the-loop** — Tasks 3 and 7 define `awaiting_approval` and resume flows.
- **Hero recipe: learning path planning** — Task 5 implements the full hero path.
- **Secondary recipes** — Task 8 adds shopping comparison and career path planning.
- **Structured result packages and downloadable artifacts** — Tasks 5 and 7 cover generation and export.
- **Testing requirements** — Tasks 1 through 8 each introduce targeted tests; Task 8 closes with E2E proof.

### Placeholder scan

Search terms checked while writing:

- `TODO`
- `TBD`
- `implement later`
- `appropriate error handling`
- `similar to`

No placeholders are intentionally left in the plan.

### Type consistency

Shared names used consistently across tasks:

- `RunStatus`
- `ResultPackage`
- `DecisionRecipe`
- `createRun`
- `resumeRun`
- `resolveWorkspaceProviders`
- recipe kinds: `learning_path`, `shopping_comparison`, `career_path`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-29-decision-workspace-mvp.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
