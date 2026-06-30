import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveProviderConfig } from '@/lib/providers/registry';
import { decryptSecret, encryptSecret } from '@/lib/security/provider-secrets';
import { LocalObjectStorage } from '@/lib/storage/local-object-storage';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('provider registry and storage', () => {
  it('resolves the default OpenAI-compatible provider config', () => {
    const config = resolveProviderConfig('openai-compatible');

    expect(config.name).toBe('openai-compatible');
    expect(config.baseUrl).toContain('api.openai.com');
  });

  it('encrypts and decrypts provider secrets', () => {
    const encrypted = encryptSecret('super-secret');

    expect(decryptSecret(encrypted)).toBe('super-secret');
  });

  it('stores and retrieves an object through the local storage adapter', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'decision-workspace-'));
    tempDirs.push(rootDir);
    const storage = new LocalObjectStorage(rootDir);

    await storage.put('artifacts/demo.md', '# Demo');
    const content = await storage.get('artifacts/demo.md');
    const onDisk = await readFile(path.join(rootDir, 'artifacts/demo.md'), 'utf8');

    expect(content).toBe('# Demo');
    expect(onDisk).toBe('# Demo');
  });
});
