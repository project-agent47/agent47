import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkbenchShell } from '@/components/workspaces/workbench-shell';
import type { WorkspaceRecord } from '@/lib/workspace-store';

const workspace: WorkspaceRecord = {
  id: 'workspace-1',
  name: 'Design review',
  slug: 'design-review',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('WorkbenchShell', () => {
  it('renders a full-screen workbench with side rail, activity pane, inspector, and composer', () => {
    render(<WorkbenchShell workspace={workspace} initialRuns={[]} workspaces={[workspace]} />);

    expect(screen.getByTestId('workbench-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-activity')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-inspector')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe the decision/i)).toBeInTheDocument();
  });
});
