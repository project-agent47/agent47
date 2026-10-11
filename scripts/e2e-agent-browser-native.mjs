import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const data = await realpath(await mkdtemp(join(tmpdir(), 'a47-agent-web-')));
await mkdir('.qa', { recursive: true });
let app, page;
const watchdog = setTimeout(() => { console.error('Browser tool fixture exceeded 180 seconds'); app?.process().kill(); process.exit(1); }, 180000);
const html = `<!doctype html><h1>CONTROLLED_BROWSER_TEST</h1><form><label>Public note<input aria-label="Public note"></label><button type="button" onclick="document.querySelector('#result').textContent='SAVED:'+document.querySelector('input').value">Save test note</button><input type="password" value="PASSWORD_SECRET"><textarea hidden>HIDDEN_VALUE</textarea></form><p id="result">Not saved</p><a href="https://example.com/next">Next</a>`;
async function intent(taskId, toolName, input) {
  const toolCallId = crypto.randomUUID();
  // Test-only intent injection into SQLite; no new renderer tool-execution IPC.
  await app.evaluate(async (_electron, data) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
    const db = new DatabaseSync(join(data.root, 'tasks.db'));
    const row = db.prepare('SELECT body FROM tasks WHERE id=?').get(data.taskId), task = JSON.parse(row.body);
    task.status = 'queued'; task.approval = undefined; task.pending = [{ toolCallId: data.toolCallId, toolName: data.toolName, input: data.input }];
    task.messages.push({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: data.toolCallId, toolName: data.toolName, input: data.input }] });
    db.prepare('UPDATE tasks SET body=? WHERE id=?').run(JSON.stringify(task), data.taskId); db.close();
  }, { root: data, taskId, toolName, input, toolCallId });
  await page.evaluate(taskId => window.agent47.setTaskPermissions({ taskId, fileMode: 'snapshot', hostMode: 'ask' }), taskId);
}
async function result(taskId) {
  return app.evaluate(async (_e, data) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
    const db = new DatabaseSync(join(data.root, 'tasks.db')); const task = JSON.parse(db.prepare('SELECT body FROM tasks WHERE id=?').get(data.taskId).body); db.close();
    return task.messages.filter(m => m.role === 'tool').at(-1).content[0].output;
  }, { root: data, taskId });
}
async function completed(taskId) { await expect.poll(async () => (await page.evaluate(() => window.agent47.listTasks())).find(t => t.id === taskId)?.status).toBe('completed'); }
async function nativeText() { return app.evaluate(async ({ BrowserWindow }) => {
  const view = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL().startsWith('https:'));
  return view ? view.webContents.executeJavaScript('document.querySelector("#result")?.textContent || ""') : '';
}); }
try {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env: { ...process.env, AGENT47_SMOKE: '1' } });
  page = await app.firstWindow(); await page.getByLabel('任务目标').waitFor();
  await app.evaluate(({ session }, html) => { const original = session.fromPartition; session.fromPartition = function(partition, ...args) {
    const s = original.call(session, partition, ...args); if (partition.startsWith('agent47-web-')) s.protocol.handle('https', () => new Response(html, { headers: { 'content-type': 'text/html' } })); return s;
  }; }, html);
  await page.getByLabel('任务目标').fill('Controlled browser tool fixture'); await page.getByLabel('开始任务', { exact: true }).click();
  await page.getByText('Electron runtime smoke test passed.', { exact: true }).waitFor();
  const taskId = (await page.evaluate(() => window.agent47.listTasks()))[0].id;
  await page.getByRole('button', { name: /^工作区/ }).click();
  await page.getByLabel('公共 HTTPS 网页地址').fill('https://example.com/'); await page.getByRole('button', { name: '打开网页', exact: true }).click();
  const tabId = (await page.evaluate(() => window.agent47.workspaceView())).activeId;
  await expect.poll(nativeText).toBe('Not saved');
  await page.getByLabel('当前网页 Agent 权限').selectOption('ask');
  await page.getByRole('button', { name: '确认网页授权', exact: true }).click();
  await intent(taskId, 'browserRead', { tabId }); await completed(taskId);
  let snapshot = (await result(taskId)).value;
  if (JSON.stringify(snapshot).includes('PASSWORD_SECRET') || JSON.stringify(snapshot).includes('HIDDEN_VALUE')) throw new Error('Sensitive form values leaked');
  let field = snapshot.elements.find(e => e.name === 'Public note');
  await intent(taskId, 'browserFill', { tabId, snapshotId: snapshot.snapshotId, ref: field.ref, text: 'PUBLIC_TEST_NOTE' });
  await page.getByRole('heading', { name: '操作网页', exact: true }).waitFor();
  await expect(page.getByLabel('确认工具操作')).toContainText('PUBLIC_TEST_NOTE');
  await page.screenshot({ path: '.qa/agent-browser-approval.png' });
  await page.getByRole('button', { name: '批准执行', exact: true }).click(); await completed(taskId);
  await intent(taskId, 'browserRead', { tabId }); await completed(taskId); snapshot = (await result(taskId)).value;
  const button = snapshot.elements.find(e => e.name === 'Save test note');
  await intent(taskId, 'browserClick', { tabId, snapshotId: snapshot.snapshotId, ref: button.ref });
  await page.getByRole('heading', { name: '操作网页', exact: true }).waitFor();
  await page.getByRole('button', { name: '拒绝执行', exact: true }).click(); await completed(taskId);
  if (await nativeText() !== 'Not saved') throw new Error('Denied click executed');
  await page.getByLabel('当前网页 Agent 权限').selectOption('allow');
  await page.getByRole('button', { name: '确认可信交互范围', exact: true }).click();
  await intent(taskId, 'browserRead', { tabId }); await completed(taskId); snapshot = (await result(taskId)).value;
  await intent(taskId, 'browserClick', { tabId, snapshotId: snapshot.snapshotId, ref: snapshot.elements.find(e => e.name === 'Save test note').ref });
  await completed(taskId); await expect.poll(nativeText).toBe('SAVED:PUBLIC_TEST_NOTE');
  const dispatch = (await result(taskId)).value; if (dispatch.verifiedOutcome !== false) throw new Error('Dispatch falsely claims verified outcome');
  await page.getByLabel('当前网页 Agent 权限').selectOption('deny');
  await intent(taskId, 'browserRead', { tabId }); await completed(taskId);
  if ((await result(taskId)).type !== 'error-text') throw new Error('Revoked tab still readable');
  await intent(taskId, 'browserOpen', { url: 'https://example.com/new' });
  await page.getByRole('heading', { name: '操作网页', exact: true }).waitFor();
  await expect(page.getByLabel('确认工具操作')).toContainText('打开并授权网页');
  await page.getByRole('button', { name: '批准执行', exact: true }).click(); await completed(taskId);
  const opened = (await result(taskId)).value;
  if (!opened.opened || opened.mode !== 'ask') throw new Error('Approved browserOpen failed to grant exact new tab');
  await writeFile('.qa/agent-browser-native-results.json', JSON.stringify({ result: 'AGENT_BROWSER_NATIVE_OK', modelFixture: true, httpsResponseFixture: true, toolIntents: 'SQLite test injection', cases: ['explicit dock grant', 'bounded refs/no passwords or values', 'exact fill approval', 'denied click has no effect', 'trusted click real DOM effect', 'dispatch not business success', 'revocation denies reads', 'agent open request uses exact URL approval'] }, null, 2));
  console.log('AGENT_BROWSER_NATIVE_OK');
} finally { if (app) await app.close(); clearTimeout(watchdog); }
