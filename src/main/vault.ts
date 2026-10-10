import { safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { z } from 'zod';
import type { ProviderInput, ProviderView } from '../shared/contracts';

export const providerSchema = z.object({
  baseURL: z.string().url().refine(url => {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash;
  }, 'Use an HTTPS API base URL without credentials, query or fragment'),
  model: z.string().trim().min(1).max(120).regex(/^deepseek[-/][a-zA-Z0-9_.:/-]+$/, 'Only DeepSeek model IDs are supported'),
  apiKey: z.string().max(4096).optional()
}).strict();
const defaults = { baseURL: 'https://opencode.ai/zen/go/v1', model: 'deepseek-v4.1-flash' };
export class CredentialStore {
  constructor(private path: string) {}
  secure(): boolean {
    return safeStorage.isEncryptionAvailable() &&
      (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');
  }
  private disk(): { baseURL: string; model: string; encryptedKey?: string } {
    if (!existsSync(this.path)) return defaults;
    return JSON.parse(readFileSync(this.path, 'utf8'));
  }
  settings(): ProviderInput {
    const disk = this.disk();
    const envKey = process.env.OPENCODE_API_TOKEN;
    if (disk.encryptedKey && !this.secure()) throw new Error('OS credential encryption unavailable');
    return {
      baseURL: disk.baseURL, model: disk.model,
      apiKey: disk.encryptedKey ? safeStorage.decryptString(Buffer.from(disk.encryptedKey, 'base64')) : envKey
    };
  }
  view(): ProviderView {
    const disk = this.disk();
    return { baseURL: disk.baseURL, model: disk.model, configured: Boolean(disk.encryptedKey || process.env.OPENCODE_API_TOKEN), secureStorage: this.secure() };
  }
  save(input: ProviderInput): void {
    const data = providerSchema.parse(input);
    if (!this.secure()) throw new Error('系统安全存储不可用，未保存任何凭据。可使用启动环境变量。');
    const old = this.disk();
    if (!data.apiKey && old.baseURL !== data.baseURL) throw new Error('切换 API 地址时必须提供新的 Key，旧凭据不会发送到新地址。');
    const encryptedKey = data.apiKey ? safeStorage.encryptString(data.apiKey).toString('base64') : old.encryptedKey;
    if (!encryptedKey) throw new Error('请填写 API Key。');
    const temp = `${this.path}.tmp`;
    writeFileSync(temp, JSON.stringify({ baseURL: data.baseURL, model: data.model, encryptedKey }), { mode: 0o600 });
    renameSync(temp, this.path);
  }
}
