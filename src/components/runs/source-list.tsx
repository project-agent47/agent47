interface SourceListProps {
  sources: string[];
}

export function SourceList({ sources }: SourceListProps) {
  return (
    <section className="panel p-6">
      <div className="eyebrow">Sources</div>
      <h2 className="mt-2 text-xl font-semibold text-white">Context sources</h2>
      <ul className="mt-5 space-y-3">
        {sources.map((source) => (
          <li key={source} className="surface-card px-4 py-3 text-sm leading-7 text-slate-300">
            {source}
          </li>
        ))}
      </ul>
    </section>
  );
}
