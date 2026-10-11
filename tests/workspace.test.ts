import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { TaskStore } from '../src/core/store';
const { picker, opener } = vi.hoisted(() => ({ picker: vi.fn(), opener: vi.fn().mockResolvedValue('') }));
vi.mock('electron', () => ({ BrowserWindow: class {}, WebContentsView: class {}, session: {}, dialog: { showOpenDialog: picker }, shell: { openPath: opener } }));
import { Workspace } from '../src/main/workspace';
import { browserSnapshotScript } from '../src/shared/browser-tools';
let root: string, store: TaskStore, workspace: Workspace;
async function browserSetup() {
  const taskId = randomUUID(), now = new Date().toISOString();
  store.save({ id: taskId, goal: 'Browser unit', skill: 'general', status: 'completed', createdAt: now, updatedAt: now, steps: 0, events: [], artifacts: [], messages: [], pending: [] });
  const tab = (await workspace.openWeb('https://example.com/')).tabs[0];
  let url = tab.url!;
  const execute = vi.fn(async (_world: number, sources: { code: string }[]) => sources[0].code === browserSnapshotScript
    ? { title: 'Unit', elements: [{ ref: 'e0', tag: 'button', role: '', name: 'Test', type: '', href: '', disabled: false, readOnly: false }], regions: [{ ref: 'r0', tag: 'main', name: 'Article' }] }
    : sources[0].code.includes('dispatched: true') ? { dispatched: true, verifiedOutcome: false } : { title: 'Unit', content: 'UNTRUSTED_PAGE_EVIDENCE', truncated: false });
  const wc = { id: 24, getURL: () => url, isDestroyed: () => false, isLoading: () => false, executeJavaScriptInIsolatedWorld: execute, loadURL: async (next: string) => { url = next; } };
  (workspace as unknown as { views: Map<string, unknown> }).views.set(tab.id, { webContents: wc, setVisible: vi.fn() });
  return { taskId, tab, execute, wc, setURL: (next: string) => { url = next; } };
}
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'a47-workspace-unit-')));
  store = new TaskStore(join(root, 'tasks.db')); workspace = new Workspace(join(root, 'workspace.json'), store, join(root, 'artifacts'), () => undefined);
  await workspace.start(); opener.mockClear();
});
afterEach(() => store.close());
it('requires explicit conversation/tab/origin authorization and does not inherit user browsing', async () => {
  const { taskId, tab } = await browserSetup();
  expect(workspace.browserTabs(taskId)).toEqual([]);
  await expect(workspace.browserRead(taskId, 'browserRead', { tabId: tab.id }, new AbortController().signal)).rejects.toThrow('授权');
  workspace.agentGrant(taskId, tab.id, 'read', tab.url!);
  expect(workspace.browserTabs(taskId)).toHaveLength(1);
  const otherId = randomUUID(), prior = store.get(taskId); store.save({ ...prior, id: otherId });
  expect(workspace.browserTabs(otherId)).toEqual([]);
  expect(() => workspace.agentGrant(taskId, tab.id, 'allow', 'https://example.com/old')).toThrow('变化');
});
it('binds action approvals to fresh refs, URL, exact payload and revocable grant generation', async () => {
  const { taskId, tab, setURL } = await browserSetup();
  workspace.agentGrant(taskId, tab.id, 'ask', tab.url!);
  const snapshot = await workspace.browserRead(taskId, 'browserRead', { tabId: tab.id }, new AbortController().signal) as { snapshotId: string };
  const action = await workspace.browserPrepare(taskId, { toolCallId: 'click-1', toolName: 'browserClick', input: { tabId: tab.id, snapshotId: snapshot.snapshotId, ref: 'e0' } });
  expect(workspace.browserValidate(taskId, action)).toBe(false);
  action.content += 'changed'; expect(() => workspace.browserValidate(taskId, action)).toThrow('过期');
  action.content = action.content.slice(0, -7);
  setURL('https://example.com/next'); expect(() => workspace.browserValidate(taskId, action)).toThrow('变化');
  setURL(tab.url!); workspace.agentGrant(taskId, tab.id, 'deny', tab.url!);
  expect(() => workspace.browserValidate(taskId, action)).toThrow('授权');
});
it('readonly blocks interaction, same-origin navigation excludes cross-origin, and trusted dispatch invalidates refs', async () => {
  const { taskId, tab, execute } = await browserSetup();
  workspace.agentGrant(taskId, tab.id, 'read', tab.url!);
  const read = () => workspace.browserRead(taskId, 'browserRead', { tabId: tab.id }, new AbortController().signal) as Promise<{ snapshotId: string }>;
  let snapshot = await read();
  const call = () => ({ toolCallId: 'click-1', toolName: 'browserClick', input: { tabId: tab.id, snapshotId: snapshot.snapshotId, ref: 'e0' } });
  await expect(workspace.browserPrepare(taskId, call())).rejects.toThrow('授权');
  await expect(workspace.browserRead(taskId, 'browserNavigate', { tabId: tab.id, url: 'https://other.example/' }, new AbortController().signal)).rejects.toThrow('跨站');
  workspace.agentGrant(taskId, tab.id, 'allow', tab.url!); snapshot = await read();
  const action = await workspace.browserPrepare(taskId, call());
  expect(workspace.browserValidate(taskId, action)).toBe(true);
  action.state = 'approved';
  expect(await workspace.browserExecute(taskId, action, new AbortController().signal)).toMatchObject({ dispatched: true, verifiedOutcome: false });
  expect(execute).toHaveBeenCalled(); expect(() => workspace.browserValidate(taskId, action)).toThrow('过期');
});
it('paginates bounded document text with digest checks, never silently combines versions', async () => {
  const { taskId, tab, execute } = await browserSetup(); workspace.agentGrant(taskId, tab.id, 'read', tab.url!);
  const body = { title: 'Unit', content: 'a'.repeat(9000), truncated: false };
  execute.mockImplementation(async (_w, sources) => sources[0].code === browserSnapshotScript ? { title: 'Unit', elements: [], regions: [] } : body);
  const first = await workspace.browserRead(taskId, 'browserRead', { tabId: tab.id, limit: 500 }, new AbortController().signal) as { contentDigest: string };
  expect(first).toMatchObject({ hasMore: true, nextOffset: 500, capturedCharacters: 9000, captureTruncated: false });
  const second = await workspace.browserRead(taskId, 'browserRead', { tabId: tab.id, offset: 500, limit: 500, expectedDigest: first.contentDigest }, new AbortController().signal);
  expect(second).toMatchObject({ offset: 500, nextOffset: 1000 });
  body.content = 'b' + body.content.slice(1);
  await expect(workspace.browserRead(taskId, 'browserRead', { tabId: tab.id, offset: 1000, expectedDigest: first.contentDigest }, new AbortController().signal)).rejects.toThrow('版本');
});
it('regions require fresh conversation-bound snapshots and retain explicit scope', async () => {
  const { taskId, tab } = await browserSetup(); workspace.agentGrant(taskId, tab.id, 'read', tab.url!);
  const first = await workspace.browserRead(taskId, 'browserRead', { tabId: tab.id }, new AbortController().signal) as { snapshotId: string };
  const focused = await workspace.browserRead(taskId, 'browserRead', { tabId: tab.id, snapshotId: first.snapshotId, regionRef: 'r0' }, new AbortController().signal);
  expect(focused).toMatchObject({ scope: { ref: 'r0', name: 'Article' } });
  await expect(workspace.browserRead(taskId, 'browserRead', { tabId: tab.id, snapshotId: first.snapshotId, regionRef: 'r0' }, new AbortController().signal)).rejects.toThrow('区域');
});
it('wait observes text without resetting actionable refs or claiming business success', async () => {
  const { taskId, tab } = await browserSetup(); workspace.agentGrant(taskId, tab.id, 'ask', tab.url!);
  const first = await workspace.browserRead(taskId, 'browserRead', { tabId: tab.id }, new AbortController().signal) as { snapshotId: string };
  const value = await workspace.browserRead(taskId, 'browserWait', { tabId: tab.id, condition: { kind: 'text', text: 'PAGE_EVIDENCE' } }, new AbortController().signal);
  expect(value).toMatchObject({ outcome: 'matched', verifiedOutcome: false });
  await expect(workspace.browserPrepare(taskId, { toolCallId: 'wait-click', toolName: 'browserClick', input: { tabId: tab.id, snapshotId: first.snapshotId, ref: 'e0' } })).resolves.toBeDefined();
});
it('wait timeout is a bounded observation result, not a tool failure or proof of absence', async () => {
  const { taskId, tab } = await browserSetup(); workspace.agentGrant(taskId, tab.id, 'read', tab.url!);
  const value = await workspace.browserRead(taskId, 'browserWait', { tabId: tab.id, condition: { kind: 'text', text: 'MISSING' }, timeoutMs: 250 }, new AbortController().signal);
  expect(value).toMatchObject({ outcome: 'timed_out', verifiedOutcome: false });
});
it('wait can observe delayed loading but rejects cross-origin URL conditions', async () => {
  const { taskId, tab, wc } = await browserSetup(); workspace.agentGrant(taskId, tab.id, 'read', tab.url!);
  let loading = true; wc.isLoading = () => loading; setTimeout(() => { loading = false; }, 20);
  const value = await workspace.browserRead(taskId, 'browserWait', { tabId: tab.id, condition: { kind: 'loaded' }, timeoutMs: 1000 }, new AbortController().signal);
  expect(value).toMatchObject({ outcome: 'matched' });
  await expect(workspace.browserRead(taskId, 'browserWait', { tabId: tab.id, condition: { kind: 'url', url: 'https://other.example/' } }, new AbortController().signal)).rejects.toThrow('跨站');
});
it('revoking grants during a wait cannot deliver observations', async () => {
  const { taskId, tab } = await browserSetup(); workspace.agentGrant(taskId, tab.id, 'read', tab.url!);
  const waiting = workspace.browserRead(taskId, 'browserWait', { tabId: tab.id, condition: { kind: 'text', text: 'MISSING' }, timeoutMs: 1000 }, new AbortController().signal);
  setTimeout(() => workspace.agentGrant(taskId, tab.id, 'deny', tab.url!), 20);
  await expect(waiting).rejects.toThrow('授权');
});
it('stop cancels wait promptly even while a fixed page script is pending', async () => {
  const { taskId, tab, execute } = await browserSetup(); workspace.agentGrant(taskId, tab.id, 'read', tab.url!);
  execute.mockImplementation(() => new Promise(() => {}));
  const controller = new AbortController(), start = Date.now();
  const waiting = workspace.browserRead(taskId, 'browserWait', { tabId: tab.id, condition: { kind: 'text', text: 'MISSING' }, timeoutMs: 15000 }, controller.signal);
  setTimeout(() => controller.abort(), 20);
  await expect(waiting).rejects.toThrow('Cancelled'); expect(Date.now() - start).toBeLessThan(1000);
});
it('a script deadline returns timed_out, never depends on fractional timer clock ordering', async () => {
  const { taskId, tab, execute } = await browserSetup(); workspace.agentGrant(taskId, tab.id, 'read', tab.url!);
  execute.mockImplementation(() => new Promise(() => {}));
  const value = await workspace.browserRead(taskId, 'browserWait', { tabId: tab.id, condition: { kind: 'text', text: 'MISSING' }, timeoutMs: 250 }, new AbortController().signal);
  expect(value).toMatchObject({ outcome: 'timed_out', verifiedOutcome: false });
});
it('same URL navigation during extraction invalidates a read using document epoch', async () => {
  const { taskId, tab, execute } = await browserSetup(); workspace.agentGrant(taskId, tab.id, 'read', tab.url!);
  const epochs = (workspace as unknown as { pageEpoch: Map<string, number> }).pageEpoch;
  execute.mockImplementation(async (_w, sources) => {
    if (sources[0].code === browserSnapshotScript) return { title: 'Unit', elements: [], regions: [] };
    epochs.set(tab.id, (epochs.get(tab.id) ?? 0) + 1);
    return { title: 'Unit', content: 'OLD', truncated: false };
  });
  await expect(workspace.browserRead(taskId, 'browserRead', { tabId: tab.id }, new AbortController().signal)).rejects.toThrow('变化');
});
it('a failed new read revokes old action refs before a page registry can change', async () => {
  const { taskId, tab, execute } = await browserSetup(); workspace.agentGrant(taskId, tab.id, 'ask', tab.url!);
  const first = await workspace.browserRead(taskId, 'browserRead', { tabId: tab.id }, new AbortController().signal) as { snapshotId: string };
  execute.mockRejectedValueOnce(new Error('Page script failed'));
  await expect(workspace.browserRead(taskId, 'browserRead', { tabId: tab.id }, new AbortController().signal)).rejects.toThrow('Page script failed');
  await expect(workspace.browserPrepare(taskId, { toolCallId: 'stale-after-failure', toolName: 'browserClick', input: { tabId: tab.id, snapshotId: first.snapshotId, ref: 'e0' } })).rejects.toThrow('过期');
});
it('switching away from target tab cancels wait rather than reading hidden tabs', async () => {
  const { taskId, tab } = await browserSetup(); workspace.agentGrant(taskId, tab.id, 'read', tab.url!);
  const waiting = workspace.browserRead(taskId, 'browserWait', { tabId: tab.id, condition: { kind: 'text', text: 'MISSING' }, timeoutMs: 1000 }, new AbortController().signal);
  setTimeout(() => { void workspace.update({ visible: false }); }, 20);
  await expect(waiting).rejects.toThrow('激活');
});
async function importFile(name: string, content: string | Buffer) {
  const path = join(root, name); await writeFile(path, content); picker.mockResolvedValue({ canceled: false, filePaths: [path] });
  return workspace.importFile();
}
it('selection binds an exact saved version and only maps targets inside the authorized project', async () => {
  const content = 'first\nsecond', state = await importFile('selection.md', content), tab = state.tabs[0], taskId = randomUUID(), at = new Date().toISOString();
  store.save({ id: taskId, goal: 'Edit', root, skill: 'general', status: 'completed', createdAt: at, updatedAt: at, steps: 0, events: [], artifacts: [], messages: [], pending: [] });
  const selected = await workspace.selectionMaterial(taskId, tab.id, tab.sha256, 6, 12);
  expect(selected.selection).toEqual({ start: 6, end: 12, targetPath: 'selection.md' });
  const task = store.get(taskId); task.root = undefined; store.save(task);
  expect((await workspace.selectionMaterial(taskId, tab.id, tab.sha256, 6, 12)).selection).toEqual({ start: 6, end: 12 });
  await writeFile(join(root, 'selection.md'), 'external');
  await expect(workspace.selectionMaterial(taskId, tab.id, tab.sha256, 6, 12)).rejects.toThrow('刷新');
});
it('selection refuses stale hashes/ranges and cannot migrate automatically to changed source', async () => {
  const state = await importFile('selection.md', 'first\nsecond'), tab = state.tabs[0], taskId = randomUUID(), at = new Date().toISOString();
  store.save({ id: taskId, goal: 'Edit', skill: 'general', status: 'completed', createdAt: at, updatedAt: at, steps: 0, events: [], artifacts: [], messages: [], pending: [] });
  await expect(workspace.selectionMaterial(taskId, tab.id, '0'.repeat(64), 0, 5)).rejects.toThrow('重新选择');
  await expect(workspace.selectionMaterial(taskId, tab.id, tab.sha256, 0, 50)).rejects.toThrow('选区');
  const selected = await workspace.selectionMaterial(taskId, tab.id, tab.sha256, 0, 5);
  await expect(workspace.refreshMaterial(selected)).rejects.toThrow('重新选择');
});
it('diff tabs persist both validated versions without paths, edit rights or system opening', async () => {
  const taskId = randomUUID(), opened = await workspace.openDiff(taskId, { path: 'a.ts', before: 'old', after: 'new' });
  expect(opened.tabs[0]).toMatchObject({ kind: 'diff', source: 'diff', before: 'old', content: 'new' });
  const reopened = new Workspace(join(root, 'workspace.json'), store, '/unused', () => undefined); await reopened.start();
  expect(reopened.view().tabs[0].before).toBe('old');
  const otherTask = randomUUID(), separate = await workspace.openDiff(otherTask, { path: 'a.ts', before: 'old', after: 'new' });
  expect(separate.tabs).toHaveLength(2);
  expect(separate.tabs.find(t => t.id === separate.activeId)?.taskId).toBe(otherTask);
  await expect(workspace.refresh(opened.activeId!)).rejects.toThrow('留档');
  const incompletePath = join(root, 'incomplete.json'), incomplete = JSON.parse(await readFile(join(root, 'workspace.json'), 'utf8'));
  delete incomplete.tabs[0].before; await writeFile(incompletePath, JSON.stringify(incomplete));
  await expect(new Workspace(incompletePath, store, '/unused', () => undefined).start()).rejects.toThrow('Invalid recorded diff');
  const path = join(root, 'workspace.json'), body = JSON.parse(await readFile(path, 'utf8')); body.tabs[0].before = 'corrupt'; await writeFile(path, JSON.stringify(body));
  await expect(new Workspace(path, store, '/unused', () => undefined).start()).rejects.toThrow('integrity');
});
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
it('opens HTTPS URL tabs without importing content and restores them paused', async () => {
  await expect(workspace.openWeb('http://example.com/')).rejects.toThrow();
  await expect(workspace.openWeb('https://127.0.0.1/')).rejects.toThrow();
  const first = await workspace.openWeb('https://example.com/');
  expect(first.tabs[0]).toMatchObject({ kind: 'web', source: 'web', url: 'https://example.com/' });
  expect(first.tabs[0].content).toBeUndefined();
  expect((await workspace.openWeb('https://example.com/')).tabs).toHaveLength(1);
  const reopened = new Workspace(join(root, 'workspace.json'), store, '/unused', () => undefined); await reopened.start();
  expect(reopened.view().tabs[0].paused).toBe(true);
  expect((await reopened.refresh(first.activeId!)).tabs[0]).toMatchObject({ paused: false, revision: 1 });
});
it('increments native render revision even when refreshing identical HTML', async () => {
  const id = (await importFile('same.html', '<h1>same</h1>')).activeId!;
  expect((await workspace.refresh(id)).tabs[0].revision).toBe(1);
  expect((await workspace.refresh(id)).tabs[0].revision).toBe(2);
});
it('binds reviewed page captures to immutable tickets, digest, URL and expiry', async () => {
  const taskId = randomUUID(), at = new Date().toISOString();
  store.save({ id: taskId, goal: 'Review', skill: 'general', status: 'completed', createdAt: at, updatedAt: at, steps: 1, events: [], artifacts: [], messages: [], pending: [] });
  const tab = (await workspace.openWeb('https://example.com/')).tabs[0];
  let url = tab.url!;
  const wc = { getURL: () => url, isDestroyed: () => false, isLoading: () => false,
    executeJavaScriptInIsolatedWorld: vi.fn().mockResolvedValue({ title: 'Evidence', content: 'page evidence', truncated: false }) };
  (workspace as unknown as { views: Map<string, unknown> }).views.set(tab.id, { webContents: wc });
  const first = await workspace.capture(tab.id, taskId);
  expect(wc.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(1001, expect.any(Array));
  expect(workspace.reviewedCapture(first.id, first.digest).content).toBe('page evidence');
  expect(() => workspace.reviewedCapture(first.id, '0'.repeat(64))).toThrow('重新审阅');
  url = 'https://example.com/changed';
  expect(() => workspace.reviewedCapture(first.id, first.digest)).toThrow('重新审阅');
  url = tab.url!;
  const next = await workspace.capture(tab.id, taskId);
  expect(() => workspace.reviewedCapture(first.id, first.digest)).toThrow('重新审阅');
  const captures = (workspace as unknown as { captures: Map<string, { capturedAt: string }> }).captures;
  captures.get(next.id)!.capturedAt = new Date(Date.now() - 600001).toISOString();
  expect(() => workspace.reviewedCapture(next.id, next.digest)).toThrow('重新审阅');
});
it('rejects oversized in-page URL changes before extracting or budgeting content', async () => {
  const taskId = randomUUID(), at = new Date().toISOString();
  store.save({ id: taskId, goal: 'Review', skill: 'general', status: 'completed', createdAt: at, updatedAt: at, steps: 1, events: [], artifacts: [], messages: [], pending: [] });
  const tab = (await workspace.openWeb('https://example.com/')).tabs[0], extract = vi.fn();
  (workspace as unknown as { views: Map<string, unknown> }).views.set(tab.id, { webContents: { getURL: () => 'https://example.com/#' + 'x'.repeat(3000), isDestroyed: () => false, isLoading: () => false, executeJavaScriptInIsolatedWorld: extract } });
  await expect(workspace.capture(tab.id, taskId)).rejects.toThrow('较短'); expect(extract).not.toHaveBeenCalled();
});
