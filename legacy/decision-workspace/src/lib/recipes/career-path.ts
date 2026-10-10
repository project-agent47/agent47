import type { RecipeInput, RecipeResult } from './types';

export function buildCareerPathRecipe(input: RecipeInput): RecipeResult {
  return {
    title: `Career path for ${input.goal}`,
    summary: `Outline the next milestones for ${input.goal}.`,
    recommendation: 'Focus on the role with the strongest near-term demand.',
    citations: [{ source: 'Decision Workspace', title: 'Career Path Recommendation' }],
    nextActions: ['Map adjacent skills', 'Build a portfolio piece'],
    confidence: 0.75,
  };
}
