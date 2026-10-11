import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
// Windows tmpdir can use a DOS 8.3 alias; preserve the app's symlink checks by
// passing a canonical test directory, rather than weakening production guards.
const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-workspace-native-'))), data = join(root, 'data');
await mkdir(data); await mkdir('.qa', { recursive: true });
let requests = 0;
const server = createServer((_req, res) => { requests++; res.end('NETWORK_SHOULD_BE_BLOCKED'); }); await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const html = `<!doctype html><html lang="zh"><body style="font:14px system-ui;padding:16px"><h2>真实离线 HTML</h2>
<button id="act" onclick="this.textContent='已交互'">点击验证</button><pre id="evidence"></pre>
<script>
evidence.textContent=JSON.stringify({bridge:typeof window.agent47,node:typeof require,process:typeof process,parentBridge:typeof parent.agent47,popup:window.open('https://example.com')===null});
fetch('http://127.0.0.1:${port}/fetch').then(()=>evidence.textContent+=' BAD_FETCH').catch(()=>evidence.textContent+=' FETCH_BLOCKED');
</script><script src="http://127.0.0.1:${port}/script"></script><img src="http://127.0.0.1:${port}/image">
<iframe src="agent47://app/"></iframe><iframe src="file:///etc/passwd"></iframe><form action="http://127.0.0.1:${port}/form"><button id="submit">提交测试</button></form></body></html>`;
await writeFile(join(root, 'offline.html'), html);
await writeFile(join(root, 'notes.md'), '# 本地 Markdown\n\n| 功能 | 验收 |\n| --- | --- |\n| 查看 | 不自动入模 |\n\n<script>window.BAD_MD=true</script>\n![远端图片](https://example.com/image.png)');
await writeFile(join(root, 'example.ts'), 'export const evidence = "MONACO_NATIVE_OK";\n');
await writeFile(join(root, 'report.pdf'), '%PDF-1.0 test');
let app, page;
const watchdog = setTimeout(() => {
  console.error('Workspace native acceptance exceeded 180 seconds');
  app?.process().kill(); server.close(); process.exit(1);
}, 180000);
const report = { platform: process.platform, nativePickerStub: true, modelInvoked: false, cases: [] };
async function launch() {
  console.log('workspace: launch');
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env: { ...process.env, AGENT47_SMOKE: '1' } });
  page = await app.firstWindow(); await page.getByLabel('任务目标').waitFor();
}
async function open(name) {
  console.log('workspace: open ' + name);
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, join(root, name));
  await page.getByRole('button', { name: '打开文件', exact: true }).click();
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
}
async function doc() {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.filter(v => v.webContents?.getURL().startsWith('agent47-document:')).map(v => ({ id: v.webContents.id, url: v.webContents.getURL(), visible: v.getVisible(), bounds: v.getBounds() })));
}
try {
  await launch(); await open('offline.html');
  console.log('workspace: inspect native HTML');
  await expect.poll(async () => (await doc()).length).toBe(1);
  const target = (await doc())[0];
  await expect.poll(async () => (await doc())[0]?.visible).toBe(true);
  const evidence = await app.evaluate(async ({ webContents }, id) => webContents.fromId(id).executeJavaScript('document.getElementById("evidence").textContent'), target.id);
  if (!evidence.includes('"bridge":"undefined"') || !evidence.includes('"node":"undefined"') || !evidence.includes('"process":"undefined"') || !evidence.includes('"parentBridge":"undefined"')) throw new Error('HTML application isolation failed');
  for (const button of ['act', 'submit']) {
    const point = await app.evaluate(({ webContents }, input) => webContents.fromId(input.id).executeJavaScript(`(()=>{const b=document.getElementById(${JSON.stringify(input.button)}).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`), { id: target.id, button });
    await app.evaluate(({ webContents }, input) => {
      const wc = webContents.fromId(input.id);
      wc.sendInputEvent({ type: 'mouseDown', x: Math.round(input.point.x), y: Math.round(input.point.y), button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x: Math.round(input.point.x), y: Math.round(input.point.y), button: 'left', clickCount: 1 });
    }, { id: target.id, point });
  }
  await expect.poll(() => app.evaluate(({ webContents }, id) => webContents.fromId(id).executeJavaScript('document.getElementById("act").textContent'), target.id)).toBe('已交互');
  if (requests !== 0) throw new Error('Untrusted HTML made a network request');
  const unchanged = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getURL());
  if (unchanged !== 'agent47://app/') throw new Error('Application navigated');
  await page.screenshot({ path: '.qa/workspace-native-html.png' });
  const capture = process.platform === 'linux' ? await app.evaluate(async ({ desktopCapturer }) => {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 1440, height: 940 } });
    return (sources.find(s => s.name.includes('Agent47')) ?? sources.find(s => s.id.startsWith('screen:')))?.thumbnail.toPNG().toString('base64');
  }) : undefined;
  if (capture) await writeFile('.qa/workspace-native-window.png', Buffer.from(capture, 'base64'));
  const surface = await app.evaluate(async ({ webContents }, id) => (await webContents.fromId(id).capturePage()).toPNG().toString('base64'), target.id);
  await writeFile('.qa/workspace-native-html-surface.png', Buffer.from(surface, 'base64'));
  report.cases.push({ name: 'actual native HTML inline JS; Node/process/IPC absent; HTTP resources/forms/iframes/popups denied', passed: true, networkRequests: requests });
  await page.getByRole('button', { name: '停止 HTML 运行', exact: true }).click();
  console.log('workspace: stopped native HTML');
  await expect.poll(async () => (await doc()).length).toBe(0);
  report.cases.push({ name: 'stop destroys native WebContents, not merely hides it', passed: true });
  await page.getByLabel('刷新当前文档').click(); await expect.poll(async () => (await doc()).length).toBe(1);
  await open('notes.md'); await expect(page.locator('.document-markdown table')).toBeVisible();
  if (await page.evaluate(() => window.BAD_MD)) throw new Error('Markdown executed raw HTML');
  await open('example.ts'); await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.view-lines')).toContainText('MONACO_NATIVE_OK');
  const input = page.locator('.monaco-editor textarea.inputarea'); await input.focus(); await page.keyboard.type('MUTATION_ATTEMPT');
  await expect(page.locator('.view-lines')).not.toContainText('MUTATION_ATTEMPT');
  await page.getByRole('tab', { name: 'notes.md', exact: true }).click();
  await page.getByRole('tab', { name: 'example.ts', exact: true }).click();
  await expect(page.locator('.view-lines')).toContainText('MONACO_NATIVE_OK');
  await page.screenshot({ path: '.qa/workspace-native-code.png' });
  report.cases.push({ name: 'actual Markdown GFM/raw-HTML suppression and Monaco ESM readonly/local worker', passed: true });
  const before = await page.evaluate(() => window.agent47.workspaceView());
  await writeFile(join(root, 'example.ts'), 'export const evidence = "EXTERNAL_NEW_VERSION";\n');
  await expect(page.locator('.view-lines')).toContainText('MONACO_NATIVE_OK');
  await page.getByLabel('刷新当前文档').click();
  await expect(page.locator('.view-lines')).toContainText('EXTERNAL_NEW_VERSION');
  await page.getByLabel('标签左移').click();
  console.log('workspace: closing for restart');
  await app.close(); app = undefined; await launch();
  console.log('workspace: restarted');
  const restored = await page.evaluate(() => window.agent47.workspaceView());
  if (restored.tabs.length !== before.tabs.length || restored.tabs.find(t => t.name === 'example.ts').content !== 'export const evidence = "EXTERNAL_NEW_VERSION";\n') throw new Error('Workspace restart snapshot failed');
  await expect(page.locator('.view-lines')).toContainText('EXTERNAL_NEW_VERSION', { timeout: 30000 });
  report.cases.push({ name: 'explicit refresh replaces pinned version; tabs/order/active state survive restart', passed: true });
  await open('report.pdf'); await expect(page.getByRole('heading', { name: '暂不支持此格式' })).toBeVisible();
  await app.evaluate(({ shell }) => { shell.openPath = async () => ''; });
  await page.getByRole('button', { name: '用系统默认查看器打开', exact: true }).click();
  report.cases.push({ name: 'unsupported PDF system-viewer routing', passed: true, systemLaunchStub: true });
  await page.getByRole('tab', { name: 'offline.html', exact: true }).click();
  console.log('workspace: resize/hide/close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 740));
  await expect.poll(async () => { const b = await page.locator('.workspace-body').boundingBox(); return Math.round(b.width); }).toBeGreaterThan(200);
  await page.getByLabel('收起工作区').click();
  await expect(page.getByLabel('产物工作区')).toHaveCount(0);
  if (requests !== 0 || (await page.evaluate(() => window.agent47.listTasks())).length) throw new Error('Viewing leaked network/model tasks');
  await page.getByRole('button', { name: /^工作区/ }).click();
  await page.getByLabel('关闭标签：offline.html').click();
  await expect.poll(async () => (await doc()).length).toBe(0);
  report.cases.push({ name: 'native layout/hide/close lifecycle and local viewing does not create model tasks', passed: true });
  report.result = 'WORKSPACE_NATIVE_SECURITY_OK'; await writeFile('.qa/workspace-native-results.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (e) { console.error('Workspace native acceptance failed:', e.message); if (page) await page.screenshot({ path: '.qa/workspace-native-failure.png' }).catch(() => {}); process.exitCode = 1; }
finally { console.log('workspace: final cleanup'); if (app) await app.close(); await new Promise(r => server.close(r)); clearTimeout(watchdog); }
