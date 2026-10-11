import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, realpath, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const live = process.env.AGENT47_MATERIAL_LIVE === '1';
if (live && (process.env.AGENT47_AUTHENTICATED_PROXY !== '1' || !process.env.HTTPS_PROXY)) throw new Error('Approved model transport required');
const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-material-native-'))), data = join(root, 'data'), file = join(root, 'notes.md'), extra = join(root, 'extra.js');
await mkdir(data); await mkdir('.qa', { recursive: true });
const original = 'ORIGINAL_' + randomUUID().replaceAll('-', ''), updated = 'UPDATED_' + randomUUID().replaceAll('-', '');
await writeFile(file, '# Notes\n' + 'background line\n'.repeat(850) + '\nEVIDENCE=' + original);
await writeFile(extra, '// Explicitly selected code text. No execution.\n');
const env = { ...process.env }; delete env.OPENCODE_API_TOKEN;
if (live) delete env.AGENT47_SMOKE; else env.AGENT47_SMOKE = '1';
let app, page;
const deadline = setTimeout(() => { console.error('Material acceptance timed out'); app?.process().kill(); process.exit(1); }, 300000);
const tasks = () => page.evaluate(() => window.agent47.listTasks());
const pick = path => app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: !selected, filePaths: selected ? [selected] : [] }); }, path);
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env });
  page = await app.firstWindow(); await page.locator('.sidebar').waitFor();
}
try {
  await launch(); await pick(null);
  if (await page.evaluate(() => window.agent47.prepareMaterial()) !== undefined) throw new Error('Cancelled selection referenced an old file');
  await pick(file);
  await page.getByRole('button', { name: '＋引用文件材料', exact: true }).click();
  await page.getByLabel('任务目标').fill('请使用 readMaterial 读取引用的 notes.md，全文件分段读取直至末尾，并只返回文件中的 EVIDENCE 标记。不要使用其他工具，不需要生成成果。');
  await page.getByLabel('开始任务', { exact: true }).click();
  await expect.poll(async () => (await tasks())[0]?.status, { timeout: 180000 }).toBe('completed');
  const first = (await tasks())[0], stableTitle = first.conversationTitle;
  if (first.root || first.materials?.length !== 1 || JSON.stringify(first).includes(root)) throw new Error('Single-file reference expanded or leaked path');
  if (live && !first.events.some(e => e.kind === 'assistant' && e.text.includes(original))) throw new Error('Original marker was not read');
  const originalID = first.materials[0].id, originalHash = first.materials[0].sha256;
  await pick(extra); await page.getByRole('button', { name: '＋选择材料', exact: true }).click();
  if ((await tasks()).length !== 1 || (await tasks())[0].usage?.length !== first.usage?.length) throw new Error('Selection invoked model');
  await page.getByLabel('移除引用：extra.js').click();
  await writeFile(file, '# Updated notes\nEVIDENCE=' + updated);
  await page.getByRole('button', { name: '检查版本', exact: true }).click();
  await expect(page.getByLabel('对话材料引用')).toContainText('有新版');
  const rejected = await page.evaluate(async ({ taskId, id }) => {
    try { await window.agent47.sendMessage({ taskId, text: 'must reject stale reference', mode: 'queue', clientMessageId: crypto.randomUUID(), materialIds: [id] }); return false; }
    catch (e) { return e.message.includes('请更新引用'); }
  }, { taskId: first.id, id: originalID });
  if (!rejected || (await tasks()).length !== 1) throw new Error('Stale source was silently sent');
  await page.getByLabel('更新引用：notes.md').click();
  const refreshed = (await tasks())[0].materials[0];
  if (refreshed.id === originalID || refreshed.sha256 === originalHash) throw new Error('Refresh replaced version identity');
  await page.getByLabel('继续对话', { exact: true }).fill('请用 readMaterial 只读取这条消息引用的新版 notes.md，返回其中新的 EVIDENCE 标记；不要沿用旧版本标记。');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(async () => (await tasks())[0]?.status, { timeout: 180000 }).toBe('completed');
  const second = (await tasks())[0];
  if (second.id === first.id || second.conversationTitle !== stableTitle || second.runNumber !== 2) throw new Error('Conversation identity/title changed');
  if (live && !second.events.filter(e => e.kind === 'assistant').at(-1)?.text.includes(updated)) throw new Error('Updated material was not read');
  if (!live) {
    await app.evaluate(({ app }, input) => {
      const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
      const db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db'));
      const t = JSON.parse(db.prepare('SELECT body FROM tasks WHERE id=?').get(input.id).body);
      const call = { toolName: 'readMaterial', toolCallId: 'native-read-material', input: { id: input.materialId } };
      t.pending = [call]; t.status = 'queued'; t.messages.push({ role: 'assistant', content: [{ type: 'tool-call', ...call }] });
      db.prepare('UPDATE tasks SET body=? WHERE id=?').run(JSON.stringify(t), t.id); db.close();
    }, { id: second.id, materialId: refreshed.id });
    await page.evaluate(id => window.agent47.sendMessage({ taskId: id, text: 'continue fixture', mode: 'queue', clientMessageId: crypto.randomUUID() }), second.id);
    await expect.poll(async () => (await tasks())[0]?.status).toBe('completed');
  }
  const evidence = await app.evaluate(({ app }) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
    const db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db')), records = db.prepare('SELECT body FROM tasks ORDER BY rowid DESC').all().map(r => JSON.parse(r.body)); db.close();
    return records.map(t => ({ id: t.id, usage: t.usage, calls: t.messages.filter(m => m.role === 'tool').flatMap(m => m.content).filter(m => m.toolName === 'readMaterial'), authorized: t.authorizedMaterialIds }));
  });
  if (!JSON.stringify(evidence[0].calls).includes(updated) || !evidence[0].authorized.includes(originalID) || !evidence[0].authorized.includes(refreshed.id)) throw new Error('Pinned reads not retained across rounds');
  await page.getByLabel('执行轮次', { exact: true }).selectOption(first.id);
  await expect(page.getByLabel('继续对话', { exact: true })).toHaveCount(0);
  if (live) await page.screenshot({ path: '.qa/materials-live-history.png' });
  await page.getByRole('button', { name: '回到当前轮次', exact: true }).click();
  await expect(page.getByLabel('继续对话', { exact: true })).toBeVisible();
  await page.locator('.message.assistant').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.qa/materials-${live ? 'live' : 'native'}.png` });
  const runCount = (await tasks()).length, usageBefore = JSON.stringify((await tasks()).map(t => t.usage));
  await app.close(); app = undefined;
  await unlink(file); await launch();
  await expect(page.getByLabel('执行轮次', { exact: true })).toHaveValue(second.id);
  const reopened = await page.evaluate(({ taskId, materialId }) => window.agent47.openMaterial({ taskId, materialId }), { taskId: second.id, materialId: originalID });
  if (!reopened.tabs.some(t => t.content?.includes(original))) throw new Error('Historical pinned snapshot lost');
  await expect.poll(async () => (await tasks()).length).toBe(runCount);
  if (JSON.stringify((await tasks()).map(t => t.usage)) !== usageBefore) throw new Error('Restart replayed model');
  const result = { result: live ? 'REAL_DEEPSEEK_MATERIALS_OK' : 'NATIVE_MATERIALS_OK', modelFixture: !live, intentInjection: !live,
    nativePickerStub: true, platform: process.platform, verifiedAt: new Date().toISOString(), steps: [first.steps, second.steps],
    cases: ['cancel selection is no reference', 'first prompt single-file reference', 'no parent directory authority', 'selection makes no model call', 'changed file rejected', 'explicit new version', 'stable title and two rounds', 'bounded pinned material tool', 'history/latest dock', 'restart no replay', 'deleted source retains original snapshot'], usage: evidence.map(t => t.usage) };
  await writeFile(`.qa/materials-${live ? 'live' : 'native'}-results.json`, JSON.stringify(result, null, 2));
  console.log(result.result);
} finally { if (app) await app.close(); clearTimeout(deadline); }
