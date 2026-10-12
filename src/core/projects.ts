import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, lstatSync } from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { ProjectView, TaskView, ProjectPin } from '../shared/contracts';
import { safeProjectPath, sha256 } from './tools';
import type { TaskRecord } from './store';

const schema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(96), revision: z.number().int().positive(),
  root: z.string().max(4096).optional(), rootRevision: z.number().int().nonnegative(), rootEnabled: z.boolean(),
  fileMode: z.enum(['snapshot', 'ask']), pinned: z.boolean(), archived: z.boolean(), createdAt: z.string(), updatedAt: z.string()
}).strict();
const terminal = (t: TaskView) => ['completed', 'failed', 'cancelled'].includes(t.status) && !t.unknownEffect;
/** Organization metadata only. Runtime checkpoints and version archives remain in TaskStore. */
export class ProjectStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('Project database symlink denied');
    this.db = new DatabaseSync(path); chmodSync(path, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);');
    const version = this.db.prepare('SELECT value FROM meta WHERE key=?').get('schema');
    if (version && !['1', '2'].includes(String(version.value))) throw new Error('Unsupported project schema; preserve data');
    if (version?.value === '1' && !existsSync(path + '.before-context')) { this.db.prepare('VACUUM INTO ?').run(path + '.before-context'); chmodSync(path + '.before-context', 0o600); }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS membership(conversation TEXT PRIMARY KEY,project TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,body TEXT NOT NULL,project TEXT NOT NULL); CREATE TABLE IF NOT EXISTS navigation(project TEXT PRIMARY KEY,run TEXT NOT NULL); CREATE TABLE IF NOT EXISTS project_context(project TEXT PRIMARY KEY,body TEXT NOT NULL)');
      this.db.prepare('INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('schema', '2');
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    if (Object.values(this.db.prepare('PRAGMA quick_check').get()!)[0] !== 'ok') throw new Error('Project integrity failed');
    this.list();
    for (const p of this.list()) this.context(p.id);
  }
  context(id: string): { revision: number; instructions: string; instructionHash: string; pins: ProjectPin[] } {
    this.get(id);
    const row = this.db.prepare('SELECT body FROM project_context WHERE project=?').get(id);
    const value = z.object({ revision: z.number().int().nonnegative(), instructions: z.string().max(6000), pins: z.array(z.object({ id: z.string().uuid(), materialId: z.string().uuid(), resourceKey: z.string().regex(/^[a-f0-9]{64}$/), originProjectId: z.string().uuid().optional() }).strict()).max(10) }).strict().parse(row ? JSON.parse(String(row.body)) : { revision: 0, instructions: '', pins: [] });
    if (new Set(value.pins.map(p => p.id)).size !== value.pins.length || new Set(value.pins.map(p => p.resourceKey)).size !== value.pins.length) throw new Error('Invalid project resource bindings');
    return { ...value, instructionHash: sha256(value.instructions) };
  }
  saveContext(id: string, expected: number, change: { instructions?: string; pins?: ProjectPin[] }) {
    const p = this.get(id), current = this.context(id);
    if (p.archived || current.revision !== expected) throw new Error('请重新审阅项目上下文：版本已变化或项目已归档。');
    if (change.instructions !== undefined && change.instructions.length > 6000 || change.pins && (change.pins.length > 10 || new Set(change.pins.map(p => p.resourceKey)).size !== change.pins.length)) throw new Error('请使用最多6000字符说明、10份不同固定材料。');
    const { instructionHash, ...body } = current; void instructionHash;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO project_context VALUES (?,?) ON CONFLICT(project) DO UPDATE SET body=excluded.body').run(id, JSON.stringify({ ...body, ...change, revision: current.revision + 1 }));
      this.save({ ...p, revision: p.revision + 1, updatedAt: new Date().toISOString() });
      this.context(id); this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    return this.context(id);
  }
  list(): ProjectView[] { return this.db.prepare('SELECT body FROM projects ORDER BY rowid DESC').all().map(r => schema.parse(JSON.parse(String(r.body)))); }
  get(id: string): ProjectView { const r = this.db.prepare('SELECT body FROM projects WHERE id=?').get(id); if (!r) throw new Error('请重新选择项目。'); return schema.parse(JSON.parse(String(r.body))); }
  private save(p: ProjectView) { schema.parse(p); this.db.prepare('INSERT INTO projects VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(p.id, JSON.stringify(p)); return p; }
  create(name: string, request: string) {
    z.string().uuid().parse(request); name = z.string().trim().min(1).max(96).parse(name);
    const prior = this.db.prepare('SELECT body,project FROM requests WHERE id=?').get(request);
    if (prior) { if (prior.body !== name) throw new Error('请使用新的请求标识。'); return this.get(String(prior.project)); }
    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const p = this.save({ id: randomUUID(), name, revision: 1, rootRevision: 0, rootEnabled: false, fileMode: 'snapshot', pinned: false, archived: false, createdAt: now, updatedAt: now });
      this.db.prepare('INSERT INTO requests VALUES (?,?,?)').run(request, name, p.id); this.db.exec('COMMIT'); return p;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  update(id: string, expected: number, changes: { name?: string; pinned?: boolean; archived?: boolean }) {
    const p = this.get(id); if (p.revision !== expected) throw new Error('请重新审阅：项目设置已变化。');
    if (p.archived && changes.archived === false && p.rootEnabled && this.list().some(o => o.id !== id && !o.archived && o.rootEnabled && o.root === p.root)) throw new Error('请先撤销已归档项目的目录授权，再恢复项目。');
    return this.save({ ...p, ...changes, revision: p.revision + 1, updatedAt: new Date().toISOString() });
  }
  bind(id: string, expected: number, root?: string, fileMode: 'snapshot' | 'ask' = 'snapshot') {
    const p = this.get(id);
    if (p.revision !== expected || p.archived && root) throw new Error('请重新审阅项目设置。');
    if (root && this.list().some(o => o.id !== id && !o.archived && o.rootEnabled && o.root === root)) throw new Error('请使用已绑定该目录的项目。');
    return this.save({ ...p, ...(root ? { root } : {}), rootEnabled: !!root, fileMode, rootRevision: p.rootRevision + 1, revision: p.revision + 1, updatedAt: new Date().toISOString() });
  }
  projectFor(conversation: string): string | undefined { return (this.db.prepare('SELECT project FROM membership WHERE conversation=?').get(conversation)?.project as string | undefined) || undefined; }
  decorate(tasks: TaskView[]): TaskView[] { return tasks.map(t => ({ ...t, projectId: this.projectFor(t.conversationId ?? t.id) })); }
  assign(task: TaskView, tasks: TaskView[], project?: string) {
    if (project && this.get(project).archived) throw new Error('请先恢复归档项目。');
    const conversation = task.conversationId ?? task.id;
    if (tasks.some(t => (t.conversationId ?? t.id) === conversation && !terminal(t))) throw new Error('请先完成或停止本会话；归类不改变执行目录。');
    this.register(conversation, project);
  }
  register(conversation: string, project?: string) {
    if (project) { this.get(project); this.db.prepare('INSERT INTO membership VALUES (?,?) ON CONFLICT(conversation) DO UPDATE SET project=excluded.project').run(conversation, project); }
    else this.db.prepare("INSERT INTO membership VALUES (?,'') ON CONFLICT(conversation) DO UPDATE SET project=''").run(conversation);
  }
  reconcile(tasks: TaskRecord[]) {
    for (const t of tasks) {
      const conversation = t.conversationId ?? t.id;
      if (t.originProjectId && !this.db.prepare('SELECT conversation FROM membership WHERE conversation=?').get(conversation)) {
        this.get(t.originProjectId); this.register(conversation, t.originProjectId);
      }
    }
  }
  current(): string | undefined {
    const id = this.db.prepare('SELECT value FROM meta WHERE key=?').get('current')?.value as string | undefined;
    return id && this.get(id) ? id : undefined;
  }
  select(id?: string) {
    if (id) { this.get(id); this.db.prepare('INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('current', id); }
    else this.db.prepare('DELETE FROM meta WHERE key=?').run('current');
  }
  remember(run: string, project?: string) { this.db.prepare('INSERT INTO navigation VALUES (?,?) ON CONFLICT(project) DO UPDATE SET run=excluded.run').run(project ?? '', run); }
  last(project?: string): string | undefined { return this.db.prepare('SELECT run FROM navigation WHERE project=?').get(project ?? '')?.run as string | undefined; }
  allowed(binding: { rootProjectId?: string; rootProjectRevision?: number; root?: string }) {
    if (!binding.rootProjectId) return true;
    const p = this.get(binding.rootProjectId);
    return p.rootEnabled && p.root === binding.root && p.rootRevision === binding.rootProjectRevision;
  }
  async folder(id: string) {
    const p = this.get(id);
    if (!p.rootEnabled || !p.root) throw new Error('请先授权项目目录。');
    try { if (await realpath(p.root) !== resolve(p.root) || !(await lstat(p.root)).isDirectory()) throw new Error('identity'); }
    catch { throw new Error('请重新确认项目目录：目录不可用或身份已变化。'); }
    return p;
  }
  async files(id: string, path: string, offset = 0) {
    const p = await this.folder(id), target = await safeProjectPath(p.root, path);
    // Bounded page: do not recursively index a directory or read file contents.
    const entries = (await readdir(target, { withFileTypes: true })).filter(e => !e.name.startsWith('.') && !e.isSymbolicLink())
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    return { path, entries: entries.slice(offset, offset + 200).map(e => ({ name: e.name, directory: e.isDirectory() })), nextOffset: offset + 200 < entries.length ? offset + 200 : undefined };
  }
  close() { this.db.close(); }
}
