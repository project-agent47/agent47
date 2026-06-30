'use client';

import { type FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
}

export function WorkspaceList() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaces = async () => {
    const response = await fetch('/api/workspaces');
    const payload = (await response.json().catch(() => ({}))) as { workspaces?: WorkspaceSummary[] };
    setWorkspaces(payload.workspaces ?? []);
  };

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const response = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      setError('Unable to create workspace.');
      return;
    }

    setName('');
    await loadWorkspaces();
  };

  return (
    <div className="space-y-6">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="eyebrow">Create</div>
            <h2 className="mt-2 text-xl font-semibold text-white">Start a new workspace</h2>
            <p className="mt-2 text-sm leading-7 text-slate-400">Give your decision context a home and begin a structured run.</p>
          </div>
          <form className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-xl" onSubmit={onSubmit}>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New workspace name"
              className="input-field flex-1 rounded-full"
            />
            <button type="submit" className="btn-primary">
              Create workspace
            </button>
          </form>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {workspaces.map((workspace) => (
          <Link
            key={workspace.id}
            href={`/workspaces/${workspace.id}`}
            className="group surface-card transition hover:-translate-y-1 hover:border-sky-400/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="eyebrow">Workspace</div>
                <h2 className="mt-3 text-xl font-semibold text-white">{workspace.name}</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                Open
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-400">/{workspace.slug}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
