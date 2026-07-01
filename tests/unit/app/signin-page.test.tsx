import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/app-shell';
import SignInPage from '@/app/signin/page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/signin',
  useRouter: () => ({ replace: vi.fn() }),
}));

describe('SignInPage', () => {
  it('renders a compact light-default sign-in surface for opening the workspace', () => {
    render(
      <AppShell>
        <SignInPage />
      </AppShell>,
    );

    expect(screen.getByRole('heading', { name: 'Open your workspace.' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Sign in and continue directly in the workbench.')).toBeInTheDocument();
    expect(screen.getByText('Demo account: demo@decision.work / demo-password')).toBeInTheDocument();
  });
});
