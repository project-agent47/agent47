interface RunStatusBadgeProps {
  status: string;
}

export function RunStatusBadge({ status }: RunStatusBadgeProps) {
  const label = status.replace(/_/g, ' ');
  const tone =
    status === 'completed'
      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
      : status === 'running'
        ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100'
        : 'border-white/10 bg-white/5 text-slate-300';

  return (
    <span className={`rounded-full border px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${tone}`}>
      {label}
    </span>
  );
}
