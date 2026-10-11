import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
if (process.env.AGENT47_AUTHENTICATED_PROXY !== '1') throw new Error('Authorized proxy required');
const root = await mkdtemp(join(tmpdir(), 'a47-decisions-live-')), data = join(root, 'data'), project = join(root, 'project');
await mkdir(data); await mkdir(project); await mkdir('.qa', { recursive: true });
const marker = 'CUSTOM_' + randomUUID(), hostMarker = 'HOST_' + randomUUID();
const env = { ...process.env }; delete env.AGENT47_SMOKE; delete env.OPENCODE_API_TOKEN;
let app, page;
const report = { fixtureModel: false, pickerStub: true, platform: process.platform, model: 'deepseek-v4.1-flash', cases: [] };
const tasks = () => page.evaluate(() => window.agent47.listTasks());
async function until(predicate, label) {
  const end = Date.now() + 180000;
  while (Date.now() < end) { const value = await predicate(); if (value) return value; await new Promise(r => setTimeout(r, 80)); }
  throw new Error('Timeout: ' + label);
}
async function state(id, target) {
  return until(async () => {
    const task = (await tasks()).find(t => t.id === id);
    if (task?.status === 'failed') throw new Error('Task failed');
    if (task?.status === 'completed' && target !== 'completed') throw new Error(`Task completed before ${target}`);
    return task?.status === target && task;
  }, target);
}
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env });
  page = await app.firstWindow(); await page.getByLabel('任务目标').waitFor();
  app.process().stderr.on('data', bytes => { for (const line of bytes.toString().split('\n')) if (line.startsWith('[model-diagnostic] ')) console.error(line); });
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, project);
}
async function create(goal, folder = false) {
  await page.getByRole('button', { name: '新任务', exact: false }).first().click();
  if (folder) await page.getByRole('button', { name: '选择项目目录', exact: true }).click();
  await page.getByLabel('任务目标').fill(goal); await page.getByLabel('开始任务', { exact: true }).click();
  return until(async () => (await tasks()).find(t => t.goal === goal), 'created');
}
const questions = [
  { id: 'audience', header: '受众', prompt: '这份 TypeScript 文档给谁看？', type: 'single', required: true, allowCustom: true, options: [{ id: 'team', label: '团队' }, { id: 'public', label: '公众' }] },
  { id: 'topics', header: '内容', prompt: '包含哪些内容？', type: 'multiple', required: true, allowCustom: true, options: [{ id: 'plan', label: '计划' }, { id: 'tests', label: '测试' }] },
  { id: 'notes', header: '补充', prompt: '可选补充？', type: 'text', required: false, allowCustom: true, options: [] }
];
try {
  await launch();
  const task = await create(`TypeScript documentation interaction test: immediately call askUser with exactly this input: ${JSON.stringify({ questions })}. Do not call other tools. After the answers are submitted, repeat all supplied answers verbatim, then finish. On cancellation finish without tools.`);
  const pending = await state(task.id, 'awaiting_input');
  if (pending.question.questions.length !== 3) throw new Error('Batch questions missing');
  await page.getByRole('radio', { name: '自定义答案', exact: true }).check();
  await page.getByLabel('自定义回答：受众').fill(marker);
  await page.getByRole('button', { name: '下一题', exact: true }).click();
  await page.getByRole('checkbox', { name: '计划', exact: true }).check();
  await page.getByRole('checkbox', { name: '测试', exact: true }).check();
  await until(async () => (await tasks()).find(t => t.id === task.id)?.question?.draft?.answers?.some(a => a.questionId === 'topics' && a.selectedOptionIds.length === 2), 'persisted draft');
  await page.getByRole('button', { name: '补充要求', exact: true }).click();
  await page.getByLabel('继续对话', { exact: true }).fill('聊天草稿不应成为答案');
  await page.getByRole('button', { name: '回到待回答／确认' }).click();
  await until(async () => (await tasks()).find(t => t.id === task.id)?.composerDraft === '聊天草稿不应成为答案', 'persisted composer');
  await page.screenshot({ path: '.qa/decisions-live-question.png', animations: 'disabled' });
  await app.close(); app = undefined; await launch();
  await page.locator('.task-row').filter({ hasText: 'TypeScript documentation interaction test:' }).click();
  await expect(page.getByRole('checkbox', { name: '计划', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '测试', exact: true })).toBeChecked();
  if ((await tasks()).find(t => t.id === task.id).steps !== pending.steps) throw new Error('Restart made extra model request');
  await page.getByRole('button', { name: '下一题', exact: true }).click();
  await page.getByRole('button', { name: '跳过这道可选题', exact: true }).click();
  await page.getByRole('button', { name: '下一题', exact: true }).click();
  await page.screenshot({ path: '.qa/decisions-live-review.png', animations: 'disabled' });
  await page.getByRole('button', { name: '提交全部答案', exact: true }).click();
  const done = await state(task.id, 'completed');
  if (!done.events.some(e => e.kind === 'assistant' && e.text.includes(marker) && e.text.includes('计划') && e.text.includes('测试'))) throw new Error('Real model did not receive exact answers');
  await expect(page.getByLabel('继续对话', { exact: true })).toHaveValue('聊天草稿不应成为答案');
  report.cases.push({ name: 'real multi-question choices/custom/skip + SQLite restart + one submission + draft separation', passed: true, steps: done.steps });

  const cancelled = await create(`TypeScript coding test: call askUser with ${JSON.stringify({ questions: [questions[0]] })}. On cancellation do not ask again or create files; finish with a brief acknowledgement.`);
  await state(cancelled.id, 'awaiting_input'); await page.getByRole('button', { name: '取消本次提问' }).click();
  const cancelledDone = await state(cancelled.id, 'completed');
  if (cancelledDone.artifacts.length) throw new Error('Cancelled question caused artifact');
  report.cases.push({ name: 'cancel returned to actual model without artifact', passed: true });

  await page.evaluate(() => window.agent47.setExecutionSettings({ fileMode: 'ask', hostExecution: false }));
  const artifact = await create('TypeScript tool test: call writeArtifact for first.md containing "first". After successful saving call writeArtifact for second.md containing "second". If denied do not retry. After both saves finish.');
  await state(artifact.id, 'awaiting_approval');
  await expect(page.getByLabel('确认工具操作')).toBeVisible();
  await expect(page.getByLabel('继续对话', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '按范围授权本次对话…', exact: true }).click();
  await page.getByRole('button', { name: '确认范围并批准', exact: true }).click();
  const artifacts = await state(artifact.id, 'completed');
  if (artifacts.artifacts.length !== 2 || artifacts.fileMode !== 'snapshot') throw new Error('Scoped file grant failed');
  report.cases.push({ name: 'dock approval + conversation file scope, second artifact without repeat prompt', passed: true });

  const trusted = await create('TypeScript documentation test: call askUser using the legacy question string "文档标题是什么？". Once answered repeat the title and finish. Do not call other tools.', true);
  await state(trusted.id, 'awaiting_input');
  await page.locator('.permission-disclosure').first().locator('summary').click();
  await page.getByRole('button', { name: '开启可信对话', exact: true }).click();
  await page.screenshot({ path: '.qa/decisions-live-trust.png', animations: 'disabled' });
  await page.getByRole('button', { name: '我理解范围，开启可信对话', exact: true }).click();
  await page.getByLabel('自定义回答：补充信息').fill('Host 验收文档');
  await page.getByRole('button', { name: '下一题', exact: true }).click();
  await page.getByRole('button', { name: '提交全部答案', exact: true }).click();
  await state(trusted.id, 'completed');
  await page.getByLabel('继续对话', { exact: true }).fill('TypeScript host execution test: runCode in cwd "." with code ' +
    JSON.stringify(`require('node:fs').writeFileSync('node.txt', ${JSON.stringify(hostMarker)}); console.log('NODE_OK')`) +
    '. Then runShell in cwd "." with command ' + JSON.stringify(`printf '${hostMarker}' > shell.txt`) +
    '. Do not create files in other ways. Finally report the exact tool outputs. If execution is disabled stop and explain.');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  const next = await until(async () => (await tasks()).find(t => t.parentRunId === trusted.id), 'trusted followup');
  const host = await state(next.id, 'completed');
  if (await readFile(join(project, 'node.txt'), 'utf8') !== hostMarker || await readFile(join(project, 'shell.txt'), 'utf8') !== hostMarker) throw new Error('Host execution evidence absent');
  if (!host.events.some(e => e.kind === 'tool' && e.text.startsWith('runCode')) || !host.events.some(e => e.kind === 'tool' && e.text.startsWith('runShell'))) throw new Error('Missing real host execution events');
  await page.evaluate(() => window.agent47.setExecutionSettings({ hostExecution: false }));
  if ((await tasks()).find(t => t.id === next.id).hostMode !== 'ask') throw new Error('Global revocation failed');
  report.cases.push({ name: 'visible trusted conversation enables actual Node/Shell without repeat prompts; global revoke', passed: true });
  report.result = 'REAL_DECISIONS_E2E_OK';
  await writeFile('.qa/decisions-live-results.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) { console.error('Decision acceptance failed:', error.message); if (page) await page.screenshot({ path: '.qa/decisions-live-failure.png' }).catch(() => {}); process.exitCode = 1; }
finally { if (app) await app.close(); }
