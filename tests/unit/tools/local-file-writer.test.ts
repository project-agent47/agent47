import { describe, expect, it, vi } from 'vitest';
import { createLocalFileWriterTool } from '@/lib/tools/files/local-file-writer';

describe('local file writer', () => {
  it('writes markdown and json artifacts for a run', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const tool = createLocalFileWriterTool({ put });

    const artifacts = await tool.writeArtifacts('run-1', [
      { name: 'report.md', kind: 'markdown', content: '# Report' },
      { name: 'result.json', kind: 'json', content: '{"ok":true}' },
    ]);

    expect(put).toHaveBeenNthCalledWith(1, 'run-1/report.md', '# Report');
    expect(put).toHaveBeenNthCalledWith(2, 'run-1/result.json', '{"ok":true}');
    expect(artifacts).toHaveLength(2);
    expect(artifacts.map(({ name, kind, content }) => ({ name, kind, content }))).toEqual([
      { name: 'report.md', kind: 'markdown', content: '# Report' },
      { name: 'result.json', kind: 'json', content: '{"ok":true}' },
    ]);
  });
});
