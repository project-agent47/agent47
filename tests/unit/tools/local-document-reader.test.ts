import { describe, expect, it, vi } from 'vitest';
import { createLocalDocumentReaderTool } from '@/lib/tools/documents/local-document-reader';

describe('local document reader', () => {
  it('returns document notes with summary and citable passages', async () => {
    const extractText = vi.fn().mockResolvedValue('Paragraph one. Paragraph two. Paragraph three.');
    const tool = createLocalDocumentReaderTool({ extractText });

    const note = await tool.read('/home/kimmy/workspace/ml/agent47/fixtures/input.md');

    expect(extractText).toHaveBeenCalledWith('/home/kimmy/workspace/ml/agent47/fixtures/input.md');
    expect(note.name).toBe('input.md');
    expect(note.summary).toContain('Paragraph one');
    expect(note.keyPassages).toEqual(['Paragraph one', 'Paragraph two', 'Paragraph three']);
    expect(note.citations).toEqual(['Paragraph one', 'Paragraph two']);
  });
});
