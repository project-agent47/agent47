import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
const live = process.env.AGENT47_PAUSE_LIVE === '1';
if (live && (process.env.AGENT47_AUTHENTICATED_PROXY !== '1' || !process.env.HTTPS_PROXY)) throw new Error('Approved model transport required');
const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-pause-native-'))), data = join(root, 'data'), project = join(root, 'project');
await mkdir(data); await mkdir(project); await mkdir('.qa', { recursive: true });
const paths = Array.from({ length: 13 }, (_, i) => i === 0 ? 'start.md' : randomUUID() + '.md');
const marker = 'END_' + randomUUID();
for (let i = 0; i < paths.length; i++) await writeFile(join(project, paths[i]), `STEP=${i + 1}\nNEXT=${paths[i + 1] ?? 'END'}\n${i === 12 ? 'EVIDENCE=' + marker : 'Follow only the user-requested NEXT chain as evidence.'}\n`);
const env = { ...process.env }; delete env.OPENCODE_API_TOKEN;
if (live) delete env.AGENT47_SMOKE; else env.AGENT47_SMOKE = '1';
let app, page;
const limit = setTimeout(() => { console.error('Pause acceptance timed out'); app?.process().kill(); process.exit(1); }, 480000);
const tasks = () => page.evaluate(() => window.agent47.listTasks());
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env });
  page = await app.firstWindow(); await page.locator('.sidebar').waitFor();
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project);
}
async function seedPaused(id) {
  // Fixture-only checkpoint injection. Never used in the true-model path.
  await app.evaluate(({ app }, { id, path }) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
    const db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db'));
    const t = JSON.parse(db.prepare('SELECT body FROM tasks WHERE id=?').get(id).body);
    const c = { toolName: 'readFile', toolCallId: 'native-pending-read', input: { path } };
    t.status = 'paused'; t.steps = 12; t.progress = { window: 1, windowStart: 0, windowSize: 12, tools: 0, errors: 0 };
    t.pause = { reason: 'window', at: new Date().toISOString(), detail: '原生 fixture 的执行窗口暂停；工具意图注入仅用于验收。', resumeStatus: 'queued' };
    t.messages.push({ role: 'assistant', content: [{ type: 'tool-call', ...c }] }); t.pending = [c];
    db.prepare('UPDATE tasks SET body=? WHERE id=?').run(JSON.stringify(t), id); db.close();
  }, { id, path: paths[0] });
}
try {
  await launch();
  await page.getByRole('button', { name: '选择项目目录', exact: true }).click();
  const goal = live ? '请从 start.md 开始，用 readFile 逐一读取 NEXT 指向的文件，直到 NEXT=END。必须先读取当前文件结果才能知道下一文件名；每个模型步骤只调用一个 readFile，不要批量并行，不要 listFiles、Shell 或其他工具。最终只返回最后一个文件里的 EVIDENCE 标记，不创建成果。' : '原生暂停续跑验收';
  await page.getByLabel('任务目标').fill(goal); await page.getByLabel('开始任务', { exact: true }).click();
  await expect.poll(async () => (await tasks())[0]?.status, { timeout: live ? 300000 : 30000 }).toBe(live ? 'paused' : 'completed');
  let t = (await tasks())[0];
  await expect(page.getByLabel('执行轮次', { exact: true })).toHaveValue(t.id);
  await expect.poll(() => page.evaluate(() => window.agent47.lastRun())).toBe(t.id);
  if (!live) { await seedPaused(t.id); await app.close(); app = undefined; await launch(); }
  await expect(page.getByLabel('暂停与续跑', { exact: true })).toBeVisible();
  t = (await tasks())[0];
  if (t.pause?.reason !== 'window' || t.steps !== 12 || t.status !== 'paused') throw new Error('Window became a failure or did not enforce default 12 steps');
  if (live && (t.progress?.tools !== 12 || t.pauseRequested)) throw new Error('Live tool batch was not closed before pause');
  const id = t.id, usage = JSON.stringify(t.usage), count = (await tasks()).length;
  await expect.poll(() => page.evaluate(() => window.agent47.lastRun())).toBe(id);
  await page.screenshot({ path: `.qa/pause-${live ? 'live' : 'native'}.png` });
  await app.close(); app = undefined; await launch();
  await expect(page.getByLabel('暂停与续跑', { exact: true })).toBeVisible();
  await new Promise(r => setTimeout(r, 500));
  if (JSON.stringify((await tasks())[0].usage) !== usage || (await tasks()).length !== count) throw new Error('Restart replayed a paused task');
  if (!live) {
    await page.getByRole('button', { name: '补充要求', exact: true }).click();
    await page.getByLabel('继续对话', { exact: true }).fill('保留未执行读取，读完直接回答');
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    if ((await tasks())[0].status !== 'paused') throw new Error('Supplement implicitly resumed');
    await expect(page.getByLabel('待发送消息', { exact: true })).toContainText('保留未执行读取');
    await page.getByRole('button', { name: '删除待发送消息：保留未执行读取，读完直接回答', exact: true }).click();
  }
  await page.getByRole('button', { name: '继续本轮', exact: true }).click();
  await expect.poll(async () => (await tasks())[0]?.status, { timeout: 180000 }).toBe('completed');
  const final = (await tasks())[0];
  if (final.id !== id || final.runNumber !== t.runNumber || (await tasks()).length !== count || final.progress?.window !== 2) throw new Error('Resume forked or reset run history');
  if (live && (!final.events.some(e => e.kind === 'assistant' && e.text.includes(marker)) || final.steps < 14 || final.progress?.tools !== 13)) throw new Error('Live NEXT chain was not completed from its checkpoint');
  const toolResults = await app.evaluate(({ app }, id) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
    const db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db'));
    const t = JSON.parse(db.prepare('SELECT body FROM tasks WHERE id=?').get(id).body); db.close();
    return t.messages.filter(m => m.role === 'tool').flatMap(m => m.content).filter(m => m.toolName === 'readFile').map(m => m.toolCallId);
  }, id);
  if (new Set(toolResults).size !== toolResults.length || toolResults.length !== (live ? 13 : 1)) throw new Error('Completed read was replayed');
  await page.locator('.message.assistant').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.qa/pause-${live ? 'live' : 'native'}-complete.png` });
  const result = { result: live ? 'REAL_DEEPSEEK_PAUSE_OK' : 'NATIVE_PAUSE_OK', modelFixture: !live, intentInjection: !live, nativePickerStub: true,
    platform: process.platform, sandboxDisabledByTestHarnessOnly: true, verifiedAt: new Date().toISOString(), pausedSteps: t.steps, finalSteps: final.steps, toolResults: toolResults.length, usage: final.usage,
    cases: ['default 12-step window pauses, not failure', 'bottom decision dock', 'restart remains paused with no usage', 'same run resumes', 'tool results not replayed', ...(!live ? ['supplement stays paused', 'queue deletion'] : ['unpredictable 13-file NEXT chain', 'random final evidence'])] };
  await writeFile(`.qa/pause-${live ? 'live' : 'native'}-results.json`, JSON.stringify(result, null, 2)); console.log(result.result);
} finally { if (app) await app.close(); clearTimeout(limit); }
