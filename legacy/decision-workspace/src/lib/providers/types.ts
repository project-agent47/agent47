export type ProviderKind = 'model' | 'search' | 'document';

export interface ProviderConfig {
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
}
