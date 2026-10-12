import { afterEach, expect, test } from 'vitest';
import { mkdtemp, realpath, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ProjectStore } from '../src/core/projects';
import { TaskStore, type TaskRecord } from '../src/core/store';
import { TaskRuntime } from '../src/core/runtime';
import { Resources, resourceKey, resourceSource } from '../src/main/resources';
import type { Workspace } from '../src/main/workspace';
import { sha256 } from '../src/core/tools';
import { validateRunContext } from '../src/core/project-context';
import type { MaterialSnapshot } from '../src/core/materials';
import { sdkDriver } from '../src/core/model';

const closes: (() => void)[] = [];
afterEach(() => closes.splice(0).forEach(f => f()));
const material = (path: string, content = 'ORIGINAL') : MaterialSnapshot => ({ id: randomUUID(), name: 'notes.md', path, content, sha256: sha256(content), bytes: Buffer.byteLength(content), source: 'file', capturedAt: new Date().toISOString() });
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-resources-'))), projectStore = new ProjectStore(join(root, 'projects.db')), store = new TaskStore(join(root, 'tasks.db'));
  closes.push(() => projectStore.close(), () => store.close());
  const project = projectStore.create('日常资料', randomUUID());
  const workspace = {
    openMaterial: async (m: MaterialSnapshot) => m,
    refreshMaterial: async (m: MaterialSnapshot) => material(m.path!, await readFile(m.path!, 'utf8'))
  } as unknown as Workspace;
  const resources = new Resources(projectStore, store, workspace);
  return { root, project, projectStore, store, resources };
}
test('project instructions are bounded, revision-checked and not permissions', async () => {
  const { project, projectStore, resources } = await setup();
  projectStore.saveContext(project.id, 0, { instructions: '以中文输出，不要开 Shell' });
  expect(resources.context(project.id)).toMatchObject({ revision: 1, pins: [], instructions: '以中文输出，不要开 Shell' });
  expect(() => projectStore.saveContext(project.id, 0, { instructions: 'stale' })).toThrow();
  expect(() => projectStore.saveContext(project.id, 1, { instructions: 'x'.repeat(6001) })).toThrow();
  expect(projectStore.get(project.id).rootEnabled).toBe(false);
});
test('pin dedup reuses one immutable material body across projects', async () => {
  const { root, project, projectStore, store, resources } = await setup(), m = material(join(root, 'notes.md'));
  const a = resources.pinMaterial(project.id, 0, m), b = projectStore.create('第二主题', randomUUID());
  resources.pinMaterial(b.id, 0, material(m.path!, m.content));
  expect(resources.context(b.id).pins[0].material.id).toBe(a.pins[0].material.id);
  expect(resources.list()).toHaveLength(1); expect(resources.list()[0].pins).toHaveLength(2);
  const db = new DatabaseSync(join(root, 'tasks.db')); expect(db.prepare('SELECT COUNT(*) AS count FROM material_versions').get()!.count).toBe(1); db.close();
  expect(store.material(m.id).frozen).toBe(true);
});
test('saved artifact and its project pin are one resource row', async () => {
  const { project, projectStore, store, resources } = await setup(), taskId = randomUUID();
  const m: MaterialSnapshot = { ...material('/app/artifact.md'), source: 'artifact', sourceTaskId: taskId, sourceArtifactId: 'generated-action' };
  const task: TaskRecord = { id: taskId, goal: '写周报', skill: 'general', status: 'completed', createdAt: '', updatedAt: '', steps: 1, messages: [], pending: [], events: [], artifacts: [{ id: 'generated-action', name: m.name, content: m.content, sha256: m.sha256 }] };
  store.save(task); projectStore.register(taskId, project.id); resources.pinMaterial(project.id, 0, m);
  expect(resources.list(project.id)).toHaveLength(1); expect(resources.list(project.id)[0]).toMatchObject({ kind: 'artifact', source: { kind: 'pin' }, taskId });
});
test('updating pin preserves old body and stale hash is rejected', async () => {
  const { root, project, store, resources } = await setup(), path = join(root, 'notes.md'); await writeFile(path, 'ORIGINAL');
  const first = resources.pinMaterial(project.id, 0, material(path)), pinId = first.pins[0].id, old = first.pins[0].material;
  await writeFile(path, 'NEW_VERSION'); const next = await resources.updatePin(project.id, first.revision, pinId);
  expect(next.pins[0].id).toBe(pinId); expect(next.pins[0].material.id).not.toBe(old.id); expect(store.material(old.id).content).toBe('ORIGINAL');
  await expect(resources.capture({ kind: 'pin', projectId: project.id, pinId, expectedHash: old.sha256 })).rejects.toThrow('版本已更新');
  expect((await resources.capture({ kind: 'pin', projectId: project.id, pinId, expectedHash: next.pins[0].material.sha256 })).content).toBe('NEW_VERSION');
});
test('unpin removes only future association, not archived history', async () => {
  const { root, project, store, resources } = await setup(), c = resources.pinMaterial(project.id, 0, material(join(root, 'notes.md')));
  await resources.updatePin(project.id, c.revision, c.pins[0].id, true);
  expect(resources.context(project.id).pins).toEqual([]); expect(store.material(c.pins[0].material.id).content).toBe('ORIGINAL');
});
test('revoked project directory cannot refresh pinned live file', async () => {
  const { root, project, projectStore, resources } = await setup(), folder = join(root, 'work'); await mkdir(folder);
  const p = projectStore.bind(project.id, 1, folder), c = resources.pinMaterial(project.id, 0, material(join(folder, 'notes.md')), project.id);
  projectStore.bind(project.id, p.revision + 1);
  await expect(resources.updatePin(project.id, c.revision, c.pins[0].id)).rejects.toThrow('授权项目目录');
});
test('dangling pin and incorrect origin identity fail closed', async () => {
  const { project, projectStore, store, resources, root } = await setup(), m = material(join(root, 'notes.md'));
  store.archiveMaterial({ ...m, frozen: true });
  projectStore.saveContext(project.id, 0, { pins: [{ id: randomUUID(), materialId: m.id, resourceKey: '0'.repeat(64) }] });
  expect(() => resources.context(project.id)).toThrow('binding');
  projectStore.saveContext(project.id, 1, { pins: [{ id: randomUUID(), materialId: randomUUID(), resourceKey: resourceKey(m) }] });
  expect(() => new Resources(projectStore, store, {} as Workspace)).toThrow('版本缺失');
});
test('resource IPC rejects arbitrary roots, proposals and mismatched versions', () => {
  expect(() => resourceSource.parse({ kind: 'proposal', taskId: randomUUID(), approvalId: 'x' })).toThrow();
  expect(() => resourceSource.parse({ kind: 'projectFile', projectId: randomUUID(), path: 'notes.md', root: '/unrelated' })).toThrow();
  expect(() => resourceSource.parse({ kind: 'pin', projectId: randomUUID(), pinId: randomUUID(), expectedHash: 'bad' })).toThrow();
});
test('context manifest integrity check rejects changed instructions', () => {
  const context = { projectId: randomUUID(), name: '日常', revision: 1, instructions: 'original', instructionHash: sha256('original') };
  validateRunContext(context); expect(() => validateRunContext({ ...context, instructions: 'modified' })).toThrow('hash');
});
test('AI SDK request carries current manifest with explicit replacement of history preferences', async () => {
  let body: { messages: { role: string; content: string }[] } | undefined;
  const transport: typeof fetch = async (_url, init) => {
    body = JSON.parse(String(init!.body));
    const response = { id: 'fixture', object: 'chat.completion.chunk', created: 0, model: 'deepseek-fixture', choices: [{ index: 0, delta: { role: 'assistant', content: 'done' }, finish_reason: null }] };
    const end = { ...response, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
    return new Response(`data: ${JSON.stringify(response)}\n\ndata: ${JSON.stringify(end)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  };
  const driver = sdkDriver(() => ({ baseURL: 'https://fixture.invalid/v1', model: 'deepseek-fixture', apiKey: 'synthetic' }), transport);
  await driver([{ role: 'assistant', content: 'OBSOLETE_RULE' }, { role: 'user', content: '继续' }], randomUUID(), new AbortController().signal, 'general', {
    projectContext: { projectId: randomUUID(), name: '日常', revision: 2, instructions: 'CURRENT_RULE', instructionHash: sha256('CURRENT_RULE') }
  });
  const system = body!.messages.find(m => m.role === 'system')!.content;
  expect(system).toContain('CURRENT RUN PROJECT CONTEXT:');
  expect(system).toContain('"instructions":"CURRENT_RULE"');
  expect(system).toContain('REPLACES earlier project preferences');
  expect(system.indexOf('CURRENT RUN PROJECT CONTEXT:')).toBeGreaterThan(system.indexOf('Recent observed source receipts'));
  expect(body!.messages.find(m => m.role === 'assistant')!.content).toBe('OBSOLETE_RULE');
});
test('schema one upgrade keeps a consistent backup and commits schema with context table', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-project-migration-'))), path = join(root, 'projects.db');
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('schema','1')");
  db.close();
  const upgraded = new ProjectStore(path); upgraded.close();
  const old = new DatabaseSync(path + '.before-context'), current = new DatabaseSync(path);
  expect(old.prepare("SELECT value FROM meta WHERE key='schema'").get()!.value).toBe('1');
  expect(current.prepare("SELECT value FROM meta WHERE key='schema'").get()!.value).toBe('2');
  expect(current.prepare("SELECT name FROM sqlite_master WHERE name='project_context'").get()).toBeDefined();
  old.close(); current.close();
});
test('schema two missing context table fails closed rather than silently replacing project relations', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-context-missing-'))), path = join(root, 'projects.db');
  const projects = new ProjectStore(path), p = projects.create('保留原资料', randomUUID());
  projects.saveContext(p.id, 0, { instructions: '不可静默覆盖' }); projects.close();
  const damaged = new DatabaseSync(path); damaged.exec('DROP TABLE project_context'); damaged.close();
  expect(() => new ProjectStore(path)).toThrow('Project context table missing');
  const preserved = new DatabaseSync(path);
  expect(preserved.prepare("SELECT name FROM sqlite_master WHERE name='project_context'").get()).toBeUndefined();
  expect(preserved.prepare('SELECT body FROM projects WHERE id=?').get(p.id)).toBeDefined();
  expect(preserved.prepare("SELECT value FROM meta WHERE key='schema'").get()!.value).toBe('2');
  preserved.close();
});
test('verified working-file output and its pin share one row, restored outputs disappear', async () => {
  const { root, project, projectStore, store, resources } = await setup(), taskId = randomUUID(), m = material(join(root, 'notes.md'));
  const task: TaskRecord = { id: taskId, goal: '写文件', skill: 'general', root, status: 'completed', createdAt: '', updatedAt: '', steps: 1, messages: [], pending: [], events: [], artifacts: [],
    fileChanges: [{ id: 'change', path: 'notes.md', kind: 'project_write', state: 'saved', sha256: m.sha256, bytes: m.bytes }] };
  store.save(task); projectStore.register(taskId, project.id); resources.pinMaterial(project.id, 0, m);
  expect(resources.list(project.id)).toHaveLength(1);
  expect(resources.list(project.id)[0]).toMatchObject({ kind: 'artifact', source: { kind: 'pin' } });
  await resources.updatePin(project.id, 1, projectStore.context(project.id).pins[0].id, true);
  task.fileChanges![0].state = 'restored'; store.save(task); expect(resources.list(project.id)).toHaveLength(0);
});
test('active run keeps its context snapshot, next run adopts new instructions', async () => {
  const { root, project, projectStore, store, resources } = await setup();
  projectStore.saveContext(project.id, 0, { instructions: 'FIRST_RULE' });
  const seen: string[] = [];
  let attempts = 0;
  const runtime = new TaskRuntime(store, async (_messages, _taskId, _signal, _skill, context) => {
    seen.push(context!.projectContext!.instructions); attempts++;
    if (attempts === 1) {
      projectStore.saveContext(project.id, 1, { instructions: 'SECOND_RULE' });
      const call = { toolCallId: 'read-once', toolName: 'listSkills', input: {} };
      return { text: '', calls: [call], messages: [{ role: 'assistant', content: [{ type: 'tool-call', ...call }] }] };
    }
    return { text: 'done', calls: [], messages: [{ role: 'assistant', content: 'done' }] };
  }, join(root, 'artifacts'), () => {}, { projectContext: () => resources.runContext(project.id) });
  runtime.start(); const task = runtime.create('继续日常工作', 'general', undefined, undefined, [], { projectContext: resources.runContext(project.id) }); projectStore.register(task.id, project.id);
  const wait = async (id: string) => { const deadline = Date.now() + 10000; while (store.get(id).status !== 'completed') { if (Date.now() > deadline) throw new Error('timeout'); await new Promise(r => setTimeout(r, 10)); } };
  await wait(task.id); expect(seen).toEqual(['FIRST_RULE', 'FIRST_RULE']);
  const child = runtime.send(task.id, '下一轮', 'followup', randomUUID()); await wait(child.id); expect(seen.at(-1)).toBe('SECOND_RULE');
  expect(store.get(task.id).projectContext!.instructions).toBe('FIRST_RULE'); expect(store.get(child.id).projectContext!.revision).toBe(2);
  runtime.shutdown(); await new Promise(r => setImmediate(r));
});
