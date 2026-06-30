export interface RecipeInput {
  goal: string;
  experience: string;
  constraints?: string;
}

export interface RecipeResult {
  title: string;
  summary: string;
  recommendation: string;
  citations: Array<{ source: string; title: string }>;
  nextActions: string[];
  confidence: number;
}
