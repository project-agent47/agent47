import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export class LocalObjectStorage {
  constructor(private readonly rootDir: string = join(process.cwd(), '.storage')) {}

  async put(key: string, content: string | Buffer): Promise<void> {
    const filePath = join(this.rootDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  async get(key: string): Promise<string | null> {
    const filePath = join(this.rootDir, key);
    try {
      return await readFile(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.rootDir, key);
    await rm(filePath, { force: true });
  }
}
