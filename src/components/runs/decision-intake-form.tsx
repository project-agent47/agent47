'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { RecipeSelector } from './recipe-selector';

interface DecisionIntakeFormProps {
  workspaceId: string;
}

export function DecisionIntakeForm({ workspaceId }: DecisionIntakeFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [recipe, setRecipe] = useState('learning-path');
  const [experience, setExperience] = useState('beginner');
  const [constraints, setConstraints] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const response = await fetch(`/api/workspaces/${workspaceId}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, goal, recipe, experience, constraints }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? 'Unable to create a run.');
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as { run?: { id: string } };
    router.push(`/workspaces/${workspaceId}/runs/${payload.run?.id ?? 'new'}`);
  };

  return (
    <form className="panel space-y-6 p-6 sm:p-8" onSubmit={handleSubmit}>
      <div className="surface-card">
        <div className="grid gap-6 md:grid-cols-2">
          <label className="block text-sm text-slate-300">
            <span className="mb-2 block">Run title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="input-field"
              placeholder="Example: Plan a frontend learning path"
              required
            />
          </label>

          <label className="block text-sm text-slate-300">
            <span className="mb-2 block">Goal</span>
            <input
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              className="input-field"
              placeholder="What do you want to decide?"
              required
            />
          </label>
        </div>
      </div>

      <RecipeSelector value={recipe} onChange={setRecipe} />

      <div className="grid gap-6 md:grid-cols-2">
        <label className="block text-sm text-slate-300">
          <span className="mb-2 block">Experience</span>
          <select
            value={experience}
            onChange={(event) => setExperience(event.target.value)}
            className="input-field"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>

        <label className="block text-sm text-slate-300">
          <span className="mb-2 block">Constraints</span>
          <input
            value={constraints}
            onChange={(event) => setConstraints(event.target.value)}
            className="input-field"
            placeholder="Budget, timeline, part-time, etc."
          />
        </label>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <button type="submit" className="btn-primary">
        Create run
      </button>
    </form>
  );
}
