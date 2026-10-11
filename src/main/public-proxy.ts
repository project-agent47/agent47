import { createServer } from 'node:http';
import { connect, type Socket } from 'node:net';
import { lookup } from 'node:dns/promises';
import { randomUUID } from 'node:crypto';
import { webOrigin, publicIPv4 } from './web';

export async function publicAddress(host: string): Promise<string> {
  const entries = await lookup(host, { family: 4, all: true });
  if (!entries.length || entries.some(e => !publicIPv4(e.address))) throw new Error('Public network required');
  return entries[0].address;
}
/** CONNECT-only, DNS-pinned HTTPS gateway. No TLS interception, app keys or cookies. */
export async function publicProxy(resolveAddress = publicAddress, dial = connect) {
  const username = 'agent47', password = randomUUID();
  const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  const sockets = new Set<Socket>();
  let closed = false;
  const server = createServer((_req, res) => { res.writeHead(403); res.end(); });
  server.on('connect', async (req, client, head) => {
    if (closed || sockets.size >= 64) { client.destroy(); return; }
    if (req.headers['proxy-authorization'] !== auth) {
      client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Agent47"\r\nConnection: close\r\n\r\n'); return;
    }
    const local = client as Socket; sockets.add(local);
    local.on('error', () => local.destroy()); local.on('close', () => sockets.delete(local));
    local.setTimeout(60000, () => local.destroy());
    const deadline = setTimeout(() => local.destroy(), 10000); deadline.unref();
    try {
      const url = new URL('https://' + req.url);
      webOrigin(url.href);
      if (url.port && url.port !== '443' || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid CONNECT');
      const address = await resolveAddress(url.hostname);
      if (!publicIPv4(address) || closed || local.destroyed) throw new Error('Private network denied');
      // The TCP destination is the validated IP, not a second DNS resolution.
      const remote = dial({ host: address, port: 443 }); sockets.add(remote);
      remote.setTimeout(60000, () => remote.destroy());
      remote.on('error', () => { remote.destroy(); local.destroy(); });
      remote.on('close', () => { sockets.delete(remote); local.destroy(); });
      local.on('close', () => remote.destroy());
      remote.once('connect', () => {
        clearTimeout(deadline); if (closed || local.destroyed) { remote.destroy(); return; }
        local.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) remote.write(head);
        local.pipe(remote); remote.pipe(local);
      });
    } catch { local.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
    finally { local.once('close', () => clearTimeout(deadline)); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as { port: number }).port;
  return { port, username, password, close: () => { closed = true; for (const socket of sockets) socket.destroy(); sockets.clear(); server.close(); } };
}
