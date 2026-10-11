import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const data = await realpath(await mkdtemp(join(tmpdir(), 'a47-web-native-'))); await mkdir('.qa', { recursive: true });
let app, page;
const watchdog = setTimeout(() => { console.error('Web fixture exceeded 180 seconds'); app?.process().kill(); process.exit(1); }, 180000);
const fixture = '<!doctype html><h1>WEB_PUBLIC_EVIDENCE</h1><p>Public fixture page, not a real remote fetch.</p><form>FORM_SECRET<input value="INPUT_SECRET"></form><div style="display:none">HIDDEN_SECRET</div><script>window.PAGE_SCRIPT_SECRET="SCRIPT_SECRET"</script><a href="https://example.com/next">Next page</a>';
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env: { ...process.env, AGENT47_SMOKE: '1' } }); page = await app.firstWindow();
  await page.getByLabel('任务目标').waitFor();
  // HTTPS response fixture only; renderer, capture, IPC, runtime and DB are real.
  // Gateway DNS/TCP/TLS behavior is separately tested, not claimed by this fixture.
  await app.evaluate(({ session }, html) => {
    const original = session.fromPartition;
    session.fromPartition = function(partition, ...args) {
      const current = original.call(session, partition, ...args);
      if (partition.startsWith('agent47-web-')) current.protocol.handle('https', () => new Response(html, { headers: { 'content-type': 'text/html' } }));
      return current;
    };
  }, fixture);
}
async function browser() { return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.filter(v => v.webContents && !v.webContents.getURL().startsWith('agent47-document:')).map(v => ({ id: v.webContents.id, url: v.webContents.getURL(), visible: v.getVisible(), ready: !v.webContents.isLoading() }))); }
try {
  await launch();
  await page.getByLabel('任务目标').fill('Review a user-selected web excerpt'); await page.getByLabel('开始任务', { exact: true }).click();
  await page.getByText('Electron runtime smoke test passed.', { exact: true }).waitFor();
  const first = await page.evaluate(() => window.agent47.listTasks());
  await page.getByRole('button', { name: /^工作区/ }).click();
  await page.getByLabel('公共 HTTPS 网页地址').fill('https://example.com/'); await page.getByRole('button', { name: '打开网页', exact: true }).click();
  await expect.poll(async () => (await browser()).some(v => v.url === 'https://example.com/' && v.visible && v.ready)).toBe(true);
  if ((await page.evaluate(() => window.agent47.listTasks())).length !== first.length) throw new Error('Opening a web tab invoked a task');
  await page.getByRole('button', { name: '将页面内容交给 Agent', exact: true }).click();
  const dock = page.getByLabel('授权确认');
  await expect(dock).toContainText('WEB_PUBLIC_EVIDENCE');
  for (const secret of ['FORM_SECRET', 'INPUT_SECRET', 'HIDDEN_SECRET', 'SCRIPT_SECRET']) await expect(dock).not.toContainText(secret);
  if ((await browser()).some(v => v.visible)) throw new Error('Native page covers review dock');
  await dock.getByRole('button', { name: '取消', exact: true }).click();
  if ((await page.evaluate(() => window.agent47.listTasks())).length !== first.length) throw new Error('Cancel submitted content');
  await page.getByRole('button', { name: '将页面内容交给 Agent', exact: true }).click();
  await dock.getByRole('button', { name: '发送已审阅摘录', exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.agent47.listTasks())).length).toBe(first.length + 1);
  const tasks = await page.evaluate(() => window.agent47.listTasks());
  if (!tasks.some(t => t.events.some(e => e.kind === 'user' && e.text.includes('user-reviewed-web-snapshot') && e.text.includes('WEB_PUBLIC_EVIDENCE')))) throw new Error('Reviewed snapshot did not reach runtime');
  await page.screenshot({ path: '.qa/web-native-consented.png' });
  const state = await page.evaluate(() => window.agent47.workspaceView());
  const oldCapture = await page.evaluate(input => window.agent47.workspaceCapture(input), { tabId: state.activeId, taskId: tasks[0].id });
  await app.evaluate(async ({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL() === 'https://example.com/').webContents;
    await wc.loadURL('https://example.com/away'); await wc.loadURL('https://example.com/');
  });
  const stale = await page.evaluate(async input => { try { await window.agent47.workspaceSendCapture(input); return ''; } catch (e) { return e.message; } }, { id: oldCapture.id, digest: oldCapture.digest, clientMessageId: crypto.randomUUID() });
  if (!stale.includes('重新审阅')) throw new Error('Navigation away/back retained old capture authority');
  const capture = await page.evaluate(input => window.agent47.workspaceCapture(input), { tabId: state.activeId, taskId: tasks[0].id });
  await page.getByRole('button', { name: '停止网页', exact: true }).click();
  const error = await page.evaluate(async input => { try { await window.agent47.workspaceSendCapture(input); return ''; } catch (e) { return e.message; } }, { id: capture.id, digest: capture.digest, clientMessageId: crypto.randomUUID() });
  if (!error.includes('重新审阅')) throw new Error('Stopped page retained send authority');
  await page.getByLabel('刷新当前文档').click(); await expect.poll(async () => (await browser()).some(v => v.visible && v.ready)).toBe(true);
  await app.close(); app = undefined; await launch();
  const restored = await page.evaluate(() => window.agent47.workspaceView());
  if (!restored.tabs[0].paused || (await browser()).length) throw new Error('Restart unexpectedly reloaded a website');
  await writeFile('.qa/web-native-results.json', JSON.stringify({ result: 'WEB_NATIVE_CONTEXT_OK', platform: process.platform, modelFixture: true, httpsResponseFixture: true, cases: ['open is not model send', 'capture excludes forms/hidden/scripts', 'bottom dock review + cancel', 'explicit send creates immutable follow-up', 'navigation away/back invalidates capture', 'stop invalidates capture', 'refresh and restart-paused sessions'] }, null, 2));
  console.log('WEB_NATIVE_CONTEXT_OK');
} finally { if (app) await app.close(); clearTimeout(watchdog); }
