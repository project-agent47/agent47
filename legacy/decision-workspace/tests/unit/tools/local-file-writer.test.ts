import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalFileWriterTool } from '@/lib/tools/files/local-file-writer';

const sandboxRoot = path.join(process.cwd(), '.test-artifacts', randomUUID());

afterEach(async () => {
  await rm(sandboxRoot, { recursive: true, force: true });
});

describe('local file writer', () => {
  it('writes artifacts beneath the configured artifact root', async () => {
    await mkdir(sandboxRoot, { recursive: true });
    const tool = createLocalFileWriterTool({ baseDirectory: sandboxRoot });

    const artifacts = await tool.writeArtifacts('run-1', [
      { name: 'report.md', kind: 'markdown', content: '# Report' },
      { name: 'result.json', kind: 'json', content: '{"ok":true}' },
    ]);

    const reportPath = path.join(sandboxRoot, 'run-1', 'report.md');
    const resultPath = path.join(sandboxRoot, 'run-1', 'result.json');

    expect(await stat(reportPath)).toBeTruthy();
    expect(await stat(resultPath)).toBeTruthy();
    expect(await readFile(reportPath, 'utf8')).toBe('# Report');
    expect(await readFile(resultPath, 'utf8')).toBe('{"ok":true}');
    expect(artifacts.map(({ name, kind, content }) => ({ name, kind, content }))).toEqual([
      { name: 'report.md', kind: 'markdown', content: '# Report' },
      { name: 'result.json', kind: 'json', content: '{"ok":true}' },
    ]);
  });

  it('rejects traversal attempts outside the artifact root', async () => {
    await mkdir(sandboxRoot, { recursive: true });
    const tool = createLocalFileWriterTool({ baseDirectory: sandboxRoot });

    await expect(
      tool.writeArtifacts('run-1', [{ name: '../../../escape.txt', kind: 'text', content: 'nope' }]),
    ).rejects.toThrow('outside the artifact root');
  });
});
