import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="entry-page">
      <section className="entry-panel">
        <p className="entry-kicker">Decision workspace</p>
        <h1 className="entry-title">A workbench for decisions that deserve more than chat.</h1>
        <p className="entry-copy">
          Open one focused workspace, run the task, and keep the process, evidence, and answer in one surface.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="entry-primary" href="/signin">
            Start a workspace
          </Link>
          <Link className="entry-secondary" href="/workspaces">
            Continue a workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
