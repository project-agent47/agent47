import type { ProviderConfig } from './types';

export function getTavilySearchProviderConfig(
  apiKey = process.env.TAVILY_API_KEY ?? 'replace-me',
): ProviderConfig {
  return {
    name: 'tavily-search',
    kind: 'search',
    apiKey,
  };
}
