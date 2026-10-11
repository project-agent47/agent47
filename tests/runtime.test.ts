import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp as createTemp, realpath, mkdir, readFile, writeFile, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
const mkdtemp = async (prefix: string) => realpath(await createTemp(prefix));
import { join } from 'node:path';
import { TaskRuntime } from '../src/core/runtime';
import { TaskStore } from '../src/core/store';
import type { ModelDriver, ModelStep } from '../src/core/model';
import { approvalFor, applyArtifact, readTool, safeProjectPath } from '../src/core/tools';

const resources: { store: TaskStore; runtime: TaskRuntime }[] = [];
afterEach(async () => { for (const r of resources.splice(0)) { r.runtime.shutdown(); await new Promise(resolve => setImmediate(resolve)); r.store.close(); } });
async function setup(model: ModelDriver) {
  const root = await mkdtemp(join(tmpdir(), 'agent47-test-'));
  const store = new TaskStore(join(root, 'tasks.db'));
  const runtime = new TaskRuntime(store, model, join(root, 'artifacts'));
  resources.push({ store, runtime }); runtime.start();
  return { root, store, runtime };
}
function answer(text = '完成'): ModelStep { return { text, messages: [{ role: 'assistant', content: text }], calls: [] }; }
function call(name: string, input: unknown, id = 'call-1'): ModelStep {
  return {
    text: '', calls: [{ toolCallId: id, toolName: name, input }],
    messages: [{ role: 'assistant', content: [{ type: 'tool-call', toolCallId: id, toolName: name, input }] }]
  };
}
async function until(condition: () => boolean) {
  const end = Date.now() + (process.platform === 'win32' ? 45000 : 5000);
  while (!condition()) { if (Date.now() > end) throw new Error('Timeout'); await new Promise(resolve => setTimeout(resolve, 5)); }
}
describe('goal-driven durable runtime', () => {
  it('answers directly without forced research, approval or packaging', async () => {
    const { runtime } = await setup(async () => answer());
    const task = runtime.create('直接解释一个问题', 'general');
    await until(() => runtime.list()[0].status === 'completed');
    expect(runtime.list()[0]).toMatchObject({ id: task.id, steps: 1, artifacts: [] });
    expect(runtime.list()[0].approval).toBeUndefined();
    expect(runtime.list()[0]).not.toHaveProperty('messages');
    expect(runtime.list()[0]).not.toHaveProperty('pending');
  });
  it('does not write before exact-content approval; saves and sends result back to model', async () => {
    let n = 0;
    const { runtime, root, store } = await setup(async messages => {
      if (++n === 1) return call('writeArtifact', { name: 'result.md', content: '# real output' });
      expect(messages.at(-1)?.role).toBe('tool'); return answer('文件已保存');
    });
    const task = runtime.create('生成文件', 'deliver');
    await until(() => runtime.list()[0].status === 'awaiting_approval');
    expect(await readdir(root)).not.toContain('artifacts');
    const view = runtime.list()[0];
    runtime.decide(task.id, view.approval!.id, view.approval!.digest, true);
    await until(() => runtime.list()[0].status === 'completed');
    expect(runtime.list()[0].artifacts[0].content).toBe('# real output');
    expect(store.get(task.id).pending).toHaveLength(0);
    expect(runtime.list()[0].approval?.state).toBe('applied');
    expect(() => runtime.decide(task.id, view.approval!.id, view.approval!.digest, true)).toThrow();
  });
  it('rejects stale, cross-task and tampered approvals', async () => {
    const { runtime } = await setup(async () => call('writeArtifact', { name: 'a.md', content: 'a' }));
    const task = runtime.create('A', 'general');
    await until(() => runtime.list()[0].status === 'awaiting_approval');
    const approval = runtime.list()[0].approval!;
    expect(() => runtime.decide(task.id, 'other', approval.digest, true)).toThrow();
    expect(() => runtime.decide(task.id, approval.id, '0'.repeat(64), true)).toThrow();
    expect(runtime.list()[0].status).toBe('awaiting_approval');
  });
  it('denial produces a tool error, not a write', async () => {
    let n = 0;
    const { runtime, root } = await setup(async messages => {
      if (++n === 1) return call('writeArtifact', { name: 'a.md', content: 'a' });
      expect(JSON.stringify(messages.at(-1))).toContain('denied'); return answer('尊重拒绝');
    });
    const task = runtime.create('A', 'general');
    await until(() => runtime.list()[0].status === 'awaiting_approval');
    const approval = runtime.list()[0].approval!;
    runtime.decide(task.id, approval.id, approval.digest, false);
    await until(() => runtime.list()[0].status === 'completed');
    expect(runtime.list()[0].artifacts).toHaveLength(0);
    expect(await readdir(root)).not.toContain('artifacts');
  });
  it('expires approval rather than executing stale intent', async () => {
    const { runtime, store } = await setup(async () => call('writeArtifact', { name: 'a.md', content: 'a' }));
    const task = runtime.create('A', 'general');
    await until(() => runtime.list()[0].status === 'awaiting_approval');
    const record = store.get(task.id); record.approval!.expiresAt = '2000-01-01T00:00:00Z'; store.save(record);
    expect(() => runtime.decide(task.id, record.approval!.id, record.approval!.digest, true)).toThrow('expired');
  });
  it('continues pending approval after reopening the database without another model call', async () => {
    const { runtime, store, root } = await setup(async () => call('writeArtifact', { name: 'a.md', content: 'a' }));
    const task = runtime.create('A', 'general');
    await until(() => runtime.list()[0].status === 'awaiting_approval');
    runtime.shutdown(); store.close(); resources.pop();
    const reopened = new TaskStore(join(root, 'tasks.db'));
    let calls = 0;
    const resumed = new TaskRuntime(reopened, async () => { calls++; return answer(); }, join(root, 'artifacts'));
    resources.push({ runtime: resumed, store: reopened }); resumed.start();
    expect(calls).toBe(0);
    const approval = resumed.list()[0].approval!;
    resumed.decide(task.id, approval.id, approval.digest, true);
    await until(() => resumed.list()[0].status === 'completed');
    expect(calls).toBe(1); expect(resumed.list()[0].artifacts).toHaveLength(1);
  });
  it('recovers a running checkpoint with approved effect, verifies replay, and never re-runs a completed task', async () => {
    const { runtime, store, root } = await setup(async () => call('writeArtifact', { name: 'a.md', content: 'a' }));
    const task = runtime.create('A', 'general');
    await until(() => runtime.list()[0].status === 'awaiting_approval');
    runtime.shutdown();
    const record = store.get(task.id); record.status = 'running'; record.approval!.state = 'approved'; store.save(record);
    await applyArtifact(join(root, 'artifacts'), task.id, record.approval!); // Crash after effect, before ledger checkpoint.
    store.close(); resources.pop();
    const reopened = new TaskStore(join(root, 'tasks.db'));
    let calls = 0;
    const resumed = new TaskRuntime(reopened, async () => { calls++; return answer(); }, join(root, 'artifacts'));
    resources.push({ runtime: resumed, store: reopened }); resumed.start();
    await until(() => resumed.list()[0].status === 'completed');
    expect(resumed.list()[0].artifacts).toHaveLength(1); expect(calls).toBe(1);
    resumed.start(); await new Promise(resolve => setImmediate(resolve)); expect(calls).toBe(1);
    expect(() => resumed.cancel(task.id)).toThrow('Finished');
  });
  it('cancels a model request and ignores late output', async () => {
    let resolveModel!: (step: ModelStep) => void;
    const { runtime } = await setup(async () => new Promise(resolve => { resolveModel = resolve; }));
    const task = runtime.create('A', 'general');
    await until(() => runtime.list()[0].status === 'running');
    runtime.cancel(task.id); resolveModel(answer('late'));
    await new Promise(resolve => setImmediate(resolve));
    expect(runtime.list()[0].status).toBe('cancelled');
    expect(runtime.list()[0].events.some(e => e.text === 'late')).toBe(false);
  });
  it('pauses an identical invalid-tool loop before wasting the entire window', async () => {
    const { runtime } = await setup(async () => call('unknownTool', { path: '.' }, crypto.randomUUID()));
    runtime.create('A', 'general');
    await until(() => runtime.list()[0].status === 'paused');
    expect(runtime.list()[0].steps).toBe(3);
    expect(runtime.list()[0].pause?.reason).toBe('repeated_tool');
  });
  it('redacts arbitrary upstream error payloads', async () => {
    const { runtime } = await setup(async () => { throw new Error('Authorization: Bearer SUPER_SECRET'); });
    runtime.create('A', 'general'); await until(() => runtime.list()[0].status === 'failed');
    expect(JSON.stringify(runtime.list())).not.toContain('SUPER_SECRET');
  });
  it('sequentially processes multiple tool calls and pauses only on a write', async () => {
    const { runtime, root } = await setup(async messages => {
      if (messages.length === 1) {
        const a = call('listFiles', { path: '.' }, 'list');
        const b = call('writeArtifact', { name: 'a.md', content: 'a' }, 'write');
        return { text: '', calls: [...a.calls, ...b.calls], messages: [{ role: 'assistant', content: [
          { type: 'tool-call', toolCallId: 'list', toolName: 'listFiles', input: { path: '.' } },
          { type: 'tool-call', toolCallId: 'write', toolName: 'writeArtifact', input: { name: 'a.md', content: 'a' } }
        ] }] };
      }
      return answer();
    });
    runtime.create('A', 'general', root);
    await until(() => runtime.list()[0].status === 'awaiting_approval');
    expect(runtime.list()[0].events.some(e => e.text.startsWith('listFiles'))).toBe(true);
    expect(runtime.list()[0].approval?.id).toBe('write');
  });
});

describe('filesystem capabilities and storage integrity', () => {
  it('denies missing grants, absolute, traversal, secrets and Windows alternate paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent47-files-'));
    for (const path of ['/etc/passwd', '../secret', '.env', '.git/config', 'credentials.json', 'a\\b', 'a:b']) await expect(safeProjectPath(root, path)).rejects.toThrow();
    await expect(safeProjectPath(undefined, '.')).rejects.toThrow('No folder');
  });
  it('blocks symlink escapes for reads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent47-files-'));
    await symlink(tmpdir(), join(root, 'escape'));
    await expect(safeProjectPath(root, 'escape')).rejects.toThrow('Symlinks');
  });
  it('reads bounded text, hides secrets and rejects binary and oversized files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent47-files-'));
    await writeFile(join(root, 'hello.md'), 'hello');
    await writeFile(join(root, '.env'), 'secret');
    await writeFile(join(root, 'binary.bin'), Buffer.from([0, 1]));
    await writeFile(join(root, 'large.txt'), 'x'.repeat(65537));
    expect(await readTool(root, 'readFile', { path: 'hello.md' })).toMatchObject({ content: 'hello', untrusted: true });
    expect(JSON.stringify(await readTool(root, 'listFiles', { path: '.' }))).not.toContain('.env');
    await expect(readTool(root, 'readFile', { path: 'binary.bin' })).rejects.toThrow('Binary');
    await expect(readTool(root, 'readFile', { path: 'large.txt' })).rejects.toThrow('64 KiB');
  });
  it('artifact replay is idempotent and tampered content is never overwritten', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent47-artifacts-'));
    const approval = approvalFor('task1', 'call1', { name: 'a.md', content: 'original' }); approval.state = 'approved';
    const first = await applyArtifact(root, 'task1', approval);
    expect(await applyArtifact(root, 'task1', approval)).toEqual(first);
    const taskFolders = await readdir(join(root, 'task1'));
    const path = join(root, 'task1', taskFolders[0], 'a.md');
    await writeFile(path, 'tampered');
    await expect(applyArtifact(root, 'task1', approval)).rejects.toThrow('refusing overwrite');
    expect(await readFile(path, 'utf8')).toBe('tampered');
  });
  it('rejects unapproved or modified payload and malicious filenames', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent47-artifacts-'));
    const approval = approvalFor('task1', 'call1', { name: 'a.md', content: 'a' });
    await expect(applyArtifact(root, 'task1', approval)).rejects.toThrow('not approved');
    approval.state = 'approved'; approval.content = 'b';
    await expect(applyArtifact(root, 'task1', approval)).rejects.toThrow('changed');
    expect(() => approvalFor('task1', 'call1', { name: '../evil.exe', content: 'a' })).toThrow();
  });
  it('denies an artifact root symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent47-artifacts-'));
    await mkdir(join(root, 'outside')); await symlink(join(root, 'outside'), join(root, 'linked'));
    const approval = approvalFor('task1', 'call1', { name: 'a.md', content: 'a' }); approval.state = 'approved';
    await expect(applyArtifact(join(root, 'linked'), 'task1', approval)).rejects.toThrow('canonical');
  });
  it('refuses corrupt SQLite without replacing data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent47-corrupt-'));
    const path = join(root, 'tasks.db'); await writeFile(path, 'not a database');
    expect(() => new TaskStore(path)).toThrow();
    expect(await readFile(path, 'utf8')).toBe('not a database');
  });
});
