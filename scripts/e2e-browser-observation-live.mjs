import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
if (process.env.AGENT47_AUTHENTICATED_PROXY !== '1' || !process.env.HTTPS_PROXY) throw new Error('Approved Vault/proxy required');
const data = await realpath(await mkdtemp(join(tmpdir(), 'a47-browser-observation-live-')));
await mkdir('.qa', { recursive: true });
const env = { ...process.env }; delete env.AGENT47_SMOKE; delete env.OPENCODE_API_TOKEN;
const head = 'HEAD_' + crypto.randomUUID(), tail = 'TAIL_' + crypto.randomUUID();
const html = `<!doctype html><h1>Controlled delayed article</h1><button onclick="this.disabled=true;setTimeout(()=>{document.querySelector('main').innerHTML='<h2>Evidence article</h2><p>${head} '+ 'Synthetic article. '.repeat(360) +' ${tail}</p>'},2000)">Load evidence</button><p>Do not guess the article evidence before it loads.</p><main><h2>Evidence article</h2><p>Waiting for load</p></main><form><input type="password" value="PRIVATE_FIXTURE_VALUE"></form>`;
let app, page;
const watchdog = setTimeout(() => { console.error('Live browser observation timeout'); app?.process().kill(); process.exit(1); }, 360000);
try {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env });
  page = await app.firstWindow(); await page.locator('.sidebar').waitFor();
  await app.evaluate(({ session }, html) => {
    const original = session.fromPartition;
    session.fromPartition = function(partition, ...args) {
      const s = original.call(session, partition, ...args);
      if (partition.startsWith('agent47-web-')) s.protocol.handle('https', () => new Response(html, { headers: { 'content-type': 'text/html' } }));
      return s;
    };
  }, html);
  await page.getByLabel('任务目标').fill('之后我会授权网页。现在只回答 READY，不调用工具。');
  await page.getByLabel('开始任务', { exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.agent47.listTasks()))[0]?.status, { timeout: 180000 }).toBe('completed');
  const first = (await page.evaluate(() => window.agent47.listTasks()))[0];
  await page.getByRole('button', { name: /^工作区/ }).click();
  await page.getByLabel('公共 HTTPS 网页地址').fill('https://example.com/');
  await page.getByRole('button', { name: '打开网页', exact: true }).click();
  await expect.poll(async () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.some(v => v.webContents?.getURL() === 'https://example.com/' && !v.webContents.isLoading()))).toBe(true);
  await page.getByLabel('当前网页 Agent 权限').selectOption('allow');
  await page.getByRole('button', { name: '确认可信交互范围', exact: true }).click();
  const follow = await page.evaluate(taskId => window.agent47.sendMessage({
    taskId, text: '请用原生 browser 工具完成已授权网页的验收：先 browserRead 获取引用，再点击 Load evidence 一次；使用 browserWait 等待 text “HEAD_” 出现，timeoutMs 5000。之后重新 browserRead 获取 Evidence article 的区域引用；用 regionRef 与 snapshotId 定向读取该区域，limit 4000，再用 nextOffset、expectedDigest=contentDigest 及最新 snapshotId 分页直到 hasMore=false。不要用其他工具、不要再次点击。最后原样报告区域中真实的 HEAD_ 和 TAIL_ 完整随机标记，并简述这是局部区域、非整个网页。不要猜测任何标记。',
    mode: 'followup', clientMessageId: crypto.randomUUID()
  }), first.id);
  await expect.poll(async () => (await page.evaluate(() => window.agent47.listTasks())).find(t => t.id === follow.id)?.status, { timeout: 240000 }).toBe('completed');
  const task = (await page.evaluate(() => window.agent47.listTasks())).find(t => t.id === follow.id);
  const record = await app.evaluate(({ app }, taskId) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
    const db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db'));
    const task = JSON.parse(db.prepare('SELECT body FROM tasks WHERE id=?').get(taskId).body); db.close(); return task;
  }, follow.id);
  const calls = record.messages.filter(m => m.role === 'assistant' && Array.isArray(m.content)).flatMap(m => m.content.filter(c => c.type === 'tool-call'));
  const results = record.messages.filter(m => m.role === 'tool').flatMap(m => m.content);
  if (calls.filter(c => c.toolName === 'browserClick').length !== 1 || !calls.some(c => c.toolName === 'browserWait') ||
    !calls.some(c => c.toolName === 'browserRead' && c.input.regionRef) ||
    !calls.some(c => c.toolName === 'browserRead' && c.input.offset > 0 && c.input.expectedDigest)) throw new Error('Real model did not use required tools/range');
  if (!results.some(r => r.toolName === 'browserWait' && r.output.value?.outcome === 'matched')) throw new Error('Wait condition not observed');
  if (!task.events.some(e => e.kind === 'assistant' && e.text.includes(head) && e.text.includes(tail))) throw new Error('Final random evidence missing');
  if (JSON.stringify(results).includes('PRIVATE_FIXTURE_VALUE')) throw new Error('Private form value exposed');
  await page.screenshot({ path: '.qa/browser-observation-live.png' });
  const image = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL() === 'https://example.com/').webContents.capturePage()).toPNG().toString('base64'));
  await writeFile('.qa/browser-observation-live-page.png', Buffer.from(image, 'base64'));
  await writeFile('.qa/browser-observation-live-results.json', JSON.stringify({
    result: 'REAL_DEEPSEEK_BROWSER_OBSERVATION_OK', modelFixture: false, httpsResponseFixture: true, intentInjection: false,
    ipcFixture: false, platform: process.platform, sandboxDisabledByTestHarnessOnly: true,
    steps: task.steps, calls: calls.map(c => ({ toolName: c.toolName, input: c.input })), usage: task.usage,
    verifiedAt: new Date().toISOString(), evidence: { head, tail }
  }, null, 2));
  console.log('REAL_DEEPSEEK_BROWSER_OBSERVATION_OK steps=' + task.steps);
} finally { if (app) await app.close(); clearTimeout(watchdog); }
