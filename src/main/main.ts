import { app, BrowserWindow, ipcMain, dialog, shell, session, protocol, net } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TaskStore } from '../core/store';
import { TaskRuntime } from '../core/runtime';
import { sdkDriver } from '../core/model';
import { artifactPath, sha256 } from '../core/tools';
import { readFile, lstat, writeFile } from 'node:fs/promises';
import { CredentialStore } from './vault';
import type { ModelDriver } from '../core/model';
import { modelTransport } from './transport';
import { SkillRegistry } from './skills';
import { executeHost } from './host';
import { FileSnapshots } from '../core/snapshots';

protocol.registerSchemesAsPrivileged([{ scheme: 'agent47', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
let window: BrowserWindow | undefined;
let runtime: TaskRuntime;
const grants = new Map<string, { path: string; fileMode: 'snapshot' | 'ask' }>();
const idSchema = z.string().uuid();
const url = 'agent47://app/';

function checkSender(event: Electron.IpcMainInvokeEvent): void {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame?.url !== url) throw new Error('Untrusted IPC sender');
}
function handle(channel: string, operation: (value: unknown) => unknown): void {
  ipcMain.handle(channel, async (event, value: unknown) => {
    checkSender(event);
    try { return await operation(value); }
    catch (error) {
      // Never send upstream model errors or secret values across IPC.
      console.warn(`[${channel}] failed`);
      const message = (error as Error).message;
      const known = /^(Approval|Task not|Finished tasks|Snapshot conflict|请|系统|切换|No folder|Folder permission)/.test(message);
      throw new Error(known ? message : '操作未完成。请检查输入、权限与连接设置。');
    }
  });
}
const fixture: ModelDriver = async (_messages, _taskId, _signal, _skill) => ({
  text: 'Electron runtime smoke test passed.', calls: [], messages: [{ role: 'assistant', content: 'Electron runtime smoke test passed.' }]
});

async function boot(): Promise<void> {
  await app.whenReady();
  const root = app.getPath('userData');
  const artifacts = join(root, 'artifacts');
  const vault = new CredentialStore(join(root, 'provider.json'));
  const transport = modelTransport();
  // Explicit authenticated proxy mode is a separate credential source, not a fake model.
  // Confine its key-free configuration to the approved OpenCode DeepSeek route.
  const providerView = () => {
    const view = vault.view();
    const proxyConfigured = Boolean(transport.fetch && view.baseURL === 'https://opencode.ai/zen/go/v1' && view.model.startsWith('deepseek-'));
    return { ...view, configured: view.configured || proxyConfigured };
  };
  const driver = sdkDriver(() => vault.settings(), transport.fetch,
    failure => console.warn('[model-diagnostic] ' + JSON.stringify(failure)));
  const store = new TaskStore(join(root, 'tasks.db'));
  const skills = new SkillRegistry(join(root, 'skills')); await skills.start();
  let hostExecution = JSON.parse(await readFile(join(root, 'execution.json'), 'utf8').catch(() => 'false')) === true;
  let fileMode = z.enum(['snapshot', 'ask']).parse(JSON.parse(await readFile(join(root, 'file-mode.json'), 'utf8').catch(() => '"snapshot"')));
  const snapshots = new FileSnapshots(join(root, 'snapshots'));
  let retentionDays = z.union([z.literal(0), z.literal(7), z.literal(30), z.literal(90)])
    .parse(JSON.parse(await readFile(join(root, 'snapshot-retention.json'), 'utf8').catch(() => '0')));
  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    if (!changeTimer) {
      window?.webContents.send('tasks:changed');
      changeTimer = setTimeout(() => { changeTimer = undefined; window?.webContents.send('tasks:changed'); }, 60);
    }
  };
  runtime = new TaskRuntime(store, process.env.AGENT47_SMOKE === '1' ? fixture : driver, artifacts, changed, { skills, executeHost, hostEnabled: () => hostExecution, fileMode: () => fileMode, snapshots });
  protocol.handle('agent47', request => {
    const parsed = new URL(request.url);
    if (parsed.hostname !== 'app') return new Response('Forbidden', { status: 403 });
    const pathname = decodeURIComponent(parsed.pathname);
    if (pathname.includes('..') || pathname.includes('\\') || pathname.includes('\0')) return new Response('Forbidden', { status: 403 });
    const file = join(__dirname, '..', 'renderer', pathname === '/' ? 'index.html' : pathname);
    return net.fetch(pathToFileURL(file).toString());
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  handle('tasks:list', () => runtime.list());
  handle('tasks:create', value => {
    const input = z.object({ goal: z.string().trim().min(1).max(12000), skill: z.enum(['general', 'review', 'deliver']), folderGrant: z.string().uuid().optional() }).strict().parse(value);
    const folder = input.folderGrant ? grants.get(input.folderGrant) : undefined;
    if (input.folderGrant && !folder) throw new Error('Folder permission expired. Select the folder again.');
    if (!providerView().configured && process.env.AGENT47_SMOKE !== '1') throw new Error('请先在连接设置中配置模型。');
    return runtime.create(input.goal, input.skill, folder?.path, folder?.fileMode);
  });
  handle('tasks:cancel', value => runtime.cancel(idSchema.parse(value)));
  handle('tasks:send', value => {
    const input = z.object({ taskId: idSchema, text: z.string().trim().min(1).max(12000), mode: z.enum(['steer', 'followup']), clientMessageId: idSchema }).strict().parse(value);
    return runtime.send(input.taskId, input.text, input.mode, input.clientMessageId);
  });
  handle('tasks:resolve', value => runtime.resolveUnknown(idSchema.parse(value)));
  handle('skills:list', () => skills.list());
  handle('skills:preview', async () => {
    const answer = await dialog.showOpenDialog(window!, { title: '选择含 SKILL.md 的 UTF-8 文本 skill 包；不会自动执行脚本', properties: ['openDirectory'] });
    if (answer.canceled || !answer.filePaths[0]) return;
    return skills.preview(await realpath(answer.filePaths[0]));
  });
  handle('skills:install', value => skills.install(idSchema.parse(value)));
  handle('skills:set', value => {
    const input = z.object({ id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64), enabled: z.boolean() }).strict().parse(value);
    return skills.set(input.id, input.enabled);
  });
  handle('tasks:permissions', value => {
    const input = z.object({ taskId: idSchema, fileMode: z.enum(['snapshot', 'ask']), hostMode: z.enum(['ask', 'allow']) }).strict().parse(value);
    runtime.setPermissions(input.taskId, input.fileMode, input.hostMode);
  });
  handle('tasks:restore', value => {
    const input = z.object({ taskId: idSchema, snapshotId: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(value);
    return runtime.restoreFile(input.taskId, input.snapshotId);
  });
  handle('tasks:undo', value => runtime.undoRun(idSchema.parse(value)));
  handle('snapshots:view', async () => ({ retentionDays, storagePath: join(root, 'snapshots'), ...await runtime.snapshotStats() }));
  handle('snapshots:retention', async value => {
    const days = z.union([z.literal(0), z.literal(7), z.literal(30), z.literal(90)]).parse(value);
    await writeFile(join(root, 'snapshot-retention.json'), JSON.stringify(days), { mode: 0o600 }); retentionDays = days;
  });
  handle('snapshots:clean', () => runtime.cleanSnapshots(retentionDays));
  handle('execution:view', () => ({ hostExecution, fileMode }));
  let executionWrite = Promise.resolve();
  handle('execution:set', value => {
    const input = z.object({ hostExecution: z.boolean().optional(), fileMode: z.enum(['snapshot', 'ask']).optional() }).strict()
      .refine(settings => settings.hostExecution !== undefined || settings.fileMode !== undefined).parse(value);
    const operation = executionWrite.then(async () => {
      if (input.hostExecution !== undefined) {
        await writeFile(join(root, 'execution.json'), JSON.stringify(input.hostExecution), { mode: 0o600 });
        hostExecution = input.hostExecution;
        if (!hostExecution) {
          for (const task of store.list()) {
            if (task.hostMode === 'allow') { task.hostMode = 'ask'; store.save(task); }
          }
        }
      }
      if (input.fileMode) { await writeFile(join(root, 'file-mode.json'), JSON.stringify(input.fileMode), { mode: 0o600 }); fileMode = input.fileMode; }
      changed();
    });
    executionWrite = operation.catch(() => {}); return operation;
  });
  handle('tasks:decide', value => {
    const input = z.object({ taskId: idSchema, approvalId: z.string().min(1).max(128), digest: z.string().regex(/^[a-f0-9]{64}$/), approve: z.boolean() }).strict().parse(value);
    runtime.decide(input.taskId, input.approvalId, input.digest, input.approve);
  });
  handle('folder:choose', async () => {
    const answer = await dialog.showOpenDialog(window!, {
      title: fileMode === 'snapshot' ? '授权此项目的读取与文件修改（自动快照，可恢复）；Shell 另行授权' : '授权读取此项目；文件修改逐次确认',
      buttonLabel: fileMode === 'snapshot' ? '授权项目读写' : '授权项目读取', properties: ['openDirectory']
    });
    if (answer.canceled || !answer.filePaths[0]) return;
    const path = await realpath(answer.filePaths[0]);
    const id = randomUUID(); grants.set(id, { path, fileMode });
    return { id, path, fileMode };
  });
  handle('provider:view', providerView);
  handle('provider:save', value => {
    if (runtime.list().some(t => !['completed', 'failed', 'cancelled'].includes(t.status))) throw new Error('请先停止或完成未结束的任务，再更改模型连接。');
    vault.save(value as Parameters<CredentialStore['save']>[0]);
  });
  handle('provider:test', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const result = await driver([{ role: 'user', content: 'For a TypeScript coding-agent connectivity test, reply only AGENT47_API_OK. Do not call tools.' }], randomUUID(), controller.signal, 'general');
      return result.text.slice(0, 240);
    } finally { clearTimeout(timer); }
  });
  handle('artifact:open', async value => {
    const input = z.object({ taskId: idSchema, artifactId: z.string().max(128) }).strict().parse(value);
    const task = store.get(input.taskId);
    const artifact = task.artifacts.find(a => a.id === input.artifactId);
    if (!artifact) throw new Error('Task not found');
    const path = await artifactPath(artifacts, task.id, artifact.id, artifact.name);
    if ((await lstat(path)).isSymbolicLink()) throw new Error('Artifact symlink denied');
    if (sha256(await readFile(path, 'utf8')) !== artifact.sha256) throw new Error('Artifact integrity failure');
    const error = await shell.openPath(path); if (error) throw new Error('Could not open artifact');
  });
  window = new BrowserWindow({
    width: 1440, height: 940, minWidth: 900, minHeight: 650, show: false,
    backgroundColor: '#f5f6f4', title: 'Agent47', autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  window.webContents.on('will-navigate', (event, target) => { if (target !== url) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('closed', () => { window = undefined; });
  app.on('second-instance', () => { window?.show(); window?.focus(); });
  await window.loadURL(url); window.show(); runtime.start();
  // Never invent an expiry default: cleanup runs only under an explicitly saved policy.
  void runtime.cleanSnapshots(retentionDays).catch(() => console.warn('[snapshot-cleanup] failed'));
  const cleanupTimer = setInterval(() => { void runtime.cleanSnapshots(retentionDays).catch(() => console.warn('[snapshot-cleanup] failed')); }, 86400_000);
  cleanupTimer.unref();
  app.on('will-quit', () => { void transport.close(); });
}
if (single) void boot().catch(() => {
  dialog.showErrorBox('Agent47 启动失败', '本地存储或应用初始化失败。原有数据未被重置。请备份用户数据目录后排查。');
  app.exit(1);
});
app.on('before-quit', () => runtime?.shutdown());
app.on('window-all-closed', () => app.quit());
