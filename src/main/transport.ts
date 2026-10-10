import { ProxyAgent, fetch as proxyFetch } from 'undici';

/**
 * Explicit opt-in for enterprise/authenticated proxy transport, main process only.
 * Proxy auth injection never exposes the provider API key to the app or renderer.
 * Normal installed apps still use their OS-encrypted key and the default fetch.
 */
export function modelTransport(): { fetch?: typeof fetch; close: () => Promise<void> } {
  const enabled = process.env.AGENT47_AUTHENTICATED_PROXY === '1';
  const proxy = process.env.HTTPS_PROXY;
  if (!enabled) return { close: async () => {} };
  if (!proxy) throw new Error('Authenticated proxy mode requires HTTPS_PROXY');
  const agent = new ProxyAgent(proxy);
  const fetch: typeof globalThis.fetch = (input, init) =>
    proxyFetch(String(input), { ...init, dispatcher: agent } as Parameters<typeof proxyFetch>[1]) as unknown as ReturnType<typeof globalThis.fetch>;
  return { fetch, close: () => agent.close() };
}
