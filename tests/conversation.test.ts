import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../src/core/store';
import { TaskRuntime, type RuntimeServices } from '../src/core/runtime';
import type { ModelDriver, ModelStep } from '../src/core/model';
import { sha256 } from '../src/core/tools';
import { compactionCut, projectedMessages } from '../src/core/context';
import { SkillRegistry } from '../src/main/skills';
import { normalizedUsage } from '../src/core/model';

const resources: { runtime: TaskRuntime; store: TaskStore }[] = [];
afterEach(async () => { for (const item of resources.splice(0)) { item.runtime.shutdown(); await new Promise(r => setImmediate(r)); item.store.close(); } });
const answer = (text: string): ModelStep => ({ text, messages: [{ role: 'assistant', content: text }], calls: [] });
const call = (name: string, input: unknown, id: string = crypto.randomUUID()): ModelStep => ({ text: '', calls: [{ toolCallId: id, toolName: name, input }], messages: [{ role: 'assistant', content: [{ type: 'tool-call', toolCallId: id, toolName: name, input }] }] });
async function setup(model: ModelDriver, services: RuntimeServices = {}) {
  const root = await mkdtemp(join(tmpdir(), 'agent47-conversation-'));
  const store = new TaskStore(join(root, 'tasks.db'));
  const runtime = new TaskRuntime(store, model, join(root, 'artifacts'), undefined, services);
  resources.push({ store, runtime }); runtime.start(); return { root, store, runtime };
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Timeout'); await new Promise(r => setTimeout(r, 5)); }
}
it('continues in a new immutable run, preserves model history and deduplicates sends', async () => {
  let count = 0;
  const { runtime, store } = await setup(async messages => {
    if (++count === 2) expect(JSON.stringify(messages)).toContain('UNIQUE_PRIOR');
    return answer(count === 1 ? 'UNIQUE_PRIOR' : 'continued');
  });
  const first = runtime.create('first', 'general');
  await until(() => runtime.list()[0].status === 'completed');
  const before = JSON.stringify(store.get(first.id));
  const command = crypto.randomUUID();
  const next = runtime.send(first.id, 'follow up', 'followup', command);
  expect(runtime.send(first.id, 'follow up', 'followup', command).id).toBe(next.id);
  await until(() => runtime.list()[0].status === 'completed');
  expect(JSON.stringify(store.get(first.id))).toBe(before);
  expect(next).toMatchObject({ conversationId: first.id, parentRunId: first.id, runNumber: 2 });
  expect(() => runtime.send(first.id, 'stale branch', 'followup', crypto.randomUUID())).toThrow('already continued');
});
it('streams separate text and reasoning drafts, persists final reasoning and usage without exposing model messages', async () => {
  let release!: () => void;
  const { runtime } = await setup(async (_m, _id, _signal, _skill, ctx) => {
    ctx?.onDelta?.('reasoning', 'provider reasoning');
    ctx?.onDelta?.('text', 'live text');
    await new Promise<void>(r => { release = r; });
    return { ...answer('final'), reasoning: 'provider reasoning', usage: { state: 'reported', input: 100, output: 20, cacheRead: 80 } };
  });
  runtime.create('stream', 'general');
  await until(() => !!runtime.list()[0].draft);
  expect(runtime.list()[0].draft).toEqual({ text: 'live text', reasoning: 'provider reasoning' });
  release(); await until(() => runtime.list()[0].status === 'completed');
  expect(runtime.list()[0].draft).toBeUndefined();
  expect(runtime.list()[0].usage?.[0]).toMatchObject({ input: 100, output: 20, cacheRead: 80 });
  expect(runtime.list()[0].events.find(e => e.kind === 'reasoning')?.text).toBe('provider reasoning');
  expect(runtime.list()[0]).not.toHaveProperty('messages');
});
it('askUser pauses and consumes one deduplicated human tool result', async () => {
  let count = 0;
  const { runtime } = await setup(async messages => {
    if (++count === 1) return call('askUser', { question: 'Which platform?' });
    expect(JSON.stringify(messages.at(-1))).toContain('Windows'); return answer('okay');
  });
  const task = runtime.create('question', 'general');
  await until(() => runtime.list()[0].status === 'awaiting_input');
  expect(count).toBe(1);
  const id = crypto.randomUUID(); runtime.send(task.id, 'Windows', 'steer', id); runtime.send(task.id, 'Windows', 'steer', id);
  await until(() => runtime.list()[0].status === 'completed');
  expect(count).toBe(2);
});
it('steering supersedes the pending write and closes its tool chain before the user message', async () => {
  let count = 0;
  const { runtime, root } = await setup(async messages => {
    if (++count === 1) return call('writeArtifact', { name: 'a.md', content: 'old' });
    expect(JSON.stringify(messages)).toContain('superseded');
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Do not write' });
    return answer('stopped write');
  });
  const task = runtime.create('write', 'general');
  await until(() => runtime.list()[0].status === 'awaiting_approval');
  const old = runtime.list()[0].approval!;
  runtime.send(task.id, 'Do not write', 'steer', crypto.randomUUID());
  expect(() => runtime.decide(task.id, old.id, old.digest, true)).toThrow();
  await until(() => runtime.list()[0].status === 'completed');
  expect(runtime.list()[0].artifacts).toEqual([]);
  await expect(readFile(join(root, 'artifacts', 'a.md'))).rejects.toThrow();
});
it('steering received during a final model response is not dropped', async () => {
  let release!: (step: ModelStep) => void, count = 0;
  const { runtime } = await setup(async messages => {
    if (++count === 1) return new Promise<ModelStep>(r => { release = r; });
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'new requirement' }); return answer('updated');
  });
  const task = runtime.create('first', 'general'); await until(() => typeof release === 'function');
  runtime.send(task.id, 'new requirement', 'steer', crypto.randomUUID());
  release(answer('old result')); await until(() => runtime.list()[0].status === 'completed');
  expect(count).toBe(2); expect(runtime.list()[0].events.at(-2)?.text).toBe('updated');
});
it('project edits require exact current hash and approval; changed target is not overwritten', async () => {
  let count = 0;
  const { runtime, root } = await setup(async () => ++count === 1 ? call('editFile', { path: 'a.txt', oldText: 'old', newText: 'new', expectedHash: sha256('old') }) : answer('done'));
  await writeFile(join(root, 'a.txt'), 'old');
  const task = runtime.create('edit', 'general', root); await until(() => runtime.list()[0].status === 'awaiting_approval');
  expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('old');
  const action = runtime.list()[0].approval!; expect(action).toMatchObject({ before: 'old', content: 'new', kind: 'project_write' });
  await writeFile(join(root, 'a.txt'), 'external change');
  runtime.decide(task.id, action.id, action.digest, true); await until(() => runtime.list()[0].status === 'completed');
  expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('external change');
});
it('creates a project file only after approval and rejects traversal/secret writes', async () => {
  let count = 0;
  const { runtime, root } = await setup(async () => ++count === 1 ? call('writeFile', { path: 'new.txt', content: 'created', expectedHash: null }) : answer('done'));
  const task = runtime.create('create', 'general', root); await until(() => runtime.list()[0].status === 'awaiting_approval');
  const action = runtime.list()[0].approval!; runtime.decide(task.id, action.id, action.digest, true);
  await until(() => runtime.list()[0].status === 'completed'); expect(await readFile(join(root, 'new.txt'), 'utf8')).toBe('created');
  const { prepareEffect } = await import('../src/core/effects');
  for (const path of ['../escape.txt', '.env', 'credentials.json', 'test.key']) await expect(prepareEffect('x', call('writeFile', { path, content: 'x', expectedHash: null }).calls[0], root, false)).rejects.toThrow();
});
it('host tools are disabled by default; enabled commands require approval and unknown effects do not replay', async () => {
  let count = 0, hostCalls = 0;
  const { runtime, store, root } = await setup(async () => ++count === 1 ? call('runShell', { command: 'echo fixture', cwd: '.', timeoutMs: 1000 }) : answer('done'), {
    hostEnabled: () => true, executeHost: async () => { hostCalls++; throw new Error('unknown'); }
  });
  const task = runtime.create('host', 'general', root); await until(() => runtime.list()[0].status === 'awaiting_approval');
  expect(hostCalls).toBe(0); const action = runtime.list()[0].approval!;
  runtime.decide(task.id, action.id, action.digest, true); await until(() => runtime.list()[0].status === 'awaiting_reconciliation');
  runtime.start(); await new Promise(r => setImmediate(r)); expect(hostCalls).toBe(1);
  runtime.resolveUnknown(task.id); await until(() => runtime.list()[0].status === 'completed');
  expect(store.get(task.id).effectStarted).toBeUndefined(); expect(hostCalls).toBe(1);
  const { prepareEffect } = await import('../src/core/effects');
  await expect(prepareEffect('x', call('runCode', { code: 'console.log(1)', cwd: '.', timeoutMs: 1000 }).calls[0], root, false)).rejects.toThrow('disabled');
});
it('automatically compacts safe closed turns, accounts summary usage, preserves raw history', async () => {
  let count = 0;
  const { runtime, store } = await setup(async (_messages, _id, _signal, _skill, ctx) => {
    if (ctx?.purpose === 'compaction') return answer('Goal: retain FIRST. Progress: prior response complete.');
    count++; return answer(count === 1 ? 'prior response '.repeat(1000) : 'continued');
  }, { contextThreshold: 14000 });
  const first = runtime.create('FIRST', 'general'); await until(() => runtime.list()[0].status === 'completed');
  const second = runtime.send(first.id, 'next', 'followup', crypto.randomUUID());
  await until(() => runtime.list()[0].status === 'completed');
  const record = store.get(second.id);
  expect(record.compactions).toHaveLength(1);
  expect(record.messages.some(m => typeof m.content === 'string' && m.content.length > 12000)).toBe(true);
  expect(projectedMessages(record).some(m => String(m.content).includes('Untrusted history summary'))).toBe(true);
  expect(record.usage?.filter(u => u.purpose === 'compaction')).toHaveLength(1);
});
it('compaction never cuts away a call from its result', () => {
  const messages = [answer('x').messages[0], ...call('readFile', { path: 'a' }, 'read').messages,
    { role: 'tool' as const, content: [{ type: 'tool-result' as const, toolCallId: 'read', toolName: 'readFile', output: { type: 'text' as const, value: 'a' } }] },
    { role: 'user' as const, content: 'followup' }];
  expect(compactionCut(messages, 1000)).toBe(3);
});
it('oversized closed single turns can compact; projection does not end in assistant prefill or reissue the old read', () => {
  const messages = [{ role: 'user' as const, content: 'Read file once' }, ...call('readFile', { path: 'a' }, 'read').messages,
    { role: 'tool' as const, content: [{ type: 'tool-result' as const, toolCallId: 'read', toolName: 'readFile', output: { type: 'text' as const, value: 'x'.repeat(40000) } }] }];
  expect(compactionCut(messages)).toBe(3);
  const projection = projectedMessages({ messages, compactions: [{ summary: 'File read completed. Exact evidence ABC.', keptFrom: 3, at: 'now' }] } as Parameters<typeof projectedMessages>[0]);
  expect(projection.at(-1)?.role).toBe('user');
  expect(String(projection.at(-1)?.content)).toContain('Do not repeat');
});
it('a cancelled host attempt requires explicit inspection before a successor run', async () => {
  let release!: () => void, count = 0;
  const { runtime, root } = await setup(async () => ++count === 1 ? call('runCode', { code: 'console.log(1)', cwd: '.', timeoutMs: 1000 }) : answer('done'), {
    hostEnabled: () => true, executeHost: async () => { await new Promise<void>(r => { release = r; }); throw new Error('interrupted'); }
  });
  const task = runtime.create('host', 'general', root); await until(() => runtime.list()[0].status === 'awaiting_approval');
  const action = runtime.list()[0].approval!; runtime.decide(task.id, action.id, action.digest, true);
  await until(() => typeof release === 'function'); runtime.cancel(task.id); release();
  await until(() => runtime.list()[0].unknownEffect === true);
  expect(() => runtime.send(task.id, 'again', 'followup', crypto.randomUUID())).toThrow('Inspect unknown');
  await new Promise(r => setImmediate(r)); runtime.resolveUnknown(task.id);
  expect(runtime.list()[0].status).toBe('cancelled');
  expect(runtime.list()[0].unknownEffect).toBe(false);
});
it('normalizes only present supplier fields; missing cache is not an actual zero', () => {
  const usage = { inputTokens: 100, outputTokens: 10, totalTokens: 110, inputTokenDetails: { cacheReadTokens: 0, noCacheTokens: 100, cacheWriteTokens: undefined }, outputTokenDetails: { reasoningTokens: 0, textTokens: 10 }, raw: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } };
  expect(normalizedUsage(usage as Parameters<typeof normalizedUsage>[0])).toMatchObject({ input: 100, output: 10, state: 'reported' });
  expect(normalizedUsage(usage as Parameters<typeof normalizedUsage>[0])?.cacheRead).toBeUndefined();
  expect(normalizedUsage({ ...usage, raw: { ...usage.raw, prompt_cache_hit_tokens: 80 } } as Parameters<typeof normalizedUsage>[0])?.cacheRead).toBe(80);
});
it('imports reviewed snapshots as disabled skills, loads on demand and denies references outside bundle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent47-skills-'));
  const source = join(root, 'source'); await mkdir(source);
  await writeFile(join(source, 'SKILL.md'), '---\nname: sample-review\ndescription: Review sample materials\n---\nRead references/check.md before reviewing.');
  await mkdir(join(source, 'references')); await writeFile(join(source, 'references', 'check.md'), 'Check evidence.');
  const registry = new SkillRegistry(join(root, 'installed')); await registry.start();
  const preview = await registry.preview(source); await registry.install(preview.ticket);
  expect(registry.catalog()).toEqual([]); expect(() => registry.load('sample-review')).toThrow('disabled');
  await registry.set('sample-review', true);
  expect(registry.catalog()).toHaveLength(1);
  expect(registry.load('sample-review')).toMatchObject({ grantsPermissions: false });
  expect(await registry.read('sample-review', 'references/check.md')).toMatchObject({ content: 'Check evidence.' });
  await expect(registry.read('sample-review', '../escape')).rejects.toThrow();
  await registry.set('sample-review', false); expect(() => registry.load('sample-review')).toThrow();
});
