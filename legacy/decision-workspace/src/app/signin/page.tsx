'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@decision.work');
  const [password, setPassword] = useState('demo-password');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const response = await fetch('/api/session/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? 'Unable to sign in.');
      return;
    }

    const workspacesResponse = await fetch('/api/workspaces');
    const payload = (await workspacesResponse.json().catch(() => ({}))) as { workspaces?: Array<{ id: string }> };
    const workspaceId = payload.workspaces?.[0]?.id;

    router.replace(workspaceId ? `/workspaces/${workspaceId}` : '/workspaces');
  };

  return (
    <main className="entry-page" data-entry-surface="signin">
      <section className="entry-panel entry-panel--narrow">
        <p className="entry-kicker">Secure access</p>
        <h1 className="entry-title">Open your workspace.</h1>
        <p className="entry-copy">Sign in and continue directly in the workbench.</p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block" htmlFor="email">
            <span className="entry-label">Email</span>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="entry-input"
              required
            />
          </label>

          <label className="block" htmlFor="password">
            <span className="entry-label">Password</span>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="entry-input"
              required
            />
          </label>

          {error ? (
            <p role="alert" className="entry-error">
              {error}
            </p>
          ) : null}

          <button type="submit" className="entry-primary w-full">
            Sign in
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-500">Demo account: demo@decision.work / demo-password</p>
      </section>
    </main>
  );
}
