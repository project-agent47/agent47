import { randomUUID } from 'node:crypto';
import type { ModelMessage } from 'ai';
import { TaskStore, publicTask, type TaskRecord, type ToolCall } from './store';
import { readTool, approvalFor, applyArtifact } from './tools';
import type { ModelDriver } from './model';
import type { SkillId, TaskView } from '../shared/contracts';
import { z } from 'zod';
import { effectNames, prepareEffect, applyProjectWrite, effectDigest, type HostExecutor } from './effects';
import { projectedMessages, compactionCut, estimateTokens } from './context';
import type { ModelContext, ModelStep } from './model';
import type { FileSnapshots } from './snapshots';

export interface RuntimeServices {
  hostEnabled?: () => boolean; executeHost?: HostExecutor;
  skills?: { catalog(): unknown[]; load(id: string): unknown; read(id: string, path: string): Promise<unknown> };
  contextThreshold?: number;
  fileMode?: () => 'snapshot' | 'ask'; snapshots?: FileSnapshots;
}

const terminal = new Set(['completed', 'failed', 'cancelled']);
export class TaskRuntime {
  private active = new Map<string, AbortController>();
  private draining = false;
  private stopped = false;
  private drafts = new Map<string, { text: string; reasoning: string }>();
  private restoringRoots = new Set<string>();
  constructor(readonly store: TaskStore, private model: ModelDriver, private artifactRoot: string, private changed: () => void = () => {}, private services: RuntimeServices = {}) {}
  start(): void {
    for (const task of this.store.list()) {
      let changedUsage = false;
      for (const usage of task.usage ?? []) if (usage.state === 'pending') { usage.state = 'unknown'; changedUsage = true; }
      if (changedUsage) this.save(task);
      if (task.status === 'running') {
        task.status = task.effectStarted ? 'awaiting_reconciliation' : 'queued';
        this.event(task, 'system', task.effectStarted ? '主机工具执行结果未知。请检查实际效果后确认，不会自动重放命令。' : '应用已重启，从已保存的检查点继续。'); this.save(task);
      }
    }
    this.kick();
  }
  list(): TaskView[] { return this.store.list().map(task => ({ ...publicTask(task), draft: this.drafts.get(task.id) })); }
  create(goal: string, skill: SkillId, root?: string, fileMode?: 'snapshot' | 'ask'): TaskView {
    if (root && this.restoringRoots.has(root)) throw new Error('请等待文件快照恢复完成。');
    if (!goal.trim() || goal.length > 12000) throw new Error('Task goal must contain 1–12000 characters');
    const now = new Date().toISOString();
    const task: TaskRecord = {
      id: randomUUID(), goal: goal.trim(), skill, root, status: 'queued', createdAt: now, updatedAt: now,
      events: [], artifacts: [], steps: 0, pending: [], messages: [{ role: 'user', content: goal.trim() }],
      usage: [], runNumber: 1, queuedInput: [],
      fileMode: fileMode ?? this.services.fileMode?.() ?? 'ask', hostMode: 'ask', fileChanges: []
    };
    this.event(task, 'user', task.goal); this.save(task); this.kick();
    return publicTask(task);
  }
  send(id: string, text: string, mode: 'steer' | 'followup', commandId: string): TaskView {
    if (!text.trim() || text.length > 12000) throw new Error('Invalid message');
    const prior = this.store.command(commandId);
    if (prior) return publicTask(this.store.get(prior));
    let task = this.store.get(id);
    if (task.root && this.restoringRoots.has(task.root)) throw new Error('请等待文件快照恢复完成。');
    if (task.effectStarted) throw new Error('Inspect unknown host effects before continuing');
    if (terminal.has(task.status)) {
      const latest = this.store.list().find(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id));
      if (latest?.id !== id) throw new Error('Conversation already continued; open the latest run');
      task = this.fork(task, text);
      this.store.saveCommand(commandId, task); this.changed(); this.kick(); return publicTask(task);
    }
    if (task.status === 'awaiting_reconciliation') throw new Error('Inspect unknown host effects before continuing');
    if (task.status === 'awaiting_input' && task.pending[0]?.toolName === 'askUser') {
      this.toolResult(task, task.pending[0], { answer: text.trim(), fromUser: true });
      task.question = undefined; task.status = 'queued'; this.event(task, 'user', text.trim());
    } else {
      task.queuedInput ??= []; task.queuedInput.push({ id: commandId, text: text.trim(), mode });
      if (task.status === 'awaiting_approval' && mode === 'steer') {
        if (task.approval) task.approval.state = 'denied';
        task.status = 'queued';
      }
    }
    this.store.saveCommand(commandId, task); this.changed(); this.kick(); return publicTask(task);
  }
  setPermissions(id: string, fileMode: 'snapshot' | 'ask', hostMode: 'ask' | 'allow'): void {
    const task = this.store.get(id);
    if (hostMode === 'allow' && (!task.root || !this.services.hostEnabled?.())) throw new Error('请先选择项目目录，并在工具设置启用本机执行。');
    if (fileMode === 'snapshot' && !this.services.snapshots) throw new Error('Snapshot service unavailable');
    task.fileMode = fileMode; task.hostMode = hostMode;
    this.event(task, 'system', `工具权限：文件 ${fileMode === 'snapshot' ? '自动备份并修改' : '逐次确认'}；本机执行 ${hostMode === 'allow' ? '本次对话免确认（非沙箱）' : '逐次确认'}。`);
    if (task.status === 'awaiting_approval') task.status = 'queued';
    this.save(task); this.kick();
  }
  async restoreFile(id: string, snapshotId: string): Promise<void> {
    const task = this.store.get(id);
    if (!task.root || this.restoringRoots.has(task.root) || !terminal.has(task.status) || task.effectStarted || this.active.has(id) ||
      this.store.list().some(other => other.root === task.root && (!terminal.has(other.status) || other.effectStarted))) throw new Error('请先停止或完成此项目的所有任务，再恢复文件。');
    const change = task.fileChanges?.find(item => item.id === snapshotId && item.state === 'saved');
    if (!change || !this.services.snapshots) throw new Error('Snapshot not found');
    this.restoringRoots.add(task.root);
    try {
      await this.services.snapshots.restore(id, snapshotId);
      const current = this.store.get(id);
      current.fileChanges!.find(item => item.id === snapshotId)!.state = 'restored';
      this.event(current, 'system', `已恢复文件快照：${change.path}；对话历史未回退。`); this.save(current);
      const latest = this.store.list().find(other => (other.conversationId ?? other.id) === (task.conversationId ?? task.id))!;
      latest.messages.push({ role: 'user', content: `[Application notice: the user restored ${change.path} to before its recorded modification. Do not replay that action. Read the file again before proposing any new edit.]` });
      this.save(latest);
    } finally { this.restoringRoots.delete(task.root); }
  }
  resolveUnknown(id: string): void {
    const task = this.store.get(id);
    if (!['awaiting_reconciliation', 'cancelled'].includes(task.status) || !task.effectStarted || task.pending[0]?.toolCallId !== task.effectStarted) throw new Error('No unknown execution');
    this.toolResult(task, task.pending[0], 'Previous host execution outcome is unknown. User inspected it. Never replay it automatically.', true);
    task.effectStarted = undefined; if (task.status !== 'cancelled') task.status = 'queued';
    this.event(task, 'system', '已人工检查未知效果，原命令不会重放。'); this.save(task); this.kick();
  }
  private fork(parent: TaskRecord, text: string): TaskRecord {
    const now = new Date().toISOString();
    const messages = structuredClone(parent.messages);
    for (const call of parent.pending) messages.push({ role: 'tool', content: [{ type: 'tool-result', toolCallId: call.toolCallId, toolName: call.toolName, output: { type: 'error-text', value: 'Prior run ended. This intent must not be replayed.' } }] });
    messages.push({ role: 'user', content: text.trim() });
    const task: TaskRecord = {
      id: randomUUID(), goal: text.trim(), skill: parent.skill, root: parent.root, status: 'queued',
      createdAt: now, updatedAt: now, events: structuredClone(parent.events), artifacts: [], steps: 0, pending: [], messages,
      conversationId: parent.conversationId ?? parent.id, goalId: parent.goalId ?? parent.id, parentRunId: parent.id,
      runNumber: (parent.runNumber ?? 1) + 1, usage: [], queuedInput: [], compactions: structuredClone(parent.compactions ?? []),
      fileMode: parent.fileMode ?? 'ask', hostMode: parent.hostMode ?? 'ask', fileChanges: []
    };
    this.event(task, 'system', `开始第 ${task.runNumber} 轮执行；旧执行轮次保持不变。`);
    this.event(task, 'user', text.trim()); return task;
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
    if ((action.kind ? effectDigest(id, action) : approvalFor(id, action.id, action).digest) !== digest) throw new Error('Approval payload changed');
    action.state = approve ? 'approved' : 'denied';
    task.status = 'queued';
    const verb = action.kind === 'project_write' ? '写入' : action.kind ? '执行' : '创建';
    this.event(task, 'system', approve ? `已批准${verb} ${action.name}。` : `已拒绝${verb} ${action.name}。`);
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
  private async invoke(task: TaskRecord, messages: import('ai').ModelMessage[], signal: AbortSignal, purpose: 'turn' | 'compaction'): Promise<ModelStep> {
    const id = randomUUID();
    task.usage ??= []; task.usage.push({ id, at: new Date().toISOString(), purpose, state: 'pending' });
    this.save(task);
    const draft = { text: '', reasoning: '' }; this.drafts.set(task.id, draft);
    const context: ModelContext = {
      purpose, hostExecution: this.services.hostEnabled?.() ?? false, fileMode: task.fileMode ?? 'ask', hostMode: task.hostMode ?? 'ask',
      catalog: JSON.stringify(this.services.skills?.catalog() ?? []),
      onDelta: (kind, text) => {
        if (signal.aborted || this.stopped) return;
        if (purpose === 'turn') { draft[kind] = (draft[kind] + text).slice(0, 1_000_000); this.changed(); }
      }
    };
    try {
      const result = await this.model(messages, task.conversationId ?? task.id, signal, task.skill, context);
      const current = this.store.get(task.id);
      const index = current.usage!.findIndex(item => item.id === id);
      current.usage![index] = { id, at: current.usage![index].at, purpose, ...(result.usage ?? { state: 'unknown' }) };
      this.save(current); return result;
    } catch (error) {
      const current = this.store.get(task.id);
      const usage = current.usage?.find(item => item.id === id);
      if (usage?.state === 'pending') { usage.state = 'unknown'; this.save(current); }
      throw error;
    } finally { this.drafts.delete(task.id); this.changed(); }
  }
  private async compact(task: TaskRecord, signal: AbortSignal): Promise<void> {
    const projection = projectedMessages(task);
    if (estimateTokens(projection) <= (this.services.contextThreshold ?? 32000)) return;
    if ((task.usage?.filter(item => item.purpose === 'compaction').length ?? 0) >= 3) throw new Error('Model returned repeated context expansion. Narrow this task instead of compacting indefinitely.');
    const cut = compactionCut(task.messages);
    const prior = task.compactions?.at(-1);
    if (!cut || cut <= (prior?.keptFrom ?? 0)) throw new Error('Model returned context too large to compact safely. Narrow the current material.');
    const history = JSON.stringify(task.messages.slice(prior?.keptFrom ?? 0, cut));
    if (Buffer.byteLength(history, 'utf8') > 96000) throw new Error('Model returned context too large to summarize without losing evidence. Narrow the current material.');
    const summaryInput = [{ role: 'user' as const, content: `Previous summary:\n${prior?.summary ?? '(none)'}\nTask history to summarize:\n${history}` }];
    this.event(task, 'system', '自动压缩较早的上下文，保留完整本地历史与最近工具链。'); this.save(task);
    const result = await this.invoke(task, summaryInput, signal, 'compaction');
    if (signal.aborted || this.stopped) return;
    if (!result.text.trim() || result.calls.length) throw new Error('Model returned invalid context summary');
    const current = this.store.get(task.id);
    current.compactions ??= []; current.compactions.push({ summary: result.text, keptFrom: cut, at: new Date().toISOString() });
    current.context = { compactions: current.compactions.length, estimatedTokens: estimateTokens(projectedMessages(current)), keptFrom: cut };
    this.save(current);
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
        const steering = task.queuedInput?.filter(item => item.mode === 'steer') ?? [];
        if (steering.length) {
          while (task.pending.length) this.toolResult(task, task.pending[0], 'User changed requirements; pending intent superseded. Do not execute it.', true);
          if (task.approval?.state === 'pending' || task.approval?.state === 'approved') task.approval.state = 'denied';
          for (const input of steering) { task.messages.push({ role: 'user', content: input.text }); this.event(task, 'user', input.text); }
          task.queuedInput = task.queuedInput?.filter(item => item.mode !== 'steer'); this.save(task);
        }
        if (task.pending.length) {
          const call = task.pending[0];
          if (call.toolName === 'askUser') {
            try {
              const { question } = z.object({ question: z.string().min(1).max(2000) }).strict().parse(call.input);
              task.question = { id: call.toolCallId, text: question }; task.status = 'awaiting_input'; this.save(task); return;
            } catch { this.toolResult(task, call, 'Invalid question', true); this.save(task); continue; }
          }
          if (effectNames.has(call.toolName)) {
            if (task.approval?.id !== call.toolCallId) {
              try { task.approval = await prepareEffect(id, call, task.root, this.services.hostEnabled?.() ?? false); }
              catch (error) { this.toolResult(task, call, (error as Error).message, true); this.save(task); continue; }
              this.save(task);
            }
            const action = task.approval;
            if (action.state === 'denied') { this.toolResult(task, call, 'User denied this action. Respect denial.', true); this.save(task); continue; }
            const autoFile = ['project_write', 'directory'].includes(action.kind ?? '') && task.fileMode === 'snapshot' && !!this.services.snapshots;
            const autoHost = ['shell', 'code'].includes(action.kind ?? '') && task.hostMode === 'allow' && !!this.services.hostEnabled?.();
            if (action.state === 'pending' && (autoFile || autoHost)) { action.state = 'approved'; this.save(task); }
            if (action.state !== 'approved') { task.status = 'awaiting_approval'; this.save(task); return; }
            if (effectDigest(id, action) !== action.digest) throw new Error('Approval payload changed');
            try {
              let value: unknown;
              if (action.kind === 'project_write' || action.kind === 'directory') {
                value = this.services.snapshots ? await this.services.snapshots.apply(id, action) : await applyProjectWrite(id, action);
              }
              else {
                if (!this.services.hostEnabled?.() || !this.services.executeHost) throw new Error('Host execution disabled');
                task.effectStarted = call.toolCallId; this.save(task);
                value = await this.services.executeHost(action, controller.signal);
              }
              if (this.stopped) return;
              task = this.store.get(id); task.effectStarted = undefined;
              const change = value as { snapshotId?: string; path?: string };
              if (change?.snapshotId && !task.fileChanges?.some(item => item.id === change.snapshotId)) {
                task.fileChanges ??= []; task.fileChanges.push({ id: change.snapshotId, path: change.path!, state: 'saved' });
              }
              if (task.approval) task.approval.state = 'applied';
              this.toolResult(task, call, value); this.event(task, 'tool', `${call.toolName} 已执行 · ${JSON.stringify(value).slice(0, 1000)}`); this.save(task);
              if (controller.signal.aborted) return;
            } catch {
              task = this.store.get(id);
              if (task.effectStarted) { task.status = task.status === 'cancelled' ? 'cancelled' : 'awaiting_reconciliation'; this.save(task); return; }
              this.toolResult(task, call, 'Action failed or target changed. No approval carries forward.', true); this.save(task);
            }
            continue;
          }
          if (call.toolName === 'writeArtifact') {
            if (task.approval?.id !== call.toolCallId) {
              try { task.approval = approvalFor(id, call.toolCallId, call.input); }
              catch { this.toolResult(task, call, 'Invalid artifact payload', true); this.save(task); continue; }
              this.save(task);
            }
            if (task.approval.state === 'pending' && task.fileMode === 'snapshot') { task.approval.state = 'approved'; this.save(task); }
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
              let value: unknown;
              if (call.toolName === 'listSkills') value = this.services.skills?.catalog() ?? [];
              else if (call.toolName === 'loadSkill') {
                const { id: skillId } = z.object({ id: z.string().max(64) }).strict().parse(call.input);
                if (!this.services.skills) throw new Error('No skills installed');
                value = this.services.skills.load(skillId); task.loadedSkills ??= []; task.loadedSkills.push(skillId);
              } else if (call.toolName === 'readSkillFile') {
                const input = z.object({ id: z.string().max(64), path: z.string().max(1024) }).strict().parse(call.input);
                if (!this.services.skills) throw new Error('No skills installed');
                value = await this.services.skills.read(input.id, input.path);
              } else value = await readTool(task.root, call.toolName, call.input);
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
        await this.compact(task, controller.signal);
        if (controller.signal.aborted || this.stopped) return;
        task = this.store.get(id);
        task.context = { compactions: task.compactions?.length ?? 0, estimatedTokens: estimateTokens(projectedMessages(task)), keptFrom: task.compactions?.at(-1)?.keptFrom ?? 0 };
        const step = await this.invoke(task, projectedMessages(task), controller.signal, 'turn');
        if (controller.signal.aborted || this.stopped) return;
        task = this.store.get(id);
        const prior = new Set(task.messages.flatMap(message => message.role === 'assistant' && Array.isArray(message.content)
          ? message.content.filter(part => part.type === 'tool-call').map(part => part.toolCallId) : []));
        const fresh = new Set(step.calls.map(call => call.toolCallId));
        if (step.calls.length > 16 || fresh.size !== step.calls.length ||
          step.calls.some(call => prior.has(call.toolCallId) || !call.toolCallId || call.toolCallId.length > 128)) throw new Error('Model returned repeated or excessive tool calls');
        // Persist the model output and pending intents before executing any tools.
        task.steps++; task.messages.push(...step.messages); task.pending = step.calls;
        if (step.reasoning) this.event(task, 'reasoning', step.reasoning);
        if (step.text) this.event(task, 'assistant', step.text);
        if (!step.calls.length) {
          if (!step.text.trim()) throw new Error('Model returned no answer or tool calls');
          if (task.queuedInput?.some(item => item.mode === 'steer')) { this.save(task); continue; }
          task.status = 'completed'; this.event(task, 'system', '任务已完成。'); this.save(task);
          const next = task.queuedInput?.find(item => item.mode === 'followup');
          if (next) {
            const child = this.fork(task, next.text);
            child.queuedInput = task.queuedInput?.filter(item => item.id !== next.id);
            this.store.saveContinuation(next.id, child); this.changed();
          }
          return;
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
