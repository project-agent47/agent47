import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request } from 'node:https';

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const) blocked.addSubnet(address, prefix);
export function publicIPv4(address: string): boolean { return isIP(address) === 4 && !blocked.check(address); }
export function webOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
    isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.') || url.hostname.endsWith('.local') || url.hostname.endsWith('.localhost')) throw new Error('请使用公共 HTTPS 站点（不接受 IP、登录信息或自定义端口）。');
  return url.origin;
}
function contentText(html: string): string {
  return html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
}
/** Public HTTPS GET only. DNS is validated then pinned per connection, with TLS hostname verification intact. */
export async function readWeb(value: string, origins: string[], signal: AbortSignal): Promise<unknown> {
  let url = new URL(value);
  const combined = AbortSignal.any([signal, AbortSignal.timeout(20000)]);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const origin = webOrigin(url.href);
    if (!origins.includes(origin)) throw new Error('请先在本次对话的网页访问中授权该站点。');
    const addresses = await lookup(url.hostname, { family: 4, all: true });
    combined.throwIfAborted();
    if (!addresses.length || addresses.some(entry => !publicIPv4(entry.address))) throw new Error('Private or reserved network denied');
    const address = addresses[0].address;
    const result = await new Promise<{ status: number; location?: string; type: string; body: string }>((resolve, reject) => {
      const req = request(url, {
        method: 'GET', agent: false, signal: combined,
        headers: { 'user-agent': 'Agent47-ReadOnly/0.2', accept: 'text/html,text/plain', 'accept-encoding': 'identity' },
        lookup: (_hostname, options, callback) => {
          // Pin the approved address; never resolve again inside the socket.
          if (options.all) callback(null, [{ address, family: 4 }]); else callback(null, address, 4);
        }
      }, response => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) { response.resume(); resolve({ status, location: response.headers.location, type: '', body: '' }); return; }
        if (status !== 200 || !/^text\/(html|plain)\b/i.test(String(response.headers['content-type'])) ||
          (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) { response.destroy(); reject(new Error('Unsupported or unsuccessful web response')); return; }
        const chunks: Buffer[] = []; let bytes = 0;
        response.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 512000) { response.destroy(new Error('Web page exceeds size limit')); } else chunks.push(chunk); });
        response.on('error', reject);
        response.on('end', () => resolve({ status, type: String(response.headers['content-type']), body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject); req.end();
    });
    if (result.location) { url = new URL(result.location, url); continue; }
    if (result.status !== 200) throw new Error('Web redirect missing destination');
    const text = result.type.startsWith('text/html') ? contentText(result.body) : result.body;
    return { url: url.href, content: text.slice(0, 24000), truncated: text.length > 24000, untrusted: true, readOnly: true, javascript: false };
  }
  throw new Error('Too many web redirects');
}
