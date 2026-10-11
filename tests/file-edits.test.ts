import { expect, it } from 'vitest';
import { mkdtemp, realpath, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyFileEdits, fileEditInput, displayText, rawSelection } from '../src/shared/file-edits';
import { prepareEffect, applyProjectWrite } from '../src/core/effects';
import { readTool, sha256 } from '../src/core/tools';
import { FileSnapshots } from '../src/core/snapshots';
it('matches every hunk against the original, not previous replacement output', () => {
  expect(applyFileEdits('ALPHA BETA', [{ oldText: 'ALPHA', newText: 'BETA' }, { oldText: 'BETA', newText: 'GAMMA' }]).content).toBe('BETA GAMMA');
});
it('rejects ambiguous text unless anchored to the exact original UTF16 offset', () => {
  expect(() => applyFileEdits('same same', [{ oldText: 'same', newText: 'new' }])).toThrow('found 2');
  expect(applyFileEdits('same same', [{ oldText: 'same', newText: 'new', startOffset: 5 }]).content).toBe('same new');
  expect(() => applyFileEdits('same same', [{ oldText: 'same', newText: 'new', startOffset: 4 }])).toThrow('found 0');
});
it('rejects overlaps and nested edits before returning any new content', () => {
  expect(() => applyFileEdits('abcdef', [{ oldText: 'abc', newText: 'x' }, { oldText: 'bc', newText: 'y' }])).toThrow('Overlapping');
  expect(() => applyFileEdits('abc', [{ oldText: 'abc', newText: 'x' }, { oldText: 'abc', newText: 'y' }])).toThrow('Overlapping');
});
it('never guesses by trimming whitespace or fuzzy similarity', () => {
  expect(() => applyFileEdits('  value = 1;\n', [{ oldText: 'value=1;', newText: 'value=2;' }])).toThrow('found 0');
});
it('normalizes only LF/CRLF matching and preserves BOM and untouched bytes', () => {
  const before = '\uFEFFfirst\r\nsecond\r\nthird\r\n';
  const result = applyFileEdits(before, [{ oldText: 'first\nsecond', newText: 'one\ntwo', startOffset: 1 }]);
  expect(result.content).toBe('\uFEFFone\r\ntwo\r\nthird\r\n');
  expect(result.ranges[0].normalizedEnding).toBe(true);
});
it('mixed line endings require exact matching and preserve unchanged line endings', () => {
  const before = 'first\r\nsecond\nthird\r\n';
  expect(() => applyFileEdits(before, [{ oldText: 'first\nsecond', newText: 'x' }])).toThrow();
  expect(applyFileEdits(before, [{ oldText: 'second', newText: 'new' }]).content).toBe('first\r\nnew\nthird\r\n');
});
it('rejects no-op edits including ones which normalize back to the original', () => {
  expect(() => applyFileEdits('x\r\n', [{ oldText: 'x\r\n', newText: 'x\n' }])).toThrow('No-op');
});
it('maps LF Monaco selections back to BOM/CRLF source offsets and Unicode units', () => {
  const before = '\uFEFFA\r\n你好😀\r\nZ';
  expect(displayText(before)).toBe('A\n你好😀\nZ');
  const range = rawSelection(before, 2, 6);
  expect(before.slice(range.start, range.end)).toBe('你好😀');
  expect(() => rawSelection(before, -1, 2)).toThrow();
});
it('bounds structured input and refuses arbitrary diff scripts', () => {
  const base = { path: 'a.ts', expectedHash: 'a'.repeat(64), edits: [{ oldText: 'x', newText: 'y' }] };
  expect(fileEditInput.parse(base).edits).toHaveLength(1);
  expect(() => fileEditInput.parse({ ...base, patch: 'rm -rf .' })).toThrow();
  expect(() => fileEditInput.parse({ ...base, edits: Array(33).fill(base.edits[0]) })).toThrow();
});
it('rejects split Unicode selections and malformed Unicode replacements', () => {
  expect(() => rawSelection('😀text', 1, 3)).toThrow('Split');
  expect(() => applyFileEdits('hello', [{ oldText: 'hello', newText: '\uD800' }])).toThrow('Unicode');
  expect(() => applyFileEdits('hello', [{ oldText: 'hello', newText: '\0' }])).toThrow('binary');
  expect(() => applyFileEdits('x\r\n', [{ oldText: '\n', newText: 'y' }])).toThrow('CRLF');
});
async function fixture(before = 'ALPHA BETA') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-file-edit-'))), target = join(root, 'file.md');
  await writeFile(target, before); return { root, target, before, snapshots: new FileSnapshots(join(root, 'snapshots')) };
}
it('preflights all hunks without modifying the file when one hunk fails', async () => {
  const f = await fixture();
  await expect(prepareEffect('task', { toolName: 'fileEdit', toolCallId: 'edit', input: { path: 'file.md', expectedHash: sha256(f.before), edits: [{ oldText: 'ALPHA', newText: 'changed' }, { oldText: 'missing', newText: 'new' }] } }, f.root, false)).rejects.toThrow();
  expect(await readFile(f.target, 'utf8')).toBe(f.before);
});
it('multiple edits use one durable snapshot and one after-version, with restoration and cleanup', async () => {
  const f = await fixture();
  const action = await prepareEffect('task', { toolName: 'fileEdit', toolCallId: 'edit', input: { path: 'file.md', expectedHash: sha256(f.before), edits: [{ oldText: 'ALPHA', newText: 'ONE' }, { oldText: 'BETA', newText: 'TWO' }] } }, f.root, false);
  action.state = 'approved';
  const result = await f.snapshots.apply('task', action);
  expect(result).toMatchObject({ saved: true, sha256: sha256('ONE TWO') });
  expect(await readdir(join(f.root, 'snapshots', 'task'))).toHaveLength(1);
  expect(await f.snapshots.diff('task', result.snapshotId)).toEqual({ path: 'file.md', before: f.before, after: 'ONE TWO' });
  await writeFile(f.target, 'EXTERNAL');
  expect((await f.snapshots.diff('task', result.snapshotId)).after).toBe('ONE TWO'); // Never label live disk as recorded after-version.
  await expect(f.snapshots.restore('task', result.snapshotId)).rejects.toThrow('conflict');
  await writeFile(f.target, 'ONE TWO'); await f.snapshots.restore('task', result.snapshotId);
  expect(await readFile(f.target, 'utf8')).toBe(f.before);
  await f.snapshots.purge('task', result.snapshotId); await expect(f.snapshots.diff('task', result.snapshotId)).rejects.toThrow();
});
it('rejects file changes after review and keeps legacy editFile checkpoints working', async () => {
  const f = await fixture();
  const action = await prepareEffect('task', { toolName: 'editFile', toolCallId: 'legacy', input: { path: 'file.md', expectedHash: sha256(f.before), oldText: 'ALPHA', newText: 'ONE' } }, f.root, false);
  action.state = 'approved'; await writeFile(f.target, 'EXTERNAL');
  await expect(applyProjectWrite('task', action)).rejects.toThrow('File changed');
  expect(await readFile(f.target, 'utf8')).toBe('EXTERNAL');
});
it('readFile hash includes BOM and fileEdit preserves it through real writes', async () => {
  const f = await fixture('\uFEFFALPHA\r\nBETA\r\n');
  const read = await readTool(f.root, 'readFile', { path: 'file.md' }) as { content: string; sha256: string };
  expect(read.content).toBe(f.before); expect(read.sha256).toBe(sha256(f.before));
  const action = await prepareEffect('task', { toolName: 'fileEdit', toolCallId: 'bom', input: { path: 'file.md', expectedHash: read.sha256, edits: [{ oldText: 'ALPHA\nBETA', newText: 'ONE\nTWO' }] } }, f.root, false);
  action.state = 'approved'; await f.snapshots.apply('task', action);
  expect(await readFile(f.target, 'utf8')).toBe('\uFEFFONE\r\nTWO\r\n');
});
