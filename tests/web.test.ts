import { beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
const network = vi.hoisted(() => ({ addresses: ['93.184.216.34'], dnsCalls: 0, requests: [] as { url: string; headers: Record<string, string>; pinned: string }[], status: 200, location: undefined as string | undefined, type: 'text/html', body: '<h1>Evidence</h1><script>EVIL</script><p>Actual page text</p>' }));
vi.mock('node:dns/promises', () => ({ lookup: async () => { network.dnsCalls++; return network.addresses.map(address => ({ address, family: 4 })); } }));
vi.mock('node:https', () => ({
  request: (url: URL, options: { headers: Record<string, string>; lookup: (host: string, options: { all: boolean }, callback: (error: null, address: string, family: number) => void) => void }, callback: (response: Readable & { statusCode: number; headers: Record<string, unknown> }) => void) => {
    let pinned = ''; options.lookup(url.hostname, { all: false }, (_error, address) => { pinned = address; });
    network.requests.push({ url: url.href, headers: options.headers, pinned });
    const req = new EventEmitter() as EventEmitter & { end(): void };
    req.end = () => queueMicrotask(() => {
      const response = Readable.from([Buffer.from(network.body)]) as Readable & { statusCode: number; headers: Record<string, unknown> };
      response.statusCode = network.status; response.headers = { 'content-type': network.type, location: network.location };
      callback(response);
    });
    return req;
  }
}));
import { readWeb } from '../src/main/web';
beforeEach(() => { network.addresses = ['93.184.216.34']; network.dnsCalls = 0; network.requests = []; network.status = 200; network.location = undefined; network.type = 'text/html'; network.body = '<h1>Evidence</h1><script>EVIL</script><p>Actual page text</p>'; });
const read = (url = 'https://example.com/') => readWeb(url, ['https://example.com'], new AbortController().signal);
it('validates DNS and pins the socket address, retaining original hostname and no credential headers', async () => {
  const result = await read() as { content: string };
  expect(result.content).toContain('Evidence'); expect(result.content).not.toContain('EVIL');
  expect(network.dnsCalls).toBe(1); expect(network.requests[0].pinned).toBe('93.184.216.34');
  expect(network.requests[0].url).toBe('https://example.com/');
  expect(network.requests[0].headers).not.toHaveProperty('authorization'); expect(network.requests[0].headers).not.toHaveProperty('cookie');
});
it('rejects a private or mixed DNS answer before opening any connection', async () => {
  network.addresses = ['93.184.216.34', '10.0.0.1']; await expect(read()).rejects.toThrow('Private'); expect(network.requests).toHaveLength(0);
});
it('denies cross-origin redirects unless separately authorized', async () => {
  network.status = 302; network.location = 'https://other.example/';
  await expect(read()).rejects.toThrow('授权'); expect(network.requests).toHaveLength(1);
});
it('never follows redirect to local network or HTTP', async () => {
  network.status = 302; network.location = 'http://127.0.0.1/private';
  await expect(read()).rejects.toThrow(); expect(network.requests).toHaveLength(1);
});
it('bounds redirects and body bytes, and marks truncated model text', async () => {
  network.status = 302; network.location = '/again'; await expect(read()).rejects.toThrow('redirects');
  expect(network.requests).toHaveLength(4);
  network.status = 200; network.location = undefined; network.body = 'x'.repeat(25000); network.type = 'text/plain';
  expect(await read()).toMatchObject({ truncated: true, content: 'x'.repeat(24000) });
  network.body = 'x'.repeat(512001); await expect(read()).rejects.toThrow('size limit');
});
it('rejects binary or error responses instead of pretending to extract a page', async () => {
  network.type = 'application/octet-stream'; await expect(read()).rejects.toThrow('Unsupported');
  network.type = 'text/plain'; network.status = 403; await expect(read()).rejects.toThrow('Unsupported');
});
it('aborted reads do not open a socket after DNS completes', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(readWeb('https://example.com/', ['https://example.com'], controller.signal)).rejects.toThrow();
  expect(network.requests).toHaveLength(0);
});
