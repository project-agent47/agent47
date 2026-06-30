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
