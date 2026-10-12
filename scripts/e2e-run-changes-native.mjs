import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, realpath, writeFile, unlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const live = process.env.AGENT47_CHANGES_LIVE === '1';
if (live && (process.env.AGENT47_AUTHENTICATED_PROXY !== '1' || !process.env.HTTPS_PROXY)) throw new Error('Approved model transport required');
const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-changes-'))), data = join(root, 'data'), project = join(root, 'project');
await mkdir(data); await mkdir(project); await mkdir('.qa', { recursive: true });
const marker = 'DAILY_SOURCE_' + randomUUID(), sourceFile = join(project, 'notes.md');
await writeFile(sourceFile, '# 原始资料\n' + marker);
const env = { ...process.env }; delete env.OPENCODE_API_TOKEN;
if (live) delete env.AGENT47_SMOKE; else env.AGENT47_SMOKE = '1';
let app, page;
const deadline = setTimeout(() => { console.error('Changes acceptance timed out'); app?.process().kill(); process.exit(1); }, 300000);
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env }); page = await app.firstWindow();
  await page.locator('.sidebar').waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
}
const tasks = () => page.evaluate(() => window.agent47.listTasks());
async function done(id) {
  await expect.poll(async () => ['completed', 'failed', 'paused', 'awaiting_approval'].includes((await tasks()).find(t => t.id === id)?.status), { timeout: 180000 }).toBe(true);
  const task = (await tasks()).find(t => t.id === id);
  if (task.status !== 'completed') throw new Error(`Run ended ${task.status}: ${task.events.filter(e => e.kind === 'error').map(e => e.text).join('; ')}`);
  return task;
}
async function fixtureCalls(id, calls) {
  if (live) throw new Error('No injected intents in live acceptance');
  await app.evaluate(({ app }, input) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
    const db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db'));
    const task = JSON.parse(db.prepare('SELECT body FROM tasks WHERE id=?').get(input.id).body);
    task.pending = input.calls; task.status = 'queued';
    task.messages.push({ role: 'assistant', content: input.calls.map(call => ({ type: 'tool-call', ...call })) });
    db.prepare('UPDATE tasks SET body=? WHERE id=?').run(JSON.stringify(task), input.id); db.close();
  }, { id, calls });
  await page.evaluate(async id => { await window.agent47.pauseTask(id); await window.agent47.resumeTask(id); }, id);
  return done(id);
}
try {
  await launch();
  await app.evaluate(({ dialog }, project) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] }); }, project);
  await page.getByRole('button', { name: '选择项目目录', exact: true }).click();
  await page.getByLabel('任务目标').fill('使用 readFile 读取 notes.md，再用 writeFile 新建 draft.md，正文包含真实读取到的完整 DAILY_SOURCE_ 标记。再用 writeArtifact 保存 brief.md：Markdown 简报包含相同完整标记，以及指向 readFile 返回 source.uri 的 Markdown 来源链接，链接文字为“核对原始资料”。最后简短回复。不要运行 Shell、不要猜测 source ID、不创建其他文件。');
  await page.getByLabel('开始任务', { exact: true }).click();
  await expect.poll(async () => (await tasks()).length).toBe(1);
  const id = (await tasks())[0].id;
  let task = await done(id);
  if (!live) {
    task = await fixtureCalls(id, [{ toolName: 'readFile', toolCallId: 'read-notes', input: { path: 'notes.md' } }]);
    const source = task.sources[0];
    task = await fixtureCalls(id, [
      { toolName: 'writeFile', toolCallId: 'write-draft', input: { path: 'draft.md', content: marker, expectedHash: null } },
      { toolName: 'writeArtifact', toolCallId: 'save-brief', input: { name: 'brief.md', content: `# 简报\n\n${marker}\n\n[核对原始资料](${source.uri})` } }
    ]);
  }
  const artifact = task.artifacts.find(a => a.name === 'brief.md'), source = task.sources.find(s => artifact?.evidenceIds?.includes(s.id));
  if (!artifact || !source || !artifact.content.includes(marker) || !artifact.content.includes(source.uri) || !(await readFile(join(project, 'draft.md'), 'utf8')).includes(marker)) throw new Error('Model/output/source evidence missing');
  const usage = task.usage?.length ?? 0;
  await page.getByLabel('继续对话', { exact: true }).fill('保留下一次简报修订草稿');
  await expect.poll(async () => (await tasks())[0].composerDraft).toBe('保留下一次简报修订草稿');
  await page.getByRole('button', { name: '打开本轮变动', exact: true }).click();
  const changes = page.getByLabel('本轮变动与恢复', { exact: true });
  await expect(changes).toContainText('draft.md');
  await changes.getByRole('button', { name: '查看差异', exact: true }).click();
  await expect(page.getByRole('tab', { name: /差异/ })).toBeVisible();
  await changes.getByRole('button', { name: /brief\.md/ }).click();
  await page.locator('.document-markdown').getByRole('button', { name: /^核对原始资料/ }).click();
  await expect(page.getByLabel('来源证据版本与范围')).toContainText('notes.md');
  const archived = (await page.evaluate(() => window.agent47.workspaceView())).tabs.find(t => t.source === 'evidence');
  if (!archived?.content.includes(marker) || (await tasks())[0].usage.length !== usage) throw new Error('Evidence not archived or viewing called model');
  await unlink(sourceFile);
  await app.close(); app = undefined; await launch();
  await expect(page.getByLabel('继续对话', { exact: true })).toHaveValue('保留下一次简报修订草稿');
  await page.getByRole('tab', { name: 'brief.md', exact: true }).click();
  await expect(page.locator('.document-markdown').getByRole('button', { name: /^核对原始资料/ })).toBeVisible();
  await page.screenshot({ path: `.qa/changes-${live ? 'live' : 'native'}-artifact.png`, animations: 'disabled' });
  await page.locator('.document-markdown').getByRole('button', { name: /^核对原始资料/ }).click();
  await expect(page.getByLabel('来源证据版本与范围')).toContainText('notes.md');
  if ((await tasks()).length !== 1 || (await tasks())[0].usage.length !== usage) throw new Error('Restart/citation replayed model');
  await page.getByRole('button', { name: '打开本轮变动', exact: true }).click();
  await expect(page.getByLabel('变动轮次范围')).toHaveValue('run');
  await page.getByLabel('本轮变动与恢复', { exact: true }).getByRole('button', { name: '恢复改动前', exact: true }).click();
  await expect(page.getByLabel('对话输入区')).toContainText('恢复 draft.md');
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect.poll(async () => (await tasks())[0].fileChanges[0].state).toBe('restored');
  let removed = false; try { await readFile(join(project, 'draft.md')); } catch (error) { removed = error.code === 'ENOENT'; }
  if (!removed) throw new Error('New file restore did not remove output');
  await page.screenshot({ path: `.qa/changes-${live ? 'live' : 'native'}-evidence.png`, animations: 'disabled' });
  await writeFile(`.qa/changes-${live ? 'live' : 'native'}-results.json`, JSON.stringify({
    result: live ? 'REAL_DEEPSEEK_CHANGES_OK' : 'NATIVE_CHANGES_OK',
    modelFixture: !live, intentInjection: !live, nativePickerStub: true, platform: process.platform,
    verifiedAt: new Date().toISOString(), steps: task.steps, usageRequests: usage,
    artifactHash: artifact.sha256, boundSourceIds: artifact.evidenceIds,
    cases: ['read actual random source', 'write file + save cited artifact', 'run change entry + recorded diff', 'artifact citation opens archived read', 'source deleted + app restart preserves binding', 'draft preserved + zero extra model calls', 'bottom decision restore removes newly created file']
  }, null, 2));
  console.log(live ? 'REAL_DEEPSEEK_CHANGES_OK' : 'NATIVE_CHANGES_OK');
} finally { if (app) await app.close(); clearTimeout(deadline); }
