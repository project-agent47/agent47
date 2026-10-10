import { describe, expect, it } from 'vitest';
import { canAccessWorkspace, workspaceRoleForUser } from '@/lib/auth';

describe('workspace access', () => {
  it('allows owners, editors, and viewers to access a workspace', () => {
    const memberships = [
      { workspaceId: 'ws-1', userId: 'user-1', role: 'owner' as const },
      { workspaceId: 'ws-1', userId: 'user-2', role: 'editor' as const },
      { workspaceId: 'ws-1', userId: 'user-3', role: 'viewer' as const },
    ];

    expect(canAccessWorkspace({ userId: 'user-1', memberships }, 'ws-1')).toBe(true);
    expect(canAccessWorkspace({ userId: 'user-2', memberships }, 'ws-1')).toBe(true);
    expect(canAccessWorkspace({ userId: 'user-3', memberships }, 'ws-1')).toBe(true);
  });

  it('denies access when the user is not a member', () => {
    const memberships = [{ workspaceId: 'ws-1', userId: 'user-1', role: 'owner' as const }];

    expect(canAccessWorkspace({ userId: 'user-2', memberships }, 'ws-1')).toBe(false);
    expect(workspaceRoleForUser({ userId: 'user-2', memberships }, 'ws-1')).toBeNull();
  });
});
