interface CheckpointCardProps {
  checkpoints: string[];
}

export function CheckpointCard({ checkpoints }: CheckpointCardProps) {
  return (
    <section className="panel p-6 sm:p-8">
      <div className="eyebrow">Activity</div>
      <h2 className="mt-2 text-xl font-semibold text-white">Execution activity</h2>
      <ul className="mt-5 space-y-3">
        {checkpoints.map((checkpoint, index) => (
          <li key={`${checkpoint}-${index}`} className="surface-card px-4 py-3 text-sm leading-7 text-slate-300">
            {checkpoint}
          </li>
        ))}
      </ul>
    </section>
  );
}
