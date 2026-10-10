import { describe, expect, it } from 'vitest';
import { buildLearningPathRecipe } from '@/lib/recipes/learning-path';
import { createRunDraft } from '@/server/runs/create-run';

describe('learning path recipe', () => {
  it('builds a structured learning path recommendation', () => {
    const recipe = buildLearningPathRecipe({
      goal: 'Become a frontend engineer',
      experience: 'beginner',
      constraints: 'part-time',
    });

    expect(recipe.title).toContain('frontend');
    expect(recipe.recommendation).toContain('bootcamp');
    expect(recipe.citations[0]?.source).toBe('Decision Workspace');
  });

  it('creates a draft run for a learning path request', () => {
    const draft = createRunDraft({
      title: 'Frontend plan',
      goal: 'Become a frontend engineer',
      experience: 'beginner',
      constraints: 'part-time',
    });

    expect(draft.status).toBe('draft');
    expect(draft.resultPackage.summary).toContain('frontend');
  });
});
