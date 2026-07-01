'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isWorkspaceRoute = pathname?.startsWith('/workspaces') ?? false;
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (isWorkspaceRoute) {
      return;
    }

    document.body.dataset.theme = theme;
  }, [isWorkspaceRoute, theme]);

  if (isWorkspaceRoute) {
    return <>{children}</>;
  }

  return (
    <div className="entry-shell">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="entry-shell__header">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="entry-shell__mark">
                A
              </div>
              <div>
                <div className="entry-shell__wordmark">AGENT47</div>
                <div className="entry-shell__subhead">AI workbench</div>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="entry-shell__toggle"
                onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
              >
                {theme === 'light' ? 'Use dark theme' : 'Use light theme'}
              </button>
              <Link href="/signin" className="entry-shell__action">
                Open workspace
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 py-10 sm:py-12">{children}</main>
      </div>
    </div>
  );
}
