import { getDeepSeekCompatibleProviderConfig } from './deepseek-compatible';
import { getFirecrawlDocumentProviderConfig } from './firecrawl-document';
import { getOpenAICompatibleProviderConfig } from './openai-compatible';
import { getTavilySearchProviderConfig } from './tavily-search';
import type { ProviderConfig } from './types';

const defaultProviders: Record<string, ProviderConfig> = {
  'openai-compatible': getOpenAICompatibleProviderConfig(),
  'deepseek-compatible': getDeepSeekCompatibleProviderConfig(),
  'tavily-search': getTavilySearchProviderConfig(),
  'firecrawl-document': getFirecrawlDocumentProviderConfig(),
};

export function resolveProviderConfig(
  providerName: string,
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig {
  const baseConfig = defaultProviders[providerName];

  if (!baseConfig) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  return {
    ...baseConfig,
    ...overrides,
  };
}

export function listProviderConfigs(): ProviderConfig[] {
  return Object.values(defaultProviders);
}
