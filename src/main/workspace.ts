import { BrowserWindow, WebContentsView, session, dialog, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, lstat, realpath, open } from 'node:fs/promises';
import { basename, extname, resolve, relative, isAbsolute } from 'node:path';
import { z } from 'zod';
import { constants } from 'node:fs';
import type { WorkspaceSource, WorkspaceState, PageCapture } from '../shared/contracts';
import { TaskStore } from '../core/store';
import { artifactPath, sha256, safeProjectPath } from '../core/tools';
import { classifyDocument, documentHTML, validDocumentRequest } from '../shared/documents';
import { webOrigin } from './web';
import { publicProxy } from './public-proxy';
import { capturePageScript, pageMessage } from '../shared/web-capture';
import { browserSnapshotScript, browserActionScript, browserTabInput, browserOpenInput, browserNavigationInput, browserElementInput, browserFillInput, browserScrollInput, browserReadInput, browserWaitInput, browserTextScript, browserElementProbeScript } from '../shared/browser-tools';
import { effectDigest } from '../core/effects';
import type { Approval } from '../shared/contracts';
import { validateMaterialSnapshot, type MaterialSnapshot } from '../core/materials';
import { evidenceView, validateEvidence, type EvidenceSnapshot } from '../core/evidence';
import type { ToolCall } from '../core/store';
import { artifactEvidence } from '../core/artifact-evidence';

const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('artifact'), taskId: z.string().uuid(), artifactId: z.string().min(1).max(128) }).strict(),
  z.object({ kind: z.literal('proposal'), taskId: z.string().uuid(), approvalId: z.string().min(1).max(128), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
]);
const tabSchema = z.object({
  id: z.string().uuid(), name: z.string().min(1).max(255), kind: z.enum(['html', 'markdown', 'code', 'unsupported', 'web', 'diff']),
  content: z.string().max(1_000_000).optional(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  before: z.string().max(1_000_000).optional(), beforeHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  source: z.enum(['artifact', 'proposal', 'file', 'web', 'diff', 'evidence']), taskId: z.string().uuid().optional(), status: z.string().max(100).optional(),
  evidence: z.object({
    id: z.string().regex(/^s[a-f0-9]{16}$/), kind: z.enum(['material', 'project', 'web']), name: z.string().max(200), url: z.string().url().max(2048).optional(),
    observedAt: z.string(), versionHash: z.string().regex(/^[a-f0-9]{64}$/), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    offset: z.number().int().nonnegative(), end: z.number().int().nonnegative(), coverage: z.string().max(800), originRunId: z.string().uuid(), tool: z.string().max(64), uri: z.string()
  }).strict().optional(),
  path: z.string().max(4096).optional(), origin: sourceSchema.optional(), paused: z.boolean().optional(), url: z.string().url().max(2048).optional(), revision: z.number().int().nonnegative().optional()
}).strict().superRefine((tab, ctx) => {
  if ((tab.kind === 'diff' || tab.source === 'diff') && (tab.kind !== 'diff' || tab.source !== 'diff' || tab.before === undefined || tab.content === undefined || !tab.beforeHash || tab.path || tab.origin)) ctx.addIssue({ code: 'custom', message: 'Invalid recorded diff tab' });
  if (tab.source === 'evidence' && (tab.kind !== 'code' || !tab.evidence || tab.content === undefined || tab.path || tab.origin || tab.url)) ctx.addIssue({ code: 'custom', message: 'Invalid evidence tab' });
  if (tab.evidence && tab.source !== 'evidence') ctx.addIssue({ code: 'custom', message: 'Invalid evidence source' });
});
type SavedTab = z.infer<typeof tabSchema>;
const stateSchema = z.object({ tabs: z.array(tabSchema).max(10), activeId: z.string().uuid().optional(), width: z.number().int().min(280).max(1000), visible: z.boolean() }).strict();
const sensitive = /(^\.|^(credentials?|secrets?|id_rsa|id_ed25519)(\.|$)|\.(pem|key|p12|pfx|db|sqlite|sqlite3)$)/i;
const systemTypes = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.rtf', '.odt', '.png', '.jpg', '.jpeg', '.gif', '.webp']);
class BrowserScriptTimeout extends Error {
  constructor() { super('请检查页面：网页工具超时。'); }
}

export class Workspace {
  private state: z.infer<typeof stateSchema> = { tabs: [], width: 440, visible: false };
  private views = new Map<string, WebContentsView>();
  private writes = Promise.resolve();
  private layouts = Promise.resolve();
  private layoutGeneration = 0;
  private proxies = new Map<string, Awaited<ReturnType<typeof publicProxy>>>();
  private captures = new Map<string, PageCapture>();
  private browserGrants = new Map<string, { tabId: string; conversationId: string; origin: string; mode: 'read' | 'ask' | 'allow'; generation: string }>();
  private browserSnapshots = new Map<string, { id: string; conversationId: string; url: string; wcId: number; at: number; elements: Record<string, unknown>[]; regions: Record<string, unknown>[] }>();
  constructor(private path: string, private store: TaskStore, private artifactRoot: string, private owner: () => BrowserWindow | undefined, private changed = () => {}) {}
  async start() {
    let text: string;
    try { text = await readFile(this.path, 'utf8'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e; }
    this.state = stateSchema.parse(JSON.parse(text));
    if (this.state.activeId && !this.state.tabs.some(t => t.id === this.state.activeId)) throw new Error('Invalid workspace active tab');
    for (const tab of this.state.tabs) if (tab.content !== undefined && sha256(tab.content) !== tab.sha256) throw new Error('Workspace integrity failure');
    for (const tab of this.state.tabs) if (tab.before !== undefined && sha256(tab.before) !== tab.beforeHash) throw new Error('Workspace diff integrity failure');
    for (const tab of this.state.tabs) if (tab.evidence) validateEvidence({ ...tab.evidence, content: tab.content! });
    for (const tab of this.state.tabs) if (tab.kind === 'web') { webOrigin(tab.url!); tab.paused = true; tab.status = '重启后暂停，刷新才重新联网'; }
    // Native HTML pages are created only when the renderer explicitly lays out a visible tab.
  }
  view(): WorkspaceState {
    return { ...this.state, tabs: this.state.tabs.map(({ path: _path, origin: _origin, ...tab }) => ({ ...tab,
      ...this.artifactSources(tab.id),
      agentGrants: [...this.browserGrants.values()].filter(g => g.tabId === tab.id && tab.url && new URL(tab.url).origin === g.origin).map(({ conversationId, origin, mode }) => ({ conversationId, origin, mode })) })) };
  }
  private artifactSources(tabId: string): Pick<WorkspaceState['tabs'][number], 'sources' | 'citationStatus'> {
    const tab = this.state.tabs.find(t => t.id === tabId);
    if (tab?.source !== 'artifact' || tab.origin?.kind !== 'artifact') return {};
    try {
      const origin = tab.origin;
      const owner = this.store.get(origin.taskId), artifact = owner.artifacts.find(a => a.id === origin.artifactId);
      if (!artifact || tab.content === undefined || sha256(tab.content) !== tab.sha256) throw new Error('成果不可用');
      return { sources: artifactEvidence(artifact, tab.sha256, owner.evidenceSnapshots).map(evidenceView),
        citationStatus: artifact.evidenceIds === undefined ? 'legacy' : 'bound' };
    } catch { return { sources: [], citationStatus: 'unavailable' }; }
  }
  async openArtifactEvidence(tabId: string, expectedHash: string, sourceId: string) {
    const tab = this.state.tabs.find(t => t.id === tabId);
    if (!tab || tab.source !== 'artifact' || tab.origin?.kind !== 'artifact' || tab.sha256 !== expectedHash ||
      !this.artifactSources(tabId).sources?.some(s => s.id === sourceId)) throw new Error('来源未绑定此成果版本，请回到来源轮次查看。');
    const source = this.store.get(tab.origin.taskId).evidenceSnapshots?.[sourceId];
    if (!source) throw new Error('历史证据不可用。');
    return this.openEvidence(source);
  }
  private conversation(taskId: string) { const task = this.store.get(taskId); return task.conversationId ?? task.id; }
  agentGrant(taskId: string, tabId: string, mode: 'deny' | 'read' | 'ask' | 'allow', expectedURL: string) {
    const conversationId = this.conversation(taskId), tab = this.state.tabs.find(t => t.id === tabId);
    if (!tab || tab.kind !== 'web' || tab.paused) throw new Error('请先打开网页。');
    const wc = this.views.get(tabId)?.webContents;
    if (mode !== 'deny' && (tab.url !== expectedURL || !wc || wc.isDestroyed() || wc.isLoading() || wc.getURL() !== expectedURL)) throw new Error('请重新审阅：网页地址已变化或未加载。');
    const key = `${conversationId}:${tabId}`;
    this.browserSnapshots.delete(tabId);
    if (mode === 'deny') this.browserGrants.delete(key);
    else this.browserGrants.set(key, { tabId, conversationId, origin: webOrigin(tab.url!), mode, generation: randomUUID() });
    this.changed(); return this.view();
  }
  browserTabs(taskId: string) {
    const conversationId = this.conversation(taskId);
    return this.view().tabs.filter(t => t.kind === 'web' && !t.paused && t.agentGrants?.some(g => g.conversationId === conversationId))
      .map(t => ({ tabId: t.id, url: t.url, active: t.id === this.state.activeId, mode: t.agentGrants!.find(g => g.conversationId === conversationId)!.mode }));
  }
  private browserTarget(taskId: string, tabId: string, interact = false) {
    const grant = this.browserGrants.get(`${this.conversation(taskId)}:${tabId}`), tab = this.state.tabs.find(t => t.id === tabId);
    if (!grant || !tab || tab.kind !== 'web' || tab.paused || webOrigin(tab.url!) !== grant.origin || interact && grant.mode === 'read') throw new Error('请在工作区为本次对话授权目标网页。');
    return { grant, tab };
  }
  private browserWC(taskId: string, tabId: string, interact = false, allowLoading = false) {
    const target = this.browserTarget(taskId, tabId, interact), wc = this.views.get(tabId)?.webContents;
    if (!wc || wc.isDestroyed() || (!allowLoading && wc.isLoading()) || wc.getURL().length > 2048 || webOrigin(wc.getURL()) !== target.grant.origin ||
      this.state.activeId !== tabId || !this.state.visible) throw new Error('请激活目标网页并等待加载完成。');
    return { ...target, wc };
  }
  private async browserScript(wc: Electron.WebContents, code: string, signal?: AbortSignal, timeoutMs = 8000) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    if (signal?.aborted) throw new Error('Cancelled');
    try { return await Promise.race([wc.executeJavaScriptInIsolatedWorld(1002, [{ code }]), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new BrowserScriptTimeout()), timeoutMs);
      if (signal) { onAbort = () => reject(new Error('Cancelled')); signal.addEventListener('abort', onAbort, { once: true }); }
    })]); }
    finally { clearTimeout(timer); if (signal && onAbort) signal.removeEventListener('abort', onAbort); }
  }
  private async browserWait(taskId: string, input: unknown, signal: AbortSignal) {
    const data = browserWaitInput.parse(input), first = this.browserWC(taskId, data.tabId, false, true);
    if (data.condition.kind === 'url' && webOrigin(data.condition.url) !== first.grant.origin) throw new Error('跨站等待不继承授权。');
    const started = performance.now(), deadline = started + data.timeoutMs;
    const check = () => {
      if (signal.aborted) throw new Error('Cancelled');
      const now = this.browserWC(taskId, data.tabId, false, true);
      if (now.wc !== first.wc || now.grant.generation !== first.grant.generation) throw new Error('网页或授权已变化。');
      return now;
    };
    while (true) {
      const { wc } = check(); let matched = false, timedOut = false;
      if (!wc.isLoading()) {
        if (data.condition.kind === 'loaded') matched = true;
        else if (data.condition.kind === 'url') matched = wc.getURL() === data.condition.url;
        else {
          const beforeURL = wc.getURL(), beforeEpoch = this.pageEpoch.get(data.tabId) ?? 0;
          try {
            const value = await this.browserScript(wc, data.condition.kind === 'element' ? browserElementProbeScript(data.condition.name) : browserTextScript(), signal, Math.max(1, deadline - performance.now()));
            check();
            if (beforeURL === wc.getURL() && beforeEpoch === (this.pageEpoch.get(data.tabId) ?? 0) && !wc.isLoading())
              matched = data.condition.kind === 'element' ? value === true : z.object({ content: z.string().max(64000) }).parse(value).content.includes(data.condition.text);
          } catch (error) { check(); if (error instanceof BrowserScriptTimeout) timedOut = true; else throw error; }
        }
      }
      check();
      if (matched || timedOut || performance.now() >= deadline) return {
        tabId: data.tabId, url: wc.getURL(), outcome: matched ? 'matched' : 'timed_out', condition: data.condition,
        elapsedMs: Math.round(performance.now() - started), verifiedOutcome: false, untrusted: true,
        coverage: 'Current main document only; bounded observation, not business success or proof of absence.', next: 'browserRead for fresh evidence and refs; never replay remote actions on timeout.'
      };
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new Error('Cancelled')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, Math.max(1, Math.min(250, deadline - performance.now())));
        signal.addEventListener('abort', abort, { once: true });
      });
    }
  }
  private pageEpoch = new Map<string, number>();
  async browserRead(taskId: string, name: string, input: unknown, signal: AbortSignal) {
    if (signal.aborted) throw new Error('Cancelled');
    if (name === 'browserTabs') { z.object({}).strict().parse(input); return this.browserTabs(taskId); }
    if (name === 'browserWait') return this.browserWait(taskId, input, signal);
    const { tabId } = browserTabInput.parse(name === 'browserNavigate' ? { tabId: browserNavigationInput.parse(input).tabId } : name === 'browserScroll' ? { tabId: browserScrollInput.parse(input).tabId } : name === 'browserRead' ? { tabId: browserReadInput.parse(input).tabId } : input);
    const target = this.browserTarget(taskId, tabId);
    if (name === 'browserActivate') { await this.update({ activeId: tabId, visible: true }); this.changed(); return { active: tabId, next: 'Wait for layout/loading, then browserRead.' }; }
    const { wc, grant } = this.browserWC(taskId, tabId);
    if (name === 'browserNavigate') {
      const { url } = browserNavigationInput.parse(input);
      if (webOrigin(url) !== grant.origin) throw new Error('请为跨站目标另行授权，不自动继承权限。');
      this.browserSnapshots.delete(tabId); await wc.loadURL(url); this.changed();
      if (this.browserWC(taskId, tabId).grant.generation !== grant.generation || signal.aborted) throw new Error('请重新授权：网页权限已变化。');
      return { navigated: wc.getURL(), next: 'browserRead' };
    }
    if (name === 'browserScroll') {
      const { deltaY } = browserScrollInput.parse(input); this.browserSnapshots.delete(tabId);
      await this.browserScript(wc, `window.scrollBy(0, ${deltaY}); true`);
      if (this.browserWC(taskId, tabId).grant.generation !== grant.generation || signal.aborted) throw new Error('请重新授权：网页权限已变化。');
      return { scrolled: deltaY, next: 'browserRead' };
    }
    if (name !== 'browserRead') throw new Error('Unknown browser tool');
    const data = browserReadInput.parse(input), url = wc.getURL(), generation = target.grant.generation, epoch = this.pageEpoch.get(tabId) ?? 0;
    let region: Record<string, unknown> | undefined;
    if (data.regionRef) {
      const previous = this.browserSnapshots.get(tabId);
      region = previous?.regions.find(r => r.ref === data.regionRef);
      if (!previous || previous.id !== data.snapshotId || previous.conversationId !== this.conversation(taskId) ||
        previous.wcId !== wc.id || previous.url !== url || Date.now() - previous.at > 120000 || !region) throw new Error('请重新读取：区域引用已过期或页面变化。');
    }
    // A failed/cancelled read may still update the isolated-world registry.
    // Fence old refs before any async page program, not only on successful return.
    this.browserSnapshots.delete(tabId);
    const body = z.object({ title: z.string().max(200), content: z.string().max(64000), truncated: z.boolean() }).parse(await this.browserScript(wc, browserTextScript(region ? Number(data.regionRef!.slice(1)) : undefined, region), signal));
    const contentDigest = sha256(JSON.stringify([url, region ?? 'document', body.content, body.truncated]));
    if (data.expectedDigest && data.expectedDigest !== contentDigest) throw new Error('请从 offset 0 重新读取：正文版本已变化，不能拼接旧分页。');
    const controls = z.object({ title: z.string().max(200), elements: z.array(z.record(z.string(), z.unknown())).max(60), regions: z.array(z.record(z.string(), z.unknown())).max(40).default([]) }).parse(await this.browserScript(wc, browserSnapshotScript, signal));
    let elementsTruncated = controls.elements.length === 60;
    while (JSON.stringify(controls.elements).length > 12000) { controls.elements.pop(); elementsTruncated = true; }
    const current = this.browserWC(taskId, tabId);
    if (signal.aborted || current.grant.generation !== generation || current.wc !== wc || wc.getURL() !== url || epoch !== (this.pageEpoch.get(tabId) ?? 0)) throw new Error('请重新读取：网页或授权已变化。');
    if (data.offset > body.content.length) throw new Error('Offset exceeds captured text; not proof of complete page.');
    const snapshot = { id: randomUUID(), conversationId: this.conversation(taskId), url, wcId: wc.id, at: Date.now(), elements: controls.elements, regions: controls.regions };
    this.browserSnapshots.set(tabId, snapshot);
    const end = Math.min(body.content.length, data.offset + data.limit), hasMore = end < body.content.length;
    return { tabId, snapshotId: snapshot.id, url, title: body.title, content: body.content.slice(data.offset, end), contentDigest, offset: data.offset,
      nextOffset: hasMore ? end : null, hasMore, capturedCharacters: body.content.length, captureTruncated: body.truncated, scope: region ?? 'document',
      observedAt: new Date(snapshot.at).toISOString(), truncated: body.truncated || hasMore, elements: controls.elements, regions: controls.regions, elementsTruncated,
      coverage: 'Partial currently-rendered main-document text; excludes hidden, lazy, frame and shadow content. Not proof of complete page.', untrusted: true, valuesIncluded: false };
  }
  private browserBinding(taskId: string, input: unknown) {
    const raw = z.record(z.string(), z.unknown()).parse(input);
    const data = browserElementInput.parse({ tabId: raw.tabId, snapshotId: raw.snapshotId, ref: raw.ref });
    const target = this.browserWC(taskId, data.tabId, true), snapshot = this.browserSnapshots.get(data.tabId);
    const element = snapshot?.elements.find(e => e.ref === data.ref);
    if (!snapshot || snapshot.conversationId !== this.conversation(taskId) || snapshot.id !== data.snapshotId || snapshot.wcId !== target.wc.id || snapshot.url !== target.wc.getURL() || Date.now() - snapshot.at > 120000 || !element) throw new Error('请重新读取页面：元素引用已过期或页面变化。');
    return { ...target, snapshot, element, data };
  }
  async browserPrepare(taskId: string, call: ToolCall): Promise<Approval> {
    if (call.toolName === 'browserOpen') {
      const { url } = browserOpenInput.parse(call.input); webOrigin(url); this.store.get(taskId);
      const action: Approval = { id: call.toolCallId, kind: 'browser', name: '打开并授权网页', content: `URL：${url}\n允许当前对话读取此 Tab 页面正文与元素并进行同站导航；点击和输入仍逐次确认。页面内容会交给 DeepSeek，临时会话不继承系统 Cookie。重启／关闭／刷新撤销授权。`,
        payload: { operation: 'browserOpen', url }, digest: '', expiresAt: new Date(Date.now() + 600000).toISOString(), state: 'pending' };
      action.digest = effectDigest(taskId, action); return action;
    }
    const input = call.toolName === 'browserFill' ? browserFillInput.parse(call.input) : browserElementInput.parse(call.input);
    const { grant, snapshot, element } = this.browserBinding(taskId, input);
    if (element.disabled || element.readOnly || call.toolName === 'browserFill' && (!['input', 'textarea'].includes(String(element.tag)) || !['text', 'search', 'email', 'url', 'tel', 'number', ''].includes(String(element.type).toLowerCase()))) throw new Error('请使用可操作的普通输入框或元素。');
    const descriptor = { ...element }; delete descriptor.ref;
    const action: Approval = { id: call.toolCallId, kind: 'browser', name: call.toolName === 'browserClick' ? '点击网页元素' : '输入网页文本',
      content: JSON.stringify({ url: snapshot.url, element, ...('text' in input ? { text: input.text } : {}), warning: '可能产生远端效果；文件快照不能撤销。输入事件也可能发送数据。' }, null, 2),
      payload: { ...input, descriptor, grantGeneration: grant.generation, operation: call.toolName }, digest: '',
      expiresAt: new Date(snapshot.at + 120000).toISOString(), state: 'pending' };
    action.digest = effectDigest(taskId, action); return action;
  }
  browserValidate(taskId: string, action: Approval) {
    if (effectDigest(taskId, action) !== action.digest || Date.parse(action.expiresAt) <= Date.now()) throw new Error('请重新读取：网页操作已过期。');
    if (action.payload?.operation === 'browserOpen') { this.store.get(taskId); webOrigin(browserOpenInput.parse({ url: action.payload.url }).url); return false; }
    const payload = action.payload!, { grant, element } = this.browserBinding(taskId, payload);
    if (grant.generation !== payload.grantGeneration) throw new Error('请重新授权：网页权限已变化。');
    if (payload.operation === 'browserClick' && element.href && webOrigin(new URL(String(element.href), this.browserSnapshots.get(String(payload.tabId))!.url).href) !== grant.origin) throw new Error('请先授权链接的跨站目标。');
    return grant.mode === 'allow';
  }
  async browserExecute(taskId: string, action: Approval, signal: AbortSignal) {
    if (action.state !== 'approved') throw new Error('Approval required');
    this.browserValidate(taskId, action); if (signal.aborted) throw new Error('Cancelled');
    if (action.payload?.operation === 'browserOpen') {
      const url = String(action.payload.url), state = await this.openWeb(url), tabId = state.activeId!;
      this.changed();
      const end = Date.now() + 15000;
      while (Date.now() < end && !signal.aborted) {
        const wc = this.views.get(tabId)?.webContents;
        if (wc && !wc.isDestroyed() && !wc.isLoading() && wc.getURL().startsWith('https:')) {
          if (webOrigin(wc.getURL()) !== webOrigin(url)) throw new Error('请为重定向站点另行授权。');
          this.agentGrant(taskId, tabId, 'ask', wc.getURL());
          return { opened: tabId, url: wc.getURL(), mode: 'ask', next: 'browserRead' };
        }
        await new Promise(r => setTimeout(r, 50));
      }
      throw new Error('请检查网页加载：结果未知，不能自动重放。');
    }
    const payload = action.payload!, { wc, data } = this.browserBinding(taskId, payload);
    const value = await this.browserScript(wc, browserActionScript(payload.operation === 'browserFill' ? 'fill' : 'click', Number(data.ref.slice(1)), payload.descriptor, typeof payload.text === 'string' ? payload.text : undefined));
    this.browserSnapshots.delete(data.tabId); this.changed(); return value;
  }
  private persist() {
    const body = JSON.stringify(this.state), path = this.path;
    const op = this.writes.then(async () => { await writeFile(path + '.tmp', body, { mode: 0o600 }); await rename(path + '.tmp', path); });
    this.writes = op.catch(() => {}); return op;
  }
  async switchFile(path: string) {
    await this.writes; await this.layouts;
    this.dispose(); this.browserGrants.clear(); this.browserSnapshots.clear(); this.captures.clear();
    for (const tab of this.state.tabs) if (tab.kind === 'web') { tab.paused = true; tab.status = '切换项目后暂停；刷新才重新联网'; }
    await this.persist();
    const previous = this.state, previousPath = this.path;
    this.path = path; this.state = { tabs: [], width: 440, visible: false };
    try { await this.start(); } catch (e) { this.path = previousPath; this.state = previous; throw e; }
    this.changed(); return this.view();
  }
  async openProjectPath(root: string, path: string) {
    return this.add(await this.fromFile(await safeProjectPath(root, path)));
  }
  private async add(tab: Omit<SavedTab, 'id'>) {
    const existing = this.state.tabs.find(t => t.sha256 === tab.sha256 && t.beforeHash === tab.beforeHash && t.evidence?.id === tab.evidence?.id && t.name === tab.name && t.source === tab.source && t.taskId === tab.taskId &&
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
  async materialSnapshot(tabId: string): Promise<MaterialSnapshot> {
    const tab = this.state.tabs.find(t => t.id === tabId);
    if (!tab || !['file', 'artifact'].includes(tab.source) || tab.kind === 'unsupported' || tab.content === undefined)
      throw new Error('请使用已保存成果或已选择的 HTML、Markdown、代码文本；网页和提案不作为文件材料。');
    const current = tab.origin ? await this.fromSource(tab.origin) : await this.fromFile(tab.path!);
    if (current.sha256 !== tab.sha256) throw new Error('请先刷新材料：文件已有新版。');
    return { id: randomUUID(), name: tab.name, sha256: tab.sha256, content: tab.content, bytes: Buffer.byteLength(tab.content),
      capturedAt: new Date().toISOString(), source: tab.source as 'file' | 'artifact', path: tab.path,
      sourceTaskId: tab.origin?.taskId, sourceArtifactId: tab.origin?.kind === 'artifact' ? tab.origin.artifactId : undefined };
  }
  async selectionMaterial(taskId: string, tabId: string, expectedHash: string, start: number, end: number) {
    const tab = this.state.tabs.find(t => t.id === tabId);
    if (!tab || !['markdown', 'code'].includes(tab.kind) || tab.sha256 !== expectedHash || this.state.activeId !== tabId) throw new Error('请重新选择当前 Markdown 或代码版本。');
    const material = await this.materialSnapshot(tabId);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > material.content.length || end - start > 12000) throw new Error('请使用最多12000字符的有效选区。');
    let targetPath: string | undefined;
    const task = this.store.get(taskId);
    if (task.root && material.path && material.source === 'file') {
      const candidate = relative(task.root, material.path).replaceAll('\\', '/');
      if (candidate && candidate !== '..' && !candidate.startsWith('../') && !isAbsolute(candidate)) {
        if (await safeProjectPath(task.root, candidate) !== material.path) throw new Error('请重新选择：项目文件身份变化。');
        if (material.bytes <= 65536) targetPath = candidate;
      }
    }
    material.selection = { start, end, ...(targetPath ? { targetPath } : {}) };
    validateMaterialSnapshot(material); return material;
  }
  async openDiff(taskId: string, diff: { path: string; before: string; after: string }) {
    return this.add({ name: `差异 · ${basename(diff.path).slice(0, 240)}`, kind: 'diff', source: 'diff', content: diff.after, before: diff.before,
      sha256: sha256(diff.after), beforeHash: sha256(diff.before), taskId, status: '写入前后已留档版本 · 不是当前磁盘或恢复操作' });
  }
  async openEvidence(source: EvidenceSnapshot) {
    validateEvidence(source);
    return this.add({ name: `证据 · ${source.name.slice(0, 240)}`, kind: 'code', source: 'evidence', content: source.content,
      sha256: source.contentHash, taskId: source.originRunId, evidence: evidenceView(source), status: '实际读取的历史摘录 · 不重新联网或读取磁盘' });
  }
  async chooseMaterial(): Promise<MaterialSnapshot | undefined> {
    const answer = await dialog.showOpenDialog(this.owner()!, { title: '选择单份文本材料；发送时交给 DeepSeek，不授权父目录', properties: ['openFile'] });
    if (answer.canceled || !answer.filePaths[0]) return;
    if ((await lstat(answer.filePaths[0])).isSymbolicLink()) throw new Error('请勿选择符号链接。');
    const loaded = await this.fromFile(await realpath(answer.filePaths[0]));
    if (loaded.content === undefined) throw new Error('请使用 HTML、Markdown 或代码文本；其他文档仅能在系统查看器打开。');
    return { id: randomUUID(), name: loaded.name, content: loaded.content, sha256: loaded.sha256, path: loaded.path,
      bytes: Buffer.byteLength(loaded.content), capturedAt: new Date().toISOString(), source: 'file' };
  }
  async checkMaterial(material: MaterialSnapshot) {
    if (material.frozen) { validateMaterialSnapshot(material); return true; }
    const current = material.source === 'artifact'
      ? await this.fromSource({ kind: 'artifact', taskId: material.sourceTaskId!, artifactId: material.sourceArtifactId! })
      : await this.fromFile(material.path!);
    return current.sha256 === material.sha256;
  }
  async refreshMaterial(material: MaterialSnapshot): Promise<MaterialSnapshot> {
    if (material.source !== 'file') { await this.checkMaterial(material); return material; }
    const next = await this.fromFile(material.path!);
    if (next.content === undefined) throw new Error('请使用支持的文本材料。');
    if (material.selection) throw new Error('请在新版文件中重新选择范围；选区不能自动迁移。');
    return { ...material, id: randomUUID(), content: next.content, sha256: next.sha256, bytes: Buffer.byteLength(next.content), capturedAt: new Date().toISOString() };
  }
  async openMaterial(material: MaterialSnapshot) {
    validateMaterialSnapshot(material);
    return this.add({ name: material.name, content: material.content, sha256: material.sha256, source: material.source, path: material.path,
      ...(material.source === 'artifact' ? { origin: { kind: 'artifact' as const, taskId: material.sourceTaskId!, artifactId: material.sourceArtifactId! }, taskId: material.sourceTaskId } : {}),
      kind: classifyDocument(material.name), status: '已引用版本快照 · 刷新不会自动更新对话引用' });
  }
  async openSource(source: WorkspaceSource) { return this.add(await this.fromSource(source)); }
  async captureResource(source: WorkspaceSource | { root: string; path: string }): Promise<MaterialSnapshot> {
    const loaded = 'kind' in source ? await this.fromSource(source) : await this.fromFile(await safeProjectPath(source.root, source.path));
    if (loaded.content === undefined || loaded.source === 'proposal') throw new Error('请使用已保存的文本资源；提案与不支持的文档不能作为材料。');
    const content = loaded.content;
    const result: MaterialSnapshot = { id: randomUUID(), name: loaded.name, content, sha256: loaded.sha256, bytes: Buffer.byteLength(content), capturedAt: new Date().toISOString(), source: loaded.source as 'file' | 'artifact', path: loaded.path,
      ...('kind' in source && source.kind === 'artifact' ? { sourceTaskId: source.taskId, sourceArtifactId: source.artifactId } : {}) };
    validateMaterialSnapshot(result); return result;
  }
  async openWeb(value: string) {
    const url = z.string().url().max(2048).parse(value); webOrigin(url);
    return this.add({ name: new URL(url).hostname.slice(0, 255), kind: 'web', source: 'web', url, sha256: sha256(url), status: '独立临时网页会话 · 不自动入模' });
  }
  async capture(tabId: string, taskId: string): Promise<PageCapture> {
    this.store.get(taskId);
    const tab = this.state.tabs.find(t => t.id === tabId), wc = this.views.get(tabId)?.webContents;
    if (!tab || tab.kind !== 'web' || tab.paused || this.state.activeId !== tabId || !this.state.visible || !wc || wc.isDestroyed() || wc.isLoading()) throw new Error('请等待当前网页加载完成。');
    const url = wc.getURL(); if (url.length > 2048) throw new Error('请使用较短的网页地址。'); webOrigin(url);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('请重试或停止页面：正文提取超时。')), 8000); });
    let extracted: unknown;
    try { extracted = await Promise.race([wc.executeJavaScriptInIsolatedWorld(1001, [{ code: capturePageScript }]), timeout]); }
    finally { clearTimeout(timer); }
    const raw = z.object({ title: z.string().max(200), content: z.string().max(8000), truncated: z.boolean() }).parse(extracted);
    if (wc.isDestroyed() || wc.getURL() !== url || this.state.activeId !== tabId) throw new Error('请重新读取：当前网页已变化。');
    if (!raw.content.trim()) throw new Error('请使用有可读正文的网页。');
    const snapshot = { ...raw, url, capturedAt: new Date().toISOString(), digest: '' };
    while (pageMessage(snapshot).length > 11000) { snapshot.content = snapshot.content.slice(0, Math.floor(snapshot.content.length * 0.9)); snapshot.truncated = true; }
    snapshot.digest = sha256(JSON.stringify(snapshot));
    for (const [id, old] of this.captures) if (Date.now() - Date.parse(old.capturedAt) > 600000 || old.tabId === tabId && old.taskId === taskId) this.captures.delete(id);
    if (this.captures.size >= 20) throw new Error('请稍后重试：待审阅页面过多。');
    const result = { ...snapshot, id: randomUUID(), tabId, taskId }; this.captures.set(result.id, result); return { ...result };
  }
  reviewedCapture(id: string, digest: string) {
    const snapshot = this.captures.get(id), tab = this.state.tabs.find(t => t.id === snapshot?.tabId);
    const wc = snapshot && this.views.get(snapshot.tabId)?.webContents;
    if (!snapshot || snapshot.digest !== digest || Date.now() - Date.parse(snapshot.capturedAt) > 600000 || !tab || tab.paused || !wc || wc.isDestroyed() || wc.getURL() !== snapshot.url) throw new Error('请重新审阅：页面、版本或有效期已变化。');
    return { ...snapshot };
  }
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
    if (input.pauseId) { const tab = this.state.tabs.find(t => t.id === input.pauseId); if (!tab || !['html', 'web'].includes(tab.kind)) throw new Error('Task not found'); this.destroy(tab.id); tab.paused = true; }
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
    if (old.kind === 'diff' || old.source === 'evidence') throw new Error('当前标签是已留档版本；不能通过刷新替换证据。');
    if (old.kind === 'web') { this.destroy(id); old.paused = false; old.revision = (old.revision ?? 0) + 1; old.status = '重新加载网页'; this.hide(); await this.persist(); return this.view(); }
    const next = old.origin ? await this.fromSource(old.origin) : await this.fromFile(old.path!);
    this.destroy(id); Object.assign(old, next, { paused: false, revision: (old.revision ?? 0) + 1 }); this.hide(); await this.persist(); return this.view();
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
    this.pageEpoch.set(id, (this.pageEpoch.get(id) ?? 0) + 1);
    this.browserSnapshots.delete(id);
    for (const [key, grant] of this.browserGrants) if (grant.tabId === id) this.browserGrants.delete(key);
    this.proxies.get(id)?.close(); this.proxies.delete(id);
    for (const [key, capture] of this.captures) if (capture.tabId === id) this.captures.delete(key);
    const view = this.views.get(id); if (!view) return;
    this.owner()?.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) {
      const isolated = view.webContents.session;
      if (this.state.tabs.find(t => t.id === id)?.kind === 'html') isolated.protocol.unhandle('agent47-document');
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
    if (!owner || !b || !tab || tab.paused || !this.state.visible || this.state.activeId !== tab.id || !['html', 'web'].includes(tab.kind) || !b.width || !b.height) return;
    const [w, h] = owner.getContentSize();
    if (b.x + b.width > w || b.y + b.height > h) throw new Error('Invalid workspace bounds');
    let view = this.views.get(tab.id);
    if (!view && tab.kind === 'web') {
      const isolated = session.fromPartition(`agent47-web-${randomUUID()}`), proxy = await publicProxy();
      if (generation !== this.layoutGeneration || owner.isDestroyed() || tab.paused) { proxy.close(); return; }
      await isolated.setProxy({ mode: 'fixed_servers', proxyRules: `http://127.0.0.1:${proxy.port}`, proxyBypassRules: '<-loopback>' });
      if (generation !== this.layoutGeneration || owner.isDestroyed() || tab.paused) { proxy.close(); return; }
      isolated.setPermissionRequestHandler((_wc, _p, cb) => cb(false)); isolated.setPermissionCheckHandler(() => false);
      isolated.webRequest.onBeforeRequest((details, cb) => { try { if (details.url.length > 2048) throw new Error('URL limit'); webOrigin(details.url); cb({ cancel: false }); } catch { cb({ cancel: true }); } });
      isolated.on('will-download', e => e.preventDefault());
      view = new WebContentsView({ webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
      const wc = view.webContents;
      wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp'); wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.on('login', (event, _details, info, callback) => { event.preventDefault(); if (info.isProxy && info.host === '127.0.0.1' && info.port === proxy.port) callback(proxy.username, proxy.password); else callback(); });
      wc.on('will-navigate', (event, target) => { try { if (target.length > 2048) throw new Error('URL limit'); webOrigin(target); } catch { event.preventDefault(); } });
      wc.on('will-attach-webview', e => e.preventDefault());
      const navigated = () => {
        this.browserSnapshots.delete(tab.id);
        if (wc.isDestroyed()) return;
        const target = wc.getURL(); try { webOrigin(target); } catch { return; }
        for (const [key, grant] of this.browserGrants) if (grant.tabId === tab.id && grant.origin !== webOrigin(target)) this.browserGrants.delete(key);
        tab.url = target.slice(0, 2048); tab.name = new URL(target).hostname.slice(0, 255); tab.sha256 = sha256(tab.url); tab.status = '临时网页会话 · 不自动入模';
        void this.persist().then(this.changed).catch(() => {});
      };
      wc.on('did-navigate', navigated); wc.on('did-navigate-in-page', navigated);
      wc.on('did-start-navigation', (_event, _url, _inPlace, isMain) => {
        if (isMain) {
          this.pageEpoch.set(tab.id, (this.pageEpoch.get(tab.id) ?? 0) + 1);
          this.browserSnapshots.delete(tab.id);
          for (const [id, capture] of this.captures) if (capture.tabId === tab.id) this.captures.delete(id);
        }
      });
      wc.on('did-fail-load', (_e, code, _description, _url, main) => { if (main && code !== -3) { tab.status = '网页加载失败，可刷新重试'; void this.persist().then(this.changed).catch(() => {}); } });
      owner.contentView.addChildView(view); view.setVisible(false); this.views.set(tab.id, view); this.proxies.set(tab.id, proxy);
      void wc.loadURL(tab.url!).catch(() => {});
    }
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
