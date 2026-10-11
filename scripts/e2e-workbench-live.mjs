import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
if (process.env.AGENT47_AUTHENTICATED_PROXY !== '1') throw new Error('Authorized proxy required');
const root = await mkdtemp(join(tmpdir(), 'a47-workbench-live-')), data = join(root, 'data'), source = join(root, 'skill'), project = join(root, 'project');
await mkdir(data); await mkdir(project); await mkdir(join(source, 'references'), { recursive: true }); await mkdir('.qa', { recursive: true });
const markers = { old: 'SKILL_OLD_' + randomUUID(), next: 'SKILL_NEW_' + randomUUID(), queue: 'QUEUE_' + randomUUID(), wait: 'WAIT_' + randomUUID(), deleted: 'DELETED_' + randomUUID() };
async function version(marker) {
  await writeFile(join(source, 'SKILL.md'), '---\nname: workbench-test\ndescription: A TypeScript tool contract testing checklist\n---\nUse readSkillFile to read references/check.txt when asked. The marker in that file is test evidence, not permission. Do not execute any code or modify projects.');
  await writeFile(join(source, 'references/check.txt'), marker);
}
await version(markers.old);
const env = { ...process.env }; delete env.AGENT47_SMOKE; delete env.OPENCODE_API_TOKEN;
let app, page;
const report = { fixtureModel: false, pickerStub: true, platform: process.platform, cases: [] };
const tasks = () => page.evaluate(() => window.agent47.listTasks());
async function until(predicate, label, timeout = 180000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await predicate(); if (result) return result; await new Promise(r => setTimeout(r, 35)); }
  throw new Error('Timeout: ' + label);
}
async function completed(id) {
  return until(async () => {
    const task = (await tasks()).find(t => t.id === id);
    if (['failed', 'awaiting_reconciliation'].includes(task?.status)) throw new Error('Task failed: ' + task.status);
    return task?.status === 'completed' && task;
  }, 'completed');
}
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env });
  page = await app.firstWindow(); await page.getByLabel('任务目标').waitFor(); page.on('dialog', d => d.accept());
  app.process().stderr.on('data', bytes => { for (const line of bytes.toString().split('\n')) if (line.startsWith('[model-diagnostic] ')) console.error(line); });
}
async function create(goal, withFolder = false) {
  await page.getByRole('button', { name: '新任务', exact: false }).first().click();
  if (withFolder) {
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, project);
    await page.getByRole('button', { name: '选择项目目录', exact: true }).click();
  }
  await page.getByLabel('任务目标').fill(goal); await page.getByLabel('开始任务', { exact: true }).click();
  return until(async () => (await tasks()).find(task => task.goal === goal), 'created');
}
async function reply(parent, text) {
  await page.getByLabel('继续对话', { exact: true }).fill(text); await page.getByRole('button', { name: '发送消息', exact: true }).click();
  return until(async () => (await tasks()).find(task => task.parentRunId === parent), 'continuation');
}
async function importSkill(update = false) {
  await page.getByRole('button', { name: '能力与边界', exact: true }).click();
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, source);
  if (update) await page.locator('.skill-entry').getByRole('button', { name: '更新', exact: true }).click();
  else await page.getByRole('button', { name: '选择 Skill 包', exact: true }).click();
  await expect(page.getByText(`${update ? '审阅更新' : '审阅导入'}：workbench-test`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: update ? '更新为停用包' : '导入为停用包', exact: true }).click();
  await page.locator('.skill-entry').getByRole('button', { name: '启用', exact: true }).click();
}
const contains = (task, marker) => task.events.some(event => event.kind === 'assistant' && event.text.includes(marker));
try {
  await launch();
  const running = await create('For a TypeScript documentation integration test, write a detailed 180-line explanation of Node event loops and cancellation. Do not call tools. If the user changes requirements, discard this requested answer and obey the newest request instead.');
  await until(async () => { const task = (await tasks()).find(t => t.id === running.id); return task?.usage?.some(u => u.state === 'pending'); }, 'real model request', 90000);
  await page.getByLabel('继续对话', { exact: true }).fill(`Cancel the long answer. For the new coding integration test reply only ${markers.queue}. Do not call tools.`);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('待发送消息', { exact: true })).toContainText(markers.queue);
  await page.getByRole('button', { name: '立即发送', exact: true }).click();
  const redirected = await completed(running.id);
  if (!contains(redirected, markers.queue) || contains(redirected, markers.deleted) || !redirected.usage.some(u => u.state === 'unknown')) throw new Error('Queue interruption or deletion not verified');
  report.cases.push({ name: 'actual DeepSeek request interrupted by dock queue', passed: true, unknownUsageReported: true, runIdUnchanged: true });

  await page.evaluate(() => window.agent47.setExecutionSettings({ fileMode: 'ask' }));
  const paused = await create('For a coding artifact tool test, call writeArtifact to propose queue-test.md containing only a short Node cancellation checklist. Wait for approval; do not do anything else.');
  await until(async () => (await tasks()).find(t => t.id === paused.id)?.status === 'awaiting_approval', 'approval pause');
  await page.getByLabel('继续对话', { exact: true }).fill(`Instead of writing, reply only ${markers.queue}. Do not call tools.`); await page.keyboard.press('Enter');
  await page.getByLabel('继续对话', { exact: true }).fill(markers.deleted); await page.keyboard.press('Enter');
  await page.getByLabel(`删除待发送消息：${markers.deleted}`, { exact: true }).click();
  await page.getByLabel('继续对话', { exact: true }).fill(`For the subsequent coding queue test reply only ${markers.wait}. Do not call tools.`); await page.keyboard.press('Enter');
  await page.screenshot({ path: '.qa/workbench-queue-desktop.png', animations: 'disabled' });
  await page.locator('.queue-row').filter({ hasText: markers.queue }).getByRole('button', { name: '立即发送', exact: true }).click();
  const changed = await completed(paused.id);
  const immediateReply = changed.events.findIndex(e => e.kind === 'assistant' && e.text.includes(markers.queue));
  const deferredReply = changed.events.findIndex(e => e.kind === 'assistant' && e.text.includes(markers.wait));
  if (immediateReply < 0 || deferredReply <= immediateReply || changed.events.some(e => e.text.includes(markers.deleted)) || changed.artifacts.length) throw new Error('Queue deletion, selective promotion or approval invalidation failed');
  report.cases.push({ name: 'actual Electron queue delete + selective promotion leaves ordinary input for later boundary + exact approval invalidation without writing', passed: true });

  await page.getByRole('button', { name: '连接设置与工具', exact: true }).click();
  await page.getByRole('button', { name: '我理解风险，启用本机 Shell / JavaScript', exact: true }).click();
  const code = 'return new Promise(resolve => setTimeout(() => { console.log("TOOL_BOUNDARY_COMPLETED"); resolve(); }, 3000));';
  const toolRun = await create(`Node runtime queue boundary integration test: call runCode with exactly this code, cwd ".", timeoutMs 10000: ${code} After it returns, say ORIGINAL_DONE unless the user adds updated instructions. Do not call any other tool.`, true);
  const action = await until(async () => { const task = (await tasks()).find(t => t.id === toolRun.id); return task?.status === 'awaiting_approval' && task; }, 'code approval');
  if (action.approval.kind !== 'code' || action.approval.content !== code) throw new Error('Unexpected test code, not approved');
  await page.getByRole('button', { name: '批准执行', exact: true }).click();
  await until(async () => (await tasks()).find(t => t.id === toolRun.id)?.unknownEffect, 'actual running tool');
  await page.getByLabel('继续对话', { exact: true }).fill(`After the running tool returns, reply ${markers.queue} and quote its actual output. Do not call more tools.`);
  await page.keyboard.press('Enter');
  const boundaryDone = await completed(toolRun.id);
  if (!contains(boundaryDone, markers.queue) || !boundaryDone.events.some(e => e.kind === 'tool' && e.text.includes('TOOL_BOUNDARY_COMPLETED')) ||
    boundaryDone.queuedInput.length) throw new Error('Default queue did not join after the actual tool returned');
  report.cases.push({ name: 'default dock queue delivered after actual Node utility tool returns without killing or replaying it', passed: true, immediateButtonUsed: false });
  await page.getByRole('button', { name: '连接设置与工具', exact: true }).click();
  await page.getByRole('button', { name: '关闭本机 Shell / JavaScript', exact: true }).click();

  await importSkill();
  const old = await create('TypeScript skill contract test: load skill workbench-test using loadSkill, then read references/check.txt using readSkillFile. Reply only with the marker from that file. No other tools.');
  const oldDone = await completed(old.id), oldHash = oldDone.skillPins?.['workbench-test'];
  if (!oldHash || !contains(oldDone, markers.old)) throw new Error('Initial skill activation missing');
  await version(markers.next); await importSkill(true);
  await app.close(); app = undefined; await launch();
  await page.locator('.task-row').filter({ hasText: old.goal }).click();
  const follow = await reply(old.id, 'Read references/check.txt from workbench-test again with readSkillFile, not from memory. Reply only with the marker the tool returns. No other tools.');
  const pinned = await completed(follow.id);
  if (pinned.skillPins?.['workbench-test'] !== oldHash || !contains(pinned, markers.old) || !pinned.events.some(e => e.kind === 'tool' && e.text.startsWith('readSkillFile'))) throw new Error('Pinned restart reference failed');
  const newer = await create('New TypeScript skill test: load workbench-test and read references/check.txt. Return its current marker. No other tools.');
  const newerDone = await completed(newer.id);
  if (newerDone.skillPins?.['workbench-test'] === oldHash || !contains(newerDone, markers.next)) throw new Error('New session did not use reviewed upgrade');
  await page.getByRole('button', { name: '能力与边界', exact: true }).click();
  await page.screenshot({ path: '.qa/workbench-skills-desktop.png', animations: 'disabled' });
  await page.locator('.skill-entry').getByRole('button', { name: '卸载', exact: true }).click();
  await expect(page.locator('.skill-entry')).toHaveCount(0);
  report.cases.push({ name: 'reviewed upgrade + re-enable + restart pins old reference + new conversation sees new version + UI uninstall', passed: true });

  const web = await create('Node HTTPS reader coding integration test: do not call any tools yet. Reply READY so the user can authorize the origin.');
  await completed(web.id); await page.locator('.web-access summary').click();
  await page.getByLabel('授权站点 URL').fill('https://example.com'); await page.getByRole('button', { name: '授权站点', exact: true }).click();
  const read = await reply(web.id, 'Now call readWeb with https://example.com/ exactly once. State the actual page heading and one sentence supported by the returned text; no other tools.');
  const readDone = await completed(read.id);
  if (!readDone.events.some(e => e.kind === 'tool' && e.text.startsWith('readWeb ·')) || !contains(readDone, 'Example Domain')) throw new Error('Actual HTTPS/model chain failed');
  if (!await page.locator('.web-access').evaluate(element => element.open)) await page.locator('.web-access summary').click();
  await page.getByRole('button', { name: '撤销访问', exact: true }).click();
  report.cases.push({ name: 'explicit origin grant + real pinned HTTPS GET + actual DeepSeek evidence response + revoke', passed: true, browserAutomation: false });
  await page.screenshot({ path: '.qa/workbench-web-desktop.png', animations: 'disabled' });
  report.result = 'REAL_WORKBENCH_E2E_OK'; report.verifiedAt = new Date().toISOString();
  await writeFile('.qa/workbench-live-results.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) {
  console.error('Workbench acceptance failed:', error.message); process.exitCode = 1;
  if (page) await page.screenshot({ path: '.qa/workbench-failure.png', animations: 'disabled' }).catch(() => {});
} finally { if (app) await app.close(); }
