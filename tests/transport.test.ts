import { afterEach, expect, it, vi } from 'vitest';
import { modelTransport } from '../src/main/transport';
afterEach(() => vi.unstubAllEnvs());
it('does not implicitly enable authenticated proxy based on an ambient URL', async () => {
  vi.stubEnv('AGENT47_AUTHENTICATED_PROXY', '');
  vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:9999');
  const transport = modelTransport();
  expect(transport.fetch).toBeUndefined();
  await transport.close();
});
it('fails closed when proxy mode is enabled without a transport URL', () => {
  vi.stubEnv('AGENT47_AUTHENTICATED_PROXY', '1');
  vi.stubEnv('HTTPS_PROXY', '');
  expect(() => modelTransport()).toThrow('requires HTTPS_PROXY');
});
it('constructs an explicit main-only transport without exporting credentials', async () => {
  vi.stubEnv('AGENT47_AUTHENTICATED_PROXY', '1');
  vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:9999');
  const transport = modelTransport();
  expect(typeof transport.fetch).toBe('function');
  expect(Object.keys(transport).sort()).toEqual(['close', 'fetch']);
  await transport.close();
});
