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

export function getDeepSeekCompatibleProviderConfig(
  apiKey = readEnvValue('DEEPSEEK_API_KEY', 'OPENAI_APIKEY', 'OPENAI_API_KEY') ?? 'replace-me',
  baseUrl = readEnvValue('DEEPSEEK_BASE_URL', 'OPENAI_BASEURL', 'OPENAI_BASE_URL') ?? 'https://api.deepseek.com',
): ProviderConfig {
  return {
    name: 'deepseek-compatible',
    kind: 'model',
    apiKey,
    baseUrl,
  };
}
