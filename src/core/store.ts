import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync, lstatSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ModelMessage } from 'ai';
import type { TaskView } from '../shared/contracts';

export interface ToolCall { toolCallId: string; toolName: string; input: unknown }
export interface TaskRecord extends TaskView { messages: ModelMessage[]; pending: ToolCall[] }

/** One process owns this database. Every checkpoint includes messages and action state. */
export class TaskStore {
  private db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('Database symlink denied');
    chmodSync(dirname(path), 0o700);
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    for (const sidecar of [`${path}-wal`, `${path}-shm`]) if (existsSync(sidecar)) chmodSync(sidecar, 0o600);
    this.db.exec('CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
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
      return parsed;
    });
  }
  get(id: string): TaskRecord {
    const row = this.db.prepare('SELECT body FROM tasks WHERE id=?').get(id);
    if (!row) throw new Error('Task not found');
    return JSON.parse(String(row.body)) as TaskRecord;
  }
  save(task: TaskRecord): void {
    task.updatedAt = new Date().toISOString();
    this.db.prepare('INSERT INTO tasks VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(task.id, JSON.stringify(task));
  }
  close(): void { this.db.close(); }
}
export function publicTask(task: TaskRecord): TaskView {
  return {
    id: task.id, goal: task.goal, skill: task.skill, root: task.root, status: task.status,
    createdAt: task.createdAt, updatedAt: task.updatedAt, events: task.events,
    artifacts: task.artifacts, approval: task.approval, steps: task.steps
  };
}
