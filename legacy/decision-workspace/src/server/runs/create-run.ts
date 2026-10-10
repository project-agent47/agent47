import { buildLearningPathRecipe } from '@/lib/recipes/learning-path';
import { buildResultPackage } from '@/lib/runtime/result-package';
import { createRunState } from '@/lib/runtime/run-machine';

export interface CreateRunDraftInput {
  title: string;
  goal: string;
  experience: string;
  constraints?: string;
}

export function createRunDraft(input: CreateRunDraftInput) {
  const run = createRunState(`run-${Math.random().toString(36).slice(2, 10)}`, input.title);
  const recipe = buildLearningPathRecipe({
    goal: input.goal,
    experience: input.experience,
    constraints: input.constraints,
  });
  const resultPackage = buildResultPackage({
    summary: recipe.summary,
    recommendation: recipe.recommendation,
    citations: recipe.citations,
    nextActions: recipe.nextActions,
    confidence: recipe.confidence,
  });

  return {
    id: run.id,
    title: input.title,
    status: run.status,
    resultPackage,
  };
}
