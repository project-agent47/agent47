import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ProjectStore } from '../src/core/projects';
import { TaskStore } from '../src/core/store';
import { TaskRuntime } from '../src/core/runtime';
import type { TaskView } from '../src/shared/contracts';
const stores: ProjectStore[] = [];
afterEach(() => stores.splice(0).forEach(s => s.close()));
function setup() { const root = mkdtempSync(join(tmpdir(), 'a47-project-test-')); const s = new ProjectStore(join(root, 'projects.db')); stores.push(s); return { root, s }; }
const task = (id = randomUUID()): TaskView => ({ id, goal: '日常任务', skill: 'general', status: 'completed', steps: 1, createdAt: '', updatedAt: '', events: [], artifacts: [] });
test('project creation is idempotent and new projects grant nothing', () => {
  const { s } = setup(), key = randomUUID(), p = s.create('  周报资料  ', key);
  expect(s.create('周报资料', key).id).toBe(p.id); expect(s.list()).toHaveLength(1); expect(p.rootEnabled).toBe(false);
  expect(() => s.create('不同内容', key)).toThrow(); expect(() => s.create('', randomUUID())).toThrow();
});
test('revision conflicts, pin/archive, restore and navigation persist', () => {
  const { root, s } = setup(), p = s.create('家庭资料', randomUUID()), r = s.update(p.id, 1, { pinned: true, archived: true });
  expect(() => s.update(p.id, 1, { name: '过期' })).toThrow('已变化');
  s.update(p.id, r.revision, { archived: false }); s.select(p.id); const run = randomUUID(); s.remember(run, p.id);
  const reopened = new ProjectStore(join(root, 'projects.db')); stores.push(reopened);
  expect(reopened.current()).toBe(p.id); expect(reopened.last(p.id)).toBe(run); expect(reopened.get(p.id).pinned).toBe(true);
});
test('membership changes do not rewrite task roots and active/unknown tasks cannot move', () => {
  const { s } = setup(), p = s.create('研究', randomUUID()), t = { ...task(), root: '/original' };
  s.assign(t, [t], p.id); expect(s.decorate([t])[0]).toMatchObject({ root: '/original', projectId: p.id });
  expect(() => s.assign(t, [{ ...t, status: 'paused' }], undefined)).toThrow();
  expect(() => s.assign(t, [{ ...t, unknownEffect: true }], undefined)).toThrow();
  s.assign(t, [t], undefined); expect(s.projectFor(t.id)).toBeUndefined();
});
test('root grants fence old runs on revoke/rebind and do not follow membership', () => {
  const { s, root } = setup(), p = s.create('写作', randomUUID()), b = s.bind(p.id, 1, root);
  const binding = { rootProjectId: p.id, rootProjectRevision: b.rootRevision, root };
  expect(s.allowed(binding)).toBe(true); const revoked = s.bind(p.id, b.revision);
  expect(s.allowed(binding)).toBe(false); s.bind(p.id, revoked.revision, root);
  expect(s.allowed(binding)).toBe(false); expect(s.allowed({ root })).toBe(true);
});
test('same active canonical directory cannot bind twice; archived is organizational', () => {
  const { s, root } = setup(), a = s.create('a', randomUUID()), b = s.create('b', randomUUID());
  const grant = s.bind(a.id, 1, root); expect(() => s.bind(b.id, 1, root)).toThrow('已绑定');
  const archived = s.update(a.id, grant.revision, { archived: true });
  expect(s.allowed({ root, rootProjectId: a.id, rootProjectRevision: grant.rootRevision })).toBe(true);
  expect(() => s.bind(a.id, archived.revision, root)).toThrow();
  s.bind(b.id, 1, root);
  expect(() => s.update(a.id, archived.revision, { archived: false })).toThrow('先撤销');
  const revoked = s.bind(a.id, archived.revision);
  expect(s.update(a.id, revoked.revision, { archived: false }).rootEnabled).toBe(false);
});
test('file lists are paged, nonrecursive and hide dot entries; invalid paths fail closed', async () => {
  const { s, root } = setup(), dir = join(root, 'work'); mkdirSync(dir);
  for (let i = 0; i < 205; i++) writeFileSync(join(dir, `item-${String(i).padStart(3, '0')}.md`), 'no automatic model read');
  writeFileSync(join(dir, '.env'), 'synthetic'); mkdirSync(join(dir, 'folder'));
  const p = s.create('files', randomUUID()); s.bind(p.id, 1, dir);
  const first = await s.files(p.id, ''); expect(first.entries).toHaveLength(200); expect(first.entries[0].directory).toBe(true);
  expect((await s.files(p.id, '', first.nextOffset)).entries).toHaveLength(6);
  await expect(s.files(p.id, '../')).rejects.toThrow(); await expect(s.files(p.id, '.env')).rejects.toThrow();
});
test('invalid metadata fails without overwriting data', () => {
  const { s } = setup(); expect(() => s.update(s.create('good', randomUUID()).id, 1, { name: '' })).toThrow();
});
test('TaskStore consistent backup preserves checkpoints', () => {
  const root = mkdtempSync(join(tmpdir(), 'a47-project-backup-')), s = new TaskStore(join(root, 'tasks.db'));
  s.backup(join(root, 'before.db')); const copy = new TaskStore(join(root, 'before.db'));
  expect(copy.list()).toEqual([]); copy.close(); s.close();
});
test('schema1 migration keeps backup and schema2 makes old runtime fail closed', () => {
  const root = mkdtempSync(join(tmpdir(), 'a47-project-migrate-')), path = join(root, 'tasks.db'), fresh = new TaskStore(path); fresh.close();
  const old = new DatabaseSync(path); old.prepare("UPDATE metadata SET value='1' WHERE key='schema'").run(); old.close();
  const current = new TaskStore(path), backup = new DatabaseSync(path + '.before-schema2');
  expect(backup.prepare("SELECT value FROM metadata WHERE key='schema'").get()!.value).toBe('1');
  backup.close(); current.close();
  const check = new DatabaseSync(path); expect(check.prepare("SELECT value FROM metadata WHERE key='schema'").get()!.value).toBe('2'); check.close();
});
test('creation interrupted before membership is repaired without undoing explicit unassignment', () => {
  const { s } = setup(), p = s.create('资料', randomUUID()), t = { ...task(), originProjectId: p.id, messages: [], pending: [] };
  s.reconcile([t]); expect(s.projectFor(t.id)).toBe(p.id);
  s.register(t.id, undefined); s.reconcile([t]); expect(s.projectFor(t.id)).toBeUndefined();
});
test('missing project metadata cannot silently recreate an execution binding', () => {
  const { s } = setup(); expect(() => s.reconcile([{ ...task(), originProjectId: randomUUID(), messages: [], pending: [] }])).toThrow();
});
test('runtime checks revoked directory grants before preparing a file effect', async () => {
  const root = mkdtempSync(join(tmpdir(), 'a47-project-revoke-')), store = new TaskStore(join(root, 'tasks.db'));
  let calls = 0;
  const call = { toolName: 'writeFile', toolCallId: 'revoked', input: { path: 'should-not.md', content: 'bad', expectedHash: null } };
  const runtime = new TaskRuntime(store, async () => ++calls === 1
    ? { text: '', calls: [call], messages: [{ role: 'assistant', content: [{ type: 'tool-call', ...call }] }] }
    : { text: '已尊重撤销', calls: [], messages: [{ role: 'assistant', content: '已尊重撤销' }] }, join(root, 'artifacts'), () => {}, { fileAuthorized: () => false });
  runtime.start(); const t = runtime.create('测试撤销', 'general', root, 'snapshot');
  for (let i = 0; i < 100 && store.get(t.id).status !== 'completed'; i++) await new Promise(r => setTimeout(r, 10));
  expect(store.get(t.id).status).toBe('completed'); expect(existsSync(join(root, 'should-not.md'))).toBe(false);
  runtime.shutdown(); await new Promise(r => setImmediate(r)); store.close();
});
