import { ProxyAgent, fetch as proxyFetch } from 'undici';
import { sdkDriver } from '../src/core/model';
import { TaskStore } from '../src/core/store';
import { TaskRuntime } from '../src/core/runtime';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// HTTPS_PROXY contains only the platform transport config, never the user API key.
// In Computer, use the approved Vault handle on the command; auth is injected upstream.
const proxy = process.env.HTTPS_PROXY;
const agent = proxy ? new ProxyAgent(proxy) : undefined;
const transport: typeof fetch = (input, init) => proxyFetch(String(input), { ...init, ...(agent ? { dispatcher: agent } : {}) } as Parameters<typeof proxyFetch>[1]) as unknown as ReturnType<typeof fetch>;
const config = {
  baseURL: process.env.AGENT47_BASE_URL || 'https://opencode.ai/zen/go/v1',
  model: process.env.AGENT47_MODEL || 'deepseek-v4.1-flash',
  ...(process.env.OPENCODE_API_TOKEN ? { apiKey: process.env.OPENCODE_API_TOKEN } : {})
};
const driver = sdkDriver(() => config, transport);
const root = await mkdtemp(join(tmpdir(), 'agent47-live-sdk-'));
await writeFile(join(root, 'requirements.md'), '# TypeScript coding task\nUse a bounded AI SDK adapter. Exact output marker: VERIFIED_SOURCE_47\n');
const store = new TaskStore(join(root, 'tasks.db'));
const runtime = new TaskRuntime(store, driver, join(root, 'artifacts'));
runtime.start();
try {
  const task = runtime.create('For a TypeScript coding-agent integration test: read requirements.md with readFile, then call writeArtifact to propose verification.md documenting the marker and the bounded SDK adapter requirement. After approval, briefly confirm the saved filename. Do not use any other files.', 'deliver', root);
  const deadline = Date.now() + 180_000;
  let approved = false;
  while (Date.now() < deadline) {
    const current = runtime.list().find(t => t.id === task.id)!;
    if (current.status === 'awaiting_approval' && current.approval) {
      if (approved || !current.approval.content.includes('VERIFIED_SOURCE_47')) throw new Error('Unexpected live approval payload');
      runtime.decide(task.id, current.approval.id, current.approval.digest, true); approved = true;
    }
    if (current.status === 'failed' || current.status === 'cancelled') throw new Error('Live SDK task did not complete');
    if (current.status === 'completed') {
      if (!approved || !current.artifacts.length || !current.events.some(e => e.kind === 'tool' && e.text.startsWith('readFile'))) throw new Error('Live model did not exercise the requested tools');
      console.log(JSON.stringify({ result: 'AI_SDK_TOOL_LOOP_OK', model: config.model, steps: current.steps, readVerified: true, approvalVerified: approved, artifacts: current.artifacts.map(a => ({ name: a.name, sha256: a.sha256 })), credentialStored: false }));
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (runtime.list()[0].status !== 'completed') throw new Error('Live SDK task timed out');
} catch {
  console.error('Live SDK verification failed. No upstream payload or credentials were logged.'); process.exitCode = 1;
} finally {
  runtime.shutdown(); await new Promise(resolve => setImmediate(resolve)); store.close(); await agent?.close();
}
