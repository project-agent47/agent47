import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// Real desktop + real remote DeepSeek. Only native picker UI is replaced with
// a deterministic selection of synthetic test data; no model/IPC/tool mocks.
if (process.env.AGENT47_AUTHENTICATED_PROXY !== '1' || !process.env.HTTPS_PROXY) throw new Error('Run with an explicitly authorized Vault/proxy transport');
const root = await mkdtemp(join(tmpdir(), 'agent47-desktop-live-'));
const data = join(root, 'user-data'), project = join(root, 'project');
await mkdir(data); await mkdir(project); await mkdir('.qa', { recursive: true });
const markerA = `REQUIREMENT_${randomUUID()}`, markerB = `CONSTRAINT_${randomUUID()}`;
await writeFile(join(project, 'requirements.md'), `# TypeScript adapter requirement\nImplement a bounded SDK adapter. Evidence marker: ${markerA}\n`);
await writeFile(join(project, 'constraints.md'), `# Coding constraints\nPersist intents before side effects; require exact-content approval. Evidence marker: ${markerB}\n`);
const env = { ...process.env, AGENT47_AUTHENTICATED_PROXY: '1' };
delete env.AGENT47_SMOKE;
delete env.OPENCODE_API_TOKEN; // The actual secret stays in the approved upstream proxy.
let app, page;
const summary = { model: 'deepseek-v4.1-flash', agent: 'AI SDK ToolLoopAgent + durable TaskRuntime', fixtureModel: false, nativePickerStub: true, platform: process.platform, cases: [] };
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env, timeout: 30000 });
  app.process().stderr.on('data', chunk => {
    for (const line of chunk.toString().split('\n')) if (line.startsWith('[model-diagnostic] ')) console.error(line);
  });
  page = await app.firstWindow();
  const actual = await app.evaluate(({ app }) => app.getPath('userData'));
  if (actual !== data) throw new Error('Electron userData isolation mismatch');
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project);
  await page.getByLabel('任务目标').waitFor();
  await page.evaluate(() => window.agent47.setExecutionSettings({ hostExecution: false, fileMode: 'ask' }));
  const metadata = await page.evaluate(() => window.agent47.provider());
  if (!metadata.configured || 'apiKey' in metadata || 'encryptedKey' in metadata) throw new Error('Live connection/credential boundary invalid');
}
const tasks = () => page.evaluate(() => window.agent47.listTasks());
async function current(id) { return (await tasks()).find(t => t.id === id); }
async function waitState(id, states) {
  // Poll the actual IPC response in the host; don't rely on cross-world Promise
  // polling in Electron's isolated preload realm.
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const task = await current(id);
    if (task && states.includes(task.status)) return task;
    if (task?.status === 'failed') throw new Error('Real DeepSeek desktop task failed: ' + task.events.filter(e => e.kind === 'error').map(e => e.text).join('; '));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Real desktop task timed out waiting for ' + states.join(','));
}
async function newTask(goal, withFolder) {
  await page.getByRole('button', { name: '新任务', exact: false }).first().click();
  if (withFolder) await page.getByRole('button', { name: '选择项目目录', exact: true }).click();
  await page.getByLabel('任务指导').selectOption(withFolder ? 'deliver' : 'general');
  await page.getByLabel('任务目标').fill(goal);
  await page.getByLabel('开始任务', { exact: true }).click();
  const task = (await tasks()).find(t => t.goal === goal);
  if (!task) throw new Error('UI create did not reach main runtime');
  return task;
}
async function files(dir) {
  if (!existsSync(dir)) return [];
  const result = [];
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry);
    if ((await stat(path)).isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result;
}
try {
  await launch();
  const goal = 'TypeScript coding integration task: read requirements.md and constraints.md with readFile. Combine the two evidence markers from those files verbatim and the adapter requirements in a Markdown deliverable desktop-verification.md via writeArtifact. Do not read other files. Wait for human approval and only confirm saving after a successful tool result.';
  const first = await newTask(goal, true);
  const pending = await waitState(first.id, ['awaiting_approval']);
  if (pending.approval.name !== 'desktop-verification.md' || !pending.approval.content.includes(markerA) || !pending.approval.content.includes(markerB)) throw new Error('Model did not combine real tool evidence');
  for (const name of ['requirements.md', 'constraints.md']) if (!pending.events.some(e => e.kind === 'tool' && e.text.startsWith('readFile') && e.text.includes(name))) throw new Error('Missing actual read event');
  if ((await files(join(data, 'artifacts'))).length) throw new Error('Artifact written before approval');
  await page.screenshot({ path: '.qa/desktop-live-awaiting-approval.png', animations: 'disabled' });
  await app.close(); app = undefined;
  await launch();
  const restored = await current(first.id);
  if (restored.status !== 'awaiting_approval' || restored.approval.id !== pending.approval.id || restored.approval.digest !== pending.approval.digest || restored.approval.content !== pending.approval.content) throw new Error('Pending approval was not restored exactly');
  await page.locator('.task-row').filter({ hasText: 'TypeScript coding integration task:' }).click();
  await page.getByRole('button', { name: '批准创建', exact: true }).click();
  const done = await waitState(first.id, ['completed']);
  if (done.artifacts.length !== 1 || done.approval.state !== 'applied') throw new Error('Approved artifact did not complete');
  const saved = await files(join(data, 'artifacts'));
  if (saved.length !== 1) throw new Error('Duplicate or missing artifact');
  const body = await readFile(saved[0], 'utf8');
  const digest = createHash('sha256').update(body).digest('hex');
  if (body !== pending.approval.content || digest !== done.artifacts[0].sha256) throw new Error('Saved bytes differ from reviewed content');
  await page.locator('.artifact-row').click();
  await expect(page.getByLabel('产物工作区')).toBeVisible();
  await expect(page.getByLabel('产物工作区')).toContainText(markerA);
  await expect(page.getByLabel('产物工作区')).toContainText(markerB);
  await page.screenshot({ path: '.qa/desktop-live-artifact.png', animations: 'disabled' });
  await page.getByLabel('收起工作区').click();
  summary.cases.push({ name: 'two-file synthesis + approval restart + save + final response + artifact review', status: done.status, steps: done.steps, approvalRestored: true, readMarkersVerified: true, artifactSha256: digest });
  const direct = await newTask('For this TypeScript coding-agent connectivity test, answer only SIMPLE_E2E_OK. Do not call any tools.', false);
  const directDone = await waitState(direct.id, ['completed']);
  if (directDone.steps !== 1 || directDone.approval || directDone.artifacts.length || !directDone.events.some(e => e.kind === 'assistant' && e.text.includes('SIMPLE_E2E_OK'))) throw new Error('Direct answer still forced into a workflow');
  summary.cases.push({ name: 'direct answer without forced phases', status: directDone.status, steps: directDone.steps });
  const denial = await newTask('For a TypeScript coding-agent approval test: read requirements.md and propose denied.md via writeArtifact documenting the adapter requirement. If the user rejects it, respect the rejection, do not propose another write, and finish with a short explanation.', true);
  const denyPending = await waitState(denial.id, ['awaiting_approval']);
  if (denyPending.approval.name !== 'denied.md') throw new Error('Unexpected denial-test artifact');
  await page.getByRole('button', { name: '拒绝写入', exact: true }).click();
  const denied = await waitState(denial.id, ['completed']);
  if (denied.artifacts.length || (await files(join(data, 'artifacts'))).length !== 1) throw new Error('Rejected write created a file');
  summary.cases.push({ name: 'human denial returned to real model without a write', status: denied.status, steps: denied.steps, filesCreated: 0 });
  const stopped = await newTask('Inspect the TypeScript adapter requirements in detail and propose an implementation plan.', false);
  await page.getByRole('button', { name: '停止任务', exact: true }).click();
  await waitState(stopped.id, ['cancelled']);
  await app.close(); app = undefined;
  await launch();
  const final = await current(first.id);
  const cancelled = await current(stopped.id);
  if (final.status !== 'completed' || final.steps !== done.steps || final.artifacts.length !== 1 || (await files(join(data, 'artifacts'))).length !== 1 || cancelled.status !== 'cancelled') throw new Error('Terminal task replayed after restart');
  summary.cases.push({ name: 'stop + terminal restart does not replay completed or cancelled tasks', status: cancelled.status, completedStepsUnchanged: true, artifactCount: 1 });
  const htmlMarker = `HTML_${randomUUID()}`;
  const htmlTask = await newTask(`Create exactly one offline HTML coding-demo artifact named demo.html using writeArtifact. Include a heading containing "${htmlMarker}" and a button id="demo" with inline onclick changing its text to "HTML_INTERACTION_OK". Use inline CSS only. No external resources, no other tools or writes. Wait for approval, then finish.`, false);
  const htmlPending = await waitState(htmlTask.id, ['awaiting_approval']);
  if (htmlPending.approval.name !== 'demo.html' || !htmlPending.approval.content.includes(htmlMarker)) throw new Error('HTML proposal missing real model evidence');
  await page.getByRole('button', { name: '在工作区预览', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'demo.html', exact: true })).toBeVisible();
  if ((await files(join(data, 'artifacts'))).length !== 1 || (await current(htmlTask.id)).approval.state !== 'pending') throw new Error('Preview implicitly approved or saved the proposal');
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.filter(v => v.webContents?.getURL().startsWith('agent47-document:') && v.getVisible()).length)).toBe(1);
  await page.getByRole('button', { name: '批准创建', exact: true }).click();
  const htmlDone = await waitState(htmlTask.id, ['completed']);
  if (htmlDone.artifacts.length !== 1 || htmlDone.artifacts[0].content !== htmlPending.approval.content) throw new Error('HTML artifact differs from proposal');
  await page.locator('.artifact-row').filter({ hasText: 'demo.html' }).click();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.filter(v => v.webContents?.getURL().startsWith('agent47-document:') && v.getVisible()).length)).toBe(1);
  const documentId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL().startsWith('agent47-document:') && v.getVisible()).webContents.id);
  await expect.poll(() => app.evaluate(({ webContents }, id) => webContents.fromId(id).executeJavaScript('document.body.textContent'), documentId)).toContain(htmlMarker);
  const point = await app.evaluate(({ webContents }, id) => webContents.fromId(id).executeJavaScript('(()=>{const b=document.getElementById("demo").getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}})()'), documentId);
  await app.evaluate(({ webContents }, { id, point }) => { const wc = webContents.fromId(id); wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 }); }, { id: documentId, point });
  await expect.poll(() => app.evaluate(({ webContents }, id) => webContents.fromId(id).executeJavaScript('document.getElementById("demo").textContent'), documentId)).toBe('HTML_INTERACTION_OK');
  const capture = await app.evaluate(async ({ desktopCapturer }) => { const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 1440, height: 940 } }); return (sources.find(s => s.name.includes('Agent47')) ?? sources.find(s => s.id.startsWith('screen:')))?.thumbnail.toPNG().toString('base64'); });
  if (capture) await writeFile('.qa/desktop-live-html-workspace.png', Buffer.from(capture, 'base64'));
  const beforeViewing = (await current(htmlTask.id)).steps;
  await page.getByRole('button', { name: '查看源码', exact: true }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: '查看渲染', exact: true }).click();
  if ((await current(htmlTask.id)).steps !== beforeViewing || (await tasks()).length !== 5) throw new Error('Local viewing triggered a model request');
  summary.cases.push({ name: 'real DeepSeek HTML proposal preview without approval; approved artifact renders interactive native HTML; source/render switching does not invoke model', status: htmlDone.status, steps: htmlDone.steps, proposalDigest: htmlPending.approval.digest });
  summary.credentialStored = existsSync(join(data, 'provider.json'));
  if (summary.credentialStored) throw new Error('Vault secret unexpectedly persisted');
  summary.result = 'REAL_DEEPSEEK_ELECTRON_E2E_OK';
  summary.verifiedAt = new Date().toISOString();
  await writeFile('.qa/desktop-live-results.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
} catch (error) {
  console.error('Live desktop acceptance failed:', error.message);
  process.exitCode = 1;
} finally { if (app) await app.close(); }
