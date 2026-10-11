import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskRuntime } from '../src/core/runtime';
import { TaskStore } from '../src/core/store';
import { effectDigest } from '../src/core/effects';
import type { Approval } from '../src/shared/contracts';
import type { RuntimeServices } from '../src/core/runtime';
const open: { store: TaskStore; runtime: TaskRuntime }[] = [];
afterEach(async () => { for (const item of open.splice(0)) { item.runtime.shutdown(); await new Promise(r => setImmediate(r)); item.store.close(); } });
async function wait(condition: () => boolean) { const end = Date.now() + 10000; while (!condition()) { if (Date.now() > end) throw new Error('Timeout'); await new Promise(r => setTimeout(r, 5)); } }
async function setup(trusted = false, failure = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-browser-runtime-'))), store = new TaskStore(join(root, 'tasks.db'));
  const execute = vi.fn(async () => { if (failure) throw new Error('Transport interrupted after dispatch'); return { dispatched: true, verifiedOutcome: false }; });
  const browser: NonNullable<RuntimeServices['browser']> = {
    tabs: () => [{ tabId: 'unit', mode: trusted ? 'allow' : 'ask' }], read: async () => ({ untrusted: true }),
    prepare: async (taskId, call) => {
      const a: Approval = { id: call.toolCallId, kind: 'browser', name: 'Click test', content: 'Exact target', payload: { tabId: 'unit' }, state: 'pending', expiresAt: new Date(Date.now() + 60000).toISOString(), digest: '' };
      a.digest = effectDigest(taskId, a); return a;
    }, validate: () => trusted, execute
  };
  let step = 0;
  const runtime = new TaskRuntime(store, async () => ++step === 1 ? {
    text: '', calls: [{ toolName: 'browserClick', toolCallId: 'click-test', input: {} }],
    messages: [{ role: 'assistant', content: [{ type: 'tool-call', toolName: 'browserClick', toolCallId: 'click-test', input: {} }] }]
  } : { text: 'Done', calls: [], messages: [{ role: 'assistant', content: 'Done' }] }, join(root, 'artifacts'), () => {}, { browser });
  open.push({ runtime, store }); runtime.start(); const task = runtime.create('Controlled test', 'general');
  return { runtime, store, task, execute, browser };
}
it('changing browser scope resumes stale approval as an error without executing it', async () => {
  const { runtime, execute, task, browser } = await setup();
  await wait(() => runtime.list()[0].status === 'awaiting_approval');
  browser.validate = () => { throw new Error('Browser grant generation changed'); };
  runtime.browserPermissionsChanged(task.id);
  await wait(() => runtime.list()[0].status === 'completed');
  expect(execute).not.toHaveBeenCalled();
});
it('browser exact-payload approval cannot be converted into file permission', async () => {
  const { runtime, task, execute } = await setup(); await wait(() => runtime.list()[0].status === 'awaiting_approval');
  const a = runtime.list()[0].approval!;
  expect(execute).not.toHaveBeenCalled();
  expect(() => runtime.decide(task.id, a.id, a.digest, true, 'files')).toThrow();
  runtime.decide(task.id, a.id, a.digest, false); await wait(() => runtime.list()[0].status === 'completed');
  expect(execute).not.toHaveBeenCalled();
});
it('trusted browser grant dispatches once and records honest result', async () => {
  const { runtime, store, task, execute } = await setup(true); await wait(() => runtime.list()[0].status === 'completed');
  expect(execute).toHaveBeenCalledTimes(1); expect(store.get(task.id).effectStarted).toBeUndefined();
  expect(JSON.stringify(store.get(task.id).messages)).toContain('"verifiedOutcome":false');
});
it('unknown remote effect does not auto-replay on restart', async () => {
  const { runtime, store, task, execute } = await setup(true, true);
  await wait(() => runtime.list()[0].status === 'awaiting_reconciliation');
  expect(store.get(task.id).effectStarted).toBe('click-test'); runtime.start();
  await new Promise(r => setTimeout(r, 20)); expect(execute).toHaveBeenCalledTimes(1);
  runtime.resolveUnknown(task.id);
  await wait(() => runtime.list()[0].status === 'completed');
  expect(execute).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(store.get(task.id).messages)).toContain('this does not verify success');
  expect(JSON.stringify(store.get(task.id).messages)).not.toContain('Previous host execution');
});
it('routes wait as a read-only tool, records timeout honestly, and exposes waiting state before completion', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-browser-wait-runtime-'))), store = new TaskStore(join(root, 'tasks.db'));
  let step = 0, startedState = false;
  const read = vi.fn(async (id: string, name: string) => {
    startedState = store.get(id).events.some(e => e.kind === 'system' && e.text.includes('有界等待'));
    expect(name).toBe('browserWait'); expect(store.get(id).effectStarted).toBeUndefined();
    return { outcome: 'timed_out', verifiedOutcome: false };
  });
  const runtime = new TaskRuntime(store, async () => ++step === 1 ? {
    text: '', calls: [{ toolCallId: 'wait-test', toolName: 'browserWait', input: { tabId: crypto.randomUUID(), condition: { kind: 'loaded' }, timeoutMs: 250 } }],
    messages: [{ role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'wait-test', toolName: 'browserWait', input: {} }] }]
  } : { text: 'Not observed', calls: [], messages: [{ role: 'assistant', content: 'Not observed' }] },
  join(root, 'artifacts'), () => {}, { browser: { read, tabs: () => [], prepare: async () => { throw new Error('Must not approve wait'); }, validate: () => false, execute: async () => { throw new Error('Must not dispatch wait'); } } });
  open.push({ runtime, store }); runtime.start(); const task = runtime.create('Wait', 'general');
  await wait(() => store.get(task.id).status === 'completed');
  expect(startedState).toBe(true); expect(read).toHaveBeenCalledOnce();
  expect(store.get(task.id).progress).toMatchObject({ tools: 1, errors: 0 });
  expect(JSON.stringify(store.get(task.id).messages)).toContain('timed_out');
});
