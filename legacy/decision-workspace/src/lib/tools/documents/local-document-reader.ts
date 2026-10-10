import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { DocumentNote, DocumentReaderTool } from '../types';

export interface LocalDocumentReaderDependencies {
  extractText?: (filePath: string) => Promise<string>;
}

function toPassages(text: string): string[] {
  return text
    .split(/[.\n]+/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function createLocalDocumentReaderTool(
  deps: LocalDocumentReaderDependencies = {},
): DocumentReaderTool {
  const extractText = deps.extractText ?? ((filePath: string) => readFile(filePath, 'utf8'));

  return {
    async read(filePath: string): Promise<DocumentNote> {
      const text = await extractText(filePath);
      const keyPassages = toPassages(text);

      return {
        name: basename(filePath),
        summary: keyPassages.join('. '),
        keyPassages,
        citations: keyPassages.slice(0, 2),
      };
    },
  };
}
