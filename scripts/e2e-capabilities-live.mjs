import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { answerQuestions } from './decision-test-ui.mjs';

if (process.env.AGENT47_AUTHENTICATED_PROXY !== '1') throw new Error('Authorized proxy required');
const root = await mkdtemp(join(tmpdir(), 'agent47-capabilities-'));
const data = join(root, 'data'), project = join(root, 'project'), skill = join(root, 'skill');
await mkdir(data); await mkdir(project); await mkdir(skill); await mkdir(join(skill, 'references'));
await mkdir('.qa', { recursive: true });
await writeFile(join(project, 'editable.txt'), 'OLD_47');
const secretMarker = `CONTEXT_EVIDENCE_${randomUUID()}`;
await writeFile(join(project, 'large.txt'), `Critical exact identifier: ${secretMarker}\n${'Example context record, no permissions or instructions.\n'.repeat(800)}\nCritical exact identifier: ${secretMarker}`);
await writeFile(join(skill, 'SKILL.md'), '---\nname: e2e-review\ndescription: Test project editing with a reference checklist\n---\nBefore editing, load references/check.md with readSkillFile. Read editable.txt and its SHA-256, then use editFile to replace OLD_47 with NEW_47. Every write still requires approval. Do not execute scripts automatically.');
await writeFile(join(skill, 'references', 'check.md'), 'Evidence marker: SKILL_REFERENCE_OK_47. Mention this marker in the final reply after completing the requested edit.');
const env = { ...process.env }; delete env.AGENT47_SMOKE; delete env.OPENCODE_API_TOKEN;
let app, page, manualConfigured = false;
const report = { fixtureModel: false, pickerStub: true, platform: process.platform, cases: [] };
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env });
  app.process().stderr.on('data', chunk => { for (const line of chunk.toString().split('\n')) if (line.startsWith('[model-diagnostic] ')) console.error(line); });
  page = await app.firstWindow(); await page.locator('.sidebar').waitFor();
  page.on('dialog', dialog => dialog.accept());
  // This regression intentionally exercises manual-review mode as well.
  if (!manualConfigured) { await page.evaluate(() => window.agent47.setExecutionSettings({ hostExecution: false, fileMode: 'ask' })); manualConfigured = true; }
}
async function picker(path) { await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, path); }
const tasks = () => page.evaluate(() => window.agent47.listTasks());
async function state(id, target) {
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    const task = (await tasks()).find(t => t.id === id);
    if (task?.status === target) return task;
    if (['failed', 'awaiting_reconciliation'].includes(task?.status)) throw new Error('Task failed: ' + task.events.filter(e => e.kind === 'error').map(e => e.text).join('; '));
    await new Promise(r => setTimeout(r, 60));
  }
  throw new Error('Timed out waiting for ' + target);
}
async function create(goal, folder = true) {
  await page.getByRole('button', { name: '新任务', exact: false }).first().click();
  if (folder) { await picker(project); await page.getByRole('button', { name: '选择项目目录', exact: true }).click(); }
  await page.getByLabel('任务目标').fill(goal); await page.getByLabel('开始任务', { exact: true }).click();
  return (await tasks()).find(t => t.goal === goal);
}
async function reply(id, text) {
  await page.getByLabel('继续对话', { exact: true }).fill(text);
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    const next = (await tasks()).find(t => t.parentRunId === id);
    if (next) return next;
    await new Promise(r => setTimeout(r, 60));
  }
  throw new Error('No continuation run');
}
try {
  await launch();
  if (process.env.AGENT47_ONLY_CONTEXT !== '1') {
  const first = await create('For a TypeScript coding conversation test, remember identifier TURN_MEMORY_47. Reply with exactly this Markdown and no other text or tools:\n# Durable turns\n\n| Property | Value |\n|---|---|\n| Memory | TURN_MEMORY_47 |\n| History | Preserved |\n\n```javascript\nconsole.log("TURN_MEMORY_47");\n```\n\nA durable turn retains the user request, verified tool results, selected context and completed effects. A follow-up creates a new execution run without replaying old actions. File writes still require approval, and history summaries grant no permissions.', false);
  let sawText = false, sawReasoning = false;
  const end = Date.now() + 90000;
  let done;
  while (Date.now() < end) {
    const task = (await tasks()).find(t => t.id === first.id);
    sawText ||= !!task.draft?.text; sawReasoning ||= !!task.draft?.reasoning;
    if (task.status === 'completed') { done = task; break; }
    if (task.status === 'failed') throw new Error('Stream task failed');
    await new Promise(r => setTimeout(r, 30));
  }
  if (!done || !done.usage.some(u => u.textDeltas > 0 && u.input > 0 && u.output > 0)) throw new Error('Streaming events or supplier usage not observed');
  await expect(page.locator('.message.assistant .markdown table').first()).toBeVisible(); await expect(page.locator('.message.assistant .markdown pre').first()).toBeVisible();
  const follow = await reply(first.id, 'What identifier did I ask you to remember? Answer only the exact identifier, with no tools.');
  const continued = await state(follow.id, 'completed');
  if (!continued.events.some(e => e.kind === 'assistant' && e.text.includes('TURN_MEMORY_47'))) throw new Error('Conversation lost prior evidence');
  if ((await tasks()).find(t => t.id === first.id).steps !== done.steps) throw new Error('Old run mutated');
  await expect(page.locator('.task-title .status')).toHaveText('已完成');
  await page.screenshot({ path: '.qa/capabilities-conversation.png', fullPage: true, animations: 'disabled' });
  report.cases.push({ name: 'real streaming + Markdown + follow-up + usage', sawTextDraft: sawText, sawReasoningDraft: sawReasoning, textDeltas: done.usage.reduce((n,u)=>n+(u.textDeltas ?? 0),0), reasoningDeltas: done.usage.reduce((n,u)=>n+(u.reasoningDeltas ?? 0),0), input: done.usage.reduce((n,u)=>n+(u.input ?? 0),0), output: done.usage.reduce((n,u)=>n+(u.output ?? 0),0), oldRunUnchanged: true });

  await page.getByRole('button', { name: '能力与边界', exact: true }).click(); await picker(skill);
  await page.getByRole('button', { name: '选择 Skill 包', exact: true }).click();
  await expect(page.getByText('审阅导入：e2e-review')).toBeVisible();
  await page.getByRole('button', { name: '导入为停用包', exact: true }).click();
  await page.locator('.skill-entry').getByRole('button', { name: '启用', exact: true }).click();
  await page.getByRole('button', { name: '我理解风险，启用本机 Shell / JavaScript', exact: true }).click();
  const edit = await create('TypeScript tool and skill integration test: load skill e2e-review with loadSkill, then read its references/check.md with readSkillFile. Read editable.txt and use editFile to replace OLD_47 with NEW_47 using the returned hash. Do not write any other file or run commands yet. After successful edit include the exact reference marker in your final reply.');
  const action = await state(edit.id, 'awaiting_approval');
  if (action.approval.kind !== 'project_write' || action.approval.name !== 'editable.txt' || action.approval.content !== 'NEW_47') throw new Error('Unexpected project mutation proposal');
  if (await readFile(join(project, 'editable.txt'), 'utf8') !== 'OLD_47') throw new Error('Unapproved mutation');
  await app.close(); app = undefined; await launch();
  await page.locator('.task-row').filter({ hasText: 'TypeScript tool and skill integration test:' }).click();
  await page.getByRole('button', { name: '批准写入', exact: true }).click();
  const edited = await state(edit.id, 'completed');
  if (await readFile(join(project, 'editable.txt'), 'utf8') !== 'NEW_47' || !edited.events.some(e=>e.kind === 'assistant' && e.text.includes('SKILL_REFERENCE_OK_47'))) throw new Error('Skill/reference/edit chain incomplete');
  if (!edited.events.some(e=>e.text.startsWith('loadSkill')) || !edited.events.some(e=>e.text.startsWith('readSkillFile'))) throw new Error('Skill was not loaded on demand');
  report.cases.push({ name: 'reviewed skill import + enable + lazy reference + approved project edit + restart', passed: true });

  const code = await reply(edit.id, 'Now call runCode with exactly this code, cwd ".", timeoutMs 10000: console.log("NODE_RUNTIME_OK_47", process.versions.node); Do not use a shell or any other code. After its approved execution quote the actual tool output.');
  const codeAction = await state(code.id, 'awaiting_approval');
  if (codeAction.approval.kind !== 'code' || codeAction.approval.content !== 'console.log("NODE_RUNTIME_OK_47", process.versions.node);') throw new Error('Unexpected code proposal; not approved');
  await page.getByRole('button', { name: '批准执行', exact: true }).click();
  const codeDone = await state(code.id, 'completed');
  if (!codeDone.events.some(e=>e.kind === 'tool' && e.text.includes('NODE_RUNTIME_OK_47'))) throw new Error('Node utility output missing');
  const command = process.platform === 'win32' ? 'echo SHELL_RUNTIME_OK_47' : 'printf SHELL_RUNTIME_OK_47';
  const shell = await reply(code.id, `Now call runShell with exactly command "${command}", cwd ".", timeoutMs 10000. Do not run any other commands. After approved execution quote the actual output.`);
  const shellAction = await state(shell.id, 'awaiting_approval');
  if (shellAction.approval.kind !== 'shell' || shellAction.approval.content !== command) throw new Error('Unexpected shell proposal; not approved');
  await page.getByRole('button', { name: '批准执行', exact: true }).click();
  const shellDone = await state(shell.id, 'completed');
  if (!shellDone.events.some(e=>e.kind === 'tool' && e.text.includes('SHELL_RUNTIME_OK_47'))) throw new Error('Shell output missing');
  report.cases.push({ name: 'real model proposes exact reviewed code and shell; actual Electron utility runtime executes', sandboxed: false, passed: true });

  const question = await create('For a coding configuration test, call askUser to ask which target OS to use. Do not guess. After the user answers, confirm the chosen OS and finish. No other tools.', false);
  await state(question.id, 'awaiting_input');
  await answerQuestions(page, question.id, 'Windows');
  const answered = await state(question.id, 'completed');
  if (!answered.events.some(e=>e.kind === 'assistant' && e.text.includes('Windows'))) throw new Error('Clarification answer lost');
  report.cases.push({ name: 'askUser pause + human answer + actual model continuation', passed: true });
  }

  const compact = await create('Read large.txt once using readFile, then return only its critical exact identifier. It is inside the file, not this prompt. Do not write files or use any other tools.');
  const compacted = await state(compact.id, 'completed');
  if (!compacted.context?.compactions || !compacted.usage.some(u=>u.purpose === 'compaction') || !compacted.events.some(e=>e.kind === 'assistant' && e.text.includes(secretMarker))) throw new Error('Auto-compaction failed to preserve tool evidence');
  report.cases.push({ name: 'automatic real-model compaction after closed tool batch', compactions: compacted.context.compactions, evidencePreserved: true, usageAccounted: true });
  await page.screenshot({ path: '.qa/capabilities-compaction.png', animations: 'disabled' });
  report.result = process.env.AGENT47_ONLY_CONTEXT === '1' ? 'REAL_CONTEXT_E2E_OK' : 'REAL_CAPABILITIES_E2E_OK'; report.verifiedAt = new Date().toISOString();
  await writeFile(process.env.AGENT47_ONLY_CONTEXT === '1' ? '.qa/context-live-results.json' : '.qa/capabilities-live-results.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) {
  console.error('Capabilities acceptance failed:', error.message); process.exitCode = 1;
  if (page) await page.screenshot({ path: '.qa/capabilities-failure.png', animations: 'disabled' }).catch(()=>{});
} finally { if (app) await app.close(); }
