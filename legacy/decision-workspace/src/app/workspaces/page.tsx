import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listWorkspaces } from '@/lib/workspace-store';

export default function WorkspacesPage() {
  const workspaces = listWorkspaces();

  if (workspaces.length > 0) {
    redirect(`/workspaces/${workspaces[0].id}`);
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-2 py-6 sm:px-6 lg:px-8">
      <section className="panel p-6 sm:p-8">
        <div className="eyebrow">Workspaces</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">No workspace yet</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">Create your first workspace from the sign-in flow.</p>
      </section>
    </main>
  );
}
