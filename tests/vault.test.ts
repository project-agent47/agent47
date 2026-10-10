import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const encryption = vi.hoisted(() => ({ available: true, backend: 'gnome_libsecret' }));
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryption.available,
    getSelectedStorageBackend: () => encryption.backend,
    // Test double only. This does not test native encryption.
    encryptString: (s: string) => Buffer.from(s.split('').reverse().join('')),
    decryptString: (b: Buffer) => b.toString().split('').reverse().join('')
  }
}));
import { CredentialStore, providerSchema } from '../src/main/vault';
beforeEach(() => { encryption.available = true; encryption.backend = 'gnome_libsecret'; });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'agent47-vault-test-'));
  const path = join(root, 'provider.json'); return { path, vault: new CredentialStore(path) };
}
describe('credential boundary (native backend mocked)', () => {
  it('persists ciphertext only and never returns key metadata', async () => {
    const { path, vault } = await setup();
    vault.save({ baseURL: 'https://example.test/v1', model: 'deepseek-test', apiKey: 'FAKE_KEY_FOR_TEST' });
    expect(await readFile(path, 'utf8')).not.toContain('FAKE_KEY_FOR_TEST');
    expect(vault.settings().apiKey).toBe('FAKE_KEY_FOR_TEST');
    expect(vault.view()).not.toHaveProperty('apiKey');
    expect(vault.view()).not.toHaveProperty('encryptedKey');
  });
  it('refuses storage when OS encryption is unavailable or plaintext', async () => {
    const { vault } = await setup();
    encryption.available = false;
    expect(() => vault.save({ baseURL: 'https://example.test/v1', model: 'deepseek-test', apiKey: 'dummy' })).toThrow('安全存储');
    encryption.available = true; encryption.backend = 'basic_text';
    if (process.platform === 'linux') expect(vault.secure()).toBe(false);
  });
  it('does not move the old key to a new API destination', async () => {
    const { vault } = await setup();
    vault.save({ baseURL: 'https://one.test/v1', model: 'deepseek-test', apiKey: 'dummy' });
    expect(() => vault.save({ baseURL: 'https://two.test/v1', model: 'deepseek-test' })).toThrow('新的 Key');
    expect(vault.settings().baseURL).toBe('https://one.test/v1');
  });
  it('rejects HTTP, embedded credentials, query tokens and fragments', () => {
    for (const baseURL of ['http://example.test', 'https://u:p@example.test', 'https://example.test?v=key', 'https://example.test/#secret']) expect(() => providerSchema.parse({ baseURL, model: 'deepseek-test' })).toThrow();
  });
  it('supports DeepSeek IDs and refuses non-DeepSeek model selection', () => {
    for (const model of ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4.1-flash']) expect(providerSchema.parse({ baseURL: 'https://example.test/v1', model }).model).toBe(model);
    expect(() => providerSchema.parse({ baseURL: 'https://example.test/v1', model: 'other-model' })).toThrow('DeepSeek');
  });
});
