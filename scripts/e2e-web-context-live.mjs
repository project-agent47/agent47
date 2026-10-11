import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
if (process.env.AGENT47_AUTHENTICATED_PROXY !== '1' || !process.env.HTTPS_PROXY) throw new Error('Approved Vault/proxy required');
const data = await realpath(await mkdtemp(join(tmpdir(), 'a47-web-live-'))); await mkdir('.qa', { recursive: true });
const env = { ...process.env }; delete env.AGENT47_SMOKE; delete env.OPENCODE_API_TOKEN;
let app, page;
const deadline = setTimeout(() => { console.error('Live web acceptance timed out'); app?.process().kill(); process.exit(1); }, 300000);
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env });
  page = await app.firstWindow(); await page.locator('.sidebar').waitFor();
}
try {
  await launch();
  await page.getByLabel('任务目标').fill('稍后我会发送一份经审阅的网页摘录。现在只回答 READY_FOR_PAGE，不调用工具。');
  await page.getByLabel('开始任务', { exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.agent47.listTasks())).some(t => t.status === 'completed'), { timeout: 180000 }).toBe(true);
  const before = await page.evaluate(() => window.agent47.listTasks());
  await page.getByRole('button', { name: /^工作区/ }).click();
  await page.getByLabel('公共 HTTPS 网页地址').fill('https://pi.dev/'); await page.getByRole('button', { name: '打开网页', exact: true }).click();
  const actual = async () => app.evaluate(async ({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL() === 'https://pi.dev/');
    if (!view || view.webContents.isLoading()) return '';
    return view.webContents.executeJavaScript('document.body.innerText');
  });
  await expect.poll(actual, { timeout: 60000 }).toContain('minimal agent harness');
  const security = await app.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL() === 'https://pi.dev/').webContents.executeJavaScript('JSON.stringify({node:typeof require,process:typeof process,bridge:typeof window.agent47})'));
  if (!security.includes('"node":"undefined"') || !security.includes('"process":"undefined"') || !security.includes('"bridge":"undefined"')) throw new Error('Live webpage app isolation failed');
  const afterOpen = await page.evaluate(() => window.agent47.listTasks());
  if (afterOpen.length !== before.length || afterOpen[0].steps !== before[0].steps) throw new Error('Browsing invoked model');
  await page.getByRole('button', { name: '将页面内容交给 Agent', exact: true }).click();
  await expect(page.getByLabel('授权确认')).toContainText('minimal agent harness');
  await page.screenshot({ path: '.qa/web-live-review-dock.png' });
  await page.getByRole('button', { name: '发送已审阅摘录', exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.agent47.listTasks())).filter(t => t.status === 'completed').length, { timeout: 180000 }).toBe(2);
  const tasks = await page.evaluate(() => window.agent47.listTasks()), followup = tasks.find(t => t.parentRunId);
  if (!followup || !followup.events.some(e => e.kind === 'user' && e.text.includes('user-reviewed-web-snapshot') && e.text.includes('minimal agent harness')) || !followup.events.some(e => e.kind === 'assistant' && /pi/i.test(e.text))) throw new Error('Actual page evidence did not reach real model answer');
  const surface = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL() === 'https://pi.dev/').webContents.capturePage()).toPNG().toString('base64'));
  await writeFile('.qa/web-live-native-page.png', Buffer.from(surface, 'base64'));
  const capture = await app.evaluate(async ({ desktopCapturer }) => { const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 1440, height: 940 } }); return (sources.find(s => s.name.includes('Agent47')) ?? sources.find(s => s.id.startsWith('screen:')))?.thumbnail.toPNG().toString('base64'); });
  if (capture) await writeFile('.qa/web-live-split-window.png', Buffer.from(capture, 'base64'));
  await app.close(); app = undefined; await launch();
  const restored = await page.evaluate(() => window.agent47.workspaceView());
  if (!restored.tabs[0].paused) throw new Error('Restart auto-loaded remote webpage');
  const result = { result: 'REAL_DEEPSEEK_WEB_CONTEXT_OK', platform: process.platform, model: 'deepseek-v4.1-flash', modelFixture: false, webFixture: false, ipcFixture: false, gateway: 'authenticated DNS-pinned CONNECT, TLS passthrough', browserURL: 'https://pi.dev/', browsingModelCalls: 0, followupSteps: followup.steps, usage: followup.usage, restartWebPaused: true, verifiedAt: new Date().toISOString() };
  await writeFile('.qa/web-live-results.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { if (app) await app.close(); clearTimeout(deadline); }
