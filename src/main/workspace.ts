import { BrowserWindow, WebContentsView, session, dialog, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, lstat, realpath, open } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { z } from 'zod';
import { constants } from 'node:fs';
import type { WorkspaceSource, WorkspaceState } from '../shared/contracts';
import { TaskStore } from '../core/store';
import { artifactPath, sha256 } from '../core/tools';
import { classifyDocument, documentHTML, validDocumentRequest } from '../shared/documents';

const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('artifact'), taskId: z.string().uuid(), artifactId: z.string().min(1).max(128) }).strict(),
  z.object({ kind: z.literal('proposal'), taskId: z.string().uuid(), approvalId: z.string().min(1).max(128), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
]);
const tabSchema = z.object({
  id: z.string().uuid(), name: z.string().min(1).max(255), kind: z.enum(['html', 'markdown', 'code', 'unsupported']),
  content: z.string().max(1_000_000).optional(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  source: z.enum(['artifact', 'proposal', 'file']), taskId: z.string().uuid().optional(), status: z.string().max(100).optional(),
  path: z.string().max(4096).optional(), origin: sourceSchema.optional(), paused: z.boolean().optional()
}).strict();
type SavedTab = z.infer<typeof tabSchema>;
const stateSchema = z.object({ tabs: z.array(tabSchema).max(10), activeId: z.string().uuid().optional(), width: z.number().int().min(280).max(1000), visible: z.boolean() }).strict();
const sensitive = /(^\.|^(credentials?|secrets?|id_rsa|id_ed25519)(\.|$)|\.(pem|key|p12|pfx|db|sqlite|sqlite3)$)/i;
const systemTypes = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.rtf', '.odt', '.png', '.jpg', '.jpeg', '.gif', '.webp']);

export class Workspace {
  private state: z.infer<typeof stateSchema> = { tabs: [], width: 440, visible: false };
  private views = new Map<string, WebContentsView>();
  private writes = Promise.resolve();
  private layouts = Promise.resolve();
  private layoutGeneration = 0;
  constructor(private path: string, private store: TaskStore, private artifactRoot: string, private owner: () => BrowserWindow | undefined) {}
  async start() {
    let text: string;
    try { text = await readFile(this.path, 'utf8'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e; }
    this.state = stateSchema.parse(JSON.parse(text));
    if (this.state.activeId && !this.state.tabs.some(t => t.id === this.state.activeId)) throw new Error('Invalid workspace active tab');
    for (const tab of this.state.tabs) if (tab.content !== undefined && sha256(tab.content) !== tab.sha256) throw new Error('Workspace integrity failure');
    // Native HTML pages are created only when the renderer explicitly lays out a visible tab.
  }
  view(): WorkspaceState {
    return { ...this.state, tabs: this.state.tabs.map(({ path: _path, origin: _origin, ...tab }) => tab) };
  }
  private persist() {
    const body = JSON.stringify(this.state);
    const op = this.writes.then(async () => { await writeFile(this.path + '.tmp', body, { mode: 0o600 }); await rename(this.path + '.tmp', this.path); });
    this.writes = op.catch(() => {}); return op;
  }
  private async add(tab: Omit<SavedTab, 'id'>) {
    const existing = this.state.tabs.find(t => t.sha256 === tab.sha256 && t.name === tab.name && t.source === tab.source &&
      (tab.path ? t.path === tab.path : JSON.stringify(t.origin) === JSON.stringify(tab.origin)));
    if (existing) this.state.activeId = existing.id;
    else {
      if (this.state.tabs.length >= 10) throw new Error('请先关闭一个标签，最多同时保留 10 个。');
      const next = { ...tab, id: randomUUID() }; this.state.tabs.push(next); this.state.activeId = next.id;
    }
    this.state.visible = true; this.hide(); await this.persist(); return this.view();
  }
  private async fromSource(input: WorkspaceSource): Promise<Omit<SavedTab, 'id'>> {
    const source = sourceSchema.parse(input), task = this.store.get(source.taskId);
    if (source.kind === 'proposal') {
      const a = task.approval;
      if (!a || a.id !== source.approvalId || a.digest !== source.digest || !['pending', 'approved', 'applied', 'denied'].includes(a.state)) throw new Error('请刷新：提案已变更。');
      if (a.kind && !['project_write'].includes(a.kind)) throw new Error('Unsupported proposal');
      return { name: a.name, content: a.content, sha256: sha256(a.content), kind: classifyDocument(a.name), source: 'proposal', taskId: task.id, status: `提案快照 · ${a.state === 'pending' ? '未保存，不代表批准' : a.state === 'denied' ? '已拒绝' : '已批准；此标签保留审阅原文'}`, origin: source };
    }
    const a = task.artifacts.find(a => a.id === source.artifactId); if (!a) throw new Error('Task not found');
    const path = await artifactPath(this.artifactRoot, task.id, a.id, a.name);
    const loaded = await this.fromFile(path);
    if (loaded.sha256 !== a.sha256 || sha256(a.content) !== a.sha256) throw new Error('Artifact integrity failure');
    return { name: a.name, content: a.content, sha256: a.sha256, kind: classifyDocument(a.name), source: 'artifact', taskId: task.id, origin: source, path };
  }
  async openSource(source: WorkspaceSource) { return this.add(await this.fromSource(source)); }
  private async fromFile(path: string): Promise<Omit<SavedTab, 'id'>> {
    const name = basename(path), kind = classifyDocument(name);
    if (sensitive.test(name) || await realpath(path) !== resolve(path) || (await lstat(path)).isSymbolicLink()) throw new Error('请勿导入敏感文件或符号链接。');
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    let bytes: Buffer;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > (kind === 'unsupported' ? 20_000_000 : 1_000_000)) throw new Error('请使用较小文件：文本最多 1 MB，其他文件最多 20 MB。');
      const actual = await lstat(path);
      if (actual.isSymbolicLink() || actual.ino !== stat.ino || actual.dev !== stat.dev) throw new Error('请重新选择：文件身份变化。');
      bytes = Buffer.alloc(stat.size + 1); let offset = 0;
      while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset); if (!bytesRead) break; offset += bytesRead; }
      bytes = bytes.subarray(0, offset);
      const after = await handle.stat();
      if (bytes.length !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error('请重新选择：文件正在变化。');
    } finally { await handle.close(); }
    if (kind === 'unsupported') {
      if (!systemTypes.has(extname(name).toLowerCase())) throw new Error('请使用支持的文本或文档类型；可执行文件不能在工作区打开。');
      return { name, kind, source: 'file', path, sha256: sha256(bytes.toString('base64')) };
    }
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { throw new Error('请使用 UTF-8 文本文件。'); }
    if (content.includes('\0')) throw new Error('请使用文本文件，而不是二进制内容。');
    return { name, kind, content, sha256: sha256(content), source: 'file', path };
  }
  async importFile() {
    const answer = await dialog.showOpenDialog(this.owner()!, { title: '在本地工作区查看文件；不会自动交给模型', properties: ['openFile'] });
    if (answer.canceled || !answer.filePaths[0]) return this.view();
    if ((await lstat(answer.filePaths[0])).isSymbolicLink()) throw new Error('请勿导入符号链接。');
    return this.add(await this.fromFile(await realpath(answer.filePaths[0])));
  }
  async update(value: unknown) {
    const input = z.object({ activeId: z.string().uuid().optional(), closeId: z.string().uuid().optional(), pauseId: z.string().uuid().optional(), moveId: z.string().uuid().optional(),
      direction: z.union([z.literal(-1), z.literal(1)]).optional(), width: z.number().int().min(280).max(1000).optional(), visible: z.boolean().optional() }).strict().parse(value);
    if (input.activeId) { if (!this.state.tabs.some(t => t.id === input.activeId)) throw new Error('Task not found'); this.state.activeId = input.activeId; }
    if (input.pauseId) { const tab = this.state.tabs.find(t => t.id === input.pauseId); if (tab?.kind !== 'html') throw new Error('Task not found'); this.destroy(tab.id); tab.paused = true; }
    if (input.closeId) {
      const index = this.state.tabs.findIndex(t => t.id === input.closeId); if (index < 0) throw new Error('Task not found');
      this.destroy(input.closeId); this.state.tabs.splice(index, 1);
      if (this.state.activeId === input.closeId) this.state.activeId = this.state.tabs[Math.min(index, this.state.tabs.length - 1)]?.id;
      if (!this.state.tabs.length) this.state.visible = false;
    }
    if (input.moveId) {
      const index = this.state.tabs.findIndex(t => t.id === input.moveId), to = index + (input.direction ?? 0);
      if (index < 0) throw new Error('Task not found');
      if (to >= 0 && to < this.state.tabs.length) [this.state.tabs[index], this.state.tabs[to]] = [this.state.tabs[to], this.state.tabs[index]];
    }
    if (input.width) this.state.width = input.width;
    if (input.visible !== undefined) this.state.visible = input.visible;
    this.hide(); await this.persist(); return this.view();
  }
  async refresh(id: string) {
    const old = this.state.tabs.find(t => t.id === id); if (!old) throw new Error('Task not found');
    const next = old.origin ? await this.fromSource(old.origin) : await this.fromFile(old.path!);
    this.destroy(id); Object.assign(old, next, { paused: false }); this.hide(); await this.persist(); return this.view();
  }
  async systemOpen(id: string) {
    const tab = this.state.tabs.find(t => t.id === id); if (!tab?.path || tab.source === 'proposal') throw new Error('请先保存产物。');
    const current = tab.origin ? await this.fromSource(tab.origin) : await this.fromFile(tab.path);
    if (current.sha256 !== tab.sha256) throw new Error('请先刷新：文件已变化，不能用旧版本代表系统打开内容。');
    this.hide();
    if (tab.kind === 'html') {
      const a = await dialog.showMessageBox(this.owner()!, { type: 'warning', buttons: ['取消', '系统打开'], defaultId: 0, cancelId: 0,
        message: '系统浏览器不受 Agent47 离线隔离策略保护，HTML 可能加载外网内容。继续？' });
      if (a.response !== 1) return;
    }
    if (await shell.openPath(tab.path)) throw new Error('请检查系统默认查看器。');
  }
  hide() { this.layoutGeneration++; for (const view of this.views.values()) view.setVisible(false); }
  private destroy(id: string) {
    const view = this.views.get(id); if (!view) return;
    this.owner()?.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) {
      const isolated = view.webContents.session; isolated.protocol.unhandle('agent47-document');
      view.webContents.close({ waitForBeforeUnload: false }); void isolated.closeAllConnections(); void isolated.clearStorageData(); void isolated.clearCache();
    }
    this.views.delete(id);
  }
  dispose() { for (const id of [...this.views.keys()]) this.destroy(id); }
  async layout(value: unknown) {
    const input = z.object({ tabId: z.string().uuid().optional(), bounds: z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(),
      width: z.number().int().nonnegative(), height: z.number().int().nonnegative() }).strict().optional() }).strict().parse(value);
    this.hide(); const generation = this.layoutGeneration;
    const op = this.layouts.then(() => this.layoutInner(input, generation));
    this.layouts = op.catch(() => {}); return op;
  }
  private async layoutInner(input: { tabId?: string; bounds?: { x: number; y: number; width: number; height: number } }, generation: number) {
    if (generation !== this.layoutGeneration) return;
    const owner = this.owner(), tab = this.state.tabs.find(t => t.id === input.tabId), b = input.bounds;
    if (!owner || !b || !tab || tab.paused || !this.state.visible || this.state.activeId !== tab.id || tab.kind !== 'html' || !b.width || !b.height) return;
    const [w, h] = owner.getContentSize();
    if (b.x + b.width > w || b.y + b.height > h) throw new Error('Invalid workspace bounds');
    let view = this.views.get(tab.id);
    if (!view) {
      const isolated = session.fromPartition(`agent47-document-${tab.id}-${randomUUID()}`);
      await isolated.setProxy({ mode: 'fixed_servers', proxyRules: '127.0.0.1:9', proxyBypassRules: '<-loopback>' });
      if (generation !== this.layoutGeneration || owner.isDestroyed() || tab.paused) return;
      const url = `agent47-document://${tab.id}/index.html`;
      isolated.setPermissionRequestHandler((_wc, _p, cb) => cb(false)); isolated.setPermissionCheckHandler(() => false);
      isolated.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !validDocumentRequest(url, details.url) }));
      isolated.on('will-download', event => event.preventDefault());
      isolated.protocol.handle('agent47-document', request => request.url === url ? new Response(documentHTML(tab.content!), { headers: {
        'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; media-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
      } }) : new Response('Forbidden', { status: 403 }));
      view = new WebContentsView({ webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
      const wc = view.webContents;
      wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.on('will-navigate', e => e.preventDefault()); wc.on('will-frame-navigate', e => e.preventDefault());
      wc.on('will-attach-webview', e => e.preventDefault());
      owner.contentView.addChildView(view); view.setVisible(false); this.views.set(tab.id, view);
      try { await wc.loadURL(url); } catch (e) { this.destroy(tab.id); throw e; }
      // Activation may have changed while the page loaded.
      if (generation !== this.layoutGeneration || !this.state.visible || this.state.activeId !== tab.id || tab.paused || wc.isDestroyed()) return;
    }
    view.setBounds(b); view.setVisible(true);
  }
}
