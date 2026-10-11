import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync, lstatSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ModelMessage } from 'ai';
import type { TaskView } from '../shared/contracts';
import type { MaterialSnapshot } from './materials';

export interface ToolCall { toolCallId: string; toolName: string; input: unknown }
export interface TaskRecord extends TaskView {
  messages: ModelMessage[]; pending: ToolCall[];
  compactions?: { summary: string; keptFrom: number; at: string }[];
  effectStarted?: string; loadedSkills?: string[];
  inputBoundary?: boolean;
  queueAfterStep?: number;
  questionReceipts?: Record<string, string>;
  materialSnapshots?: Record<string, MaterialSnapshot>; authorizedMaterialIds?: string[];
}

/** One process owns this database. Every checkpoint includes messages and action state. */
export class TaskStore {
  private db: DatabaseSync;
  private materialCache = new Map<string, MaterialSnapshot>();
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('Database symlink denied');
    chmodSync(dirname(path), 0o700);
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    for (const sidecar of [`${path}-wal`, `${path}-shm`]) if (existsSync(sidecar)) chmodSync(sidecar, 0o600);
    this.db.exec('CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, task_id TEXT NOT NULL);');
    this.db.exec('CREATE TABLE IF NOT EXISTS material_versions (id TEXT PRIMARY KEY, body TEXT NOT NULL);');
    const version = this.db.prepare('SELECT value FROM metadata WHERE key=?').get('schema');
    if (version && version.value !== '1') throw new Error('Unsupported database schema. Preserve database and upgrade the app.');
    this.db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('schema', '1');
    // Fail closed on corruption instead of manufacturing replacement defaults.
    const check = this.db.prepare('PRAGMA quick_check').get();
    if (!check || Object.values(check)[0] !== 'ok') throw new Error('Database integrity check failed');
    this.list();
  }
  list(): TaskRecord[] {
    return this.db.prepare('SELECT body FROM tasks ORDER BY rowid DESC').all().map(row => {
      const parsed = JSON.parse(String(row.body)) as TaskRecord;
      if (!parsed.id || !Array.isArray(parsed.messages) || !Array.isArray(parsed.pending)) throw new Error('Invalid task checkpoint');
      return this.hydrateMaterials(parsed);
    });
  }
  get(id: string): TaskRecord {
    const row = this.db.prepare('SELECT body FROM tasks WHERE id=?').get(id);
    if (!row) throw new Error('Task not found');
    return this.hydrateMaterials(JSON.parse(String(row.body)) as TaskRecord);
  }
  private hydrateMaterials(task: TaskRecord): TaskRecord {
    for (const [id, metadata] of Object.entries(task.materialSnapshots ?? {})) {
      if (typeof metadata.content === 'string') continue; // Additive legacy snapshot migration at next save.
      let material = this.materialCache.get(id);
      if (!material) {
        const row = this.db.prepare('SELECT body FROM material_versions WHERE id=?').get(id);
        if (!row) throw new Error('Missing pinned material version; preserve database');
        material = JSON.parse(String(row.body)) as MaterialSnapshot; this.materialCache.set(id, material);
      }
      if (material.id !== id || material.sha256 !== metadata.sha256) throw new Error('Invalid material version binding');
      task.materialSnapshots![id] = material;
    }
    return task;
  }
  save(task: TaskRecord): void {
    task.updatedAt = new Date().toISOString();
    const pointers: Record<string, Omit<MaterialSnapshot, 'content'>> = {};
    for (const [id, material] of Object.entries(task.materialSnapshots ?? {})) {
      const body = JSON.stringify(material);
      const existing = this.db.prepare('SELECT body FROM material_versions WHERE id=?').get(id);
      if (existing && existing.body !== body) throw new Error('Immutable material version changed');
      this.db.prepare('INSERT OR IGNORE INTO material_versions VALUES (?,?)').run(id, body);
      const { content, ...pointer } = material;
      void content; pointers[id] = pointer; this.materialCache.set(id, material);
    }
    this.db.prepare('INSERT INTO tasks VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(task.id, JSON.stringify({ ...task, ...(task.materialSnapshots ? { materialSnapshots: pointers } : {}) }));
  }
  command(id: string): string | undefined { return this.db.prepare('SELECT task_id FROM commands WHERE id=?').get(id)?.task_id as string | undefined; }
  saveCommand(id: string, task: TaskRecord, parent?: TaskRecord): void {
    this.db.exec('BEGIN IMMEDIATE');
    try { if (parent) this.save(parent); this.save(task); this.db.prepare('INSERT INTO commands VALUES (?,?)').run(id, task.id); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  saveContinuation(id: string, task: TaskRecord, parent?: TaskRecord): void {
    this.db.exec('BEGIN IMMEDIATE');
    try { if (parent) this.save(parent); this.save(task); this.db.prepare('UPDATE commands SET task_id=? WHERE id=?').run(task.id, id); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close(): void { this.db.close(); }
}
export function publicTask(task: TaskRecord): TaskView {
  return {
    id: task.id, goal: task.goal, skill: task.skill, root: task.root, status: task.status,
    createdAt: task.createdAt, updatedAt: task.updatedAt, events: task.events,
    artifacts: task.artifacts, approval: task.approval, steps: task.steps,
    conversationId: task.conversationId ?? task.id, goalId: task.goalId ?? task.id,
    parentRunId: task.parentRunId, runNumber: task.runNumber ?? 1,
    conversationTitle: task.conversationTitle ?? task.goal.split('\n')[0].slice(0, 60), materials: task.materials ?? [],
    usage: task.usage ?? [], question: task.question, queuedInput: task.queuedInput,
    context: task.context, unknownEffect: Boolean(task.effectStarted),
    fileMode: task.fileMode ?? 'ask', hostMode: task.hostMode ?? 'ask', fileChanges: task.fileChanges ?? [], undo: task.undo, skillPins: task.skillPins, webOrigins: task.webOrigins ?? [], composerDraft: task.composerDraft
  };
}
