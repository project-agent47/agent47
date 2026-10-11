import { afterEach, expect, it } from 'vitest';
import { mkdtemp as createTemp, realpath, readFile, writeFile, mkdir, lstat, symlink, link, readdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
const mkdtemp = async (prefix: string) => realpath(await createTemp(prefix));
import { join } from 'node:path';
import { FileSnapshots } from '../src/core/snapshots';
import { prepareEffect } from '../src/core/effects';
import { sha256 } from '../src/core/tools';
import { TaskStore } from '../src/core/store';
import { TaskRuntime, type RuntimeServices } from '../src/core/runtime';
import type { ModelDriver, ModelStep } from '../src/core/model';

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'agent47-snapshots-'));
  const project = join(root, 'project'); await mkdir(project);
  return { root, project, snapshots: new FileSnapshots(join(root, 'snapshots')) };
}
async function action(root: string, name: string, input: unknown, id = 'call-one') {
  const approved = await prepareEffect('task-one', { toolName: name, input, toolCallId: id }, root, false);
  approved.state = 'approved'; return approved;
}
it('creates nested parents with shell disabled; snapshots replay without replacing the original backup', async () => {
  const { root, project, snapshots } = await setup();
  const approved = await action(project, 'writeFile', { path: 'governance/policies/README.md', content: 'hello', expectedHash: null });
  const first = await snapshots.apply('task-one', approved);
  expect(await readFile(join(project, first.path), 'utf8')).toBe('hello');
  expect((await snapshots.apply('task-one', approved)).replayVerified).toBe(true);
  expect((await readdir(join(root, 'snapshots', 'task-one'))).length).toBe(1);
  await new FileSnapshots(join(root, 'snapshots')).restore('task-one', first.snapshotId);
  await expect(lstat(join(project, 'governance'))).rejects.toThrow();
  await expect(snapshots.apply('task-one', approved)).rejects.toThrow('replay conflict');
});
it('restores existing text and preserves permissions after restarting the snapshot service', async () => {
  const { root, project, snapshots } = await setup();
  await writeFile(join(project, 'a.md'), 'old'); await chmod(join(project, 'a.md'), 0o644);
  const approved = await action(project, 'editFile', { path: 'a.md', oldText: 'old', newText: 'new', expectedHash: sha256('old') });
  const changed = await snapshots.apply('task-one', approved);
  if (process.platform !== 'win32') expect((await lstat(join(project, 'a.md'))).mode & 0o777).toBe(0o644);
  await new FileSnapshots(join(root, 'snapshots')).restore('task-one', changed.snapshotId);
  expect(await readFile(join(project, 'a.md'), 'utf8')).toBe('old');
});
it('restoration refuses external changes and does not destroy them', async () => {
  const { project, snapshots } = await setup();
  const changed = await snapshots.apply('task-one', await action(project, 'writeFile', { path: 'a.md', content: 'agent', expectedHash: null }));
  await writeFile(join(project, 'a.md'), 'human');
  await expect(snapshots.restore('task-one', changed.snapshotId)).rejects.toThrow('Snapshot conflict');
  expect(await readFile(join(project, 'a.md'), 'utf8')).toBe('human');
});
it('makeDirectory creates and restores empty trees without shell', async () => {
  const { project, snapshots } = await setup();
  const changed = await snapshots.apply('task-one', await action(project, 'makeDirectory', { path: 'a/b/c' }));
  expect((await lstat(join(project, 'a/b/c'))).isDirectory()).toBe(true);
  await snapshots.restore('task-one', changed.snapshotId);
  await expect(lstat(join(project, 'a'))).rejects.toThrow();
});
it('restoring a directory never deletes content added afterwards', async () => {
  const { project, snapshots } = await setup();
  const changed = await snapshots.apply('task-one', await action(project, 'makeDirectory', { path: 'a/b' }));
  await writeFile(join(project, 'a/b/human.txt'), 'keep');
  await expect(snapshots.restore('task-one', changed.snapshotId)).rejects.toThrow('no longer empty');
  expect(await readFile(join(project, 'a/b/human.txt'), 'utf8')).toBe('keep');
});
it('backup failure prevents project directories and files from being created', async () => {
  const { root, project } = await setup();
  const broken = join(root, 'not-a-directory'); await writeFile(broken, 'blocked');
  const snapshots = new FileSnapshots(broken);
  await expect(snapshots.apply('task-one', await action(project, 'writeFile', { path: 'a/b.md', content: 'x', expectedHash: null }))).rejects.toThrow();
  expect(await readdir(project)).toEqual([]);
});
it('rejects traversal, secret, absolute, missing-root and linked targets', async () => {
  const { project } = await setup();
  for (const path of ['../x.md', 'a/../../x.md', 'a/.env', 'a/private.key', '/tmp/x.md', 'a\\b.md', 'a:b.md']) {
    await expect(action(project, 'writeFile', { path, content: 'x', expectedHash: null })).rejects.toThrow();
  }
  await expect(action(join(project, 'nonexistent'), 'writeFile', { path: 'a.md', content: 'x', expectedHash: null })).rejects.toThrow();
  await writeFile(join(project, 'one.md'), 'x'); await link(join(project, 'one.md'), join(project, 'two.md'));
  await expect(action(project, 'editFile', { path: 'one.md', oldText: 'x', newText: 'y', expectedHash: sha256('x') })).rejects.toThrow('non-linked');
  if (process.platform !== 'win32') {
    await symlink(project, join(project, 'shortcut'));
    await expect(action(project, 'writeFile', { path: 'shortcut/x.md', content: 'x', expectedHash: null })).rejects.toThrow('Symlinks');
  }
});
it('restores multiple edits in reverse order with their own original content', async () => {
  const { project, snapshots } = await setup();
  await writeFile(join(project, 'a.md'), 'one');
  const first = await snapshots.apply('task-one', await action(project, 'writeFile', { path: 'a.md', content: 'two', expectedHash: sha256('one') }, 'first'));
  const second = await snapshots.apply('task-one', await action(project, 'writeFile', { path: 'a.md', content: 'three', expectedHash: sha256('two') }, 'second'));
  await expect(snapshots.restore('task-one', first.snapshotId)).rejects.toThrow('Snapshot conflict');
  await snapshots.restore('task-one', second.snapshotId); await snapshots.restore('task-one', first.snapshotId);
  expect(await readFile(join(project, 'a.md'), 'utf8')).toBe('one');
});

const resources: { runtime: TaskRuntime; store: TaskStore }[] = [];
afterEach(async () => { for (const item of resources.splice(0)) { item.runtime.shutdown(); await new Promise(r => setImmediate(r)); item.store.close(); } });
const answer = (): ModelStep => ({ text: 'done', messages: [{ role: 'assistant', content: 'done' }], calls: [] });
const call = (name: string, input: unknown): ModelStep => {
  const id = crypto.randomUUID(); return { text: '', calls: [{ toolName: name, input, toolCallId: id }],
    messages: [{ role: 'assistant', content: [{ type: 'tool-call', toolName: name, input, toolCallId: id }] }] };
};
async function until(predicate: () => boolean) {
  const end = Date.now() + 5000; while (!predicate()) { if (Date.now() > end) throw new Error('Timeout'); await new Promise(r => setTimeout(r, 5)); }
}
async function runtimeSetup(model: ModelDriver, mode: 'snapshot' | 'ask' = 'snapshot', hostEnabled = false, extra: Pick<RuntimeServices, 'skills'> = {}) {
  const data = await setup(); const store = new TaskStore(join(data.root, 'tasks.db'));
  const executions: string[] = [];
  const runtime = new TaskRuntime(store, model, join(data.root, 'artifacts'), undefined, {
    snapshots: data.snapshots, fileMode: () => mode, hostEnabled: () => hostEnabled,
    executeHost: async approval => { executions.push(approval.content); return { output: 'host' }; }, ...extra
  });
  resources.push({ runtime, store }); runtime.start(); return { ...data, runtime, store, executions };
}
it('auto-snapshot mode completes multiple nested file changes without approval pauses, then restores', async () => {
  let step = 0;
  const { runtime, project } = await runtimeSetup(async () => ++step === 1 ? call('writeFile', { path: 'a/b.md', content: 'one', expectedHash: null }) :
    step === 2 ? call('writeFile', { path: 'a/c.md', content: 'two', expectedHash: null }) : answer());
  const task = runtime.create('many files', 'general', project); await until(() => runtime.list()[0].status === 'completed');
  expect(runtime.list()[0].fileChanges).toHaveLength(2);
  expect(await readFile(join(project, 'a/b.md'), 'utf8')).toBe('one');
  const changes = runtime.list()[0].fileChanges!;
  await runtime.restoreFile(task.id, changes[1].id); await runtime.restoreFile(task.id, changes[0].id);
  await expect(lstat(join(project, 'a'))).rejects.toThrow();
});
it('switching a waiting file review to snapshots resumes without repeated approve clicks', async () => {
  let step = 0;
  const { runtime, project } = await runtimeSetup(async () => ++step === 1 ? call('writeFile', { path: 'a/b.md', content: 'x', expectedHash: null }) : answer(), 'ask');
  const task = runtime.create('write', 'general', project); await until(() => runtime.list()[0].status === 'awaiting_approval');
  runtime.setPermissions(task.id, 'snapshot', 'ask'); await until(() => runtime.list()[0].status === 'completed');
  expect(await readFile(join(project, 'a/b.md'), 'utf8')).toBe('x');
});
it('trusted host scope executes consecutive commands once and is inherited by a continuation', async () => {
  let step = 0;
  const { runtime, project, executions } = await runtimeSetup(async () => ++step <= 2 ? call('runShell', { command: `echo ${step}` }) : answer(), 'snapshot', true);
  const task = runtime.create('commands', 'general', project); await until(() => runtime.list()[0].status === 'awaiting_approval');
  runtime.setPermissions(task.id, 'snapshot', 'allow'); await until(() => runtime.list()[0].status === 'completed');
  expect(executions).toEqual(['echo 1', 'echo 2']);
  const next = runtime.send(task.id, 'next', 'followup', crypto.randomUUID());
  expect(next.hostMode).toBe('allow'); expect(next.fileMode).toBe('snapshot');
});
it('host scope cannot be granted while disabled or without a selected project', async () => {
  const { runtime, project } = await runtimeSetup(async () => answer());
  const task = runtime.create('hello', 'general', project);
  expect(() => runtime.setPermissions(task.id, 'snapshot', 'allow')).toThrow('启用');
});
it('file restore is blocked during a live run', async () => {
  let release!: () => void, step = 0;
  const { runtime, project } = await runtimeSetup(async () => {
    if (++step === 1) return call('writeFile', { path: 'a.md', content: 'x', expectedHash: null });
    await new Promise<void>(r => { release = r; }); return answer();
  });
  const task = runtime.create('write', 'general', project); await until(() => !!release);
  await expect(runtime.restoreFile(task.id, runtime.list()[0].fileChanges![0].id)).rejects.toThrow('停止');
  release(); await until(() => runtime.list()[0].status === 'completed');
});
it('artifact delivery also avoids repeated approval in snapshot mode', async () => {
  let step = 0;
  const { runtime } = await runtimeSetup(async () => ++step === 1 ? call('writeArtifact', { name: 'answer.md', content: 'answer' }) : answer());
  runtime.create('deliver', 'general'); await until(() => runtime.list()[0].status === 'completed');
  expect(runtime.list()[0].artifacts).toHaveLength(1);
});
it('restoration is visible to the model in the next turn, without replaying prior tools', async () => {
  let step = 0;
  const { runtime, project } = await runtimeSetup(async messages => {
    if (++step === 1) return call('writeFile', { path: 'a.md', content: 'new', expectedHash: null });
    if (step === 3) expect(JSON.stringify(messages)).toContain('user restored a.md');
    return answer();
  });
  const task = runtime.create('write', 'general', project); await until(() => runtime.list()[0].status === 'completed');
  await runtime.restoreFile(task.id, runtime.list()[0].fileChanges![0].id);
  runtime.send(task.id, 'inspect', 'followup', crypto.randomUUID()); await until(() => runtime.list()[0].status === 'completed');
  expect(step).toBe(3);
});
it('restore retries reconcile a completed on-disk restore without applying it again', async () => {
  const { project, snapshots } = await setup();
  const saved = await snapshots.apply('task-one', await action(project, 'writeFile', { path: 'a.md', content: 'new', expectedHash: null }));
  await snapshots.restore('task-one', saved.snapshotId);
  // Disk restore committed, but TaskStore update may not have happened.
  await expect(snapshots.restore('task-one', saved.snapshotId)).resolves.toBeUndefined();
});
it('restore refuses a cancelled task whose file effect is still in flight', async () => {
  let step = 0, release!: () => void;
  const { runtime, project, snapshots } = await runtimeSetup(async () => ++step === 1 ? call('writeFile', { path: 'a.md', content: 'one', expectedHash: null }) :
    step === 3 ? call('writeFile', { path: 'a.md', content: 'two', expectedHash: sha256('one') }) : answer());
  const first = runtime.create('first', 'general', project); await until(() => runtime.list()[0].status === 'completed');
  const snapshotId = runtime.list()[0].fileChanges![0].id;
  const apply = snapshots.apply.bind(snapshots);
  snapshots.apply = async (...args) => { await new Promise<void>(r => { release = r; }); return apply(...args); };
  const second = runtime.create('second', 'general', project); await until(() => !!release); runtime.cancel(second.id);
  let rejected = false;
  try { await runtime.restoreFile(first.id, snapshotId); } catch { rejected = true; }
  release(); await new Promise(r => setTimeout(r, 30));
  expect(rejected).toBe(true);
});
it('restore locks overlapping selected roots, including a running child-folder task', async () => {
  let step = 0, release!: () => void;
  const { runtime, project } = await runtimeSetup(async () => {
    if (++step === 1) return call('writeFile', { path: 'child/a.md', content: 'one', expectedHash: null });
    if (step === 3) await new Promise<void>(r => { release = r; });
    return answer();
  });
  const first = runtime.create('parent', 'general', project); await until(() => runtime.list()[0].status === 'completed');
  const snapshotId = runtime.list()[0].fileChanges![0].id;
  runtime.create('child', 'general', join(project, 'child')); await until(() => !!release);
  let rejected = false;
  try { await runtime.restoreFile(first.id, snapshotId); } catch { rejected = true; }
  release(); await until(() => runtime.list()[0].status === 'completed');
  expect(rejected).toBe(true);
});
it('an awaited skill read does not overwrite a concurrent permission revocation', async () => {
  let step = 0, release!: () => void;
  const { runtime, project } = await runtimeSetup(async () => ++step === 1 ? call('readSkillFile', { id: 'test', path: 'ref.md' }) : answer(), 'snapshot', true, {
    skills: { catalog: () => [], load: () => ({}), read: async () => { await new Promise<void>(r => { release = r; }); return { content: 'reference' }; } }
  });
  const task = runtime.create('read skill', 'general', project); await until(() => !!release);
  runtime.setPermissions(task.id, 'ask', 'ask'); release(); await until(() => runtime.list()[0].status === 'completed');
  expect(runtime.list()[0].fileMode).toBe('ask');
});
it('replays a large valid UTF-8 write using its original snapshot, not a 1MiB byte cutoff', async () => {
  const { project, snapshots } = await setup();
  const approved = await action(project, 'writeFile', { path: 'large.md', content: '字'.repeat(400000), expectedHash: null });
  await snapshots.apply('task-one', approved);
  expect((await snapshots.apply('task-one', approved)).replayVerified).toBe(true);
});
