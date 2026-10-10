import { describe, expect, it } from 'vitest';
import { buildCareerPathRecipe } from '@/lib/recipes/career-path';
import { buildShoppingComparisonRecipe } from '@/lib/recipes/shopping-comparison';

describe('secondary recipes', () => {
  it('builds a shopping comparison recommendation', () => {
    const recipe = buildShoppingComparisonRecipe({
      goal: 'best laptop',
      experience: 'budget-conscious',
    });

    expect(recipe.title).toContain('Shopping');
    expect(recipe.recommendation).toContain('value');
  });

  it('builds a career path recommendation', () => {
    const recipe = buildCareerPathRecipe({
      goal: 'data analyst',
      experience: 'mid-career',
    });

    expect(recipe.title).toContain('Career');
    expect(recipe.recommendation).toContain('demand');
  });
});
