import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../src/core/store';
const { picker, opener } = vi.hoisted(() => ({ picker: vi.fn(), opener: vi.fn().mockResolvedValue('') }));
vi.mock('electron', () => ({ BrowserWindow: class {}, WebContentsView: class {}, session: {}, dialog: { showOpenDialog: picker }, shell: { openPath: opener } }));
import { Workspace } from '../src/main/workspace';
let root: string, store: TaskStore, workspace: Workspace;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'a47-workspace-unit-')));
  store = new TaskStore(join(root, 'tasks.db')); workspace = new Workspace(join(root, 'workspace.json'), store, join(root, 'artifacts'), () => undefined);
  await workspace.start(); opener.mockClear();
});
afterEach(() => store.close());
async function importFile(name: string, content: string | Buffer) {
  const path = join(root, name); await writeFile(path, content); picker.mockResolvedValue({ canceled: false, filePaths: [path] });
  return workspace.importFile();
}
it('snapshots imported Markdown, redacts private paths and deduplicates the same version', async () => {
  const first = await importFile('a.md', '# old');
  expect(first.tabs[0]).toMatchObject({ name: 'a.md', content: '# old', source: 'file', kind: 'markdown' });
  expect(first.tabs[0]).not.toHaveProperty('path'); expect(first.tabs[0]).not.toHaveProperty('origin');
  expect((await workspace.importFile()).tabs).toHaveLength(1);
  await writeFile(join(root, 'a.md'), '# new'); expect(workspace.view().tabs[0].content).toBe('# old');
});
it('persists order, active ID and content snapshots without reopening arbitrary source files', async () => {
  const a = (await importFile('a.md', 'a')).activeId!; const b = (await importFile('b.ts', 'b')).activeId!;
  await workspace.update({ moveId: b, direction: -1, width: 500 }); await workspace.update({ activeId: a });
  const reopened = new Workspace(join(root, 'workspace.json'), store, join(root, 'artifacts'), () => undefined); await reopened.start();
  expect(reopened.view()).toMatchObject({ width: 500, activeId: a, tabs: [{ id: b }, { id: a }] });
});
it('rejects stale system-opening and updates the snapshot only on explicit refresh', async () => {
  const view = await importFile('a.md', '# old'), id = view.activeId!;
  await writeFile(join(root, 'a.md'), '# new');
  await expect(workspace.systemOpen(id)).rejects.toThrow('刷新');
  expect(opener).not.toHaveBeenCalled();
  expect((await workspace.refresh(id)).tabs[0].content).toBe('# new');
  await workspace.systemOpen(id); expect(opener).toHaveBeenCalledOnce();
});
it('rejects executable, sensitive, invalid UTF-8 and oversized file selections', async () => {
  await expect(importFile('app.exe', 'code')).rejects.toThrow('可执行');
  await expect(importFile('.env', 'secret')).rejects.toThrow('敏感');
  await expect(importFile('bad.txt', Buffer.from([0xff]))).rejects.toThrow('UTF-8');
  await expect(importFile('big.txt', 'x'.repeat(1_000_001))).rejects.toThrow('较小');
  expect(workspace.view().tabs).toHaveLength(0);
});
it('supports explicit HTML pause and close without deleting the user source file', async () => {
  const id = (await importFile('a.html', '<h1>test</h1>')).activeId!;
  expect((await workspace.update({ pauseId: id })).tabs[0].paused).toBe(true);
  expect((await workspace.refresh(id)).tabs[0].paused).toBe(false);
  await workspace.update({ closeId: id }); expect(workspace.view().visible).toBe(false);
  expect(await readFile(join(root, 'a.html'), 'utf8')).toContain('test');
});
it('does not overwrite malformed or hash-corrupt saved workspace state', async () => {
  const first = await importFile('a.md', 'evidence');
  const path = join(root, 'workspace.json'), body = JSON.parse(await readFile(path, 'utf8')); body.tabs[0].content = 'tampered';
  await writeFile(path, JSON.stringify(body)); const before = await readFile(path, 'utf8');
  const reopened = new Workspace(path, store, '/unused', () => undefined);
  await expect(reopened.start()).rejects.toThrow('integrity'); expect(await readFile(path, 'utf8')).toBe(before);
  expect(first.tabs[0].content).toBe('evidence');
});
it('limits tabs and rejects unknown tab mutation identifiers', async () => {
  for (let i = 0; i < 10; i++) await importFile(`${i}.txt`, `${i}`);
  await expect(importFile('extra.txt', 'extra')).rejects.toThrow('10');
  await expect(workspace.update({ activeId: '7edb8bfc-40a8-4a21-8e60-e4c315980055' })).rejects.toThrow();
});
