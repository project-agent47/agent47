import { buildCareerPathRecipe } from './career-path';
import { buildLearningPathRecipe } from './learning-path';
import { buildShoppingComparisonRecipe } from './shopping-comparison';
import type { RecipeInput, RecipeResult } from './types';

export function buildRecipeResult(recipe: string, input: RecipeInput): RecipeResult {
  switch (recipe) {
    case 'shopping-comparison':
      return buildShoppingComparisonRecipe(input);
    case 'career-path':
      return buildCareerPathRecipe(input);
    case 'learning-path':
    default:
      return buildLearningPathRecipe(input);
  }
}
