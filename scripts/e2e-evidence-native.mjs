import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, realpath, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
const live = process.env.AGENT47_EVIDENCE_LIVE === '1';
if (live && (process.env.AGENT47_AUTHENTICATED_PROXY !== '1' || !process.env.HTTPS_PROXY)) throw new Error('Approved transport required');
const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-evidence-'))), data = join(root, 'data'), file = join(root, 'notes.md');
await mkdir(data); await mkdir('.qa', { recursive: true });
const marker = 'OBSERVED_' + randomUUID().replaceAll('-', ''), changed = 'CHANGED_' + randomUUID().replaceAll('-', '');
await writeFile(file, '# Synthetic notes\nFACT=' + marker);
const env = { ...process.env }; delete env.OPENCODE_API_TOKEN;
if (live) delete env.AGENT47_SMOKE; else env.AGENT47_SMOKE = '1';
let app, page;
const deadline = setTimeout(() => { console.error('Evidence acceptance timed out'); app?.process().kill(); process.exit(1); }, 300000);
const tasks = () => page.evaluate(() => window.agent47.listTasks());
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env }); page = await app.firstWindow();
  await page.locator('.sidebar').waitFor(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
}
async function done(id) {
  await expect.poll(async () => {
    const t = (await tasks()).find(t => t.id === id);
    if (['failed', 'paused', 'awaiting_approval', 'awaiting_input', 'awaiting_reconciliation'].includes(t?.status)) throw new Error(JSON.stringify(t));
    return t?.status;
  }, { timeout: 180000 }).toBe('completed'); return (await tasks()).find(t => t.id === id);
}
try {
  await launch(); await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, file);
  await page.getByRole('button', { name: '＋引用文件材料', exact: true }).click();
  await expect(page.getByLabel('移除待发送材料：notes.md')).toBeVisible();
  await page.getByLabel('任务目标').fill('来源验收：读取引用 notes.md，只返回 FACT 标记，并用 readMaterial 返回的 source.uri 做 Markdown 引用。不要写文件或使用其他工具。');
  await page.getByLabel('开始任务', { exact: true }).click(); const first = (await tasks())[0]; await done(first.id);
  if (!live) {
    await app.evaluate(({ app }, input) => {
      const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
      const db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db')), t = JSON.parse(db.prepare('SELECT body FROM tasks WHERE id=?').get(input.id).body);
      const call = { toolName: 'readMaterial', toolCallId: 'fixture-evidence-read', input: { id: input.materialId } };
      t.pending = [call]; t.status = 'queued'; t.messages.push({ role: 'assistant', content: [{ type: 'tool-call', ...call }] });
      db.prepare('UPDATE tasks SET body=? WHERE id=?').run(JSON.stringify(t), t.id); db.close();
    }, { id: first.id, materialId: first.materials[0].id });
    await page.evaluate(id => window.agent47.sendMessage({ taskId: id, text: 'continue fixture read', mode: 'queue', clientMessageId: crypto.randomUUID() }), first.id); await done(first.id);
  }
  const observed = (await tasks())[0], source = observed.sources?.[0];
  if (!source || source.offset !== 0 || source.end <= 0 || observed.root || source.name !== 'notes.md') throw new Error('Actual read receipt missing or expanded directory permission');
  if (live && !observed.events.filter(e => e.kind === 'assistant').at(-1).text.includes(source.uri)) throw new Error('Real model did not cite actual receipt');
  await page.getByLabel('继续对话', { exact: true }).fill('保留这个审阅草稿');
  const usage = JSON.stringify((await tasks()).map(t => t.usage));
  await writeFile(file, '# Changed\nFACT=' + changed);
  if (live) await page.locator('.source-citation').last().click();
  else {
    await page.locator('.source-list summary').click(); await page.locator('.source-row').first().click();
  }
  await expect(page.getByLabel('来源证据版本与范围')).toContainText(source.versionHash.slice(0, 12));
  await expect(page.locator('.view-lines')).toContainText(marker, { timeout: 30000 });
  await expect(page.locator('.view-lines')).not.toContainText(changed);
  await expect(page.getByLabel('刷新当前文档')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '让 Agent 修改', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('继续对话', { exact: true })).toHaveValue('保留这个审阅草稿');
  if (JSON.stringify((await tasks()).map(t => t.usage)) !== usage) throw new Error('Opening source called model');
  const rejected = await page.evaluate(async id => { try { await window.agent47.openEvidence({ taskId: id, sourceId: 's0000000000000000' }); return false; } catch { return true; } }, first.id);
  if (!rejected) throw new Error('Forged source accepted');
  await page.screenshot({ path: `.qa/evidence-${live ? 'live' : 'native'}.png`, animations: 'disabled' });
  await expect.poll(async () => (await tasks())[0].composerDraft).toBe('保留这个审阅草稿');
  await expect.poll(() => page.evaluate(() => window.agent47.lastRun())).toBe(first.id);
  await app.close(); app = undefined; await unlink(file); await launch();
  await expect(page.locator('.view-lines')).toContainText(marker, { timeout: 30000 });
  await expect(page.getByLabel('继续对话', { exact: true })).toHaveValue('保留这个审阅草稿');
  if (JSON.stringify((await tasks()).map(t => t.usage)) !== usage) throw new Error('Restart replayed model');
  await page.getByLabel('移除引用：notes.md').click();
  await expect.poll(async () => (await tasks())[0].materials?.length).toBe(0);
  await page.getByLabel('继续对话', { exact: true }).fill(`请只用 readEvidence 重新核对上一轮已留档来源 id=${source.id}，再返回其中 FACT 和同一个 source.uri 的 Markdown 引用。不能重读文件或使用其他工具；来源是历史证据，不代表当前文件。`);
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(async () => (await tasks())[0].id).not.toBe(first.id);
  const second = await done((await tasks())[0].id);
  if (second.sources?.length !== 1 || second.sources[0].id !== source.id) throw new Error('Followup lost or fabricated source');
  if (live && (!second.events.filter(e => e.kind === 'assistant').at(-1).text.includes(source.uri) || !second.events.filter(e => e.kind === 'assistant').at(-1).text.includes(marker))) throw new Error('Followup citation did not preserve actual evidence');
  if (live && !second.events.some(e => e.kind === 'tool' && e.text.startsWith('readEvidence'))) throw new Error('Archived read tool not exercised by real model');
  await page.evaluate(input => window.agent47.openEvidence(input), { taskId: second.id, sourceId: source.id });
  const rows = await app.evaluate(({ app }) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path'), db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db'));
    const count = db.prepare('SELECT COUNT(*) AS n FROM source_evidence').get().n; db.close(); return count;
  });
  if (rows !== 1) throw new Error('Followup duplicated immutable source body');
  const result = { result: live ? 'REAL_DEEPSEEK_EVIDENCE_OK' : 'NATIVE_EVIDENCE_OK', modelFixture: !live, intentInjection: !live, nativePickerStub: true, platform: process.platform, verifiedAt: new Date().toISOString(), steps: [observed.steps, second.steps], source, usage: (await tasks()).map(t => t.usage), cases: ['actual read receipt and model citation in live mode', 'changed disk does not replace evidence', 'source click preserves draft and makes no model call', 'forged ID rejected', 'offline readonly excerpt', 'deleted source and restart preserve evidence', 'followup inherits same receipt without rereading', 'immutable body stored once'] };
  await writeFile(`.qa/evidence-${live ? 'live' : 'native'}-results.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  if (await readFile(join(data, 'workspace.json'), 'utf8').then(s => s.includes('file://'))) throw new Error('Private source URL leaked');
} finally { if (app) await app.close(); clearTimeout(deadline); }
