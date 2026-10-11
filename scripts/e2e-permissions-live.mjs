import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { answerQuestions } from './decision-test-ui.mjs';

if (process.env.AGENT47_AUTHENTICATED_PROXY !== '1') throw new Error('Authorized proxy required');
const root = await mkdtemp(join(tmpdir(), 'agent47-permissions-live-'));
const data = join(root, 'data'), project = join(root, 'project');
await mkdir(data); await mkdir(project); await mkdir('.qa', { recursive: true });
await writeFile(join(project, 'README.md'), 'ORIGINAL_README_47');
const env = { ...process.env }; delete env.AGENT47_SMOKE; delete env.OPENCODE_API_TOKEN;
let app, page;
const report = { fixtureModel: false, pickerStub: true, platform: process.platform, cases: [] };
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env });
  app.process().stderr.on('data', chunk => { for (const line of chunk.toString().split('\n')) if (line.startsWith('[model-diagnostic] ')) console.error(line); });
  page = await app.firstWindow(); await page.locator('.sidebar').waitFor();
  page.on('dialog', dialog => dialog.accept());
}
const tasks = () => page.evaluate(() => window.agent47.listTasks());
async function wait(id, status) {
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    const task = (await tasks()).find(t => t.id === id);
    if (task?.status === status) return task;
    if (['failed', 'awaiting_approval', 'awaiting_reconciliation'].includes(task?.status)) throw new Error(`Unexpected ${task.status}: ${JSON.stringify(task.events.filter(e => e.kind === 'error'))}`);
    await new Promise(r => setTimeout(r, 80));
  }
  throw new Error(`Timeout: ${status}`);
}
try {
  await launch();
  const settings = await page.evaluate(() => window.agent47.executionSettings());
  if (settings.fileMode !== 'snapshot' || settings.hostExecution) throw new Error('Unsafe or incorrect defaults');
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, project);
  await page.getByRole('button', { name: '选择项目目录', exact: true }).click();
  const goal = 'This is a TypeScript coding-agent file-tool acceptance test in a disposable project. Shell and JavaScript are disabled. Use only file tools: read README.md and edit ORIGINAL_README_47 to MODIFIED_README_47 using the returned hash; write governance/README.md with exact content GOVERNANCE_NESTED_OK_47 and expectedHash null (parents do not yet exist); create empty directory governance/empty with makeDirectory. Do not write any other files. After all three operations succeed, use askUser to ask "Ready to finish?" Then when the user answers yes, finish without additional tools.';
  await page.getByLabel('任务目标').fill(goal); await page.getByLabel('开始任务', { exact: true }).click();
  const task = (await tasks()).find(t => t.goal === goal);
  const paused = await wait(task.id, 'awaiting_input');
  if (paused.fileChanges.length !== 3 || await readFile(join(project, 'README.md'), 'utf8') !== 'MODIFIED_README_47' ||
      await readFile(join(project, 'governance/README.md'), 'utf8') !== 'GOVERNANCE_NESTED_OK_47' ||
      !(await lstat(join(project, 'governance/empty'))).isDirectory()) throw new Error('File/dir batch incomplete');
  await answerQuestions(page, task.id, 'yes'); await wait(task.id, 'completed');
  report.cases.push({ name: 'real DeepSeek edits existing file, writes missing governance parent and creates empty directory; shell disabled; zero approval clicks', snapshots: 3, passed: true });
  await app.close(); await launch();
  await page.locator('.recent-item').first().click();
  await page.getByText('文件改动与恢复点（写入前自动备份）', { exact: true }).click();
  await page.screenshot({ path: '.qa/permissions-desktop.png', fullPage: true, animations: 'disabled' });
  // Restore via the actual UI after a real Electron restart.
  const row = path => page.locator('.snapshot-row').filter({ has: page.locator('span', { hasText: path }) });
  if (process.env.AGENT47_BATCH_UNDO === '1') {
    await page.getByRole('button', { name: '撤销第 1 轮文件改动', exact: true }).click();
    await page.getByRole('button', { name: '确认撤销本轮文件', exact: true }).click();
    await expect.poll(async () => (await tasks()).find(t => t.id === task.id).undo?.state).toBe('completed');
    report.cases.push({ name: 'single UI confirmation reverses the whole real-model run after restart', restored: 3, passed: true, atomic: false });
  } else {
    await row('governance/empty').getByRole('button', { name: '恢复改动前', exact: true }).click();
    await page.getByRole('button', { name: '确认恢复', exact: true }).click();
    await row('governance/README.md').getByRole('button', { name: '恢复改动前', exact: true }).click();
    await page.getByRole('button', { name: '确认恢复', exact: true }).click();
    await row('README.md').filter({ hasNotText: 'governance/' }).getByRole('button', { name: '恢复改动前', exact: true }).click();
    await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  }
  await expect.poll(() => readFile(join(project, 'README.md'), 'utf8')).toBe('ORIGINAL_README_47');
  try { await lstat(join(project, 'governance')); throw new Error('Created parent was not removed'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  report.cases.push({ name: 'real desktop restart, persisted snapshots, UI restoration of existing file and newly created directory tree', passed: true });

  await page.getByRole('button', { name: '连接设置与工具', exact: true }).click();
  await expect(page.getByRole('heading', { name: '工具设置', exact: true })).toBeVisible();
  if (process.env.AGENT47_BATCH_UNDO === '1') {
    await expect(page.getByLabel('快照保留策略')).toHaveValue('0');
    await expect(page.getByRole('button', { name: '清理过期快照', exact: true })).toBeDisabled();
    await page.getByLabel('快照保留策略').selectOption('7');
    await expect(page.getByText('保留策略已保存。')).toBeVisible();
    await page.getByRole('button', { name: '清理过期快照', exact: true }).click();
    await expect(page.getByText('已清理 0 项；0 项未清理。')).toBeVisible();
    // Age disposable fixture timestamps only; real SQLite/IPC/cleanup stay in use.
    await app.evaluate(({ app }, id) => {
      const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
      const { join } = process.getBuiltinModule('node:path');
      const db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db'));
      const body = JSON.parse(db.prepare('SELECT body FROM tasks WHERE id=?').get(id).body);
      body.updatedAt = '2000-01-01T00:00:00.000Z';
      db.prepare('UPDATE tasks SET body=? WHERE id=?').run(JSON.stringify(body), id); db.close();
    }, task.id);
    await page.getByRole('button', { name: '清理过期快照', exact: true }).click();
    await expect(page.getByText('已清理 3 项；0 项未清理。')).toBeVisible();
    if (await readFile(join(project, 'README.md'), 'utf8') !== 'ORIGINAL_README_47') throw new Error('Cleanup modified project');
    report.cases.push({ name: 'explicit retention UI keeps fresh backups, then purges aged disposable backup data via real IPC/SQLite', passed: true, fixtureTimestampsAged: true });
  }
  await page.getByRole('button', { name: '我理解风险，启用本机 Shell / JavaScript', exact: true }).click();
  await expect(page.getByRole('button', { name: '关闭本机 Shell / JavaScript', exact: true })).toBeVisible();
  await page.screenshot({ path: '.qa/tool-settings-desktop.png', fullPage: true, animations: 'disabled' });
  await page.locator('.recent-item').first().click();
  await page.locator('.permission-disclosure').first().locator('summary').click();
  await page.getByLabel('本次对话执行权限').selectOption('allow');
  await page.getByRole('button', { name: '授权本次对话免确认', exact: true }).click();
  const command = process.platform === 'win32' ? 'echo TRUSTED_SHELL_OK_47' : 'printf TRUSTED_SHELL_OK_47';
  const text = `In this disposable coding test, the user has enabled trusted host tools. Call runCode with exactly code console.log("TRUSTED_NODE_OK_47", process.versions.node); cwd "." timeoutMs 10000. Also call runShell with exactly command ${command} cwd "." timeoutMs 10000. No file writes, no extra commands, no permissions questions. Finish by quoting both actual outputs.`;
  await page.getByLabel('继续对话', { exact: true }).fill(text); await page.getByRole('button', { name: '发送消息', exact: true }).click();
  const next = (await tasks()).find(t => t.parentRunId === task.id);
  const done = await wait(next.id, 'completed');
  if (!done.events.some(e => e.kind === 'tool' && e.text.includes('TRUSTED_NODE_OK_47')) || !done.events.some(e => e.kind === 'tool' && e.text.includes('TRUSTED_SHELL_OK_47'))) throw new Error('Actual trusted host executions missing');
  report.cases.push({ name: 'visible settings UI + scoped trust selection + real Node/Shell execution without repeated approvals', passed: true, sandboxed: false });
  await page.getByRole('button', { name: '连接设置与工具', exact: true }).click();
  await page.getByRole('button', { name: '关闭本机 Shell / JavaScript', exact: true }).click();
  if ((await tasks()).some(t => t.hostMode === 'allow')) throw new Error('Disable failed to revoke host scopes');
  await app.close(); await launch();
  const saved = await page.evaluate(() => window.agent47.executionSettings());
  if (saved.hostExecution || saved.fileMode !== 'snapshot') throw new Error('Settings did not persist');
  if (process.env.AGENT47_BATCH_UNDO === '1' && (await page.evaluate(() => window.agent47.snapshotSettings())).retentionDays !== 7) throw new Error('Retention did not persist');
  report.cases.push({ name: 'global disable revokes all conversation host grants and remains disabled after restart', passed: true });
  report.result = process.env.AGENT47_BATCH_UNDO === '1' ? 'REAL_RUN_UNDO_RETENTION_E2E_OK' : 'REAL_PERMISSIONS_SNAPSHOTS_E2E_OK'; report.verifiedAt = new Date().toISOString();
  await writeFile(process.env.AGENT47_BATCH_UNDO === '1' ? '.qa/run-undo-live-results.json' : '.qa/permissions-live-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await app?.close(); }
