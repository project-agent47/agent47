import type { ProviderConfig } from './types';

function readEnvValue(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function getOpenAICompatibleProviderConfig(
  apiKey = readEnvValue('OPENAI_API_KEY', 'OPENAI_APIKEY', 'DEEPSEEK_API_KEY') ?? 'replace-me',
  baseUrl = readEnvValue('OPENAI_BASE_URL', 'OPENAI_BASEURL', 'DEEPSEEK_BASE_URL') ?? 'https://api.openai.com/v1',
): ProviderConfig {
  return {
    name: 'openai-compatible',
    kind: 'model',
    apiKey,
    baseUrl,
  };
}
