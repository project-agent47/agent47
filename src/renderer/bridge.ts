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
const sampleSource = { id: 'sffffffffffffffff', uri: 'agent47-source:sffffffffffffffff', kind: 'material' as const, name: '示例材料.md',
  versionHash: 'a'.repeat(64), contentHash: 'b'.repeat(64), offset: 100, end: 165, observedAt: now, originRunId: 'preview-answer',
  tool: 'readMaterial', coverage: '示例摘录，不读取真实材料或调用模型。' };
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
  sources: [sampleSource],
  fileChanges: [{ id: 'e'.repeat(64), path: 'example.ts', state: 'saved', kind: 'project_write' }],
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
const preparedMaterials = new Map<string, import('../shared/contracts').MaterialView>();
const materialContents = new Map<string, string>();
samples[1].events.push({ id: 'source-demo', at: now, kind: 'assistant', text: '示例来源：[查看示例证据](agent47-source:sffffffffffffffff)。无法核对的标记会显示为 [未读取引用](agent47-source:s0000000000000000)，不会变成可点击来源。' });
const previewBridge: AgentBridge = {
  preview: true,
  openEvidence: async input => {
    const source = samples.find(t => t.id === input.taskId)?.sources?.find(s => s.id === input.sourceId);
    if (!source) throw new Error('没有实际读取的来源记录。'); return previewWorkspace.evidence(source);
  },
  selectWorkspace: async input => {
    const task = samples.find(t => t.id === input.taskId)!, tab = (await previewWorkspace.view()).tabs.find(t => t.id === input.tabId);
    if (!tab || tab.sha256 !== input.expectedHash || !['markdown', 'code'].includes(tab.kind) || !['file', 'artifact'].includes(tab.source) ||
      input.start < 0 || input.end <= input.start || input.end > (tab.content?.length ?? 0) || input.end - input.start > 12000) throw new Error('请重新选择有效范围。');
    const m = { id: crypto.randomUUID(), name: tab.name, sha256: tab.sha256, bytes: new TextEncoder().encode(tab.content ?? '').length, capturedAt: new Date().toISOString(),
      source: tab.source as 'file' | 'artifact', selection: { start: input.start, end: input.end } };
    materialContents.set(m.id, tab.content ?? ''); task.materials ??= []; task.materials.push(m); emit(); return clone(task);
  },
  openFileDiff: async input => previewWorkspace.diff(input.taskId),
  lastRun: async () => undefined,
  rememberRun: async () => {},
  discardMaterialTicket: async ticket => { preparedMaterials.delete(ticket); },
  prepareMaterial: async () => {
    const ticket = crypto.randomUUID(), content = '# 示例材料\n\n预览不读取真实文件，也不调用模型。';
    const material = { id: crypto.randomUUID(), name: '示例材料.md', sha256: 'a'.repeat(64), bytes: new TextEncoder().encode(content).length, capturedAt: new Date().toISOString(), source: 'file' as const };
    preparedMaterials.set(ticket, material); materialContents.set(material.id, content); return { ticket, material };
  },
  chooseMaterial: async taskId => {
    const task = samples.find(t => t.id === taskId)!; const picked = await previewBridge.prepareMaterial();
    task.materials ??= []; task.materials.push(picked!.material); emit(); return clone(task);
  },
  attachMaterial: async input => {
    const task = samples.find(t => t.id === input.taskId)!, tab = (await previewWorkspace.view()).tabs.find(t => t.id === input.tabId);
    if (!tab || !['file', 'artifact'].includes(tab.source) || tab.kind === 'unsupported') throw new Error('请选择已保存文本。');
    const m = { id: crypto.randomUUID(), name: tab.name, sha256: tab.sha256, bytes: new TextEncoder().encode(tab.content ?? '').length, capturedAt: new Date().toISOString(), source: tab.source as 'file' | 'artifact' };
    materialContents.set(m.id, tab.content ?? ''); task.materials ??= []; task.materials.push(m); emit(); return clone(task);
  },
  removeMaterial: async input => { const task = samples.find(t => t.id === input.taskId)!; task.materials = task.materials?.filter(m => m.id !== input.materialId); emit(); return clone(task); },
  refreshMaterial: async input => { const task = samples.find(t => t.id === input.taskId)!; return clone(task); },
  openMaterial: async input => { const m = samples.find(t => t.id === input.taskId)?.materials?.find(m => m.id === input.materialId); if (!m) throw new Error('请选择材料。'); return previewWorkspace.material(m.name, materialContents.get(m.id) ?? ''); },
  checkMaterials: async id => (samples.find(t => t.id === id)?.materials ?? []).map(m => ({ id: m.id, state: 'current' as const })),
  workspaceAgentGrant: async input => {
    const state = await previewWorkspace.view(), tab = state.tabs.find(t => t.id === input.tabId), task = samples.find(t => t.id === input.taskId);
    if (!tab || !task || tab.kind !== 'web') throw new Error('请选择对话和网页。');
    return previewWorkspace.agentGrant(tab.id, task.conversationId ?? task.id, input.mode);
  },
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
  listTasks: async () => clone(samples.map(t => ({ ...t, conversationTitle: t.conversationTitle ?? samples.filter(o => (o.conversationId ?? o.id) === (t.conversationId ?? t.id)).at(-1)?.goal.split('\n')[0].slice(0, 60), latestRunId: samples.find(o => (o.conversationId ?? o.id) === (t.conversationId ?? t.id))?.id }))),
  createTask: async (input: CreateInput) => {
    const at = new Date().toISOString();
    const task: TaskView = {
      id: crypto.randomUUID(), goal: input.goal, skill: input.skill, root: input.folderGrant ? '~/Projects/preview' : undefined,
      status: 'running', createdAt: at, updatedAt: at, steps: 0, artifacts: [], fileMode: previewExecution.fileMode, hostMode: 'ask',
      conversationTitle: input.goal.split('\n')[0].slice(0, 60), materials: (input.materialTickets ?? []).map(id => preparedMaterials.get(id)!).filter(Boolean),
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
  pauseTask: async id => {
    const task = samples.find(t => t.id === id)!;
    if (task.status === 'paused') return;
    if (['completed', 'failed', 'cancelled', 'awaiting_reconciliation'].includes(task.status)) throw new Error('本轮不能暂停。');
    clearTimeout(timers.get(id)); timers.delete(id);
    task.pause = { reason: 'manual', at: new Date().toISOString(), detail: '预览已暂停；不执行真实工具。重启恢复仅由桌面版 SQLite 提供。',
      resumeStatus: task.status === 'awaiting_input' || task.status === 'awaiting_approval' ? task.status : 'queued' };
    task.status = 'paused'; emit();
  },
  resumeTask: async id => {
    const task = samples.find(t => t.id === id)!;
    if (task.status !== 'paused' || !task.pause) throw new Error('本轮未暂停。');
    task.status = task.pause.resumeStatus; task.pause = undefined;
    if (task.status === 'queued') {
      task.status = 'running';
      timers.set(id, setTimeout(() => {
        if (task.status !== 'running') return;
        task.status = 'completed'; task.steps++;
        task.events.push({ id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'assistant', text: '同一轮次的暂停／继续交互示例完成，没有调用模型或真实工具。' });
        for (const q of task.queuedInput ?? []) task.events.push({ id: q.id, at: now, kind: 'user', text: q.text });
        task.queuedInput = []; timers.delete(id); emit();
      }, 900));
    }
    emit();
  },
  sendMessage: async input => {
    const parent = samples.find(t => t.id === input.taskId)!;
    parent.composerDraft = '';
    if (['running', 'queued', 'paused', 'awaiting_approval', 'awaiting_input'].includes(parent.status)) {
      parent.queuedInput ??= []; parent.queuedInput.push({ id: input.clientMessageId, text: input.text, mode: input.mode, materials: parent.materials?.filter(m => input.materialIds?.includes(m.id)) }); emit(); return clone(parent);
    }
    const task: TaskView = { ...clone(parent), id: crypto.randomUUID(), goal: input.text, conversationTitle: parent.conversationTitle ?? parent.goal.split('\n')[0].slice(0, 60), conversationId: parent.conversationId ?? parent.id, parentRunId: parent.id, runNumber: (parent.runNumber ?? 1) + 1,
      status: 'completed', approval: undefined, artifacts: [], steps: 1, usage: [], events: [...parent.events,
        { id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'user', text: input.text },
        { id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'assistant', text: '## 继续讨论\n\n这是**多轮交互示例**，没有调用模型。\n\n| 能力 | 状态 |\n|---|---|\n| Markdown | 示例渲染 |\n| 工具 | 不执行 |' }] };
    samples.unshift(task); emit(); return clone(task);
  },
  manageQueue: async input => {
    const task = samples.find(t => t.id === input.taskId)!;
    const item = task.queuedInput?.find(entry => entry.id === input.messageId);
    if (!item) throw new Error('消息已发送或删除。');
    if (input.action === 'send' && task.status === 'paused') {
      item.mode = 'steer'; task.pause!.resumeStatus = 'queued'; task.question = undefined;
      if (task.approval) task.approval.state = 'denied';
      emit(); return clone(task);
    }
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
