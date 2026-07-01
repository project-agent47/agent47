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
      data-fixed-composer="true"
      className="sticky bottom-0 border-t px-5 py-4 backdrop-blur sm:px-6"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'color-mix(in srgb, var(--surface-bg) 94%, transparent)',
      }}
      onSubmit={onSubmit}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {starterPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="rounded-full border px-3 py-1.5 text-xs transition"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'var(--surface-bg)',
              color: 'var(--text-secondary)',
            }}
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
        className="min-h-24 w-full resize-none rounded-2xl border px-4 py-3 text-sm leading-7 outline-none focus:ring-2"
        style={{
          borderColor: 'var(--border-subtle)',
          background: 'var(--surface-bg)',
          color: 'var(--text-primary)',
        }}
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {message}
        </p>
        <button
          type="submit"
          className="inline-flex items-center rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70"
          style={{
            background: 'var(--accent-bg)',
            color: 'var(--accent-fg)',
          }}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating…' : 'Run'}
        </button>
      </div>
    </form>
  );
}
