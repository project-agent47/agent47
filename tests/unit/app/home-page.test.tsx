import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/app-shell';
import HomePage from '@/app/page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('HomePage', () => {
  it('renders the workbench entry surface with light-default copy and theme toggle', () => {
    render(
      <AppShell>
        <HomePage />
      </AppShell>,
    );

    expect(
      screen.getByRole('heading', { name: 'A workbench for decisions that deserve more than chat.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a workspace' })).toHaveAttribute('href', '/signin');
    expect(screen.getByRole('button', { name: 'Use dark theme' })).toBeInTheDocument();
  });
});
