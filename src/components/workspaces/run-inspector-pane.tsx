'use client';

import Link from 'next/link';
import type { WorkspaceRunRecord } from '@/lib/workspace-store';

export interface DetailItem {
  id: string;
  title: string;
  body: string;
}

interface RunInspectorPaneProps {
  workspaceId: string;
  selectedRun: WorkspaceRunRecord | null;
  activeDetail: DetailItem | null;
  detailItems: DetailItem[];
  onSelectDetail: (item: DetailItem) => void;
}

export function RunInspectorPane({
  workspaceId,
  selectedRun,
  activeDetail,
  detailItems,
  onSelectDetail,
}: RunInspectorPaneProps) {
  return (
    <aside
      data-testid="workbench-inspector"
      className="flex min-h-screen flex-col border-l border-white/10 bg-black/20 px-4 py-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.3em] text-slate-500">Inspector</p>
          <h2 className="mt-3 text-base font-semibold text-white">Summary and details</h2>
        </div>
        {selectedRun ? (
          <Link href={`/workspaces/${workspaceId}/runs/${selectedRun.id}`} className="text-sm text-slate-400 transition hover:text-white">
            Open full
          </Link>
        ) : null}
      </div>

      {selectedRun ? (
        <>
          <section className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Summary</p>
            <h3 className="mt-3 text-base font-semibold text-slate-100">{selectedRun.title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-400">{selectedRun.resultPackage.summary}</p>
          </section>

          <div className="mt-4 flex flex-wrap gap-2">
            {detailItems.slice(0, 4).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectDetail(item)}
                className={`rounded-full border px-3 py-2 text-sm transition ${
                  activeDetail?.id === item.id
                    ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:bg-white/10 hover:text-slate-100'
                }`}
              >
                {item.title}
              </button>
            ))}
          </div>

          <section className="mt-4 flex-1 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            {activeDetail ? (
              <>
                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.24em] text-slate-500">{activeDetail.title}</p>
                <p className="mt-3 text-sm leading-7 text-slate-400">{activeDetail.body}</p>
              </>
            ) : (
              <p className="text-sm leading-7 text-slate-500">Select a detail to inspect it here.</p>
            )}
          </section>
        </>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-500">
          Summary, artifacts, and citations will appear here.
        </div>
      )}
    </aside>
  );
}
