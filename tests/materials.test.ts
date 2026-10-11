import { afterEach, expect, it } from 'vitest';
import { mkdtemp, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { TaskStore } from '../src/core/store';
import { TaskRuntime } from '../src/core/runtime';
import { sha256 } from '../src/core/tools';
import { materialMessage, readMaterial, type MaterialSnapshot } from '../src/core/materials';
import type { ModelDriver } from '../src/core/model';
import type { DatabaseSync } from 'node:sqlite';
const items: { store: TaskStore; runtime: TaskRuntime }[] = [];
afterEach(async () => { for (const v of items.splice(0)) { v.runtime.shutdown(); await new Promise(r => setImmediate(r)); v.store.close(); } });
const material = (content = 'random-evidence') : MaterialSnapshot => ({ id: randomUUID(), name: 'notes.md', content, sha256: sha256(content), bytes: Buffer.byteLength(content), capturedAt: new Date().toISOString(), source: 'file', path: '/selected/notes.md' });
async function setup(model: ModelDriver = async () => ({ text: 'done', calls: [], messages: [{ role: 'assistant', content: 'done' }] })) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'a47-materials-'))), store = new TaskStore(join(dir, 'tasks.db')), runtime = new TaskRuntime(store, model, join(dir, 'artifacts'));
  items.push({ store, runtime }); runtime.start(); return { store, runtime };
}
async function wait(fn: () => boolean) { const end = Date.now() + 10000; while (!fn()) { if (Date.now() > end) throw new Error('Timeout'); await new Promise(r => setTimeout(r, 5)); } }
it('ranges are bounded, untrusted, immutable and cannot read a path or an unsent version', () => {
  const m = material('abcdef'), snapshots = { [m.id]: m };
  expect(() => readMaterial(snapshots, [], { id: m.id })).toThrow('not authorized');
  expect(() => readMaterial(snapshots, [m.id], { id: m.id, path: '../secret' })).toThrow();
  expect(() => readMaterial(snapshots, [m.id], { id: m.id, length: 12001 })).toThrow();
  expect(readMaterial(snapshots, [m.id], { id: m.id, offset: 2, length: 2 })).toMatchObject({ content: 'cd', truncated: true, nextOffset: 4, untrusted: true, sha256: m.sha256 });
  expect(() => readMaterial(snapshots, [m.id], { id: m.id, offset: 7 })).toThrow('offset');
  expect(materialMessage('summarize', [m])).not.toContain(m.content);
});
it('corrupt snapshot content fails closed instead of masquerading as the pinned hash', () => {
  const m = material(); m.content = 'modified';
  expect(() => readMaterial({ [m.id]: m }, [m.id], { id: m.id })).toThrow('版本校验失败');
});
it('first send authorizes only the pinned version, never a parent directory or private path', async () => {
  const { runtime, store } = await setup(), m = material();
  const t = runtime.create('stable title', 'general', undefined, undefined, [m]);
  await wait(() => runtime.list()[0].status === 'completed');
  expect(t.root).toBeUndefined(); expect(JSON.stringify(t)).not.toContain('/selected/');
  expect(JSON.stringify(store.get(t.id).messages)).not.toContain('/selected/');
  expect(store.get(t.id).authorizedMaterialIds).toEqual([m.id]);
});
it('selection does not authorize a tool until a sent message; followup keeps title and history', async () => {
  const { runtime, store } = await setup(), m = material();
  const first = runtime.create('Original title', 'general'); await wait(() => runtime.list()[0].status === 'completed');
  runtime.attachMaterial(first.id, m);
  expect(store.get(first.id).authorizedMaterialIds).toEqual([]);
  const command = randomUUID(), next = runtime.send(first.id, 'A long different followup', 'queue', command, true, [m.id]);
  await wait(() => runtime.list()[0].status === 'completed');
  expect(next.conversationTitle).toBe('Original title'); expect(next.runNumber).toBe(2);
  expect(store.get(next.id).authorizedMaterialIds).toEqual([m.id]);
  expect(store.get(first.id).authorizedMaterialIds).toEqual([]);
  expect(runtime.list().find(t => t.id === first.id)?.latestRunId).toBe(next.id);
  expect(runtime.send(first.id, 'duplicate', 'queue', command).id).toBe(next.id);
  expect(() => runtime.attachMaterial(first.id, material())).toThrow('当前轮次');
  runtime.removeMaterial(next.id, m.id);
  expect(store.get(next.id).authorizedMaterialIds).toEqual([m.id]);
  expect(readMaterial(store.get(next.id).materialSnapshots!, [m.id], { id: m.id }).content).toBe(m.content);
});
it('queued material versions survive removal and restart without silently replacing evidence', async () => {
  let release!: () => void; const blocked = new Promise<void>(r => { release = r; });
  const { runtime, store } = await setup(async () => { await blocked; return { text: 'done', calls: [], messages: [{ role: 'assistant', content: 'done' }] }; });
  const t = runtime.create('Queue', 'general'); await wait(() => runtime.list()[0].status === 'running');
  const old = material('version-one'), newer = material('version-two'); runtime.attachMaterial(t.id, old);
  runtime.send(t.id, 'use the old version', 'queue', randomUUID(), true, [old.id]);
  runtime.attachMaterial(t.id, newer, old.id); runtime.removeMaterial(t.id, newer.id);
  expect(store.get(t.id).queuedInput?.[0].materials?.[0].sha256).toBe(old.sha256);
  release(); await wait(() => runtime.list()[0].status === 'completed');
  expect(store.get(t.id).authorizedMaterialIds).toEqual([old.id]);
  expect(JSON.stringify(store.get(t.id).messages)).toContain(old.sha256);
  expect(JSON.stringify(store.get(t.id).messages)).not.toContain(newer.sha256);
  runtime.start(); expect(store.get(t.id).materialSnapshots?.[old.id].content).toBe('version-one');
});
it('legacy titles migrate additively, without replaying completed tasks', async () => {
  const { runtime, store } = await setup();
  const first = runtime.create('First title', 'general'); await wait(() => runtime.list()[0].status === 'completed');
  const next = runtime.send(first.id, 'Second objective', 'queue', randomUUID()); await wait(() => runtime.list()[0].status === 'completed');
  for (const t of store.list()) { delete t.conversationTitle; store.save(t); }
  runtime.start();
  expect(runtime.list().map(t => t.conversationTitle)).toEqual(['First title', 'First title']);
  expect(store.get(next.id).status).toBe('completed');
});
it('material table stores one immutable body across round checkpoints', async () => {
  const { runtime, store } = await setup(), m = material('uniquely-pinned-body');
  const first = runtime.create('Evidence', 'general', undefined, undefined, [m]); await wait(() => runtime.list()[0].status === 'completed');
  const second = runtime.send(first.id, 'Followup', 'queue', randomUUID(), true, [m.id]); await wait(() => runtime.list()[0].status === 'completed');
  const db = (store as unknown as { db: DatabaseSync }).db;
  expect(db.prepare('SELECT COUNT(*) AS count FROM material_versions').get()?.count).toBe(1);
  expect(String(db.prepare('SELECT body FROM tasks WHERE id=?').get(second.id)?.body)).not.toContain(m.content);
  expect(store.get(second.id).materialSnapshots?.[m.id].content).toBe(m.content);
  store.rememberRun(second.id); expect(store.lastRun()).toBe(second.id);
  store.rememberRun(); expect(store.lastRun()).toBeUndefined();
  const bad = store.get(second.id); bad.materialSnapshots = { [m.id]: { ...m, content: 'different', bytes: 9 } };
  expect(() => store.save(bad)).toThrow('Immutable material');
});
