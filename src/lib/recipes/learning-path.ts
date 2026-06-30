import type { RecipeInput, RecipeResult } from './types';

export function buildLearningPathRecipe(input: RecipeInput): RecipeResult {
  const experience = input.experience ?? 'beginner';
  const constraints = input.constraints ?? 'full-time';

  return {
    title: `${input.goal} learning path for ${experience} learners`,
    summary: `A ${experience} friendly plan for ${input.goal} that fits ${constraints}.`,
    recommendation: 'Start with a structured bootcamp, then ship one project every two weeks.',
    citations: [{ source: 'Decision Workspace', title: 'Learning Path Recommendation' }],
    nextActions: ['Create a weekly study schedule', 'Pick one project to ship'],
    confidence: 0.77,
  };
}
