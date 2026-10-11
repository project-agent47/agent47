import type { AgentBridge, TaskView, ProviderView, CreateInput } from '../shared/contracts';
import { answerSummary, parseQuestions, validateAnswers } from '../shared/questions';
import { previewWorkspace } from './workspace-preview';
import { pageMessage } from '../shared/web-capture';
import type { PageCapture } from '../shared/contracts';

const demoQuestions = parseQuestions({ questions: [
  { id: 'audience', header: '受众', prompt: '这份报告面向谁？', type: 'single', options: [{ id: 'team', label: '研发团队', description: '强调技术与实现' }, { id: 'management', label: '管理层', description: '强调目标与风险' }] },
  { id: 'topics', header: '内容', prompt: '你希望包含哪些内容？可以多选并补充。', type: 'multiple', options: [{ id: 'plan', label: '实施计划' }, { id: 'tests', label: '验收测试' }] },
  { id: 'notes', header: '补充', prompt: '还有什么需要补充？这道题可以跳过。', type: 'text', required: false }
] }).questions;

const now = new Date().toISOString();
const sampleContent = '# Agent47 桌面改造清单\n\n## 第一批闭环\n\n- 使用 AI SDK 接入真实模型\n- 用目标驱动的工具循环替代固定阶段\n- 仅允许读取明确授权的项目目录\n- 写入前展示完整成果内容，并确认权限\n- 记录任务检查点和可追溯的执行事件\n\n## 后续验收\n\nWindows / macOS 安装、系统密钥存储和原生自动化需要分别验证。\n';
const samples: TaskView[] = [{
  id: 'preview-review', goal: '整理 Agent47 桌面改造清单，生成一份可审阅的 Markdown', skill: 'deliver',
  root: '~/Projects/agent47', status: 'awaiting_approval', createdAt: now, updatedAt: now, steps: 3,
  artifacts: [], approval: { id: 'preview-action', name: 'desktop-checklist.md', content: sampleContent, digest: 'preview-digest', expiresAt: new Date(Date.now() + 86400_000).toISOString(), state: 'pending' },
  events: [
    { id: 'a1', at: now, kind: 'user', text: '整理 Agent47 桌面改造清单，生成一份可审阅的 Markdown' },
    { id: 'a2', at: now, kind: 'assistant', text: '我会先梳理最小桌面闭环，再把平台能力和后续验收分开。清单只记录本轮的范围，不将尚未接入的能力标记为完成。' },
    { id: 'a3', at: now, kind: 'tool', text: 'readFile · {"path":"README.md"}（示例事件）' },
    { id: 'a4', at: now, kind: 'assistant', text: '清单已整理为一个 Markdown 草稿。确认内容后，我会将它放入成果库；不会改动项目中的原始文件。' },
    { id: 'a5', at: now, kind: 'system', text: '等待审阅 desktop-checklist.md 的完整内容。' }
  ]
}, {
  id: 'preview-answer', goal: '解释任务审批与固定 workflow 有什么区别', skill: 'general',
  status: 'completed', createdAt: now, updatedAt: now, steps: 1, artifacts: [],
  events: [
    { id: 'b1', at: now, kind: 'user', text: '解释任务审批与固定 workflow 有什么区别' },
    { id: 'b2', at: now, kind: 'assistant', text: '固定 workflow 预先决定每个任务经过哪些阶段。按动作审批只在即将执行需要权限的操作时暂停，绑定具体对象与内容。\n\n直接回答不需要走研究、审批和打包；只有要保存成果时，才展示文件名与完整内容，请你确认。任务步骤由目标和工具结果决定，而不是由页面预设。' },
    { id: 'b3', at: now, kind: 'system', text: '任务已完成。（交互示例）' }
  ]
}];
const listeners = new Set<() => void>();
const clone = <T,>(value: T): T => structuredClone(value);
const emit = () => listeners.forEach(listener => listener());
const provider: ProviderView = { baseURL: 'https://opencode.ai/zen/go/v1', model: 'deepseek-v4.1-flash', configured: false, secureStorage: false };
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let previewExecution = { hostExecution: false, fileMode: 'snapshot' as 'snapshot' | 'ask' };
let previewRetention: 0 | 7 | 30 | 90 = 0;
const pageCaptures = new Map<string, PageCapture>();
const previewBridge: AgentBridge = {
  preview: true,
  workspaceView: previewWorkspace.view,
  workspaceOpen: input => previewWorkspace.open(input, samples),
  workspaceImport: previewWorkspace.import,
  workspaceUpdate: previewWorkspace.update,
  workspaceRefresh: previewWorkspace.refresh,
  workspaceSystemOpen: async () => {},
  workspaceLayout: async () => {},
  workspaceWebOpen: previewWorkspace.web,
  workspaceCapture: async input => {
    const tab = (await previewWorkspace.view()).tabs.find(t => t.id === input.tabId);
    if (tab?.kind !== 'web') throw new Error('请选择网页。');
    const snapshot = { ...input, id: crypto.randomUUID(), url: tab.url!, title: '示例网页', content: '这是公共网页正文的交互示例。PREVIEW_PAGE_OK。预览没有访问网页、读取 Cookie 或调用模型。', capturedAt: new Date().toISOString(), digest: '0'.repeat(64), truncated: false };
    pageCaptures.set(snapshot.id, snapshot); return snapshot;
  },
  workspaceSendCapture: async input => {
    const snapshot = pageCaptures.get(input.id); if (!snapshot || snapshot.digest !== input.digest) throw new Error('请重新审阅页面。');
    return previewBridge.sendMessage({ taskId: snapshot.taskId, text: pageMessage(snapshot), mode: 'queue', clientMessageId: input.clientMessageId });
  },
  listTasks: async () => clone(samples),
  createTask: async (input: CreateInput) => {
    const at = new Date().toISOString();
    const task: TaskView = {
      id: crypto.randomUUID(), goal: input.goal, skill: input.skill, root: input.folderGrant ? '~/Projects/preview' : undefined,
      status: 'running', createdAt: at, updatedAt: at, steps: 0, artifacts: [], fileMode: previewExecution.fileMode, hostMode: 'ask',
      events: [{ id: crypto.randomUUID(), at, kind: 'user', text: input.goal }]
    };
    samples.unshift(task); emit();
    if (input.goal.includes('多题演示')) {
      task.status = 'awaiting_input'; task.steps = 1;
      task.question = { id: crypto.randomUUID(), text: '多题交互示例', questions: clone(demoQuestions), revision: 1, digest: '0'.repeat(64), legacy: false };
      emit(); return clone(task);
    }
    timers.set(task.id, setTimeout(() => {
      if (task.status !== 'running') return;
      task.status = 'completed'; task.steps = 1;
      task.events.push({ id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'assistant',
        text: '这是交互预览，没有调用模型或读取文件。\n\n桌面应用会把你的目标交给已配置的模型，由模型选择必要的工具。当提出写入成果时，应用会暂停并展示完整内容，等待你的确认。你可以打开左侧待审阅的示例任务，体验完整审批流程。' });
      for (const input of task.queuedInput ?? []) task.events.push({ id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'user', text: input.text });
      if (task.queuedInput?.length) task.events.push({ id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'assistant', text: '队列已在示例响应边界合并发送。本预览不调用模型，也不执行工具。' });
      task.queuedInput = [];
      timers.delete(task.id); emit();
    }, 3000));
    return clone(task);
  },
  cancelTask: async id => {
    const task = samples.find(t => t.id === id)!;
    clearTimeout(timers.get(id)); timers.delete(id);
    task.status = 'cancelled';
    task.events.push({ id: crypto.randomUUID(), at: now, kind: 'system', text: '示例任务已停止。' }); emit();
  },
  sendMessage: async input => {
    const parent = samples.find(t => t.id === input.taskId)!;
    parent.composerDraft = '';
    if (['running', 'queued', 'awaiting_approval', 'awaiting_input'].includes(parent.status)) {
      parent.queuedInput ??= []; parent.queuedInput.push({ id: input.clientMessageId, text: input.text, mode: input.mode }); emit(); return clone(parent);
    }
    const task: TaskView = { ...clone(parent), id: crypto.randomUUID(), goal: input.text, conversationId: parent.conversationId ?? parent.id, parentRunId: parent.id, runNumber: (parent.runNumber ?? 1) + 1,
      status: 'completed', approval: undefined, artifacts: [], steps: 1, usage: [], events: [...parent.events,
        { id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'user', text: input.text },
        { id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'assistant', text: '## 继续讨论\n\n这是**多轮交互示例**，没有调用模型。\n\n| 能力 | 状态 |\n|---|---|\n| Markdown | 示例渲染 |\n| 工具 | 不执行 |' }] };
    samples.unshift(task); emit(); return clone(task);
  },
  manageQueue: async input => {
    const task = samples.find(t => t.id === input.taskId)!;
    const item = task.queuedInput?.find(entry => entry.id === input.messageId);
    if (!item) throw new Error('消息已发送或删除。');
    task.queuedInput = task.queuedInput!.filter(entry => entry.id !== item.id);
    if (input.action === 'send') { task.events.push({ id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'user', text: item.text }); task.status = 'completed'; task.question = undefined; if (task.approval) task.approval.state = 'denied'; }
    emit(); return clone(task);
  },
  saveQuestionDraft: async input => {
    const task = samples.find(t => t.id === input.taskId)!;
    if (!task.question || task.question.id !== input.questionId || (task.question.draft?.version ?? 0) !== input.expectedVersion) throw new Error('请刷新问题草稿。');
    const answers = validateAnswers(task.question.questions!, input.answers, false);
    task.question.draft = { answers, step: input.step, version: input.expectedVersion + 1 }; emit(); return clone(task.question.draft);
  },
  respondQuestion: async input => {
    const task = samples.find(t => t.id === input.taskId)!;
    if (task.status !== 'awaiting_input' || task.question?.id !== input.questionId) throw new Error('本次提问已结束。');
    const text = input.result === 'cancel' ? '用户取消本次提问。' : answerSummary(task.question.questions!, validateAnswers(task.question.questions!, input.answers));
    task.events.push({ id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'user', text },
      { id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'assistant', text: '这是结构化回答示例，未调用模型或授予额外权限。' });
    task.question = undefined; task.status = 'completed'; emit(); return clone(task);
  },
  saveComposerDraft: async input => { const task = samples.find(t => t.id === input.taskId)!; task.composerDraft = input.text; emit(); },
  resolveUnknown: async () => {},
  listSkills: async () => [],
  previewSkill: async () => { throw new Error('预览不读取本机 skill 包，请在桌面应用中导入。'); },
  installSkill: async () => { throw new Error('预览不安装 skill。'); },
  setSkill: async () => {},
  removeSkill: async () => {},
  setWebOrigins: async input => { const task = samples.find(t => t.id === input.taskId)!; task.webOrigins = input.origins; emit(); },
  executionSettings: async () => clone(previewExecution),
  setExecutionSettings: async input => { previewExecution = { hostExecution: input.hostExecution ?? previewExecution.hostExecution, fileMode: input.fileMode ?? previewExecution.fileMode }; emit(); },
  setTaskPermissions: async input => {
    const task = samples.find(t => t.id === input.taskId)!;
    task.fileMode = input.fileMode; task.hostMode = input.hostMode; emit();
  },
  restoreFile: async () => { throw new Error('预览没有真实文件快照；请在桌面应用中恢复。'); },
  undoRun: async () => { throw new Error('预览没有真实文件改动；请在桌面应用中撤销。'); },
  snapshotSettings: async () => ({ retentionDays: previewRetention, count: 0, bytes: 0, storagePath: '预览示例：应用数据目录/snapshots（不读写本机）' }),
  setSnapshotRetention: async days => { previewRetention = days; },
  cleanSnapshots: async () => ({ cleaned: 0, errors: 0 }),
  decide: async input => {
    const task = samples.find(t => t.id === input.taskId)!;
    if (!task.approval || task.approval.state !== 'pending') throw new Error('此审批已结束。');
    task.approval.state = input.approve ? 'applied' : 'denied';
    if (input.scope === 'files') task.fileMode = 'snapshot';
    if (input.scope === 'host') task.hostMode = 'allow';
    task.status = 'completed';
    if (input.approve) task.artifacts.push({ id: task.approval.id, name: task.approval.name, content: task.approval.content, sha256: 'preview-only' });
    task.events.push({ id: crypto.randomUUID(), at: now, kind: 'assistant', text: input.approve ? '已将示例成果加入预览成果库。未写入任何真实文件。' : '已拒绝这次示例写入。没有创建文件。' }); emit();
  },
  chooseFolder: async () => ({ id: 'preview-folder', path: '~/Projects/preview（示例目录）', fileMode: previewExecution.fileMode }),
  provider: async () => clone(provider),
  saveProvider: async () => { throw new Error('预览不接收或保存真实凭据。请在桌面应用中配置。'); },
  testProvider: async () => '交互预览不会请求模型。真实 API 验证结果请查看本轮交付说明。',
  openArtifact: async ({ taskId, artifactId }) => {
    const artifact = samples.find(t => t.id === taskId)?.artifacts.find(a => a.id === artifactId);
    if (!artifact) return;
    const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = artifact.name;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  onChange: callback => { listeners.add(callback); return () => listeners.delete(callback); }
};
export const bridge = window.agent47 ?? previewBridge;
