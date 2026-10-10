import { _electron as electron } from 'playwright';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'agent47-electron-'));
const app = await electron.launch({
  ...(process.env.AGENT47_EXECUTABLE ? { executablePath: process.env.AGENT47_EXECUTABLE } : {}),
  args: [...(process.env.AGENT47_EXECUTABLE ? [] : ['.']), '--no-sandbox', `--user-data-dir=${directory}`],
  env: { ...process.env, AGENT47_SMOKE: '1' },
  timeout: 30000
});
try {
  const page = await app.firstWindow();
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
  await page.locator('.task-page').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
  await page.screenshot({ path: '.qa/electron-smoke.png' });
  console.log(JSON.stringify({ result: 'ELECTRON_IPC_RUNTIME_OK', platform: process.platform, security, credentialReturned: false, fixtureModel: true, sandboxDisabledByTestHarnessOnly: true }));
} finally { await app.close(); }
