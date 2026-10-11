import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
if (process.env.AGENT47_AUTHENTICATED_PROXY !== '1' || !process.env.HTTPS_PROXY) throw new Error('Approved Vault/proxy required');
const data = await realpath(await mkdtemp(join(tmpdir(), 'a47-agent-browser-live-'))); await mkdir('.qa', { recursive: true });
const env = { ...process.env }; delete env.AGENT47_SMOKE; delete env.OPENCODE_API_TOKEN;
const marker = 'VISIBLE_RESULT_' + crypto.randomUUID();
// Controlled page fixture: no external writes, real model chooses tools/refs.
const html = `<!doctype html><h1>Controlled interaction test</h1><label>Public note<input aria-label="Public note"></label><button onclick="document.querySelector('#result').textContent='${marker}:'+document.querySelector('input').value">Save test note</button><p id="result">Not saved</p>`;
let app, page;
const deadline = setTimeout(() => { console.error('Live browser acceptance timed out'); app?.process().kill(); process.exit(1); }, 300000);
try {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env });
  page = await app.firstWindow(); await page.locator('.sidebar').waitFor();
  await app.evaluate(({ session }, html) => { const original = session.fromPartition; session.fromPartition = function(partition, ...args) {
    const s = original.call(session, partition, ...args); if (partition.startsWith('agent47-web-')) s.protocol.handle('https', () => new Response(html, { headers: { 'content-type': 'text/html' } })); return s;
  }; }, html);
  await page.getByLabel('任务目标').fill('之后我会授权一个工作区网页。现在只回答 READY，不调用工具。');
  await page.getByLabel('开始任务', { exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.agent47.listTasks()))[0]?.status, { timeout: 180000 }).toBe('completed');
  const first = (await page.evaluate(() => window.agent47.listTasks()))[0];
  await page.getByRole('button', { name: /^工作区/ }).click();
  await page.getByLabel('公共 HTTPS 网页地址').fill('https://example.com/'); await page.getByRole('button', { name: '打开网页', exact: true }).click();
  await expect.poll(async () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.some(v => v.webContents?.getURL() === 'https://example.com/' && !v.webContents.isLoading()))).toBe(true);
  await page.getByLabel('当前网页 Agent 权限').selectOption('allow'); await page.getByRole('button', { name: '确认可信交互范围', exact: true }).click();
  const followup = await page.evaluate(taskId => window.agent47.sendMessage({ taskId, text: '在已授权的右侧网页完成真实交互测试：先 browserRead 读取页面和元素引用，在 Public note 输入框填入 PUBLIC_MODEL_NOTE，再点击 Save test note。每次操作后重新 browserRead 获取新引用；最后重新读取页面并原样报告页面实际显示的结果字符串。只能用 browser 工具，不要用 shell、readWeb、文件工具或编造结果。', mode: 'followup', clientMessageId: crypto.randomUUID() }), first.id);
  await expect.poll(async () => (await page.evaluate(() => window.agent47.listTasks())).find(t => t.id === followup.id)?.status, { timeout: 240000 }).toBe('completed');
  const task = (await page.evaluate(() => window.agent47.listTasks())).find(t => t.id === followup.id);
  for (const name of ['browserRead', 'browserFill', 'browserClick']) if (!task.events.some(e => e.kind === 'tool' && e.text.startsWith(name))) throw new Error(`Missing real model tool ${name}`);
  if (!task.events.some(e => e.kind === 'assistant' && e.text.includes(marker + ':PUBLIC_MODEL_NOTE'))) throw new Error('Model did not report actual random DOM result');
  await page.screenshot({ path: '.qa/agent-browser-live-conversation.png' });
  const image = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL() === 'https://example.com/').webContents.capturePage()).toPNG().toString('base64'));
  await writeFile('.qa/agent-browser-live-page.png', Buffer.from(image, 'base64'));
  await writeFile('.qa/agent-browser-live-results.json', JSON.stringify({ result: 'REAL_DEEPSEEK_BROWSER_TOOLS_OK', modelFixture: false, httpsResponseFixture: true, ipcFixture: false, intentInjection: false, platform: process.platform, steps: task.steps, usage: task.usage, verifiedAt: new Date().toISOString(), evidenceMarker: marker }, null, 2));
  console.log('REAL_DEEPSEEK_BROWSER_TOOLS_OK steps=' + task.steps);
} finally { if (app) await app.close(); clearTimeout(deadline); }
