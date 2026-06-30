export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

export interface WorkspaceMembership {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

export interface WorkspaceAccessContext {
  userId: string | null;
  memberships: WorkspaceMembership[];
}

export function workspaceRoleForUser(
  context: WorkspaceAccessContext,
  workspaceId: string,
): WorkspaceRole | null {
  if (!context.userId) {
    return null;
  }

  return (
    context.memberships.find(
      (membership) =>
        membership.userId === context.userId && membership.workspaceId === workspaceId,
    )?.role ?? null
  );
}

export function canAccessWorkspace(
  context: WorkspaceAccessContext,
  workspaceId: string,
): boolean {
  return workspaceRoleForUser(context, workspaceId) !== null;
}
