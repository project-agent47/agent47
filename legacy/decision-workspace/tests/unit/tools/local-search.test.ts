import { describe, expect, it, vi } from 'vitest';
import { createLocalSearchTool } from '@/lib/tools/search/local-search';

describe('local search tool', () => {
  it('builds a search session that records opened and discarded candidates', async () => {
    const search = vi.fn().mockResolvedValue([
      { title: 'A', url: 'https://a.test' },
      { title: 'B', url: 'https://b.test' },
    ]);

    const tool = createLocalSearchTool({ search });

    const session = await tool.run('best frontend roadmap');

    expect(search).toHaveBeenCalledWith('best frontend roadmap');
    expect(session.query).toBe('best frontend roadmap');
    expect(session.candidates).toEqual([
      { title: 'A', url: 'https://a.test' },
      { title: 'B', url: 'https://b.test' },
    ]);
    expect(session.opened).toEqual([]);
    expect(session.discarded).toEqual([]);
  });
});
