import type { ProviderConfig } from './types';

export function getFirecrawlDocumentProviderConfig(
  apiKey = process.env.FIRECRAWL_API_KEY ?? 'replace-me',
): ProviderConfig {
  return {
    name: 'firecrawl-document',
    kind: 'document',
    apiKey,
  };
}
