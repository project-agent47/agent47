import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DecisionIntakeForm } from '@/components/runs/decision-intake-form';
import { getWorkspace } from '@/lib/workspace-store';

export default async function NewRunPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const workspace = getWorkspace(workspaceId);

  if (!workspace) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-2 py-6 sm:px-6 lg:px-8">
      <section className="panel-strong p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="eyebrow">New run</div>
            <h1 className="mt-3 display-font text-3xl text-white sm:text-4xl">Start a decision run</h1>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Describe the decision, choose a recipe, and let the workspace turn it into a structured result package.
            </p>
          </div>
          <Link href={`/workspaces/${workspace.id}`} className="btn-secondary">
            Back to workspace
          </Link>
        </div>
      </section>

      <DecisionIntakeForm workspaceId={workspace.id} />
    </main>
  );
}
