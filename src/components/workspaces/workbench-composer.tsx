'use client';

import type { FormEvent } from 'react';

interface WorkbenchComposerProps {
  draft: string;
  isSubmitting: boolean;
  starterPrompts: string[];
  message: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUsePrompt: (prompt: string) => void;
}

export function WorkbenchComposer({
  draft,
  isSubmitting,
  starterPrompts,
  message,
  onDraftChange,
  onSubmit,
  onUsePrompt,
}: WorkbenchComposerProps) {
  return (
    <form
      data-testid="workbench-composer"
      className="border-t border-white/10 bg-slate-950/80 px-5 py-4 backdrop-blur sm:px-6"
      onSubmit={onSubmit}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {starterPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-white"
            onClick={() => onUsePrompt(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <label className="sr-only" htmlFor="workbench-prompt">
        Describe the task
      </label>
      <textarea
        id="workbench-prompt"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Describe the decision, deliverable, or question you need help with."
        className="min-h-24 w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">{message}</p>
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating…' : 'Run'}
        </button>
      </div>
    </form>
  );
}
