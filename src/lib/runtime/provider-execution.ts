import { resolveProviderConfig } from '@/lib/providers/registry';
import { buildRecipeResult } from '@/lib/recipes/registry';
import { buildResultPackage } from '@/lib/runtime/result-package';
import { listProviderSettings } from '@/lib/workspace-store';
import type { Citation, ResultPackage } from './types';

interface ExecuteRecipeInput {
  workspaceId: string;
  title: string;
  recipe: string;
  goal: string;
  experience?: string;
  constraints?: string;
}

export interface ProviderExecutionResult {
  resultPackage: ResultPackage;
  checkpoints: string[];
  providerUsed: string;
}

function getProviderNameFromSettings(workspaceId: string): string | undefined {
  const settings = listProviderSettings(workspaceId);
  return settings.find((setting) => setting.provider === 'deepseek-compatible' || setting.provider === 'openai-compatible')?.provider;
}

function readEnvValue(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function getModelForProvider(providerName: string): string {
  if (providerName === 'openai-compatible') {
    return readEnvValue('OPENAI_MODEL', 'DEEPSEEK_MODEL') ?? 'deepseek-v4-flash';
  }

  return readEnvValue('DEEPSEEK_MODEL', 'OPENAI_MODEL') ?? 'deepseek-v4-flash';
}

function getApiKeyForProvider(providerName: string): string | undefined {
  if (providerName === 'openai-compatible') {
    return readEnvValue('OPENAI_API_KEY', 'OPENAI_APIKEY', 'DEEPSEEK_API_KEY');
  }

  return readEnvValue('DEEPSEEK_API_KEY', 'OPENAI_APIKEY', 'OPENAI_API_KEY');
}

function getBaseUrlForProvider(providerName: string): string | undefined {
  if (providerName === 'openai-compatible') {
    return readEnvValue('OPENAI_BASE_URL', 'OPENAI_BASEURL', 'DEEPSEEK_BASE_URL');
  }

  return readEnvValue('DEEPSEEK_BASE_URL', 'OPENAI_BASEURL', 'OPENAI_BASE_URL');
}

function normalizeCitation(raw: Citation | Record<string, unknown>): Citation {
  return {
    source: typeof raw.source === 'string' ? raw.source : 'Decision Workspace',
    title: typeof raw.title === 'string' ? raw.title : 'Reference',
    url: typeof raw.url === 'string' ? raw.url : undefined,
  };
}

function extractJsonPayload(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1] ?? trimmed;

  try {
    const parsed = JSON.parse(candidate);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function buildCompletionEndpoint(baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL('chat/completions', normalizedBase).toString();
}

function normalizeStructuredPayload(payload: Record<string, unknown>, fallback: ResultPackage): ResultPackage {
  const nextActions = Array.isArray(payload.next_actions)
    ? payload.next_actions.filter((value): value is string => typeof value === 'string')
    : Array.isArray(payload.nextActions)
      ? payload.nextActions.filter((value): value is string => typeof value === 'string')
      : fallback.nextActions;

  const citations = Array.isArray(payload.citations)
    ? payload.citations
        .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null)
        .map((value) => normalizeCitation(value))
    : fallback.citations;

  const openQuestions = Array.isArray(payload.open_questions)
    ? payload.open_questions.filter((value): value is string => typeof value === 'string')
    : Array.isArray(payload.openQuestions)
      ? payload.openQuestions.filter((value): value is string => typeof value === 'string')
      : fallback.openQuestions;

  return buildResultPackage({
    summary: typeof payload.summary === 'string' ? payload.summary : fallback.summary,
    recommendation: typeof payload.recommendation === 'string' ? payload.recommendation : fallback.recommendation,
    citations,
    nextActions,
    confidence: typeof payload.confidence === 'number' ? payload.confidence : fallback.confidence,
    openQuestions,
  });
}

export async function executeRecipeWithProvider(input: ExecuteRecipeInput): Promise<ProviderExecutionResult> {
  const fallbackRecipe = buildRecipeResult(input.recipe, {
    goal: input.goal,
    experience: input.experience ?? 'beginner',
    constraints: input.constraints,
  });
  const fallbackResultPackage = buildResultPackage({
    summary: fallbackRecipe.summary,
    recommendation: fallbackRecipe.recommendation,
    citations: fallbackRecipe.citations.map((citation) => ({
      ...citation,
      source: citation.source,
      title: citation.title,
    })),
    nextActions: fallbackRecipe.nextActions,
    confidence: fallbackRecipe.confidence,
  });

  if (process.env.PLAYWRIGHT_TEST === '1') {
    return {
      resultPackage: fallbackResultPackage,
      checkpoints: ['Intake captured', 'Fallback recipe used'],
      providerUsed: 'fallback',
    };
  }

  const providerName =
    getProviderNameFromSettings(input.workspaceId) ??
    (getApiKeyForProvider('openai-compatible') ? 'openai-compatible' : getApiKeyForProvider('deepseek-compatible') ? 'deepseek-compatible' : null);

  if (!providerName) {
    return {
      resultPackage: fallbackResultPackage,
      checkpoints: ['Intake captured', 'Fallback recipe used'],
      providerUsed: 'fallback',
    };
  }

  const providerConfig = resolveProviderConfig(providerName, {
    apiKey: getApiKeyForProvider(providerName),
    baseUrl: getBaseUrlForProvider(providerName),
  });

  if (!providerConfig.apiKey) {
    return {
      resultPackage: fallbackResultPackage,
      checkpoints: ['Intake captured', 'Fallback recipe used'],
      providerUsed: 'fallback',
    };
  }

  try {
    const endpoint = buildCompletionEndpoint(providerConfig.baseUrl ?? 'https://api.deepseek.com');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: getModelForProvider(providerName),
        messages: [
          {
            role: 'system',
            content:
              'You are a decision assistant. Return concise JSON only with keys summary, recommendation, citations, next_actions, confidence, and open_questions.',
          },
          {
            role: 'user',
            content: `Task: ${input.title}\nGoal: ${input.goal}\nRecipe: ${input.recipe}\nExperience: ${input.experience ?? 'beginner'}\nConstraints: ${input.constraints ?? 'none'}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 700,
      }),
    });

    if (!response.ok) {
      throw new Error(`Provider request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? '';
    const structuredPayload = extractJsonPayload(content);

    if (!structuredPayload) {
      throw new Error('Provider returned an unstructured response');
    }

    return {
      resultPackage: normalizeStructuredPayload(structuredPayload, fallbackResultPackage),
      checkpoints: ['Intake captured', 'Provider response received'],
      providerUsed: providerName,
    };
  } catch {
    return {
      resultPackage: fallbackResultPackage,
      checkpoints: ['Intake captured', 'Fallback recipe used'],
      providerUsed: 'fallback',
    };
  }
}
