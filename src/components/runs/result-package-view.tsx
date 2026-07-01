import type { ResultPackage } from '@/lib/runtime/types';

interface ResultPackageViewProps {
  packageData: ResultPackage;
}

export function ResultPackageView({ packageData }: ResultPackageViewProps) {
  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Result package</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Structured result package</h2>
        </div>
        <div className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-sm text-sky-300">
          {packageData.confidence.toFixed(2)} confidence
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <div className="surface-card">
          <h3 className="text-sm font-medium uppercase tracking-[0.2em] text-sky-300">Summary</h3>
          <p className="mt-2 text-sm leading-7 text-slate-300">{packageData.summary}</p>
        </div>
        <div className="surface-card">
          <h3 className="text-sm font-medium uppercase tracking-[0.2em] text-sky-300">Recommendation</h3>
          <p className="mt-2 text-sm leading-7 text-slate-300">{packageData.recommendation}</p>
        </div>
        <div className="surface-card">
          <h3 className="text-sm font-medium uppercase tracking-[0.2em] text-sky-300">Next actions</h3>
          <ul className="mt-3 space-y-3 text-sm leading-7 text-slate-300">
            {packageData.nextActions.map((action) => (
              <li key={action} className="flex gap-2">
                <span className="mt-2 h-2 w-2 rounded-full bg-sky-400" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
        {packageData.citations.length > 0 ? (
          <div className="surface-card">
            <h3 className="text-sm font-medium uppercase tracking-[0.2em] text-sky-300">Sources</h3>
            <ul className="mt-3 space-y-3 text-sm leading-7 text-slate-300">
              {packageData.citations.map((citation, index) => (
                <li key={`${citation.title}-${index}`}>
                  <span className="font-medium text-slate-100">{citation.title}</span>
                  <span className="text-slate-500"> · {citation.source}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {packageData.openQuestions.length > 0 ? (
          <div className="surface-card">
            <h3 className="text-sm font-medium uppercase tracking-[0.2em] text-sky-300">Open questions</h3>
            <ul className="mt-3 space-y-3 text-sm leading-7 text-slate-300">
              {packageData.openQuestions.map((question) => (
                <li key={question} className="flex gap-2">
                  <span className="mt-2 h-2 w-2 rounded-full bg-sky-400" />
                  <span>{question}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
