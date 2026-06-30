import type { SearchCandidate, SearchSession, SearchTool } from '../types';

export interface LocalSearchDependencies {
  search: (query: string) => Promise<SearchCandidate[]>;
}

export function createLocalSearchTool(deps: LocalSearchDependencies): SearchTool {
  return {
    async run(query: string): Promise<SearchSession> {
      const candidates = await deps.search(query);
      return {
        query,
        candidates,
        opened: [],
        discarded: [],
      };
    },
  };
}
