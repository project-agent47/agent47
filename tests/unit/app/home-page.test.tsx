import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from '@/app/page';

describe('HomePage', () => {
  it('renders a minimal product statement and workspace entry action', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', { name: 'A workbench for decisions that deserve more than chat.' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /How it works/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a workspace' })).toHaveAttribute('href', '/signin');
  });
});
