import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = await realpath(await mkdtemp(join(tmpdir(), 'agent47-electron-')));
await mkdir('.qa', { recursive: true });
const app = await electron.launch({
  ...(process.env.AGENT47_EXECUTABLE ? { executablePath: process.env.AGENT47_EXECUTABLE } : {}),
  args: [...(process.env.AGENT47_EXECUTABLE ? [] : ['.']), '--no-sandbox', `--user-data-dir=${directory}`],
  env: { ...process.env, AGENT47_SMOKE: '1' },
  timeout: 30000
});
try {
  const page = await app.firstWindow();
  page.on('dialog', dialog => dialog.accept());
  await page.getByLabel('任务目标').fill('Verify the isolated Electron runtime');
  await page.getByLabel('开始任务', { exact: true }).click();
  await page.getByText('Electron runtime smoke test passed.', { exact: true }).waitFor();
  const security = await page.evaluate(() => ({
    bridge: Boolean(window.agent47), preview: window.agent47?.preview,
    nodeVisible: typeof window.require !== 'undefined',
    processVisible: typeof window.process !== 'undefined'
  }));
  if (!security.bridge || security.preview || security.nodeVisible || security.processVisible) throw new Error('Renderer isolation failed');
  const settings = await page.evaluate(() => window.agent47.provider());
  if ('apiKey' in settings || 'encryptedKey' in settings) throw new Error('Credential leaked through IPC');
  await page.getByRole('button', { name: '连接设置与工具', exact: true }).click();
  await page.getByLabel('默认文件权限').selectOption('ask');
  await page.getByRole('button', { name: '我理解风险，启用本机 Shell / JavaScript', exact: true }).click();
  const execution = await page.evaluate(() => window.agent47.executionSettings());
  if (!execution.hostExecution || execution.fileMode !== 'ask') throw new Error('Tool settings IPC failed');
  await page.getByRole('button', { name: '关闭本机 Shell / JavaScript', exact: true }).click();
  await page.locator('.recent-item').first().click();
  await page.locator('.task-page').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
  await page.screenshot({ path: '.qa/electron-smoke.png' });
  console.log(JSON.stringify({ result: 'ELECTRON_IPC_RUNTIME_OK', platform: process.platform, security, credentialReturned: false, fixtureModel: true, sandboxDisabledByTestHarnessOnly: true }));
} finally { await app.close(); }
