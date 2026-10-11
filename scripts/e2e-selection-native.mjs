import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, realpath, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const live = process.env.AGENT47_SELECTION_LIVE === '1';
if (live && (process.env.AGENT47_AUTHENTICATED_PROXY !== '1' || !process.env.HTTPS_PROXY)) throw new Error('Approved model transport required');
const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-selection-'))), data = join(root, 'data'), project = join(root, 'project');
await mkdir(data); await mkdir(project); await mkdir('.qa', { recursive: true });
const marker = 'KEEP_' + randomUUID().replaceAll('-', '');
const original = `\uFEFF// first\r\nconst label = "OLD";\r\n// second\r\nconst label = "OLD";\r\n// ${marker}\r\n`;
const selected = 'const label = "OLD";', start = original.lastIndexOf(selected), replacement = 'const label = "NEW";';
const modified = original.slice(0, start) + replacement + original.slice(start + selected.length);
const file = join(project, 'notes.ts'); await writeFile(file, original);
const env = { ...process.env }; delete env.OPENCODE_API_TOKEN;
if (live) delete env.AGENT47_SMOKE; else env.AGENT47_SMOKE = '1';
let app, page;
const deadline = setTimeout(() => { console.error('Selection acceptance timed out'); app?.process().kill(); process.exit(1); }, 300000);
const tasks = () => page.evaluate(() => window.agent47.listTasks());
const pick = path => app.evaluate(({ dialog }, value) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [value] }); }, path);
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env });
  page = await app.firstWindow(); await page.locator('.sidebar').waitFor();
}
async function completed(id) {
  await expect.poll(async () => {
    const t = (await tasks()).find(t => t.id === id);
    if (['failed', 'awaiting_approval', 'awaiting_reconciliation', 'awaiting_input', 'paused'].includes(t?.status)) throw new Error(JSON.stringify(t));
    return t?.status;
  }, { timeout: 180000 }).toBe('completed');
  return (await tasks()).find(t => t.id === id);
}
try {
  await launch(); await pick(project);
  await page.getByRole('button', { name: '选择项目目录', exact: true }).click();
  await page.getByLabel('任务目标').fill('This is a coding-tool test. Reply READY only; do not use tools yet.');
  await page.getByLabel('开始任务', { exact: true }).click();
  const first = (await tasks())[0]; await completed(first.id);
  await pick(file); await page.getByRole('button', { name: '打开文件', exact: true }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30000 });
  const draft = '保留这个草稿，不要自动发送';
  await page.getByLabel('继续对话', { exact: true }).fill(draft);
  const beforeUsage = JSON.stringify((await tasks()).map(t => t.usage));
  await page.locator('.monaco-editor textarea').focus();
  await page.keyboard.press('ControlOrMeta+Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await expect(page.getByRole('button', { name: '让 Agent 修改', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '让 Agent 修改', exact: true }).click();
  await expect(page.getByLabel('继续对话', { exact: true })).toHaveValue(draft);
  const pinned = (await tasks())[0].materials?.[0];
  if (pinned?.selection?.start !== start || pinned.selection.end !== start + selected.length || pinned.selection.targetPath !== 'notes.ts') throw new Error('Raw repeated-text selection mapped incorrectly');
  if (JSON.stringify((await tasks()).map(t => t.usage)) !== beforeUsage || (await tasks()).length !== 1) throw new Error('Selecting implicitly invoked model');
  await page.screenshot({ path: `.qa/selection-${live ? 'live' : 'native'}-draft.png`, animations: 'disabled' });
  await expect.poll(async () => (await tasks())[0].composerDraft).toBe(draft);
  await app.close(); app = undefined; await launch();
  await expect(page.getByLabel('继续对话', { exact: true })).toHaveValue(draft);
  if ((await tasks())[0].materials[0].selection.start !== start) throw new Error('Selection did not persist');
  const goal = `In the referenced notes.ts, change ONLY the selected second occurrence of ${JSON.stringify(selected)} to ${JSON.stringify(replacement)}. First readMaterial for the selected version to obtain original text and sha256. Then use fileEdit with path notes.ts, expectedHash from that version, one edits entry with exact oldText/newText and original UTF-16 startOffset ${start}. No other tools or changes. Preserve BOM, CRLF, first repeated line and ${marker}. After actual success reply SELECTED_EDIT_OK with the marker.`;
  if (!live) {
    // Fixture intent injection only: tools, file IO, snapshots, IPC and UI remain real.
    await app.evaluate(({ app }, input) => {
      const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
      const db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db'));
      const t = JSON.parse(db.prepare('SELECT body FROM tasks WHERE id=?').get(input.id).body);
      const call = { toolCallId: 'selection-native-edit', toolName: 'fileEdit', input: { path: 'notes.ts', expectedHash: input.hash, edits: [{ oldText: input.oldText, newText: input.newText, startOffset: input.start }] } };
      t.pending = [call]; t.status = 'queued'; t.messages.push({ role: 'assistant', content: [{ type: 'tool-call', ...call }] });
      db.prepare('UPDATE tasks SET body=? WHERE id=?').run(JSON.stringify(t), t.id); db.close();
    }, { id: first.id, hash: pinned.sha256, oldText: selected, newText: replacement, start });
    await page.evaluate(id => window.agent47.sendMessage({ taskId: id, text: 'continue fixture intent', mode: 'queue', clientMessageId: crypto.randomUUID() }), first.id);
  } else {
    await page.getByLabel('继续对话', { exact: true }).fill(goal);
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect.poll(async () => (await tasks())[0].id).not.toBe(first.id);
  }
  const run = await completed((await tasks())[0].id);
  if (await readFile(file, 'utf8') !== modified || run.fileChanges.length !== 1) throw new Error('Exact selected edit or single snapshot missing');
  if (live && !run.events.some(e => e.kind === 'assistant' && e.text.includes(marker) && e.text.includes('SELECTED_EDIT_OK'))) throw new Error('Real model failed to report actual evidence');
  await expect(page.getByLabel('执行轮次', { exact: true })).toHaveValue(run.id);
  await page.getByText('文件改动与恢复点（写入前自动备份）', { exact: true }).click();
  await page.getByRole('button', { name: '查看差异', exact: true }).click();
  await expect(page.locator('.monaco-diff-editor')).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel('产物工作区')).toContainText('只读文本差异');
  await page.screenshot({ path: `.qa/selection-${live ? 'live' : 'native'}-diff.png`, animations: 'disabled' });
  const usage = JSON.stringify((await tasks()).map(t => t.usage)), count = (await tasks()).length;
  await page.getByRole('button', { name: '恢复改动前', exact: true }).click();
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect.poll(() => readFile(file, 'utf8')).toBe(original);
  await app.close(); app = undefined; await launch();
  await expect(page.locator('.monaco-diff-editor')).toBeVisible({ timeout: 30000 });
  if ((await tasks()).length !== count || JSON.stringify((await tasks()).map(t => t.usage)) !== usage || await readFile(file, 'utf8') !== original) throw new Error('Restart replayed model or edit');
  const result = { result: live ? 'REAL_DEEPSEEK_SELECTION_EDIT_OK' : 'NATIVE_SELECTION_EDIT_OK', modelFixture: !live, intentInjection: !live, nativePickerStub: true, platform: process.platform, verifiedAt: new Date().toISOString(), steps: run.steps, usage: run.usage, cases: ['actual keyboard selection of second duplicate', 'BOM/CRLF original offsets', 'attach does not send and preserves draft', 'restart keeps selected version and draft', 'structured single-file edit', 'exact original bytes outside selected edit', 'one automatic snapshot without approval', 'readonly historical diff', 'UI restore', 'restart without replay'] };
  await writeFile(`.qa/selection-${live ? 'live' : 'native'}-results.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} finally { if (app) await app.close(); clearTimeout(deadline); }
