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

    render(
      <AppShell>
        <div>entry content</div>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: /AGENT47/i })).toBeInTheDocument();
    expect(screen.getByText('entry content')).toBeInTheDocument();
  });

  it('does not render entry chrome on workspace routes', () => {
    pathnameState.value = '/workspaces/workspace-demo';

    render(
      <AppShell>
        <div>workspace content</div>
      </AppShell>,
    );

    expect(screen.queryByRole('link', { name: /AGENT47/i })).not.toBeInTheDocument();
    expect(screen.getByText('workspace content')).toBeInTheDocument();
  });
});
