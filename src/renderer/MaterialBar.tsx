import { useEffect, useState } from 'react';
import { bridge } from './bridge';
import type { TaskView, WorkspaceState } from '../shared/contracts';

export function MaterialBar({ task, busy, run, open }: { task: TaskView; busy: boolean; run: (op: () => Promise<unknown>) => Promise<void>; open: (state: WorkspaceState) => void }) {
  const [states, setStates] = useState<Record<string, string>>({});
  const ids = (task.materials ?? []).map(m => m.id).join(',');
  const check = async () => setStates(Object.fromEntries((await bridge.checkMaterials(task.id)).map(m => [m.id, m.state])));
  useEffect(() => { let alive = true; void bridge.checkMaterials(task.id).then(result => { if (alive) setStates(Object.fromEntries(result.map(m => [m.id, m.state]))); }).catch(() => {}); return () => { alive = false; }; }, [task.id, ids]);
  return <div className="material-bar" aria-label="对话材料引用">
    <div className="material-chips">{(task.materials ?? []).map(m => <span className="material-chip" key={m.id}>
      <button type="button" title={`${m.name} · ${m.sha256} · ${m.bytes} B · ${m.capturedAt}`} onClick={() => void run(async () => open(await bridge.openMaterial({ taskId: task.id, materialId: m.id })))}>{m.name} · {m.sha256.slice(0, 6)}</button>
      {states[m.id] !== 'current' && <small>{states[m.id] === 'changed' ? '有新版' : states[m.id] === 'unavailable' ? '源文件不可用' : '待检查'}</small>}
      <button type="button" disabled={busy} aria-label={`更新引用：${m.name}`} onClick={() => void run(() => bridge.refreshMaterial({ taskId: task.id, materialId: m.id }))}>更新</button>
      <button type="button" disabled={busy} aria-label={`移除引用：${m.name}`} onClick={() => void run(() => bridge.removeMaterial({ taskId: task.id, materialId: m.id }))}>×</button>
    </span>)}</div>
    <div className="material-controls"><button type="button" className="text-button" disabled={busy} onClick={() => void run(() => bridge.chooseMaterial(task.id))}>＋选择材料</button>
      {!!task.materials?.length && <button type="button" className="text-button" disabled={busy} onClick={() => void run(check)}>检查版本</button>}
      <span title="移除只取消后续引用，不删除已经发送的历史或模型上下文。">发送时引用 · 按需读取 · 不授权父目录</span></div>
  </div>;
}
