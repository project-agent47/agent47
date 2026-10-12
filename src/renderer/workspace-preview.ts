import type { WorkspaceState, WorkspaceSource, TaskView, EvidenceView } from '../shared/contracts';
import { classifyDocument } from '../shared/documents';
const state: WorkspaceState = { tabs: [], width: 440, visible: false };
const clone = () => structuredClone(state);
function add(name: string, content: string, source: 'file' | 'artifact' | 'proposal', taskId?: string) {
  const existing = state.tabs.find(t => t.name === name && t.content === content && t.source === source && t.taskId === taskId);
  if (existing) state.activeId = existing.id;
  else { const tab = { id: crypto.randomUUID(), name, content, sha256: '0'.repeat(64), kind: classifyDocument(name), source, taskId }; state.tabs.push(tab); state.activeId = tab.id; }
  state.visible = true; return clone();
}
export const previewWorkspace = {
  replace: async (next: WorkspaceState) => { Object.assign(state, structuredClone(next)); return clone(); },
  evidence: async (source: EvidenceView) => {
    const existing = state.tabs.find(t => t.evidence?.id === source.id);
    if (existing) state.activeId = existing.id;
    else {
      const tab = { id: crypto.randomUUID(), name: `证据 · ${source.name}`, kind: 'code' as const, source: 'evidence' as const,
        content: 'SOURCE_EVIDENCE_PREVIEW — 示例摘录，不读取真实材料或调用模型。', sha256: source.contentHash, evidence: source, status: '示例证据，不连接真实来源' };
      state.tabs.push(tab); state.activeId = tab.id;
    }
    state.visible = true; return clone();
  },
  diff: async (taskId: string) => {
    const tab = { id: crypto.randomUUID(), name: '差异 · example.ts', kind: 'diff' as const, source: 'diff' as const, taskId,
      content: 'export const message = "Updated";\n', before: 'export const message = "Original";\n', sha256: '1'.repeat(64), beforeHash: '2'.repeat(64), status: '示例差异，不执行真实文件工具' };
    state.tabs.push(tab); state.activeId = tab.id; state.visible = true; return clone();
  },
  material: async (name: string, content: string) => add(name, content, 'file'),
  agentGrant: async (tabId: string, conversationId: string, mode: 'deny' | 'read' | 'ask' | 'allow') => {
    const tab = state.tabs.find(t => t.id === tabId); if (!tab?.url) throw new Error('请选择网页。');
    tab.agentGrants = (tab.agentGrants ?? []).filter(g => g.conversationId !== conversationId);
    if (mode !== 'deny') tab.agentGrants.push({ conversationId, origin: new URL(tab.url).origin, mode });
    return clone();
  },
  view: async () => clone(),
  web: async (value: string) => {
    const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('请使用公共 HTTPS 网页。');
    const existing = state.tabs.find(t => t.url === url.href);
    if (existing) state.activeId = existing.id;
    else { const tab = { id: crypto.randomUUID(), name: url.hostname, kind: 'web' as const, source: 'web' as const, url: url.href, sha256: '0'.repeat(64), status: '示例网页，不联网' }; state.tabs.push(tab); state.activeId = tab.id; }
    state.visible = true; return clone();
  },
  open: async (input: WorkspaceSource, tasks: TaskView[]) => {
    const task = tasks.find(t => t.id === input.taskId)!;
    if (input.kind === 'proposal') return add(task.approval!.name, task.approval!.content, 'proposal', task.id);
    const a = task.artifacts.find(a => a.id === input.artifactId)!;
    add(a.name, a.content, 'artifact', task.id);
    const tab = state.tabs.find(t => t.id === state.activeId)!;
    tab.sources = (task.sources ?? []).filter(s => a.evidenceIds?.includes(s.id));
    tab.citationStatus = a.evidenceIds === undefined ? 'legacy' : 'bound';
    return clone();
  },
  import: async () => add('preview-notes.md', '# 本地文件查看示例\n\n| 能力 | 状态 |\n| --- | --- |\n| 本地查看 | 不自动入模 |\n\n预览不读取真实文件。', 'file'),
  update: async (input: { activeId?: string; closeId?: string; pauseId?: string; width?: number; visible?: boolean; moveId?: string; direction?: -1 | 1 }) => {
    if (input.activeId) state.activeId = input.activeId;
    if (input.pauseId) { const tab = state.tabs.find(t => t.id === input.pauseId); if (tab) tab.paused = true; }
    if (input.closeId) { state.tabs = state.tabs.filter(t => t.id !== input.closeId); if (state.activeId === input.closeId) state.activeId = state.tabs.at(-1)?.id; if (!state.tabs.length) state.visible = false; }
    if (input.moveId) { const i = state.tabs.findIndex(t => t.id === input.moveId), j = i + (input.direction ?? 0); if (i >= 0 && j >= 0 && j < state.tabs.length) [state.tabs[i], state.tabs[j]] = [state.tabs[j], state.tabs[i]]; }
    if (input.width) state.width = input.width; if (input.visible !== undefined) state.visible = input.visible;
    return clone();
  },
  refresh: async (id: string) => { const tab = state.tabs.find(t => t.id === id); if (tab) tab.paused = false; return clone(); },
  demo: async (kind: 'html' | 'code' | 'unsupported') => kind === 'html'
    ? add('offline-demo.html', '<!doctype html><html lang="zh"><body style="font:14px system-ui;padding:16px"><h2>离线 HTML 产物</h2><p>示例数据，不调用模型。网页脚本在交互预览中关闭。</p><button onclick="this.textContent=\'已点击\'">桌面版支持隔离交互</button></body></html>', 'file')
    : add(kind === 'code' ? 'example.ts' : 'example.pdf', kind === 'code' ? 'export function greet(name: string) {\n  return `Hello, ${name}`;\n}\n' : '', 'file')
};
