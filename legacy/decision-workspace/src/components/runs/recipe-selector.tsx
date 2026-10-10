'use client';

interface RecipeSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const recipes = [
  { value: 'learning-path', label: 'Learning path planning' },
  { value: 'shopping-comparison', label: 'Shopping comparison' },
  { value: 'career-path', label: 'Career path planning' },
];

export function RecipeSelector({ value, onChange }: RecipeSelectorProps) {
  return (
    <div className="surface-card space-y-3">
      <label className="block text-sm font-medium text-slate-200">Recipe</label>
      <div className="grid gap-3 md:grid-cols-3">
        {recipes.map((recipe) => (
          <label
            key={recipe.value}
            className={`cursor-pointer rounded-[1.25rem] border px-4 py-3 text-sm transition ${
              value === recipe.value ? 'border-sky-500 bg-sky-500/10 text-slate-50' : 'border-white/10 bg-slate-900/80 text-slate-300 hover:border-sky-400/40'
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              checked={value === recipe.value}
              onChange={() => onChange(recipe.value)}
            />
            {recipe.label}
          </label>
        ))}
      </div>
    </div>
  );
}
