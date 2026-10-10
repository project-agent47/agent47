import { randomUUID } from 'node:crypto';
import type { ModelMessage } from 'ai';
import { TaskStore, publicTask, type TaskRecord, type ToolCall } from './store';
import { readTool, approvalFor, applyArtifact } from './tools';
import type { ModelDriver } from './model';
import type { SkillId, TaskView } from '../shared/contracts';

const terminal = new Set(['completed', 'failed', 'cancelled']);
export class TaskRuntime {
  private active = new Map<string, AbortController>();
  private draining = false;
  private stopped = false;
  constructor(readonly store: TaskStore, private model: ModelDriver, private artifactRoot: string, private changed: () => void = () => {}) {}
  start(): void {
    for (const task of this.store.list()) {
      if (task.status === 'running') { task.status = 'queued'; this.event(task, 'system', '应用已重启，从已保存的检查点继续。'); this.save(task); }
    }
    this.kick();
  }
  list(): TaskView[] { return this.store.list().map(publicTask); }
  create(goal: string, skill: SkillId, root?: string): TaskView {
    if (!goal.trim() || goal.length > 12000) throw new Error('Task goal must contain 1–12000 characters');
    const now = new Date().toISOString();
    const task: TaskRecord = {
      id: randomUUID(), goal: goal.trim(), skill, root, status: 'queued', createdAt: now, updatedAt: now,
      events: [], artifacts: [], steps: 0, pending: [], messages: [{ role: 'user', content: goal.trim() }]
    };
    this.event(task, 'user', task.goal); this.save(task); this.kick();
    return publicTask(task);
  }
  cancel(id: string): void {
    const task = this.store.get(id);
    if (terminal.has(task.status)) throw new Error('Finished tasks cannot be cancelled or resumed');
    task.status = 'cancelled';
    if (task.approval?.state === 'pending') task.approval.state = 'denied';
    this.active.get(id)?.abort();
    this.event(task, 'system', '任务已停止。已保存的成果会保留。'); this.save(task);
  }
  decide(id: string, approvalId: string, digest: string, approve: boolean): void {
    const task = this.store.get(id);
    const action = task.approval;
    if (task.status !== 'awaiting_approval' || !action || action.id !== approvalId || action.state !== 'pending' || action.digest !== digest) throw new Error('Approval is stale or does not match this task and payload');
    if (Date.parse(action.expiresAt) <= Date.now()) throw new Error('Approval expired. Stop this task and start a new one.');
    if (approvalFor(id, action.id, action).digest !== digest) throw new Error('Approval payload changed');
    action.state = approve ? 'approved' : 'denied';
    task.status = 'queued';
    this.event(task, 'system', approve ? `已批准创建 ${action.name}。` : `已拒绝创建 ${action.name}。`);
    this.save(task); this.kick();
  }
  shutdown(): void {
    this.stopped = true;
    for (const controller of this.active.values()) controller.abort();
  }
  private event(task: TaskRecord, kind: TaskRecord['events'][number]['kind'], text: string): void {
    task.events.push({ id: randomUUID(), at: new Date().toISOString(), kind, text });
  }
  private save(task: TaskRecord): void { this.store.save(task); this.changed(); }
  private kick(): void { if (!this.stopped) queueMicrotask(() => void this.drain()); }
  private async drain(): Promise<void> {
    if (this.draining || this.stopped) return;
    this.draining = true;
    try {
      for (;;) {
        if (this.stopped) break;
        const task = this.store.list().reverse().find(t => t.status === 'queued');
        if (!task) break;
        await this.run(task.id);
      }
    } finally { this.draining = false; }
  }
  private toolResult(task: TaskRecord, call: ToolCall, value: unknown, error = false): void {
    const message: ModelMessage = { role: 'tool', content: [{
      type: 'tool-result', toolCallId: call.toolCallId, toolName: call.toolName,
      output: error ? { type: 'error-text', value: String(value) } : { type: 'json', value: JSON.parse(JSON.stringify(value)) }
    }] };
    task.messages.push(message); task.pending.shift();
  }
  private async run(id: string): Promise<void> {
    const controller = new AbortController();
    this.active.set(id, controller);
    let task = this.store.get(id);
    task.status = 'running'; this.save(task);
    try {
      while (!this.stopped && !controller.signal.aborted) {
        task = this.store.get(id);
        if (task.status === 'cancelled') return;
        if (task.pending.length) {
          const call = task.pending[0];
          if (call.toolName === 'writeArtifact') {
            if (task.approval?.id !== call.toolCallId) {
              try { task.approval = approvalFor(id, call.toolCallId, call.input); }
              catch { this.toolResult(task, call, 'Invalid artifact payload', true); this.save(task); continue; }
              task.status = 'awaiting_approval';
              this.event(task, 'system', `等待你审阅 ${task.approval.name} 的完整内容。`); this.save(task);
              return;
            }
            if (task.approval.state === 'denied') {
              this.toolResult(task, call, 'User denied this write. Respect the denial.', true);
            } else if (task.approval.state === 'approved') {
              // No renderer mutation is possible. Fence asynchronous side effects after cancellation.
              const artifact = await applyArtifact(this.artifactRoot, id, task.approval);
              const current = this.store.get(id);
              if (this.stopped) return; // Checkpoint still approved; replay verifies the same file.
              task = current;
              task.artifacts.push(artifact);
              if (task.approval) task.approval.state = 'applied';
              this.event(task, 'tool', `已保存 ${artifact.name} · SHA-256 ${artifact.sha256.slice(0, 12)}`);
              this.toolResult(task, call, { saved: true, name: artifact.name, sha256: artifact.sha256 });
              this.save(task);
              if (task.status === 'cancelled') return; // Approved I/O already in flight may finish, recorded honestly.
              continue;
            } else {
              task.status = 'awaiting_approval'; this.save(task); return;
            }
          } else {
            try {
              const value = await readTool(task.root, call.toolName, call.input);
              if (controller.signal.aborted || this.stopped) return;
              this.toolResult(task, call, value);
              this.event(task, 'tool', `${call.toolName} · ${JSON.stringify(call.input)}`);
            } catch (error) {
              if (controller.signal.aborted || this.stopped) return;
              this.toolResult(task, call, String((error as Error).message), true);
              this.event(task, 'tool', `${call.toolName}：请求被拒绝或未能读取。`);
            }
          }
          this.save(task); continue;
        }
        if (task.steps >= 12) throw new Error('Reached the 12-step budget. Review progress and start a narrower task.');
        const step = await this.model(task.messages, id, controller.signal, task.skill);
        if (controller.signal.aborted || this.stopped) return;
        const prior = new Set(task.messages.flatMap(message => message.role === 'assistant' && Array.isArray(message.content)
          ? message.content.filter(part => part.type === 'tool-call').map(part => part.toolCallId) : []));
        const fresh = new Set(step.calls.map(call => call.toolCallId));
        if (step.calls.length > 16 || fresh.size !== step.calls.length ||
          step.calls.some(call => prior.has(call.toolCallId) || !call.toolCallId || call.toolCallId.length > 128)) throw new Error('Model returned repeated or excessive tool calls');
        // Persist the model output and pending intents before executing any tools.
        task.steps++; task.messages.push(...step.messages); task.pending = step.calls;
        if (step.text) this.event(task, 'assistant', step.text);
        if (!step.calls.length) {
          if (!step.text.trim()) throw new Error('Model returned no answer or tool calls');
          task.status = 'completed'; this.event(task, 'system', '任务已完成。'); this.save(task); return;
        }
        this.save(task);
      }
    } catch (error) {
      if (!controller.signal.aborted && !this.stopped) {
        task = this.store.get(id);
        if (task.status !== 'cancelled') {
          task.status = 'failed';
          // Do not expose upstream response bodies, URLs, or credentials in renderer events.
          const message = (error as Error).message;
          const safe = /^(Configure a model|Reached the 12-step|Model returned)/.test(message) ? message : '模型或工具执行失败。检查连接设置和权限后，新建任务重试。';
          this.event(task, 'error', safe); this.save(task);
        }
      }
    } finally { this.active.delete(id); }
  }
}
