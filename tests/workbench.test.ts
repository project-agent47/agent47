import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../src/core/store';
import { TaskRuntime } from '../src/core/runtime';
import type { ModelDriver, ModelStep } from '../src/core/model';
import { SkillRegistry } from '../src/main/skills';
import { publicIPv4, webOrigin, readWeb } from '../src/main/web';

const open: { runtime: TaskRuntime; store: TaskStore }[] = [];
afterEach(async () => { for (const item of open.splice(0)) { item.runtime.shutdown(); await new Promise(r => setImmediate(r)); item.store.close(); } });
const answer = (text = 'done'): ModelStep => ({ text, messages: [{ role: 'assistant', content: text }], calls: [] });
const call = (toolName: string, input: unknown): ModelStep => {
  const toolCallId = crypto.randomUUID();
  return { text: '', calls: [{ toolCallId, toolName, input }], messages: [{ role: 'assistant', content: [{ type: 'tool-call', toolCallId, toolName, input }] }] };
};
async function until(test: () => boolean) { const end = Date.now() + 10000; while (!test()) { if (Date.now() > end) throw new Error('Timeout'); await new Promise(r => setTimeout(r, 5)); } }
async function setup(driver: ModelDriver, services: ConstructorParameters<typeof TaskRuntime>[4] = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-workbench-')));
  const store = new TaskStore(join(root, 'tasks.db')), runtime = new TaskRuntime(store, driver, join(root, 'artifacts'), undefined, services);
  open.push({ runtime, store }); runtime.start(); return { runtime, store, root };
}
it('queues multiple messages durably, deletes one, then delivers together without aborting the model', async () => {
  let release!: () => void, step = 0, aborted = false, observed = '';
  const { runtime, store } = await setup(async (messages, _id, signal) => {
    if (++step === 1) {
      signal.addEventListener('abort', () => { aborted = true; }); await new Promise<void>(r => { release = r; });
      const first = call('listFiles', { path: '.' }), second = call('listFiles', { path: '.' });
      return { text: '', calls: [...first.calls, ...second.calls], messages: [...first.messages, ...second.messages] };
    }
    observed = JSON.stringify(messages); return answer();
  });
  const task = runtime.create('goal', 'general'); await until(() => !!release);
  const first = crypto.randomUUID(), second = crypto.randomUUID(), third = crypto.randomUUID();
  runtime.send(task.id, 'alpha', 'queue', first); runtime.send(task.id, 'remove me', 'queue', second); runtime.send(task.id, 'beta', 'queue', third);
  runtime.manageQueue(task.id, second, 'delete');
  expect(store.get(task.id).queuedInput?.map(item => item.text)).toEqual(['alpha', 'beta']);
  expect(aborted).toBe(false); release(); await until(() => runtime.list()[0].status === 'completed');
  expect(observed).toContain('alpha'); expect(observed).toContain('beta'); expect(observed).not.toContain('remove me');
  expect(observed).toContain('pending intent superseded'); expect(runtime.list()[0].queuedInput).toEqual([]);
  expect(observed).toContain('No folder permission');
  expect(() => runtime.manageQueue(task.id, first, 'delete')).toThrow();
  runtime.send(task.id, 'alpha', 'queue', first); expect(runtime.list()).toHaveLength(1); // duplicate command stays acknowledged
});
it('immediate queue promotion aborts only the current model, records unknown usage and continues the same run', async () => {
  let entered = false, aborted = false, count = 0, observed = '';
  const { runtime, store } = await setup(async (messages, _id, signal) => {
    if (++count === 1) { entered = true; await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true })); }
    observed = JSON.stringify(messages); return answer('redirected');
  });
  const task = runtime.create('old goal', 'general'); await until(() => entered);
  const id = crypto.randomUUID(); runtime.send(task.id, 'new direction', 'queue', id);
  expect(aborted).toBe(false); runtime.manageQueue(task.id, id, 'send');
  await until(() => runtime.list()[0].status === 'completed');
  expect(aborted).toBe(true); expect(observed).toContain('new direction');
  expect(store.get(task.id).usage?.[0].state).toBe('unknown'); expect(runtime.list()).toHaveLength(1);
});
it('promoting one message does not immediately flush other messages before the next tool boundary', async () => {
  let entered = false, count = 0, second = '', third = '';
  const { runtime } = await setup(async (messages, _id, signal) => {
    if (++count === 1) { entered = true; await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); }
    if (count === 2) { second = JSON.stringify(messages); return call('listFiles', { path: '.' }); }
    third = JSON.stringify(messages); return answer();
  });
  const task = runtime.create('goal', 'general'); await until(() => entered);
  const immediate = crypto.randomUUID(); runtime.send(task.id, 'IMMEDIATE_ONLY', 'queue', immediate);
  runtime.send(task.id, 'WAIT_FOR_TOOL', 'queue', crypto.randomUUID()); runtime.manageQueue(task.id, immediate, 'send');
  await until(() => runtime.list()[0].status === 'completed');
  expect(second).toContain('IMMEDIATE_ONLY'); expect(second).not.toContain('WAIT_FOR_TOOL');
  expect(third).toContain('WAIT_FOR_TOOL'); expect(third).toContain('No folder permission');
});
it('promotion during host execution never kills or replays the effect; remaining intents are superseded', async () => {
  let release!: () => void, hostAborted = false, executions = 0, count = 0;
  const { runtime, root } = await setup(async () => ++count === 1 ? call('runCode', { code: '1', cwd: '.', timeoutMs: 1000 }) : answer(), {
    hostEnabled: () => true, executeHost: async (_approval, signal) => { executions++; signal.addEventListener('abort', () => { hostAborted = true; }); await new Promise<void>(r => { release = r; }); return { ok: true }; }
  });
  const task = runtime.create('host', 'general', root); runtime.setPermissions(task.id, 'ask', 'allow'); await until(() => !!release);
  const id = crypto.randomUUID(); runtime.send(task.id, 'change direction', 'queue', id); runtime.manageQueue(task.id, id, 'send');
  expect(hostAborted).toBe(false); release(); await until(() => runtime.list()[0].status === 'completed');
  expect(executions).toBe(1); expect(hostAborted).toBe(false);
});
it('queued messages survive restart and cancelled queues stay paused until explicitly sent', async () => {
  const { runtime, store } = await setup(async () => answer());
  const task = runtime.create('old goal', 'general'), id = crypto.randomUUID();
  runtime.send(task.id, 'later', 'queue', id); runtime.cancel(task.id);
  runtime.shutdown(); await new Promise(r => setImmediate(r));
  const restarted = new TaskRuntime(store, async () => answer(), '/unused'); restarted.start(); open.push({ runtime: restarted, store: { close: () => {} } as TaskStore });
  expect(restarted.list()[0].status).toBe('cancelled'); expect(restarted.list()[0].queuedInput).toHaveLength(1);
  const next = restarted.manageQueue(task.id, id, 'send'); expect(next.runNumber).toBe(2);
  await until(() => restarted.list()[0].status === 'completed'); expect(store.get(task.id).status).toBe('cancelled');
});
it('an explicit successor retains stopped queue text before the newest instruction, atomically clearing the old queue', async () => {
  let observed = '';
  const { runtime, store } = await setup(async messages => { observed = JSON.stringify(messages); return answer(); });
  const task = runtime.create('goal', 'general');
  runtime.send(task.id, 'older queued constraint', 'queue', crypto.randomUUID()); runtime.cancel(task.id);
  const next = runtime.send(task.id, 'newest explicit instruction', 'queue', crypto.randomUUID());
  expect(store.get(task.id).queuedInput).toEqual([]);
  await until(() => runtime.list()[0].status === 'completed');
  expect(observed.indexOf('older queued constraint')).toBeLessThan(observed.indexOf('newest explicit instruction'));
  expect(next.parentRunId).toBe(task.id);
});
it('restart honors the persisted tool boundary rather than executing another superseded intent', async () => {
  let reads = 0;
  const { runtime, store } = await setup(async () => answer(), { skills: { catalog: () => [], load: () => { reads++; return {}; }, read: async () => ({}) } });
  runtime.shutdown(); const task = runtime.create('restart', 'general');
  const record = store.get(task.id), pending = call('loadSkill', { id: 'never-run' });
  record.messages.push(...pending.messages); record.pending = pending.calls; record.inputBoundary = true;
  record.queuedInput = [{ id: crypto.randomUUID(), text: 'redirect before next tool', mode: 'queue' }]; store.save(record);
  const next = new TaskRuntime(store, async () => answer(), '/unused', undefined, { skills: { catalog: () => [], load: () => { reads++; return {}; }, read: async () => ({}) } });
  open.push({ runtime: next, store: { close: () => {} } as TaskStore }); next.start();
  await until(() => next.list()[0].status === 'completed');
  expect(reads).toBe(0); expect(store.get(task.id).queuedInput).toEqual([]);
});
async function skillFixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-skills-')));
  const source = join(root, 'source'); await mkdir(join(source, 'references'), { recursive: true });
  const put = async (value: string) => {
    await writeFile(join(source, 'SKILL.md'), `---\nname: test-skill\ndescription: test\n---\n${value}`);
    await writeFile(join(source, 'references', 'one.txt'), value);
  };
  await put('version one');
  const registry = new SkillRegistry(join(root, 'registry')); await registry.start();
  const preview = await registry.preview(source); await registry.install(preview.ticket); await registry.set('test-skill', true);
  return { registry, source, root, put, hash: preview.skill.hash };
}
it('reviews upgrades, keeps pinned resources immutable across restart, and requires re-enable', async () => {
  const { registry, source, root, put, hash } = await skillFixture();
  await put('version two'); const update = await registry.preview(source);
  expect(update.replaces).toBe(hash); expect(update.resources?.['references/one.txt']).toBe('version two');
  await registry.install(update.ticket); expect(registry.catalog()).toEqual([]);
  await registry.set('test-skill', true);
  expect((await registry.read('test-skill', 'references/one.txt', hash)).content).toBe('version one');
  expect(registry.load('test-skill').hash).toBe(update.skill.hash);
  const restart = new SkillRegistry(join(root, 'registry')); await restart.start();
  expect(restart.load('test-skill', hash).instructions).toContain('version one');
  await restart.remove('test-skill'); expect(() => restart.load('test-skill', hash)).toThrow();
  const after = new SkillRegistry(join(root, 'registry')); await after.start(); expect(after.list()).toEqual([]);
  expect(await readFile(join(root, 'registry', '.versions', 'test-skill', `${hash}.json`), 'utf8')).toContain('version one');
});
it('a stale upgrade preview cannot replace a newer reviewed package', async () => {
  const { registry, source, put } = await skillFixture();
  await put('two'); const a = await registry.preview(source);
  await put('three'); const b = await registry.preview(source);
  await registry.install(b.ticket); await expect(registry.install(a.ticket)).rejects.toThrow('changed after preview');
});
it('runtime pins first activation, passes it to references and inherits it across runs', async () => {
  const { registry, source, put, hash } = await skillFixture(); let count = 0;
  const { runtime, store } = await setup(async () => {
    if (++count === 1) return call('loadSkill', { id: 'test-skill' });
    if (count === 2) { await put('two'); const preview = await registry.preview(source); await registry.install(preview.ticket); await registry.set('test-skill', true); return call('readSkillFile', { id: 'test-skill', path: 'references/one.txt' }); }
    return answer();
  }, { skills: registry });
  const task = runtime.create('test', 'general'); await until(() => runtime.list()[0].status === 'completed');
  expect(JSON.stringify(store.get(task.id).messages)).toContain('version one');
  expect(runtime.list()[0].skillPins?.['test-skill']).toBe(hash);
  const next = runtime.send(task.id, 'again', 'queue', crypto.randomUUID()); expect(next.skillPins?.['test-skill']).toBe(hash);
  await until(() => runtime.list()[0].status === 'completed');
});
it('web access denies non-public endpoints and unapproved origins without contacting them', async () => {
  for (const value of ['http://example.com', 'https://127.0.0.1', 'https://[::1]', 'https://user:pass@example.com', 'https://example.com:8443', 'https://thing.local']) expect(() => webOrigin(value)).toThrow();
  for (const address of ['127.0.0.1', '10.0.1.2', '169.254.169.254', '100.64.0.1', '192.168.2.1', '198.18.0.2', '::1']) expect(publicIPv4(address)).toBe(false);
  expect(publicIPv4('93.184.216.34')).toBe(true);
  await expect(readWeb('https://example.com', [], new AbortController().signal)).rejects.toThrow('授权');
});
it('web revocation while reading prevents returned material entering the model', async () => {
  let count = 0, release!: () => void;
  const { runtime, store } = await setup(async () => ++count === 1 ? call('readWeb', { url: 'https://example.com' }) : answer(), {
    readWeb: async () => { await new Promise<void>(r => { release = r; }); return { content: 'DO_NOT_DELIVER' }; }
  });
  const task = runtime.create('read', 'general'); runtime.setWebOrigins(task.id, ['https://example.com']); await until(() => !!release);
  runtime.setWebOrigins(task.id, []); release(); await until(() => runtime.list()[0].status === 'completed');
  expect(JSON.stringify(store.get(task.id).messages)).not.toContain('DO_NOT_DELIVER');
});
