import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, realpath, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const live = process.env.AGENT47_PROJECTS_LIVE === '1';
if (live && (process.env.AGENT47_AUTHENTICATED_PROXY !== '1' || !process.env.HTTPS_PROXY)) throw new Error('Approved transport required');
const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-projects-'))), data = join(root, 'data'), work = join(root, 'daily');
await mkdir(data); await mkdir(work); await mkdir('.qa', { recursive: true });
const marker = 'DAILY_' + randomUUID();
await writeFile(join(work, 'notes.md'), '# 周报资料\n\n完成事项：材料整理。\n证据：' + marker);
const env = { ...process.env }; delete env.OPENCODE_API_TOKEN;
if (live) delete env.AGENT47_SMOKE; else env.AGENT47_SMOKE = '1';
let app, page;
const deadline = setTimeout(() => { console.error('Project acceptance timed out'); app?.process().kill(); process.exit(1); }, 300000);
const tasks = () => page.evaluate(() => window.agent47.listTasks());
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env }); page = await app.firstWindow();
  await page.locator('.sidebar').waitFor(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
}
async function done(id) { await expect.poll(async () => (await tasks()).find(t => t.id === id)?.status, { timeout: 180000 }).toBe('completed'); return (await tasks()).find(t => t.id === id); }
try {
  await launch();
  await page.getByLabel('新建项目', { exact: true }).click(); await page.getByLabel('新项目名称').fill('日常工作');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.agent47.projects())).toMatchObject({ projects: [{ name: '日常工作' }] });
  const project = (await page.evaluate(() => window.agent47.projects())).projects[0];
  if ((await tasks()).length) throw new Error('Creating project called model');
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, work);
  await page.getByText('项目设置', { exact: true }).click(); await page.getByRole('button', { name: '选择项目目录', exact: true }).click();
  await page.getByRole('button', { name: '确认项目目录授权', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.agent47.projects())).toMatchObject({ projects: [{ rootEnabled: true }] });
  await page.getByText('项目设置', { exact: true }).click();
  await page.getByRole('button', { name: '项目文件与成果', exact: true }).click();
  await page.getByLabel('项目文件与成果', { exact: true }).getByRole('button', { name: /notes\.md/ }).click();
  await expect(page.locator('.document-markdown')).toContainText(marker);
  if ((await tasks()).length) throw new Error('Viewing project file invoked model');
  await page.getByLabel('任务目标').fill('请读取项目 notes.md，使用 writeFile 创建 brief/周报.md，以中文整理事项并原样保留文件中的 DAILY_完整证据标记；不使用Shell，不猜测标记。完成后说明保存路径。');
  await page.getByLabel('开始任务', { exact: true }).click();
  await expect.poll(async () => (await tasks()).length).toBe(1);
  const first = (await tasks())[0]; await done(first.id);
  if (!live) {
    await app.evaluate(({ app }, input) => {
      const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
      const db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db')), t = JSON.parse(db.prepare('SELECT body FROM tasks WHERE id=?').get(input.id).body);
      const call = { toolName: 'writeFile', toolCallId: 'fixture-project-write', input: { path: 'brief/周报.md', content: '# 周报\n\n' + input.marker, expectedHash: null } };
      t.pending = [call]; t.status = 'queued'; t.messages.push({ role: 'assistant', content: [{ type: 'tool-call', ...call }] });
      db.prepare('UPDATE tasks SET body=? WHERE id=?').run(JSON.stringify(t), t.id); db.close();
    }, { id: first.id, marker });
    await page.evaluate(id => window.agent47.sendMessage({ taskId: id, text: 'continue fixture', mode: 'queue', clientMessageId: crypto.randomUUID() }), first.id); await done(first.id);
  }
  const completed = await done(first.id);
  if (completed.projectId !== project.id || completed.root !== work || completed.hostMode !== 'ask' || completed.fileChanges.length !== 1) throw new Error('Project binding/snapshot/host boundary missing');
  if (!(await readFile(join(work, 'brief', '周报.md'), 'utf8')).includes(marker)) throw new Error('Daily deliverable evidence missing');
  await page.getByLabel('继续对话', { exact: true }).fill('保留日常工作的追问草稿');
  await expect.poll(async () => (await tasks())[0].composerDraft).toBe('保留日常工作的追问草稿');
  const other = await page.evaluate(() => window.agent47.createProject({ name: '旅行规划', clientRequestId: crypto.randomUUID() }));
  await page.locator('.project-nav').getByRole('button', { name: '旅行规划', exact: true }).click();
  await expect(page.getByLabel('任务目标')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'notes.md', exact: true })).toHaveCount(0);
  await page.locator('.project-nav').getByRole('button', { name: '日常工作', exact: true }).click();
  await expect(page.getByLabel('继续对话', { exact: true })).toHaveValue('保留日常工作的追问草稿');
  await expect(page.getByRole('tab', { name: 'notes.md', exact: true })).toBeVisible();
  await page.screenshot({ path: `.qa/projects-${live ? 'live' : 'native'}.png`, animations: 'disabled' });
  await app.close(); app = undefined; await launch();
  await expect(page.getByLabel('继续对话', { exact: true })).toHaveValue('保留日常工作的追问草稿');
  await expect(page.getByRole('tab', { name: 'notes.md', exact: true })).toBeVisible();
  const view = await page.evaluate(() => window.agent47.projects());
  if (view.currentId !== project.id) throw new Error('Project scope lost at restart');
  const count = (await tasks()).length;
  await page.getByRole('button', { name: '新任务', exact: false }).first().click(); await page.getByLabel('任务目标').fill('只回答项目入口正常，不调用工具。');
  await page.getByLabel('开始任务', { exact: true }).click();
  await expect.poll(async () => (await tasks()).length).toBe(count + 1); const second = await done((await tasks())[0].id);
  if (second.projectId !== project.id || second.root !== work || second.hostMode !== 'ask' || second.sources.length || second.materials.length) throw new Error('New conversation implicitly shared context/trust');
  const p = (await page.evaluate(() => window.agent47.projects())).projects.find(p => p.id === project.id);
  await page.evaluate(p => window.agent47.bindProjectFolder({ id: p.id, expectedRevision: p.revision, revoke: true }), p);
  await expect.poll(() => page.evaluate(() => window.agent47.projects())).toMatchObject({ projects: expect.arrayContaining([expect.objectContaining({ id: project.id, rootEnabled: false })]) });
  const rejected = await page.evaluate(async id => { try { await window.agent47.projectFiles({ id, path: '' }); return false; } catch { return true; } }, project.id);
  if (!rejected) throw new Error('Revoked directory still browsable');
  const moved = await page.evaluate(({ taskId, projectId }) => window.agent47.assignProject({ taskId, projectId }), { taskId: second.id, projectId: other.id }); void moved;
  const final = (await tasks()).find(t => t.id === second.id); if (final.root !== work || final.projectId !== other.id) throw new Error('Assignment redirected old root');
  await writeFile(`.qa/projects-${live ? 'live' : 'native'}-results.json`, JSON.stringify({ result: live ? 'REAL_DEEPSEEK_PROJECTS_OK' : 'NATIVE_PROJECTS_OK', modelFixture: !live, intentInjection: !live, nativePickerStub: true, platform: process.platform, verifiedAt: new Date().toISOString(), steps: [completed.steps, second.steps],
    cases: ['create/view without model', 'persistent project root reused', 'file write snapshots without per-file approval', 'host trust not inherited', 'scope-specific viewer tabs', 'draft and latest conversation restart', 'independent new conversation context', 'root revoke', 'move preserves old execution root'] }, null, 2));
  console.log(live ? 'REAL_DEEPSEEK_PROJECTS_OK' : 'NATIVE_PROJECTS_OK');
} finally { if (app) await app.close(); clearTimeout(deadline); }
