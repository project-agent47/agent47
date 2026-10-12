import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, realpath, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const live = process.env.AGENT47_RESOURCES_LIVE === '1';
if (live && (process.env.AGENT47_AUTHENTICATED_PROXY !== '1' || !process.env.HTTPS_PROXY)) throw new Error('Approved model transport required');
const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-resources-'))), data = join(root, 'data'), file = join(root, 'daily.md');
await mkdir(data); await mkdir('.qa', { recursive: true });
const original = 'EVIDENCE_OLD_' + randomUUID(), updated = 'EVIDENCE_NEW_' + randomUUID(), prefix1 = 'RULE_ONE_' + randomUUID(), prefix2 = 'RULE_TWO_' + randomUUID();
await writeFile(file, '# 日常工作材料\n' + original);
const env = { ...process.env }; delete env.OPENCODE_API_TOKEN;
if (live) delete env.AGENT47_SMOKE; else env.AGENT47_SMOKE = '1';
let app, page;
const deadline = setTimeout(() => { console.error('Resource acceptance timed out'); app?.process().kill(); process.exit(1); }, 300000);
const tasks = () => page.evaluate(() => window.agent47.listTasks());
const context = id => page.evaluate(id => window.agent47.projectContext(id), id);
async function launch() {
  app = await electron.launch({ args: ['.', '--no-sandbox', `--user-data-dir=${data}`], env }); page = await app.firstWindow();
  await page.locator('.sidebar').waitFor(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
}
async function done(id) {
  await expect.poll(async () => (await tasks()).find(t => t.id === id)?.status, { timeout: 180000 }).toBe('completed');
  return (await tasks()).find(t => t.id === id);
}
async function record(id) {
  return app.evaluate(({ app }, id) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
    const db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db')); const body = JSON.parse(db.prepare('SELECT body FROM tasks WHERE id=?').get(id).body); db.close();
    return { projectContext: body.projectContext, authorized: body.authorizedMaterialIds, calls: body.messages.filter(m => m.role === 'tool').flatMap(m => m.content), versions: body.materialVersions };
  }, id);
}
async function fixtureIntent(id, materialId, artifact = false) {
  if (live) throw new Error('No intent injection in live mode');
  await app.evaluate(({ app }, input) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite'), { join } = process.getBuiltinModule('node:path');
    const db = new DatabaseSync(join(app.getPath('userData'), 'tasks.db')), t = JSON.parse(db.prepare('SELECT body FROM tasks WHERE id=?').get(input.id).body);
    const calls = [{ toolName: 'readMaterial', toolCallId: 'fixture-read-' + input.id, input: { id: input.materialId } }];
    if (input.artifact) calls.push({ toolName: 'writeArtifact', toolCallId: 'fixture-write-' + input.id, input: { name: 'summary.md', content: '# 日常摘要\n' + input.marker } });
    t.pending = calls; t.status = 'queued'; t.messages.push({ role: 'assistant', content: calls.map(c => ({ type: 'tool-call', ...c })) });
    db.prepare('UPDATE tasks SET body=? WHERE id=?').run(JSON.stringify(t), t.id); db.close();
  }, { id, materialId, artifact, marker: updated });
  await page.evaluate(async id => { await window.agent47.pauseTask(id); await window.agent47.resumeTask(id); }, id); await done(id);
}
try {
  await launch();
  await page.getByLabel('新建项目', { exact: true }).click(); await page.getByLabel('新项目名称').fill('日常资料与成果');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.agent47.projects())).toMatchObject({ projects: [{ name: '日常资料与成果' }] });
  const project = (await page.evaluate(() => window.agent47.projects())).projects[0];
  await page.locator('.project-context-editor > summary').click();
  await page.getByLabel('项目说明', { exact: true }).fill('每次最终回复必须原样包含标记 ' + prefix1 + '。只输出真实读取到的证据，不猜测。');
  await page.getByRole('button', { name: '保存项目说明', exact: true }).click();
  await expect.poll(() => context(project.id)).toMatchObject({ revision: 1 });
  await page.locator('.project-context-editor > summary').click();
  await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, file);
  await page.getByRole('button', { name: '资源库', exact: true }).click();
  await page.getByRole('button', { name: '固定文件到项目', exact: true }).click();
  await expect.poll(async () => (await context(project.id)).pins.length).toBe(1);
  const pinned = await context(project.id), old = pinned.pins[0].material;
  if ((await tasks()).length || pinned.pins.length !== 1) throw new Error('Pinning invoked model or failed');
  await writeFile(file, '# 新版日常材料\n' + updated);
  await page.getByRole('button', { name: '任务中心', exact: true }).click();
  await expect(page.locator('.home .material-chips')).toContainText('固定：daily.md');
  await page.getByLabel('任务目标').fill('使用 readMaterial 读取本条消息已选 daily.md，返回其中 EVIDENCE_完整标记并遵循项目说明；不读取目录、不写文件、不猜测。');
  await page.getByLabel('开始任务', { exact: true }).click();
  await expect.poll(async () => (await tasks()).length).toBe(1);
  const firstId = (await tasks())[0].id; await done(firstId);
  if (!live) await fixtureIntent(firstId, old.id);
  const first = await done(firstId), r1 = await record(firstId);
  if (first.root || first.hostMode !== 'ask' || first.materials.length !== 1 || first.projectContext.revision !== pinned.revision) throw new Error('Implicit scope or missing manifest');
  if (!JSON.stringify(r1.calls).includes(original) || JSON.stringify(r1.calls).includes(updated)) throw new Error('Fixed old version was silently refreshed');
  if (live && !first.events.some(e => e.kind === 'assistant' && e.text.includes(original) && e.text.includes(prefix1))) throw new Error('Model did not use material + project instructions');
  const c1 = await context(project.id);
  await page.evaluate(input => window.agent47.saveProjectInstructions(input), { id: project.id, expectedRevision: c1.revision, instructions: '每次最终回复必须原样包含标记 ' + prefix2 + '。不猜测。' });
  const c2 = await context(project.id);
  await page.evaluate(input => window.agent47.updateProjectPin(input), { projectId: project.id, expectedRevision: c2.revision, pinId: c2.pins[0].id });
  const current = await context(project.id), newer = current.pins[0].material;
  if (newer.id === old.id || newer.sha256 === old.sha256 || (await record(firstId)).projectContext.instructionHash !== first.projectContext.instructionHash) throw new Error('History mutated');
  await unlink(file);
  await page.getByLabel('继续对话', { exact: true }).fill('保留日常追问草稿');
  await expect.poll(async () => (await tasks())[0].composerDraft).toBe('保留日常追问草稿');
  const usageBefore = first.usage?.length;
  await page.locator('.material-bar .material-chip > button').first().click();
  await expect(page.locator('.document-markdown')).toContainText(original);
  if ((await tasks())[0].usage?.length !== usageBefore) throw new Error('Viewing invoked model');
  await app.close(); app = undefined; await launch();
  await expect(page.getByLabel('继续对话', { exact: true })).toHaveValue('保留日常追问草稿');
  if ((await tasks()).length !== 1 || (await tasks())[0].usage?.length !== usageBefore) throw new Error('Restart replayed');
  await page.getByLabel('继续对话', { exact: true }).fill('保留草稿 @');
  await page.locator('.resource-picker').getByRole('button', { name: /daily\.md/ }).click();
  await expect(page.getByLabel('继续对话', { exact: true })).toHaveValue('保留草稿 @');
  await expect.poll(async () => (await tasks())[0].materials.some(m => m.id === newer.id)).toBe(true);
  if ((await tasks()).length !== 1) throw new Error('Selecting reference sent message');
  await page.getByLabel('继续对话', { exact: true }).fill(`只使用 readMaterial 读取 id=${newer.id} 这份新固定版本，调用 writeArtifact 保存 summary.md，包含材料中的 EVIDENCE_完整标记并遵循当前项目说明，然后回复。不要沿用旧版，不使用目录或 Shell。`);
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(async () => (await tasks()).length).toBe(2); const secondId = (await tasks())[0].id; await done(secondId);
  if (!live) await fixtureIntent(secondId, newer.id, true);
  const second = await done(secondId), r2 = await record(secondId);
  await expect(page.locator('.composer-dock .material-bar')).toHaveCount(1);
  if (second.runNumber !== 2 || second.projectContext.revision !== current.revision || !r2.authorized.includes(old.id) || !r2.authorized.includes(newer.id) || !JSON.stringify(r2.calls).includes(updated)) throw new Error('New run/version context missing');
  const artifact = second.artifacts.find(a => a.name === 'summary.md');
  if (!artifact?.content.includes(updated)) throw new Error('Actual deliverable evidence missing');
  if (live && !second.events.filter(e => e.kind === 'assistant').at(-1)?.text.includes(prefix2)) throw new Error('New project instructions not applied');
  await page.screenshot({ path: `.qa/resources-${live ? 'live' : 'native'}-conversation.png`, animations: 'disabled' });
  await page.evaluate(input => window.agent47.pinResource(input), { projectId: project.id, expectedRevision: current.revision, source: { kind: 'artifact', taskId: secondId, artifactId: artifact.id } });
  const rows = await page.evaluate(id => window.agent47.listResources(id), project.id);
  if (rows.length !== 2 || rows.filter(r => r.kind === 'artifact').length !== 1 || rows.some(r => r.pins.length !== 1)) throw new Error('Parallel artifact/resource rows duplicated');
  await page.getByRole('button', { name: '资源库', exact: true }).click();
  await page.locator('.standard-page').getByRole('button', { name: '全部', exact: true }).click();
  await expect(page.locator('.standard-page .resource-row')).toHaveCount(2);
  await page.screenshot({ path: `.qa/resources-${live ? 'live' : 'native'}-library.png`, animations: 'disabled' });
  await app.close(); app = undefined; await launch();
  if ((await tasks()).length !== 2 || (await context(project.id)).pins.length !== 2 || (await record(firstId)).projectContext.instructionHash !== first.projectContext.instructionHash) throw new Error('Resource history lost at restart');
  await writeFile(`.qa/resources-${live ? 'live' : 'native'}-results.json`, JSON.stringify({
    result: live ? 'REAL_DEEPSEEK_RESOURCES_OK' : 'NATIVE_RESOURCES_OK', modelFixture: !live, intentInjection: !live, nativePickerStub: true,
    platform: process.platform, verifiedAt: new Date().toISOString(), steps: [first.steps, second.steps],
    cases: ['UI instructions/pin without model', 'fixed version survives changed source', 'real readMaterial and per-run instructions', 'source deletion keeps archived views', '@ explicit selection preserves draft without sending', 'restart without replay', 'next run adopts new instructions and selected new version', 'saved artifact and pin one row']
  }, null, 2));
  console.log(live ? 'REAL_DEEPSEEK_RESOURCES_OK' : 'NATIVE_RESOURCES_OK');
} finally { if (app) await app.close(); clearTimeout(deadline); }
