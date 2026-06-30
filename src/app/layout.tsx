import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-50">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
