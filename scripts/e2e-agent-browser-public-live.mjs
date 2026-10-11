import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
if (process.env.AGENT47_AUTHENTICATED_PROXY !== '1' || !process.env.HTTPS_PROXY) throw new Error('Approved Vault/proxy required');
const data = await realpath(await mkdtemp(join(tmpdir(), 'a47-browser-public-live-'))); await mkdir('.qa', { recursive: true });
const env = { ...process.env }; delete env.AGENT47_SMOKE; delete env.OPENCODE_API_TOKEN;
let app, page;
const deadline = setTimeout(() => { console.error('Public live browser acceptance timed out'); app?.process().kill(); process.exit(1); }, 300000);
try {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env });
  page = await app.firstWindow(); await page.locator('.sidebar').waitFor();
  await page.getByLabel('任务目标').fill('请用 browserOpen 打开 https://pi.dev/，等待应用的网页授权批准，再用 browserRead 读取实际页面。根据实际页面，用中文两句话说明 Pi 的核心设计；不要用 readWeb、Shell 或文件工具，不要凭记忆回答，不需要点击或提交。');
  await page.getByLabel('开始任务', { exact: true }).click();
  await page.getByRole('heading', { name: '操作网页', exact: true }).waitFor({ timeout: 180000 });
  const first = (await page.evaluate(() => window.agent47.listTasks()))[0];
  if (first.approval?.payload?.operation !== 'browserOpen' || first.approval?.payload?.url !== 'https://pi.dev/') throw new Error('Model requested unexpected site/action');
  await page.screenshot({ path: '.qa/agent-browser-public-open-approval.png' });
  await page.getByRole('button', { name: '批准执行', exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.agent47.listTasks()))[0]?.status, { timeout: 180000 }).toBe('completed');
  const task = (await page.evaluate(() => window.agent47.listTasks()))[0];
  for (const name of ['browserOpen', 'browserRead']) if (!task.events.some(e => e.kind === 'tool' && e.text.startsWith(name))) throw new Error('Missing real public tool ' + name);
  const evidence = await app.evaluate(({ app }) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
    const db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db')); const t = JSON.parse(db.prepare('SELECT body FROM tasks ORDER BY rowid DESC LIMIT 1').get().body); db.close();
    return t.messages.filter(m => m.role === 'tool').flatMap(m => m.content).filter(m => m.toolName === 'browserRead').map(m => m.output?.value).findLast(v => v?.content?.trim());
  });
  const actualDOM = await app.evaluate(async ({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL() === 'https://pi.dev/');
    return view?.webContents.executeJavaScript('document.body.innerText');
  });
  // innerText includes opacity-zero navigation that our reader excludes.
  // Match the first40 captured words in order, allowing excluded DOM blocks.
  const words = value => value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const expected = words(evidence?.content ?? '').slice(0, 40);
  let matched = 0;
  for (const word of words(actualDOM ?? '')) if (word === expected[matched]) matched++;
  if (expected.length < 8 || matched !== expected.length || evidence?.title !== 'Pi' || evidence.url !== 'https://pi.dev/') {
    await writeFile('.qa/agent-browser-public-assertion.json', JSON.stringify({ evidence: evidence?.content, actualDOM }, null, 2));
    throw new Error('Actual Pi DOM did not reach model');
  }
  await page.screenshot({ path: '.qa/agent-browser-public-conversation.png' });
  await writeFile('.qa/agent-browser-public-results.json', JSON.stringify({ result: 'REAL_PUBLIC_DEEPSEEK_BROWSER_OK', modelFixture: false, webFixture: false, ipcFixture: false, intentInjection: false, url: evidence.url, steps: task.steps, usage: task.usage, platform: process.platform, verifiedAt: new Date().toISOString() }, null, 2));
  console.log('REAL_PUBLIC_DEEPSEEK_BROWSER_OK steps=' + task.steps);
} finally { if (app) await app.close(); clearTimeout(deadline); }
