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
    <div className="min-h-screen text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="sticky top-4 z-20 rounded-[1.125rem] border border-stone-200 bg-white/80 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 bg-stone-100 text-sm font-semibold text-slate-700">
                A
              </div>
              <div>
                <div className="text-sm font-semibold tracking-[0.24em] text-slate-700">AGENT47</div>
                <div className="text-xs text-slate-500">Workspace</div>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {isWorkspaceRoute ? (
                <Link href="/signin" className="btn-secondary px-3 py-2 text-xs">
                  Sign out
                </Link>
              ) : (
                <Link href="/signin" className="btn-secondary px-3 py-2 text-xs">
                  Open workspace
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 py-5 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
