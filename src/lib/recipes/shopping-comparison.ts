import type { RecipeInput, RecipeResult } from './types';

export function buildShoppingComparisonRecipe(input: RecipeInput): RecipeResult {
  return {
    title: `Shopping comparison for ${input.goal}`,
    summary: `Compare the top options for ${input.goal}.`,
    recommendation: 'Choose the option with the best blend of value and reliability.',
    citations: [{ source: 'Decision Workspace', title: 'Shopping Comparison' }],
    nextActions: ['List the top three options', 'Compare warranty and support'],
    confidence: 0.74,
  };
}
