import { it, expect } from 'vitest';
import { mkdtemp, realpath, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { captureEvidence, validateEvidence, readArchivedEvidence, type EvidenceSnapshot } from '../src/core/evidence';
import { TaskStore, publicTask, type TaskRecord } from '../src/core/store';
import { TaskRuntime } from '../src/core/runtime';
import { sha256 } from '../src/core/tools';
const record = (): TaskRecord => ({ id: randomUUID(), goal: 'evidence', skill: 'general', status: 'completed', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), steps: 0, events: [], artifacts: [], messages: [], pending: [] });
function receipt(task = record(), text = 'OBSERVED', toolName = 'readMaterial', fields = {}) {
  const result = captureEvidence(task, { toolName, toolCallId: randomUUID(), input: {} }, { name: 'notes.md', content: text, sha256: sha256(text), ...fields }) as { source: EvidenceSnapshot };
  return { task, source: task.evidenceSnapshots![result.source.id], result };
}
it('only successful supported read paths capture receipts, not metadata or effect tools', () => {
  const task = record();
  expect(captureEvidence(task, { toolName: 'writeFile', toolCallId: 'x', input: {} }, { content: 'x' })).toEqual({ content: 'x' });
  expect(captureEvidence(task, { toolName: 'readMaterial', toolCallId: 'x', input: {} }, { name: 'not read' })).toEqual({ name: 'not read' });
  expect(task.evidenceSnapshots).toBeUndefined();
});
it('records exact range, original version and snippet hash without private path', () => {
  const { source, result, task } = receipt(record(), 'middle', 'readMaterial', { offset: 25, sha256: sha256('full original') });
  expect(source).toMatchObject({ offset: 25, end: 31, versionHash: sha256('full original'), contentHash: sha256('middle'), kind: 'material' });
  expect(result.source).not.toHaveProperty('content');
  expect(publicTask(task).sources).toEqual([result.source]);
  expect(publicTask(task).sources?.[0]).not.toHaveProperty('content');
});
it('archives bounded Unicode excerpts and honestly discloses truncation', () => {
  const { source } = receipt(record(), 'x'.repeat(65535) + '😀tail', 'readFile');
  expect(source.content).toHaveLength(65535); expect(source.end).toBe(65535);
  expect(source.coverage).toContain('first 65536'); validateEvidence(source);
});
it('rereads bounded historical ranges without new observations, network or live paths', () => {
  const { source, task } = receipt(record(), 'archived middle tail', 'readMaterial', { offset: 50 });
  expect(readArchivedEvidence(source, { id: source.id, offset: 9, length: 6 })).toMatchObject({ content: 'middle', readRange: { start: 59, end: 65 }, nextOffset: 15, historical: true });
  expect(Object.keys(task.evidenceSnapshots!)).toHaveLength(1);
  expect(() => readArchivedEvidence(source, { id: source.id, length: 12001 })).toThrow();
  expect(() => readArchivedEvidence(source, { id: source.id, offset: 100 })).toThrow();
});
it('keeps browser region pagination hash and observation time, never full-page coverage', () => {
  const time = new Date().toISOString(), task = record(), input = { sha256: undefined, url: 'https://example.com/article', contentDigest: sha256('full region'), offset: 10, observedAt: time, scope: { ref: 'r0', name: 'Article' }, coverage: 'Partial main document' };
  const a = receipt(task, 'first', 'browserRead', input), b = receipt(task, 'next', 'browserRead', { ...input, offset: 15 });
  expect(a.source).toMatchObject({ kind: 'web', url: input.url, observedAt: time, offset: 10 });
  expect(a.source.coverage).toContain('Region:'); expect(a.source.versionHash).toBe(b.source.versionHash);
  expect(a.source.id).not.toBe(b.source.id); expect(b.source.offset).toBe(a.source.end);
});
it('public HTTP reader captures a body-version hash without inventing DOM coverage', () => {
  const task = record(), result = captureEvidence(task, { toolName: 'readWeb', toolCallId: 'web', input: {} }, { url: 'https://example.com/', content: 'HTTP text', truncated: true }) as { source: EvidenceSnapshot };
  expect(result.source.versionHash).toBe(sha256('HTTP text')); expect(result.source.kind).toBe('web');
  expect(result.source.coverage).toContain('not proof');
});
it('archive caps do not fail a successful read or invent a source URI', () => {
  const task = record(); for (let i = 0; i < 128; i++) receipt(task);
  const result = captureEvidence(task, { toolName: 'readFile', toolCallId: 'limit', input: {} }, { path: 'a', content: 'extra', sha256: sha256('extra') }) as Record<string, unknown>;
  expect(result.content).toBe('extra'); expect(result.sourceUnavailable).toBeTruthy(); expect(result.source).toBeUndefined();
});
it('rejects corrupt body, range, URI, version hash and credential-bearing URL', () => {
  const { source } = receipt();
  for (const changed of [{ content: 'tampered' }, { end: 999 }, { uri: 'https://example.com' }, { versionHash: 'fake' }, { url: 'https://secret@example.com/' }]) expect(() => validateEvidence({ ...source, ...changed })).toThrow();
});
it('additively stores immutable source bodies once and preserves pointers across restart', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'a47-source-unit-'))), path = join(dir, 'tasks.db'), store = new TaskStore(path), { task, source } = receipt();
  store.save(task); const next = { ...task, id: randomUUID() }; store.save(next);
  const db = new DatabaseSync(path);
  expect(db.prepare('SELECT COUNT(*) AS n FROM source_evidence').get()?.n).toBe(1);
  expect(JSON.parse(String(db.prepare('SELECT body FROM tasks WHERE id=?').get(task.id)?.body)).evidenceSnapshots[source.id]).not.toHaveProperty('content');
  db.close(); store.close();
  const reopened = new TaskStore(path); expect(reopened.get(next.id).evidenceSnapshots?.[source.id].content).toBe('OBSERVED');
  const corrupt = reopened.get(task.id); corrupt.evidenceSnapshots![source.id].name = 'changed';
  expect(() => reopened.save(corrupt)).toThrow('Immutable'); reopened.close();
});
it('fails closed on missing or corrupt persisted evidence rather than manufacturing sources', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'a47-source-corrupt-'))), path = join(dir, 'tasks.db'), store = new TaskStore(path), { task } = receipt();
  store.save(task); store.close(); const db = new DatabaseSync(path); db.exec('DELETE FROM source_evidence'); db.close();
  expect(() => new TaskStore(path)).toThrow('Missing source evidence');
});
it('runtime only cites actual reads, inherits receipts into followup and binds IPC lookups to a conversation', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'a47-source-runtime-'))), store = new TaskStore(join(dir, 'tasks.db')); await writeFile(join(dir, 'notes.md'), 'REAL_RANDOM_' + randomUUID());
  let read = false, seen: unknown, reread: string | undefined;
  const runtime = new TaskRuntime(store, async (_messages, _id, _signal, _skill, context) => {
    seen = context?.sources;
    if (!read) { read = true; const call = { toolName: 'readFile', toolCallId: 'read-source', input: { path: 'notes.md' } }; return { text: '', calls: [call], messages: [{ role: 'assistant', content: [{ type: 'tool-call', ...call }] }] }; }
    if (reread) { const call = { toolName: 'readEvidence', toolCallId: 'reread-source', input: { id: reread } }; reread = undefined; return { text: '', calls: [call], messages: [{ role: 'assistant', content: [{ type: 'tool-call', ...call }] }] }; }
    return { text: 'done', calls: [], messages: [{ role: 'assistant', content: 'done' }] };
  }, join(dir, 'artifacts')); runtime.start();
  try {
    const first = runtime.create('Read evidence', 'general', dir);
    const wait = async (id: string) => { const end = Date.now() + 10000; while (store.get(id).status !== 'completed') { if (Date.now() > end) throw new Error('Timed out'); await new Promise(r => setTimeout(r, 5)); } };
    await wait(first.id); const source = runtime.list()[0].sources![0];
    expect(seen).toEqual([source]); expect(runtime.evidence(first.id, source.id).content).toContain('REAL_RANDOM_');
    const compacted = store.get(first.id); compacted.compactions = [{ summary: `Observed source ${source.uri}; re-read before claiming content.`, keptFrom: compacted.messages.length, at: new Date().toISOString() }]; store.save(compacted);
    await unlink(join(dir, 'notes.md')); reread = source.id;
    const next = runtime.send(first.id, 'Use old evidence', 'followup', randomUUID()); await wait(next.id);
    expect(runtime.evidence(next.id, source.id).content).toBe(runtime.evidence(first.id, source.id).content);
    expect(runtime.list()[0].sources).toHaveLength(1);
    expect(JSON.stringify(store.get(next.id).messages)).toContain('"historical":true');
    const unrelated = runtime.create('No source', 'general'); await wait(unrelated.id);
    expect(() => runtime.evidence(unrelated.id, source.id)).toThrow('没有');
    expect(() => runtime.evidence(next.id, 's0000000000000000')).toThrow('没有');
  } finally { runtime.shutdown(); await new Promise(r => setImmediate(r)); store.close(); }
});
