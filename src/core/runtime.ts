import { randomUUID } from 'node:crypto';
import type { ModelMessage } from 'ai';
import { TaskStore, publicTask, type TaskRecord, type ToolCall } from './store';
import { readTool, approvalFor, applyArtifact, sha256 } from './tools';
import type { ModelDriver } from './model';
import type { SkillId, TaskView, RunUndo, UserQuestion, QuestionDraftInput, QuestionReply } from '../shared/contracts';
import { parseQuestions, validateAnswers, answerSummary } from '../shared/questions';
import { z } from 'zod';
import { effectNames, prepareEffect, applyProjectWrite, effectDigest, type HostExecutor } from './effects';
import { projectedMessages, compactionCut, estimateTokens } from './context';
import type { ModelContext, ModelStep } from './model';
import type { FileSnapshots } from './snapshots';
import { relative, isAbsolute, sep, resolve } from 'node:path';
import { browserReadNames, browserEffectNames } from '../shared/browser-tools';
import type { Approval } from '../shared/contracts';
import { materialMessage, readMaterial, validateMaterialSnapshot, type MaterialSnapshot } from './materials';
import { captureEvidence, evidenceView, validateEvidence, evidenceReadInput, readArchivedEvidence } from './evidence';
import { inputKey, recordObservation } from './progress';
import { bindArtifactEvidence } from './artifact-evidence';

export interface RuntimeServices {
  projectContext?: (task: TaskRecord) => TaskView['projectContext'];
  fileAuthorized?: (task: TaskRecord) => boolean;
  hostEnabled?: () => boolean; executeHost?: HostExecutor;
  skills?: { catalog(): unknown[]; load(id: string, hash?: string): unknown; read(id: string, path: string, hash?: string): Promise<unknown> };
  contextThreshold?: number;
  executionWindow?: number;
  fileMode?: () => 'snapshot' | 'ask'; snapshots?: FileSnapshots;
  readWeb?: (url: string, origins: string[], signal: AbortSignal) => Promise<unknown>;
  browser?: {
    tabs(taskId: string): unknown[];
    read(taskId: string, name: string, input: unknown, signal: AbortSignal): Promise<unknown>;
    prepare(taskId: string, call: ToolCall): Promise<Approval>;
    validate(taskId: string, action: Approval): boolean;
    execute(taskId: string, action: Approval, signal: AbortSignal): Promise<unknown>;
  };
}

const terminal = new Set(['completed', 'failed', 'cancelled']);
function overlappingRoots(a: string, b: string): boolean {
  const inside = (parent: string, child: string) => {
    const path = relative(parent, child);
    return !isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep);
  };
  return inside(a, b) || inside(b, a);
}
export class TaskRuntime {
  private active = new Map<string, AbortController>();
  private draining = false;
  private stopped = false;
  private drafts = new Map<string, { text: string; reasoning: string }>();
  private restoringRoots = new Set<string>();
  private modelControllers = new Map<string, AbortController>();
  private interrupted = new Set<string>();
  constructor(readonly store: TaskStore, private model: ModelDriver, private artifactRoot: string, private changed: () => void = () => {}, private services: RuntimeServices = {}) {}
  start(): void {
    const records = this.store.list();
    const titles = new Map<string, string>();
    for (const t of [...records].reverse()) {
      const key = t.conversationId ?? t.id;
      if (!titles.has(key) || (t.runNumber ?? 1) === 1) titles.set(key, t.conversationTitle ?? t.goal.split('\n')[0].slice(0, 60));
    }
    for (const task of records) {
      if (!task.progress) { this.initProgress(task); this.save(task); }
      if (task.pauseRequested && task.status === 'queued') { this.enterPause(task, 'manual'); continue; }
      if (!task.conversationTitle) { task.conversationTitle = titles.get(task.conversationId ?? task.id); this.save(task); }
      // Additive checkpoint migration; preserve old tool-call identity and state.
      if (task.status === 'awaiting_input' && task.pending[0]?.toolName === 'askUser' && !task.question?.digest) {
        try { task.question = this.questionFor(task, task.pending[0]); }
        catch {
          this.toolResult(task, task.pending[0], 'Invalid saved question. Ask again with a valid format.', true);
          task.question = undefined; task.status = 'queued';
        }
        this.save(task);
      }
      if (task.undo?.state === 'running') {
        task.undo.state = 'partial'; this.event(task, 'system', '整轮撤销被重启中断；已恢复项保留，请检查后重试，不自动继续。'); this.save(task);
      }
      let changedUsage = false;
      for (const usage of task.usage ?? []) if (usage.state === 'pending') { usage.state = 'unknown'; changedUsage = true; }
      if (changedUsage) this.save(task);
      if (task.status === 'running') {
        task.status = task.effectStarted ? 'awaiting_reconciliation' : 'queued';
        if (task.pauseRequested && !task.effectStarted) { this.enterPause(task, 'manual'); continue; }
        this.event(task, 'system', task.effectStarted ? '工具执行结果未知。请检查本机或网页实际效果后确认，不会自动重放操作。' : '应用已重启，从已保存的检查点继续。'); this.save(task);
      }
    }
    this.kick();
  }
  private initProgress(task: TaskRecord): void {
    task.progress ??= { window: 1, windowStart: 0, windowSize: Math.max(1, Math.min(12, this.services.executionWindow ?? 12)), tools: 0, errors: 0 };
  }
  private enterPause(task: TaskRecord, reason: NonNullable<TaskView['pause']>['reason']): void {
    this.initProgress(task);
    const detail = reason === 'manual' ? '已在安全边界暂停。已开始的工具可能已完成，不回滚，也不会重放。'
      : reason === 'window' ? `本执行窗口已完成 ${task.progress!.windowSize} 个模型步骤；检查记录后可继续同一轮次。`
      : reason === 'errors' ? '连续 4 次工具错误。请检查权限、输入或连接，调整要求后再继续。'
      : '检测到重复工具输入／观察。请检查是否空转；继续不代表操作已成功或获得新权限。';
    task.pause = { reason, at: new Date().toISOString(), detail,
      resumeStatus: task.status === 'awaiting_approval' || task.status === 'awaiting_input' ? task.status : 'queued' };
    task.status = 'paused'; task.pauseRequested = false;
    this.event(task, 'system', detail); this.save(task);
  }
  pause(id: string): void {
    const task = this.store.get(id);
    if (task.status === 'paused' || task.pauseRequested) return;
    if (terminal.has(task.status) || task.status === 'awaiting_reconciliation' || task.effectStarted && !this.active.has(id)) throw new Error('请先检查未知效果；已结束任务不能暂停。');
    if (this.active.has(id)) {
      task.pauseRequested = true; this.save(task);
      // Only interrupt model inference. A dispatched tool is allowed to settle.
      this.modelControllers.get(id)?.abort();
    } else this.enterPause(task, 'manual');
  }
  resume(id: string): void {
    const task = this.store.get(id);
    if (task.status !== 'paused' || !task.pause || task.effectStarted || this.active.has(id)) throw new Error('请等待安全暂停完成，或先检查未知执行效果。');
    if (this.list().find(t => t.id === id)?.latestRunId !== id) throw new Error('请回到当前轮次继续。');
    this.initProgress(task);
    task.progress!.window++; task.progress!.windowStart = task.steps;
    task.progressGuard = { repeatedInputs: 0, repeatedObservations: 0, consecutiveErrors: 0 };
    task.status = task.pause.resumeStatus; task.pause = undefined; task.pauseRequested = false;
    this.event(task, 'system', '继续本轮检查点；历史步骤与用量累计保留，权限不变，已完成工具不重放。');
    this.save(task); this.kick();
  }
  list(): TaskView[] {
    const records = this.store.views(), latest = new Map<string, string>();
    for (const t of records) if (!latest.has(t.conversationId ?? t.id)) latest.set(t.conversationId ?? t.id, t.id);
    return records.map(task => ({ ...task, latestRunId: latest.get(task.conversationId ?? task.id), draft: this.drafts.get(task.id) }));
  }
  attachMaterial(id: string, material: MaterialSnapshot, replaceId?: string): TaskView {
    const task = this.store.get(id);
    if (this.list().find(t => t.id === id)?.latestRunId !== id) throw new Error('请回到当前轮次引用材料。');
    validateMaterialSnapshot(material);
    if (!replaceId && task.materials?.some(m => m.id === material.id)) {
      if (JSON.stringify(task.materialSnapshots?.[material.id]) !== JSON.stringify(material)) throw new Error('Immutable material version changed');
      return publicTask(task);
    }
    const existing = task.materials?.find(m => m.sha256 === material.sha256 && m.name === material.name && task.materialSnapshots?.[m.id]?.path === material.path && m.sourceTaskId === material.sourceTaskId && JSON.stringify(m.selection) === JSON.stringify(material.selection));
    if (existing) return publicTask(task);
    if (replaceId && !task.materials?.some(m => m.id === replaceId)) throw new Error('请重新选择材料。');
    if (!replaceId && (task.materials?.length ?? 0) >= 10) throw new Error('请先移除材料：最多选择 10 份。');
    if (Buffer.byteLength(material.content) > 1_000_000 || Object.values(task.materialSnapshots ?? {}).reduce((n, m) => n + m.bytes, 0) + material.bytes > 5_000_000)
      throw new Error('请使用较小材料：单份 1 MB，会话版本合计 5 MB。');
    task.materialSnapshots ??= {}; task.materialSnapshots[material.id] = material;
    const view = { id: material.id, name: material.name, sha256: material.sha256, bytes: material.bytes, capturedAt: material.capturedAt, source: material.source, frozen: material.frozen, sourceTaskId: material.sourceTaskId, sourceArtifactId: material.sourceArtifactId, selection: material.selection };
    task.materials = (task.materials ?? []).filter(m => m.id !== replaceId); task.materials.push(view); this.save(task); return publicTask(task);
  }
  removeMaterial(id: string, materialId: string): TaskView {
    const task = this.store.get(id);
    if (this.list().find(t => t.id === id)?.latestRunId !== id) throw new Error('请回到当前轮次修改材料选择。');
    task.materials = (task.materials ?? []).filter(m => m.id !== materialId);
    if (!task.authorizedMaterialIds?.includes(materialId) && !task.queuedInput?.some(q => q.materials?.some(m => m.id === materialId))) delete task.materialSnapshots?.[materialId];
    this.save(task); return publicTask(task);
  }
  create(goal: string, skill: SkillId, root?: string, fileMode?: 'snapshot' | 'ask', materials: MaterialSnapshot[] = [], binding?: { originProjectId?: string; rootProjectId?: string; rootProjectRevision?: number; projectContext?: TaskView['projectContext'] }): TaskView {
    if (root && [...this.restoringRoots].some(other => overlappingRoots(root, other))) throw new Error('请等待文件快照恢复完成。');
    if (!goal.trim() || goal.length > 12000) throw new Error('Task goal must contain 1–12000 characters');
    if (materials.length > 10 || materials.reduce((n, m) => n + m.bytes, 0) > 5_000_000 || materials.some(m => m.bytes > 1_000_000 || m.bytes !== Buffer.byteLength(m.content) || sha256(m.content) !== m.sha256)) throw new Error('请使用有效且总计不超过 5 MB 的材料版本。');
    const now = new Date().toISOString();
    const task: TaskRecord = {
      id: randomUUID(), goal: goal.trim(), skill, root, ...binding, status: 'queued', createdAt: now, updatedAt: now,
      events: [], artifacts: [], steps: 0, pending: [], messages: [{ role: 'user', content: materialMessage(goal.trim(), materials) }],
      usage: [], runNumber: 1, queuedInput: [], conversationTitle: goal.trim().split('\n')[0].slice(0, 60),
      fileMode: fileMode ?? this.services.fileMode?.() ?? 'ask', hostMode: 'ask', fileChanges: []
    };
    task.materialSnapshots = Object.fromEntries(materials.map(m => [m.id, m]));
    task.materials = materials.map(({ id, name, sha256, bytes, capturedAt, source, frozen, sourceTaskId, sourceArtifactId }) => ({ id, name, sha256, bytes, capturedAt, source, frozen, sourceTaskId, sourceArtifactId }));
    task.authorizedMaterialIds = materials.map(m => m.id);
    this.initProgress(task);
    this.event(task, 'user', task.goal, task.materials); this.save(task); this.kick();
    return publicTask(task);
  }
  send(id: string, text: string, mode: 'queue' | 'steer' | 'followup', commandId: string, instruction = false, materialIds: string[] = []): TaskView {
    if (!text.trim() || text.length > 12000) throw new Error('Invalid message');
    const prior = this.store.command(commandId);
    if (prior) return publicTask(this.store.get(prior));
    let task = this.store.get(id);
    const materials = materialIds.map(mid => {
      const m = task.materials?.find(m => m.id === mid);
      if (!m) throw new Error('请重新选择材料：引用列表已变化。');
      return m;
    });
    if (task.status === 'awaiting_input' && task.question?.legacy && !instruction && materials.length) throw new Error('请先回答当前问题，再发送材料。');
    if (task.root && [...this.restoringRoots].some(other => overlappingRoots(task.root!, other))) throw new Error('请等待文件快照恢复完成。');
    if (task.effectStarted && (task.status !== 'running' || !this.active.has(id))) throw new Error('Inspect unknown host effects before continuing');
    if (terminal.has(task.status)) {
      const latest = this.store.list().find(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id));
      if (latest?.id !== id) throw new Error('Conversation already continued; open the latest run');
      const parent = task;
      const hadQueue = !!parent.queuedInput?.length, hadDraft = !!parent.composerDraft;
      if (hadDraft) parent.composerDraft = '';
      task = this.fork(parent, text, true, materials); if (hadQueue) parent.queuedInput = [];
      this.store.saveCommand(commandId, task, hadQueue || hadDraft ? parent : undefined); this.changed(); this.kick(); return publicTask(task);
    }
    if (task.status === 'awaiting_reconciliation') throw new Error('Inspect unknown host effects before continuing');
    if (task.status === 'paused' && task.pause?.resumeStatus === 'awaiting_input' && task.question?.legacy && !instruction)
      throw new Error('请先继续本轮，再回答当前问题。');
    if (task.status === 'awaiting_input' && task.pending[0]?.toolName === 'askUser' && task.question?.legacy && !instruction) {
      this.toolResult(task, task.pending[0], { answer: text.trim(), fromUser: true });
      task.question = undefined; task.status = 'queued'; this.event(task, 'user', text.trim());
    } else {
      if ((task.queuedInput?.length ?? 0) >= 32) throw new Error('Task queue full: remove or deliver pending messages first');
      task.queuedInput ??= []; task.queuedInput.push({ id: commandId, text: text.trim(), mode, materials });
      if (['awaiting_approval', 'awaiting_input'].includes(task.status) && mode === 'steer') {
        if (task.approval) task.approval.state = 'denied';
        task.status = 'queued'; task.question = undefined;
      }
      if (task.status === 'paused' && mode === 'steer' && task.pause) {
        task.pause.resumeStatus = 'queued'; task.question = undefined;
        if (task.approval) task.approval.state = 'denied';
      }
    }
    task.composerDraft = '';
    this.store.saveCommand(commandId, task);
    if (mode === 'steer') this.interruptModel(id);
    this.changed(); this.kick(); return publicTask(task);
  }
  private interruptModel(id: string): void {
    const controller = this.modelControllers.get(id);
    if (controller) { this.interrupted.add(id); controller.abort(); }
  }
  manageQueue(id: string, messageId: string, action: 'delete' | 'send'): TaskView {
    const task = this.store.get(id);
    const item = task.queuedInput?.find(input => input.id === messageId);
    if (!item) throw new Error('Task not queued: message was already delivered or removed');
    if (action === 'delete') {
      task.queuedInput = task.queuedInput!.filter(input => input.id !== messageId); this.save(task); return publicTask(task);
    }
    if (task.status === 'awaiting_reconciliation' || (task.effectStarted && (task.status !== 'running' || !this.active.has(id)))) throw new Error('请先检查未知执行效果。');
    if (terminal.has(task.status)) {
      const latest = this.store.list().find(t => (t.conversationId ?? t.id) === (task.conversationId ?? task.id));
      if (latest?.id !== id) throw new Error('Task not latest: open latest run');
      const child = this.fork(task, item.text, false, item.materials);
      // Stopped queues are carried, never silently dispatched on restart.
      child.queuedInput = task.queuedInput!.filter(input => input.id !== messageId);
      child.queueAfterStep = 1;
      task.queuedInput = []; this.store.saveContinuation(messageId, child, task); this.changed(); this.kick(); return publicTask(child);
    }
    item.mode = 'steer';
    if (task.status === 'awaiting_approval' || task.status === 'awaiting_input') {
      task.status = 'queued'; task.question = undefined;
      if (task.approval) task.approval.state = 'denied';
    }
    if (task.status === 'paused' && task.pause) {
      task.pause.resumeStatus = 'queued'; task.question = undefined;
      if (task.approval) task.approval.state = 'denied';
    }
    this.save(task); this.interruptModel(id); this.kick(); return publicTask(task);
  }
  setPermissions(id: string, fileMode: 'snapshot' | 'ask', hostMode: 'ask' | 'allow'): void {
    const task = this.store.get(id);
    if (hostMode === 'allow' && (!task.root || !this.services.hostEnabled?.())) throw new Error('请先选择项目目录，并在工具设置启用本机执行。');
    if (fileMode === 'snapshot' && !this.services.snapshots) throw new Error('Snapshot service unavailable');
    task.fileMode = fileMode; task.hostMode = hostMode;
    this.event(task, 'system', `工具权限：文件 ${fileMode === 'snapshot' ? '自动备份并修改' : '逐次确认'}；本机执行 ${hostMode === 'allow' ? '本次对话免确认（非沙箱）' : '逐次确认'}。`);
    if (task.status === 'awaiting_approval') task.status = 'queued';
    if (task.status === 'paused' && task.pause?.resumeStatus === 'awaiting_approval') task.pause.resumeStatus = 'queued';
    this.save(task); this.kick();
  }
  setWebOrigins(id: string, origins: string[]): void {
    const task = this.store.get(id); task.webOrigins = [...new Set(origins)]; this.save(task);
  }
  browserPermissionsChanged(id: string): void {
    const task = this.store.get(id);
    if (task.status === 'awaiting_approval' && task.approval?.kind === 'browser') {
      // The broker invalidates the old snapshot/generation. Resume to produce a
      // stale-intent result, not silently approve it under the new scope.
      task.status = 'queued'; this.save(task); this.kick();
    }
    if (task.status === 'paused' && task.pause?.resumeStatus === 'awaiting_approval' && task.approval?.kind === 'browser') {
      task.pause.resumeStatus = 'queued'; this.save(task);
    }
  }
  private questionFor(task: TaskRecord, call: ToolCall): UserQuestion {
    const { questions, legacy } = parseQuestions(call.input);
    return { id: call.toolCallId, text: questions.map(q => q.prompt).join('\n'), questions, legacy, revision: 1,
      digest: sha256(JSON.stringify({ taskId: task.id, callId: call.toolCallId, questions, legacy, revision: 1 })) };
  }
  private pendingQuestion(input: { taskId: string; questionId: string; revision: number; digest: string }) {
    const task = this.store.get(input.taskId), call = task.pending[0];
    if (task.status !== 'awaiting_input' || call?.toolName !== 'askUser') throw new Error('请刷新：本次提问已结束或作废。');
    const expected = this.questionFor(task, call), question = task.question;
    if (!question || question.id !== input.questionId || question.revision !== input.revision || question.digest !== input.digest ||
      expected.digest !== input.digest || JSON.stringify(question.questions) !== JSON.stringify(expected.questions)) throw new Error('请刷新：提问版本不匹配。');
    return { task, call, question };
  }
  saveQuestionDraft(input: QuestionDraftInput) {
    const { task, question } = this.pendingQuestion(input);
    const answers = validateAnswers(question.questions!, input.answers, false);
    if (!Number.isInteger(input.step) || input.step < 0 || input.step > question.questions!.length) throw new Error('Invalid question step');
    if ((question.draft?.version ?? 0) !== input.expectedVersion) {
      if (question.draft?.version === input.expectedVersion + 1 && question.draft.step === input.step &&
        JSON.stringify(question.draft.answers) === JSON.stringify(answers)) return question.draft;
      throw new Error('请刷新：回答草稿已被其他操作更新。');
    }
    question.draft = { answers, step: input.step, version: input.expectedVersion + 1 }; this.save(task); return question.draft;
  }
  respondQuestion(input: QuestionReply): TaskView {
    const receipt = sha256(JSON.stringify(input));
    const prior = this.store.command(input.clientCommandId);
    if (prior) {
      const task = this.store.get(prior);
      if (prior !== input.taskId || task.questionReceipts?.[input.clientCommandId] !== receipt) throw new Error('请使用新的提交编号：旧编号对应不同操作。');
      return publicTask(task);
    }
    const { task, call, question } = this.pendingQuestion(input);
    if (!['answers', 'cancel'].includes(input.result)) throw new Error('Invalid question result');
    const answers = input.result === 'answers' ? validateAnswers(question.questions!, input.answers) : [];
    if (input.result === 'cancel' && input.answers.length) throw new Error('Invalid cancelled answer');
    const summary = input.result === 'cancel' ? '用户取消本次提问。' : answerSummary(question.questions!, answers);
    this.toolResult(task, call, input.result === 'cancel' ? { cancelled: true, fromUser: true } :
      question.legacy ? { answer: answers[0].customText!, fromUser: true } : { answers, summary, fromUser: true });
    task.question = undefined; task.status = 'queued';
    // A normal queue cannot silently replace the human's just-submitted decision.
    task.inputBoundary = false; task.queueAfterStep = task.steps + 1;
    task.questionReceipts ??= {}; task.questionReceipts[input.clientCommandId] = receipt;
    this.event(task, 'user', summary);
    this.store.saveCommand(input.clientCommandId, task); this.changed(); this.kick(); return publicTask(task);
  }
  saveComposerDraft(id: string, text: string): void {
    if (text.length > 12000) throw new Error('Invalid composer draft');
    const task = this.store.get(id); task.composerDraft = text; this.save(task);
  }
  async fileDiff(id: string, snapshotId: string) {
    const task = this.store.get(id);
    if (!task.fileChanges?.some(c => c.id === snapshotId && c.state !== 'cleaned') || !this.services.snapshots) throw new Error('请使用本轮可查看的文件改动。');
    return this.services.snapshots.diff(id, snapshotId);
  }
  evidence(id: string, sourceId: string) {
    const source = this.store.get(id).evidenceSnapshots?.[sourceId];
    if (!source) throw new Error('没有本次对话实际读取的来源记录。');
    validateEvidence(source); return source;
  }
  async restoreFile(id: string, snapshotId: string): Promise<void> {
    const task = this.store.get(id);
    if (!task.root || [...this.restoringRoots].some(other => overlappingRoots(task.root!, other)) || !terminal.has(task.status) || task.effectStarted || this.active.has(id) ||
      this.store.list().some(other => other.root && overlappingRoots(other.root, task.root!) &&
        (!terminal.has(other.status) || other.effectStarted || this.active.has(other.id)))) throw new Error('请先停止或完成此项目的所有任务，再恢复文件。');
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
    this.toolResult(task, task.pending[0], 'Previous execution outcome is unknown. User inspected the effects; this does not verify success. Never replay the operation automatically.', true);
    task.effectStarted = undefined; if (task.status !== 'cancelled') task.status = 'queued';
    this.event(task, 'system', '已人工检查未知效果，不代表操作成功；原操作不会重放。'); this.save(task); this.kick();
  }
  private lockProject(task: TaskRecord): string {
    if (!task.root || [...this.restoringRoots].some(root => overlappingRoots(root, task.root!)) ||
      this.store.list().some(other => other.root && overlappingRoots(other.root, task.root!) &&
        (!terminal.has(other.status) || other.effectStarted || this.active.has(other.id)))) throw new Error('请先停止或完成此项目的所有任务，再执行恢复或清理。');
    this.restoringRoots.add(task.root); return task.root;
  }
  async undoRun(id: string): Promise<RunUndo> {
    if (!this.services.snapshots) throw new Error('Snapshot service unavailable');
    const initial = this.store.get(id), root = this.lockProject(initial);
    const undo: RunUndo = { state: 'running', restored: 0, conflicts: [], startedAt: new Date().toISOString() };
    initial.undo = undo; this.save(initial);
    const blocked = new Set<string>();
    try {
      for (const change of [...(initial.fileChanges ?? [])].reverse()) {
        const canonical = resolve(root, change.path);
        const target = ['win32', 'darwin'].includes(process.platform) ? canonical.toLowerCase() : canonical;
        if (change.state === 'cleaned' && change.cleanedFrom !== 'restored') {
          blocked.add(target); undo.conflicts.push({ path: change.path, error: 'Snapshot backup was cleaned; cannot undo this change.' }); continue;
        }
        if (change.state !== 'saved') continue;
        if (blocked.has(target)) continue;
        try {
          await this.services.snapshots.restore(id, change.id);
          const current = this.store.get(id);
          current.fileChanges!.find(item => item.id === change.id)!.state = 'restored';
          undo.restored++; current.undo = structuredClone(undo); this.save(current);
        } catch (error) {
          blocked.add(target); undo.conflicts.push({ path: change.path, error: (error as Error).message });
        }
      }
      undo.state = undo.conflicts.length ? 'partial' : 'completed';
      const current = this.store.get(id); current.undo = undo;
      this.event(current, 'system', `本轮文件撤销：恢复 ${undo.restored} 项，冲突 ${undo.conflicts.length} 项；不是原子事务。`); this.save(current);
      const latest = this.store.list().find(other => (other.conversationId ?? other.id) === (initial.conversationId ?? initial.id))!;
      latest.messages.push({ role: 'user', content: `[Application notice: the user undid file changes from run ${initial.runNumber ?? 1}. Restored ${undo.restored}; conflicts: ${JSON.stringify(undo.conflicts)}. Read current files again; never replay old actions. Conversation history and host/remote effects were not reverted.]` }); this.save(latest);
      return undo;
    } finally { this.restoringRoots.delete(root); }
  }
  async snapshotStats(): Promise<{ count: number; bytes: number }> {
    let count = 0, bytes = 0;
    for (const task of this.store.list()) for (const change of task.fileChanges ?? []) {
      if (change.state === 'cleaned') continue;
      try {
        const info = await this.services.snapshots?.info(task.id, change.id);
        if (info && info.state !== 'cleaned') { count++; bytes += info.bytes; }
      } catch { /* Missing/invalid backup is not counted as usable or silently deleted. */ }
    }
    return { count, bytes };
  }
  async cleanSnapshots(days: number, now = Date.now()): Promise<{ cleaned: number; errors: number }> {
    if (![0, 7, 30, 90].includes(days)) throw new Error('Invalid retention');
    const result = { cleaned: 0, errors: 0 };
    if (!days || !this.services.snapshots) return result;
    for (const task of this.store.list()) {
      if (!task.root || !terminal.has(task.status) || Date.parse(task.updatedAt) > now - days * 86400_000) continue;
      let root: string;
      try { root = this.lockProject(task); } catch { continue; }
      try {
        for (const change of task.fileChanges ?? []) {
          if (change.state === 'cleaned') continue;
          try {
            await this.services.snapshots.purge(task.id, change.id);
            const current = this.store.get(task.id);
            const target = current.fileChanges!.find(item => item.id === change.id)!;
            target.cleanedFrom = target.state as 'saved' | 'restored'; target.state = 'cleaned'; this.save(current); result.cleaned++;
          } catch { result.errors++; }
        }
      } finally { this.restoringRoots.delete(root); }
    }
    return result;
  }
  private fork(parent: TaskRecord, text: string, includeQueued = false, materials: NonNullable<TaskView['materials']> = []): TaskRecord {
    const now = new Date().toISOString();
    const messages = structuredClone(parent.messages);
    for (const call of parent.pending) messages.push({ role: 'tool', content: [{ type: 'tool-result', toolCallId: call.toolCallId, toolName: call.toolName, output: { type: 'error-text', value: 'Prior run ended. This intent must not be replayed.' } }] });
    if (includeQueued) for (const input of parent.queuedInput ?? []) messages.push({ role: 'user', content: materialMessage(input.text, input.materials) });
    messages.push({ role: 'user', content: materialMessage(text.trim(), materials) });
    const task: TaskRecord = {
      id: randomUUID(), goal: text.trim(), skill: parent.skill, root: parent.root, status: 'queued',
      createdAt: now, updatedAt: now, events: structuredClone(parent.events), artifacts: [], steps: 0, pending: [], messages,
      conversationId: parent.conversationId ?? parent.id, goalId: parent.goalId ?? parent.id, parentRunId: parent.id,
      runNumber: (parent.runNumber ?? 1) + 1, usage: [], queuedInput: [], compactions: structuredClone(parent.compactions ?? []),
      conversationTitle: parent.conversationTitle ?? parent.goal.split('\n')[0].slice(0, 60),
      materials: structuredClone(parent.materials ?? []), materialSnapshots: structuredClone(parent.materialSnapshots ?? {}),
      evidenceSnapshots: structuredClone(parent.evidenceSnapshots ?? {}), originProjectId: parent.originProjectId, rootProjectId: parent.rootProjectId, rootProjectRevision: parent.rootProjectRevision,
      projectContext: this.services.projectContext ? this.services.projectContext(parent) : structuredClone(parent.projectContext),
      authorizedMaterialIds: [...new Set([...(parent.authorizedMaterialIds ?? []), ...materials.map(m => m.id), ...(includeQueued ? (parent.queuedInput ?? []).flatMap(q => (q.materials ?? []).map(m => m.id)) : [])])],
      fileMode: parent.fileMode ?? 'ask', hostMode: parent.hostMode ?? 'ask', fileChanges: [], skillPins: structuredClone(parent.skillPins ?? {}), webOrigins: structuredClone(parent.webOrigins ?? [])
    };
    if (includeQueued) for (const input of parent.queuedInput ?? []) this.event(task, 'user', input.text, input.materials);
    this.initProgress(task);
    this.event(task, 'system', `开始第 ${task.runNumber} 轮执行；旧执行轮次保持不变。`);
    this.event(task, 'user', text.trim(), materials); return task;
  }
  cancel(id: string): void {
    const task = this.store.get(id);
    if (terminal.has(task.status)) throw new Error('Finished tasks cannot be cancelled or resumed');
    task.status = 'cancelled';
    task.pause = undefined; task.pauseRequested = false;
    task.question = undefined;
    if (task.approval?.state === 'pending') task.approval.state = 'denied';
    this.active.get(id)?.abort();
    this.event(task, 'system', '任务已停止。已保存的成果会保留。'); this.save(task);
  }
  decide(id: string, approvalId: string, digest: string, approve: boolean, scope?: 'files' | 'host', reason?: string): void {
    const task = this.store.get(id);
    const action = task.approval;
    if (task.status !== 'awaiting_approval' || !action || action.id !== approvalId || action.state !== 'pending' || action.digest !== digest) throw new Error('Approval is stale or does not match this task and payload');
    if (Date.parse(action.expiresAt) <= Date.now()) throw new Error('Approval expired. Stop this task and start a new one.');
    if ((action.kind ? effectDigest(id, action) : approvalFor(id, action.id, action).digest) !== digest) throw new Error('Approval payload changed');
    if (reason && reason.length > 2000) throw new Error('Invalid denial reason');
    if (scope) {
      if (!approve || (scope === 'host' && (!['shell', 'code'].includes(action.kind ?? '') || !task.root || !this.services.hostEnabled?.())) ||
        (scope === 'files' && ['shell', 'code', 'browser'].includes(action.kind ?? ''))) throw new Error('请检查授权范围与工具设置。');
      if (scope === 'files' && !this.services.snapshots) throw new Error('Snapshot service unavailable');
      if (scope === 'host') task.hostMode = 'allow'; else task.fileMode = 'snapshot';
      this.event(task, 'system', scope === 'host' ? '用户授权本次对话本机执行，免重复确认；不是安全沙箱。' : '用户授权本次对话文件自动快照，免逐文件确认。');
    }
    action.state = approve ? 'approved' : 'denied';
    task.status = 'queued';
    const verb = action.kind === 'project_write' ? '写入' : action.kind ? '执行' : '创建';
    this.event(task, 'system', approve ? `已批准${verb} ${action.name}。` : `已拒绝${verb} ${action.name}。`);
    if (!approve && reason?.trim()) {
      action.denialReason = reason.trim(); this.event(task, 'user', `拒绝原因：${reason.trim()}`);
    }
    task.inputBoundary = false; task.queueAfterStep = task.steps + 1;
    this.save(task); this.kick();
  }
  shutdown(): void {
    this.stopped = true;
    for (const controller of this.active.values()) controller.abort();
  }
  private event(task: TaskRecord, kind: TaskRecord['events'][number]['kind'], text: string, materials?: TaskView['materials']): void {
    task.events.push({ id: randomUUID(), at: new Date().toISOString(), kind, text, ...(materials?.length ? { materials: structuredClone(materials) } : {}) });
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
    this.initProgress(task); recordObservation(task, call, value, error);
    if (!error) value = captureEvidence(task, call, value);
    const message: ModelMessage = { role: 'tool', content: [{
      type: 'tool-result', toolCallId: call.toolCallId, toolName: call.toolName,
      output: error ? { type: 'error-text', value: String(value) } : { type: 'json', value: JSON.parse(JSON.stringify(value)) }
    }] };
    task.messages.push(message); task.pending.shift();
    task.inputBoundary = true;
  }
  private async invoke(task: TaskRecord, messages: import('ai').ModelMessage[], signal: AbortSignal, purpose: 'turn' | 'compaction'): Promise<ModelStep> {
    const id = randomUUID();
    task.usage ??= []; task.usage.push({ id, at: new Date().toISOString(), purpose, state: 'pending' });
    this.save(task);
    const draft = { text: '', reasoning: '' }; this.drafts.set(task.id, draft);
    const context: ModelContext = {
      projectContext: task.projectContext,
      purpose, hostExecution: this.services.hostEnabled?.() ?? false, fileMode: task.fileMode ?? 'ask', hostMode: task.hostMode ?? 'ask',
      catalog: JSON.stringify(this.services.skills?.catalog() ?? []), webOrigins: task.webOrigins ?? [],
      browserTabs: this.services.browser?.tabs(task.id) ?? [],
      sources: Object.values(task.evidenceSnapshots ?? {}).slice(-32).map(evidenceView),
      materials: (task.authorizedMaterialIds ?? []).map(id => {
        const m = task.materialSnapshots?.[id];
        return m ? { id, name: m.name, sha256: m.sha256, bytes: m.bytes, capturedAt: m.capturedAt, selection: m.selection, frozen: m.frozen } : undefined;
      }).filter(Boolean),
      onDelta: (kind, text) => {
        if (signal.aborted || this.stopped) return;
        if (purpose === 'turn') { draft[kind] = (draft[kind] + text).slice(0, 1_000_000); this.changed(); }
      }
    };
    const modelController = new AbortController(); this.modelControllers.set(task.id, modelController);
    try {
      const result = await this.model(messages, task.conversationId ?? task.id, AbortSignal.any([signal, modelController.signal]), task.skill, context);
      const current = this.store.get(task.id);
      const index = current.usage!.findIndex(item => item.id === id);
      current.usage![index] = { id, at: current.usage![index].at, purpose, ...(result.usage ?? { state: 'unknown' }) };
      this.save(current); return result;
    } catch (error) {
      const current = this.store.get(task.id);
      const usage = current.usage?.find(item => item.id === id);
      if (usage?.state === 'pending') { usage.state = 'unknown'; this.save(current); }
      throw error;
    } finally { this.modelControllers.delete(task.id); this.drafts.delete(task.id); this.changed(); }
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
        if (task.pauseRequested) { this.enterPause(task, 'manual'); return; }
        if (task.status === 'paused') return;
        const hasImmediate = task.queuedInput?.some(item => item.mode === 'steer');
        const queueBoundary = task.inputBoundary || (!task.pending.length && task.steps >= (task.queueAfterStep ?? 0));
        const steering = task.queuedInput?.filter(item => hasImmediate ? item.mode === 'steer' : item.mode === 'queue' && queueBoundary) ?? [];
        if (steering.length) {
          while (task.pending.length) this.toolResult(task, task.pending[0], 'User changed requirements; pending intent superseded. Do not execute it.', true);
          if (task.approval?.state === 'pending' || task.approval?.state === 'approved') task.approval.state = 'denied';
          for (const input of steering) {
            task.messages.push({ role: 'user', content: materialMessage(input.text, input.materials) });
            task.authorizedMaterialIds = [...new Set([...(task.authorizedMaterialIds ?? []), ...(input.materials ?? []).map(m => m.id)])];
            this.event(task, 'user', input.text, input.materials);
          }
          task.queuedInput = task.queuedInput?.filter(item => !steering.some(delivered => delivered.id === item.id));
          // Promoting one message must not promote the rest of the ordinary queue.
          task.queueAfterStep = hasImmediate ? task.steps + 1 : undefined;
          task.inputBoundary = false; this.save(task);
          task.progressGuard = { repeatedInputs: 0, repeatedObservations: 0, consecutiveErrors: 0 }; this.save(task);
        }
        if (task.progressGuard?.reason) { this.enterPause(task, task.progressGuard.reason); return; }
        if (task.pending.length) {
          const call = task.pending[0];
          if ((effectNames.has(call.toolName) || browserEffectNames.has(call.toolName) || call.toolName === 'writeArtifact') &&
            task.progressGuard?.input === inputKey(call) && task.progressGuard.repeatedInputs >= 2) {
            this.enterPause(task, 'repeated_tool'); return;
          }
          if (call.toolName === 'askUser') {
            try {
              task.question = this.questionFor(task, call); task.status = 'awaiting_input'; this.save(task); return;
            } catch { this.toolResult(task, call, 'Invalid question', true); this.save(task); continue; }
          }
          if (browserEffectNames.has(call.toolName)) {
            const browser = this.services.browser;
            try {
              if (!browser) throw new Error('Browser tools unavailable');
              if (task.approval?.id !== call.toolCallId) {
                const action = await browser.prepare(id, call);
                task = this.store.get(id);
                if (controller.signal.aborted || task.status === 'cancelled' || this.stopped) return;
                if (task.pauseRequested) continue;
                task.approval = action; this.save(task);
              }
              const action = task.approval!;
              if (action.state === 'denied') { this.toolResult(task, call, 'User denied browser action. Do not retry or use other tools to bypass.', true); this.save(task); continue; }
              const trusted = browser.validate(id, action);
              if (trusted && action.state === 'pending') { action.state = 'approved'; this.save(task); }
              if (action.state !== 'approved') { task.status = 'awaiting_approval'; this.save(task); return; }
              // Conservative durable dispatch fence. Never auto-replay a remote effect.
              task.effectStarted = call.toolCallId; this.save(task);
              const value = await browser.execute(id, action, controller.signal);
              if (this.stopped) return;
              task = this.store.get(id); task.effectStarted = undefined; task.approval!.state = 'applied';
              this.toolResult(task, call, value);
              this.event(task, 'tool', `${call.toolName} 已派发；业务效果需重新读取验证。`); this.save(task);
              if (controller.signal.aborted) return;
            } catch (error) {
              task = this.store.get(id);
              if (task.effectStarted) { task.status = task.status === 'cancelled' ? 'cancelled' : 'awaiting_reconciliation'; this.save(task); return; }
              if (controller.signal.aborted || this.stopped) return;
              this.toolResult(task, call, (error as Error).message, true); this.save(task);
            }
            continue;
          }
          if (effectNames.has(call.toolName)) {
            if (task.approval?.id !== call.toolCallId) {
              try {
                if (call.toolName !== 'writeArtifact' && this.services.fileAuthorized?.(task) === false) throw new Error('请重新授权项目目录，并在新会话执行；旧动作不能改换目标。');
                const approval = await prepareEffect(id, call, task.root, this.services.hostEnabled?.() ?? false);
                task = this.store.get(id); // Do not overwrite permission revocation or cancellation while path I/O awaited.
                if (task.status === 'cancelled') return;
                if (task.pauseRequested) continue;
                task.approval = approval;
              }
              catch (error) {
                if (controller.signal.aborted || this.stopped) return;
                task = this.store.get(id);
                this.toolResult(task, call, (error as Error).message, true); this.save(task); continue;
              }
              this.save(task);
            }
            const action = task.approval;
            if (action.state === 'denied') { this.toolResult(task, call, `User denied this action. Respect denial.${action.denialReason ? ` Reason: ${action.denialReason}` : ''}`, true); this.save(task); continue; }
            const autoFile = ['project_write', 'directory'].includes(action.kind ?? '') && task.fileMode === 'snapshot' && !!this.services.snapshots;
            const autoHost = ['shell', 'code'].includes(action.kind ?? '') && task.hostMode === 'allow' && !!this.services.hostEnabled?.();
            if (action.state === 'pending' && (autoFile || autoHost)) { action.state = 'approved'; this.save(task); }
            if (action.state !== 'approved') { task.status = 'awaiting_approval'; this.save(task); return; }
            if (effectDigest(id, action) !== action.digest) throw new Error('Approval payload changed');
            try {
              let value: unknown;
              if (call.toolName !== 'writeArtifact' && this.services.fileAuthorized?.(task) === false) throw new Error('请重新授权项目目录；旧动作不能继续派发。');
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
              const change = value as { snapshotId?: string; path?: string; sha256?: string };
              if (change?.snapshotId && !task.fileChanges?.some(item => item.id === change.snapshotId)) {
                task.fileChanges ??= []; task.fileChanges.push({ id: change.snapshotId, path: change.path!, state: 'saved', kind: action.kind as 'project_write' | 'directory',
                  ...(action.kind === 'project_write' ? { sha256: change.sha256, bytes: Buffer.byteLength(action.content) } : {}) });
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
              this.toolResult(task, call, `User denied this write. Respect the denial.${task.approval.denialReason ? ` Reason: ${task.approval.denialReason}` : ''}`, true);
            } else if (task.approval.state === 'approved') {
              // No renderer mutation is possible. Fence asynchronous side effects after cancellation.
              const artifact = await applyArtifact(this.artifactRoot, id, task.approval);
              const current = this.store.get(id);
              if (this.stopped) return; // Checkpoint still approved; replay verifies the same file.
              task = current;
              task.artifacts.push({ ...artifact, evidenceIds: bindArtifactEvidence(artifact.content, task.evidenceSnapshots) });
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
              if (browserReadNames.has(call.toolName)) {
                if (!this.services.browser) throw new Error('Browser tools unavailable');
                if (call.toolName === 'browserWait') {
                  this.event(task, 'system', '正在有界等待网页条件；可停止，等待结果不代表业务成功。'); this.save(task);
                }
                value = await this.services.browser.read(id, call.toolName, call.input, controller.signal);
              } else if (call.toolName === 'readWeb') {
                const { url } = z.object({ url: z.string().url().max(2048) }).strict().parse(call.input);
                if (!this.services.readWeb) throw new Error('Web reader unavailable');
                value = await this.services.readWeb(url, task.webOrigins ?? [], controller.signal);
                // Revocation while I/O is pending prevents content reaching the model.
                if (JSON.stringify(this.store.get(id).webOrigins ?? []) !== JSON.stringify(task.webOrigins ?? [])) throw new Error('Web access changed while reading');
              } else if (call.toolName === 'listSkills') value = this.services.skills?.catalog() ?? [];
              else if (call.toolName === 'loadSkill') {
                const { id: skillId } = z.object({ id: z.string().max(64) }).strict().parse(call.input);
                if (!this.services.skills) throw new Error('No skills installed');
                value = this.services.skills.load(skillId, task.skillPins?.[skillId]);
                const hash = (value as { hash?: string }).hash;
                if (hash) { task.skillPins ??= {}; task.skillPins[skillId] = hash; }
                task.loadedSkills ??= []; task.loadedSkills.push(skillId);
              } else if (call.toolName === 'readSkillFile') {
                const input = z.object({ id: z.string().max(64), path: z.string().max(1024) }).strict().parse(call.input);
                if (!this.services.skills) throw new Error('No skills installed');
                if (!task.skillPins?.[input.id]) throw new Error('Load skill before reading references');
                value = await this.services.skills.read(input.id, input.path, task.skillPins[input.id]);
              } else if (call.toolName === 'readEvidence') {
                const { id: sourceId } = evidenceReadInput.parse(call.input);
                const source = this.evidence(id, sourceId);
                value = readArchivedEvidence(source, call.input);
              } else if (call.toolName === 'readMaterial') value = readMaterial(task.materialSnapshots ?? {}, task.authorizedMaterialIds ?? [], call.input);
              else {
                if (this.services.fileAuthorized?.(task) === false) throw new Error('请重新授权项目目录，并使用新会话。');
                value = await readTool(task.root, call.toolName, call.input);
              }
              if (controller.signal.aborted || this.stopped) return;
              const loadedSkills = task.loadedSkills, skillPins = task.skillPins;
              task = this.store.get(id);
              if (loadedSkills) task.loadedSkills = [...new Set([...(task.loadedSkills ?? []), ...loadedSkills])];
              if (skillPins) task.skillPins = { ...task.skillPins, ...skillPins };
              this.toolResult(task, call, value);
              this.event(task, 'tool', `${call.toolName} · ${JSON.stringify(call.input)}`);
            } catch (error) {
              if (controller.signal.aborted || this.stopped) return;
              task = this.store.get(id);
              this.toolResult(task, call, String((error as Error).message), true);
              this.event(task, 'tool', `${call.toolName}：请求被拒绝或未能读取。`);
            }
          }
          this.save(task); continue;
        }
        this.initProgress(task);
        if (task.steps >= task.progress!.windowStart + task.progress!.windowSize) { this.enterPause(task, 'window'); return; }
        try { await this.compact(task, controller.signal); }
        catch (error) { if (this.interrupted.delete(id)) continue; throw error; }
        if (controller.signal.aborted || this.stopped) return;
        task = this.store.get(id);
        if (task.pauseRequested) { this.enterPause(task, 'manual'); return; }
        if (task.queuedInput?.some(item => item.mode === 'steer' || (item.mode === 'queue' && task.steps >= (task.queueAfterStep ?? 0)))) continue;
        task.inputBoundary = false;
        task.context = { compactions: task.compactions?.length ?? 0, estimatedTokens: estimateTokens(projectedMessages(task)), keptFrom: task.compactions?.at(-1)?.keptFrom ?? 0 };
        let step: ModelStep;
        try { step = await this.invoke(task, projectedMessages(task), controller.signal, 'turn'); }
        catch (error) { if (this.interrupted.delete(id)) continue; throw error; }
        this.interrupted.delete(id);
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
          if (task.queuedInput?.some(item => item.mode !== 'followup')) { this.save(task); continue; }
          if (task.pauseRequested) { this.enterPause(task, 'manual'); return; }
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
        if (task.pauseRequested && !task.effectStarted && task.status !== 'cancelled') { this.enterPause(task, 'manual'); return; }
        if (task.status !== 'cancelled') {
          task.status = 'failed';
          // Do not expose upstream response bodies, URLs, or credentials in renderer events.
          const message = (error as Error).message;
          const safe = /^(Configure a model|Model returned)/.test(message) ? message : '模型或工具执行失败。检查连接设置和权限后，新建任务重试。';
          this.event(task, 'error', safe); this.save(task);
        }
      }
    } finally { this.active.delete(id); this.interrupted.delete(id); }
  }
}
