import { afterEach, expect, it } from 'vitest';
import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { TaskStore } from '../src/core/store';
import { TaskRuntime, type RuntimeServices } from '../src/core/runtime';
import type { ModelDriver, ModelStep } from '../src/core/model';
import { FileSnapshots } from '../src/core/snapshots';
const resources: { runtime: TaskRuntime; store: TaskStore }[] = [];
afterEach(async () => { for (const r of resources.splice(0)) { r.runtime.shutdown(); await new Promise(r => setTimeout(r, 20)); r.store.close(); } });
const answer = (): ModelStep => ({ text: 'done', calls: [], messages: [{ role: 'assistant', content: 'done' }] });
const calls = (...items: { name: string; input: unknown }[]): ModelStep => {
  const calls = items.map(i => ({ toolCallId: randomUUID(), toolName: i.name, input: i.input }));
  return { text: '', calls, messages: [{ role: 'assistant', content: calls.map(c => ({ type: 'tool-call' as const, ...c })) }] };
};
async function setup(model: ModelDriver, services: RuntimeServices = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-pause-'))), store = new TaskStore(join(root, 'tasks.db'));
  const runtime = new TaskRuntime(store, model, join(root, 'artifacts'), () => {}, services);
  resources.push({ runtime, store }); runtime.start(); return { runtime, store, root };
}
async function wait(fn: () => boolean) { const end = Date.now() + 45000; while (!fn()) { if (Date.now() > end) throw new Error('Timeout'); await new Promise(r => setTimeout(r, 5)); } }
it('12 steps close into a resumable window, preserving id, usage, results and no replay', async () => {
  let n = 0;
  const { runtime, store, root } = await setup(async () => ++n <= 13 ? calls({ name: 'readFile', input: { path: `${n}.md` } }) : answer());
  for (let i = 1; i <= 13; i++) await writeFile(join(root, `${i}.md`), `evidence-${i}`);
  const t = runtime.create('long task', 'general', root);
  await wait(() => store.get(t.id).status === 'paused');
  expect(store.get(t.id)).toMatchObject({ steps: 12, pause: { reason: 'window' }, pending: [] });
  const oldResults = JSON.stringify(store.get(t.id).messages.filter(m => m.role === 'tool'));
  runtime.resume(t.id); await wait(() => store.get(t.id).status === 'completed');
  expect(store.get(t.id).steps).toBe(14); expect(store.get(t.id).usage).toHaveLength(14);
  expect(JSON.stringify(store.get(t.id).messages.filter(m => m.role === 'tool'))).toContain(oldResults.slice(1, -1));
  expect(runtime.list()).toHaveLength(1); expect(store.get(t.id).progress?.window).toBe(2);
  expect(() => runtime.resume(t.id)).toThrow(); expect(() => runtime.pause(t.id)).toThrow();
});
it('manual model interruption marks unknown usage, never executes an uncommitted intent', async () => {
  let n = 0;
  const { runtime, store } = await setup(async (_m, _id, signal) => {
    if (++n > 1) return answer();
    await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abort')), { once: true }));
    return calls({ name: 'writeArtifact', input: { name: 'bad.md', content: 'bad' } });
  });
  const t = runtime.create('pause streaming', 'general');
  await wait(() => !!store.get(t.id).usage?.length); runtime.pause(t.id);
  await wait(() => store.get(t.id).status === 'paused');
  expect(store.get(t.id).pending).toEqual([]); expect(store.get(t.id).usage?.[0].state).toBe('unknown');
  runtime.resume(t.id); await wait(() => store.get(t.id).status === 'completed');
  expect(store.get(t.id).usage).toHaveLength(2); expect(store.get(t.id).artifacts).toEqual([]);
});
it('in-flight host effect settles exactly once; remainder of tool batch stays pinned', async () => {
  let release!: () => void, executions = 0, signalAborted = false, n = 0;
  const gate = new Promise<void>(r => { release = r; });
  const { runtime, store, root } = await setup(async () => ++n === 1 ? calls(
    { name: 'runCode', input: { cwd: '.', code: 'return 1' } }, { name: 'listSkills', input: {} }) : answer(),
  { hostEnabled: () => true, executeHost: async (_a, signal) => { executions++; await gate; signalAborted = signal.aborted; return { stdout: 'actual' }; } });
  const t = runtime.create('host', 'general', root); runtime.setPermissions(t.id, 'ask', 'allow');
  await wait(() => !!store.get(t.id).effectStarted); runtime.pause(t.id);
  expect(store.get(t.id).pauseRequested).toBe(true); expect(() => runtime.resume(t.id)).toThrow();
  release(); await wait(() => store.get(t.id).status === 'paused');
  expect(signalAborted).toBe(false); expect(store.get(t.id).pending).toHaveLength(1);
  runtime.resume(t.id); await wait(() => store.get(t.id).status === 'completed');
  expect(executions).toBe(1); expect(store.get(t.id).progress?.tools).toBe(2);
});
it('pause survives actual store reopen without model calls or release of approvals', async () => {
  const { runtime, store, root } = await setup(async () => calls({ name: 'writeArtifact', input: { name: 'a.md', content: 'a' } }));
  const t = runtime.create('review', 'general');
  await wait(() => store.get(t.id).status === 'awaiting_approval');
  const approval = store.get(t.id).approval!;
  runtime.pause(t.id); runtime.shutdown(); store.close(); resources.pop();
  let invoked = 0; const nextStore = new TaskStore(join(root, 'tasks.db'));
  const next = new TaskRuntime(nextStore, async () => { invoked++; return answer(); }, join(root, 'artifacts'));
  resources.push({ runtime: next, store: nextStore }); next.start();
  await new Promise(r => setTimeout(r, 30)); expect(invoked).toBe(0);
  next.resume(t.id); expect(nextStore.get(t.id).status).toBe('awaiting_approval');
  expect(nextStore.get(t.id).approval?.digest).toBe(approval.digest);
  next.decide(t.id, approval.id, approval.digest, true); await wait(() => nextStore.get(t.id).status === 'completed');
});
it('question draft is preserved while paused and cannot be submitted until resumed', async () => {
  const { runtime, store } = await setup(async () => calls({ name: 'askUser', input: { question: 'which?' } }));
  const t = runtime.create('question', 'general'); await wait(() => store.get(t.id).status === 'awaiting_input');
  const q = store.get(t.id).question!; runtime.pause(t.id);
  expect(store.get(t.id).question?.id).toBe(q.id);
  expect(() => runtime.respondQuestion({ taskId: t.id, questionId: q.id, revision: q.revision!, digest: q.digest!, clientCommandId: randomUUID(), result: 'cancel', answers: [] })).toThrow();
  runtime.resume(t.id); expect(store.get(t.id).status).toBe('awaiting_input');
});
it('three identical read observations pause; continuation retains counts and permits a new response', async () => {
  let n = 0;
  const { runtime, store } = await setup(async () => ++n <= 3 ? calls({ name: 'listSkills', input: {} }) : answer());
  const t = runtime.create('repeated reads', 'general'); await wait(() => store.get(t.id).status === 'paused');
  expect(store.get(t.id)).toMatchObject({ pause: { reason: 'repeated_tool' }, progress: { tools: 3 } });
  runtime.resume(t.id); await wait(() => store.get(t.id).status === 'completed');
  expect(store.get(t.id).progress?.tools).toBe(3);
});
it('changing observations do not count as no progress', async () => {
  let n = 0, observation = 0;
  const { runtime, store } = await setup(async () => ++n <= 4 ? calls({ name: 'listSkills', input: {} }) : answer(),
    { skills: { catalog: () => [{ revision: ++observation }], load: () => ({}), read: async () => ({}) } });
  const t = runtime.create('poll changed', 'general'); await wait(() => store.get(t.id).status === 'completed');
  expect(store.get(t.id).progress?.tools).toBe(4);
});
it('four consecutive different tool errors pause and do not become a failed run', async () => {
  let n = 0;
  const { runtime, store } = await setup(async () => calls({ name: 'readFile', input: { path: `missing-${++n}` } }));
  const t = runtime.create('errors', 'general'); await wait(() => store.get(t.id).status === 'paused');
  expect(store.get(t.id)).toMatchObject({ pause: { reason: 'errors' }, progress: { errors: 4 } });
});
it('third identical effect intent is paused BEFORE dispatch', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-repeat-write-'))), snapshots = new FileSnapshots(join(root, 'snapshots'));
  const { runtime, store } = await setup(async () => calls({ name: 'makeDirectory', input: { path: 'folder' } }), { snapshots });
  const t = runtime.create('repeat directory', 'general', root, 'snapshot');
  await wait(() => store.get(t.id).status === 'paused');
  expect(store.get(t.id).progress?.tools).toBe(2); expect(store.get(t.id).pending).toHaveLength(1);
  expect(store.get(t.id).pause?.reason).toBe('repeated_tool');
});
it('queued/steering supplements remain paused and do not implicitly authorize or resume', async () => {
  let n = 0;
  const { runtime, store } = await setup(async () => ++n === 1 ? calls({ name: 'writeArtifact', input: { name: 'no.md', content: 'no' } }) : answer());
  const t = runtime.create('pending write', 'general'); await wait(() => store.get(t.id).status === 'awaiting_approval'); runtime.pause(t.id);
  const key = randomUUID(); runtime.send(t.id, 'do not write', 'queue', key, true);
  runtime.manageQueue(t.id, key, 'send');
  expect(store.get(t.id).status).toBe('paused'); expect(store.get(t.id).approval?.state).toBe('denied');
  runtime.resume(t.id); await wait(() => store.get(t.id).status === 'completed');
  expect(store.get(t.id).artifacts).toHaveLength(0);
});
it('unknown remote effect cannot be paused or resumed as if it succeeded', async () => {
  const { runtime, store } = await setup(async () => answer());
  const t = runtime.create('unknown', 'general'); await wait(() => store.get(t.id).status === 'completed');
  const record = store.get(t.id); record.status = 'awaiting_reconciliation'; record.effectStarted = 'unknown'; store.save(record);
  expect(() => runtime.pause(t.id)).toThrow(); expect(() => runtime.resume(t.id)).toThrow();
  expect(store.get(t.id).status).toBe('awaiting_reconciliation');
});
it('manual pause requests survive restart and a stopped paused run is terminal', async () => {
  const { runtime, store } = await setup(async () => answer());
  const t = runtime.create('restart request', 'general'); await wait(() => store.get(t.id).status === 'completed');
  const record = store.get(t.id); record.status = 'running'; record.pauseRequested = true; store.save(record);
  runtime.start(); expect(store.get(t.id).status).toBe('paused');
  runtime.cancel(t.id); expect(store.get(t.id).status).toBe('cancelled'); expect(() => runtime.resume(t.id)).toThrow();
});
it('file effect pause preserves material source changes as reality, not rollback', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-pause-file-'))); await writeFile(join(root, 'read.md'), 'real');
  let n = 0; const { runtime, store } = await setup(async () => ++n === 1 ? calls({ name: 'readFile', input: { path: 'read.md' } }) : answer(), { executionWindow: 1 });
  const t = runtime.create('window read', 'general', root); await wait(() => store.get(t.id).status === 'paused');
  expect(store.get(t.id).progress?.tools).toBe(1); const old = store.get(t.id).messages.filter(m => m.role === 'tool');
  runtime.resume(t.id); await wait(() => store.get(t.id).status === 'completed');
  expect(store.get(t.id).messages.filter(m => m.role === 'tool')).toEqual(old);
});
