import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RunArtifact } from '@/lib/runtime/types';
import type { FileArtifactInput, FileWriterTool } from '../types';

export interface LocalFileWriterDependencies {
  baseDirectory?: string;
  createId?: () => string;
  put?: (key: string, content: string) => Promise<void>;
}

async function writeArtifactToDisk(baseDirectory: string, key: string, content: string): Promise<void> {
  const rootDirectory = path.resolve(baseDirectory);
  const outputPath = path.resolve(rootDirectory, key);
  const relativePath = path.relative(rootDirectory, outputPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to write artifact outside the artifact root: ${key}`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, 'utf8');
}

export function createLocalFileWriterTool(
  deps: LocalFileWriterDependencies = {},
): FileWriterTool {
  const baseDirectory = deps.baseDirectory ?? 'artifacts';
  const createId = deps.createId ?? randomUUID;
  const put = deps.put ?? ((key: string, content: string) => writeArtifactToDisk(baseDirectory, key, content));

  return {
    async writeArtifacts(runId: string, files: FileArtifactInput[]): Promise<RunArtifact[]> {
      const artifacts: RunArtifact[] = [];

      for (const file of files) {
        await put(`${runId}/${file.name}`, file.content);
        artifacts.push({
          id: createId(),
          name: file.name,
          kind: file.kind,
          content: file.content,
        });
      }

      return artifacts;
    },
  };
}
