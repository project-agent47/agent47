import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, ShieldCheck, X } from 'lucide-react';
import type { QuestionAnswer, QuestionDraft, TaskView } from '../shared/contracts';
import { answerSummary, validateAnswers } from '../shared/questions';
import { bridge } from './bridge';
import { Markdown } from './Markdown';

type Run = (operation: () => Promise<unknown>) => Promise<void>;
export interface LocalDecision { title: string; detail: string; confirmLabel: string; confirm: () => Promise<unknown> }
export function ConsentPanel({ decision, busy, run, close }: { decision: LocalDecision; busy: boolean; run: Run; close: () => void }) {
  return <section className="decision-panel" aria-label="授权确认">
    <div className="decision-heading"><ShieldCheck size={16} /><h2>{decision.title}</h2></div>
    <div className="decision-body"><p className="decision-detail">{decision.detail}</p></div>
    <div className="decision-actions"><button className="secondary small-button" disabled={busy} onClick={close}>取消</button>
      <button className="primary small-button" disabled={busy} onClick={() => void run(async () => { await decision.confirm(); close(); })}>{decision.confirmLabel}</button></div>
  </section>;
}

export function DecisionPanel({ task, busy, hostEnabled, run, supplement }: { task: TaskView; busy: boolean; hostEnabled: boolean; run: Run; supplement: () => void }) {
  if (task.status === 'awaiting_input' && task.question?.questions) return <QuestionForm key={`${task.id}:${task.question.id}:${task.question.digest}`} task={task} busy={busy} run={run} supplement={supplement} />;
  if (task.status === 'awaiting_approval' && task.approval) return <ApprovalPanel key={`${task.id}:${task.approval.id}`} task={task} busy={busy} hostEnabled={hostEnabled} run={run} supplement={supplement} />;
  if (task.status === 'awaiting_reconciliation' || (task.status === 'cancelled' && task.unknownEffect)) return <section className="decision-panel" aria-label="检查执行结果">
    <div className="decision-heading"><ShieldCheck size={16} /><h2>主机执行结果未知</h2></div>
    <div className="decision-body"><p>请先检查项目与系统的实际效果。继续不会重放原命令；已停止轮次仍保持停止。</p></div>
    <div className="decision-actions"><button className="secondary small-button" disabled={busy} onClick={() => void run(() => bridge.resolveUnknown(task.id))}>我已检查，不重放并继续</button></div>
  </section>;
  return null;
}

function QuestionForm({ task, busy, run, supplement }: { task: TaskView; busy: boolean; run: Run; supplement: () => void }) {
  const question = task.question!, questions = question.questions!;
  const binding = { taskId: task.id, questionId: question.id, revision: question.revision!, digest: question.digest! };
  const initial: QuestionDraft = question.draft ?? { answers: questions.map(q => ({ questionId: q.id, selectedOptionIds: [] })), step: 0, version: 0 };
  const [draft, setDraft] = useState(initial);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const latest = useRef(initial), version = useRef(initial.version), pump = useRef<Promise<void> | undefined>(undefined), saved = useRef(JSON.stringify(initial));
  const mounted = useRef(true), command = useRef(crypto.randomUUID()), root = useRef<HTMLElement>(null);
  useEffect(() => {
    mounted.current = true;
    if (document.activeElement === document.body) root.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    return () => { mounted.current = false; };
  }, []);
  const flush = (): Promise<void> => {
    if (pump.current) return pump.current;
    const pending = (async () => {
      while (JSON.stringify(latest.current) !== saved.current) {
        const current = structuredClone(latest.current);
        const next = await bridge.saveQuestionDraft({ ...binding, answers: current.answers, step: current.step, expectedVersion: version.current });
        version.current = next.version; saved.current = JSON.stringify(current);
      }
    })();
    pump.current = pending;
    void pending.then(() => { if (mounted.current) { setSaving(false); setSaveError(''); } }, error => {
      if (mounted.current) { setSaving(false); setSaveError((error as Error).message); }
    }).finally(() => { pump.current = undefined; });
    return pending;
  };
  function update(next: QuestionDraft) { latest.current = next; setDraft(next); setSaving(true); void flush().catch(() => {}); }
  function answerChange(answer: QuestionAnswer) {
    update({ ...latest.current, answers: [...latest.current.answers.filter(a => a.questionId !== answer.questionId), answer] });
  }
  const current = questions[draft.step], a = draft.answers.find(a => a.questionId === current?.id) ?? { questionId: current?.id ?? '', selectedOptionIds: [] };
  let valid = false, allValid = false;
  try { if (current) { validateAnswers([current], [a]); valid = true; } } catch { /* Incomplete, not an error while editing. */ }
  try { validateAnswers(questions, draft.answers); allValid = true; } catch { /* Submit remains disabled. */ }
  function submit(result: 'answers' | 'cancel') {
    void run(async () => {
      if (result === 'answers') await flush();
      else if (pump.current) await pump.current.catch(() => {});
      await bridge.respondQuestion({ ...binding, clientCommandId: command.current, result, answers: result === 'answers' ? latest.current.answers : [] });
    });
  }
  return <section ref={root} className="decision-panel question-decision" aria-label="回答 Agent 问题" onKeyDown={e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
      e.preventDefault(); if (current && valid) update({ ...latest.current, step: draft.step + 1 }); else if (!current && allValid) submit('answers');
    }
  }}>
    <div className="decision-heading"><h2>需要你的选择</h2><span role="status">{saveError ? '草稿未保存' : saving ? '保存中…' : '草稿已保存到本地'}</span></div>
    <nav className="question-progress" aria-label="问题进度">{questions.map((q, i) => {
      let answered = false; try { validateAnswers([q], draft.answers.filter(a => a.questionId === q.id)); answered = true; } catch { /* Not answered. */ }
      return <button key={q.id} disabled={busy} className={draft.step === i ? 'selected' : ''} aria-current={draft.step === i ? 'step' : undefined} onClick={() => update({ ...latest.current, step: i })}>{i + 1} · {q.header}{answered && <Check size={12} />}</button>;
    })}<button disabled={busy} className={!current ? 'selected' : ''} onClick={() => update({ ...latest.current, step: questions.length })}>核对答案</button></nav>
    <div className="decision-body">
      {saveError && <p className="decision-error" role="alert">{saveError}<button className="text-button" onClick={() => { setSaving(true); void flush().catch(() => {}); }}>重试保存</button></p>}
      {current ? <fieldset disabled={busy} className="question-fields"><legend><Markdown>{current.prompt}</Markdown></legend>
        <div className="question-options">{current.options.map(option => <label key={option.id} className={a.selectedOptionIds.includes(option.id) ? 'question-option selected' : 'question-option'}>
          <input type={current.type === 'multiple' ? 'checkbox' : 'radio'} name={`${question.id}-${current.id}`} checked={a.selectedOptionIds.includes(option.id)} onChange={e => answerChange({
            questionId: current.id, selectedOptionIds: current.type === 'multiple' ? e.target.checked ? [...a.selectedOptionIds, option.id] : a.selectedOptionIds.filter(id => id !== option.id) : [option.id],
            ...(current.type === 'multiple' && a.customText !== undefined ? { customText: a.customText } : {})
          })} /><span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
        </label>)}
          {current.type !== 'text' && current.allowCustom && <label className="question-option">
            <input type={current.type === 'multiple' ? 'checkbox' : 'radio'} name={`${question.id}-${current.id}`} checked={a.customText !== undefined} onChange={e => answerChange({
              questionId: current.id, selectedOptionIds: current.type === 'multiple' ? a.selectedOptionIds : [], ...(e.target.checked ? { customText: '' } : {})
            })} /><span>{current.type === 'multiple' ? '补充自定义内容' : '自定义答案'}</span></label>}
        </div>
        {(current.type === 'text' || a.customText !== undefined) && <label className="custom-answer-label">你的回答
          <textarea aria-label={`自定义回答：${current.header}`} value={a.customText ?? ''} maxLength={4000} rows={2} placeholder="输入自己的答案，支持多行…" onChange={e => answerChange({ questionId: current.id, selectedOptionIds: a.selectedOptionIds, customText: e.target.value })} /></label>}
        {!current.required && <button className="text-button" onClick={() => answerChange({ questionId: current.id, selectedOptionIds: [], skipped: true })}>跳过这道可选题{a.skipped ? '（已跳过）' : ''}</button>}
      </fieldset> : <div className="answer-review"><h3>核对后一次提交</h3>{questions.map((q, i) => <button key={q.id} disabled={busy} onClick={() => update({ ...latest.current, step: i })}><span>{answerSummary([q], draft.answers.filter(a => a.questionId === q.id))}</span><ChevronRight size={14} /></button>)}</div>}
    </div>
    <div className="decision-actions"><button className="text-button" disabled={busy} onClick={() => submit('cancel')}>取消本次提问</button><button className="text-button" disabled={busy} onClick={() => void run(async () => { await flush(); supplement(); })}>补充要求</button><span className="decision-spacer" />
      <button className="secondary small-button" disabled={busy || !draft.step} onClick={() => update({ ...latest.current, step: draft.step - 1 })}>返回</button>
      {current ? <button className="primary small-button" disabled={busy || !valid} onClick={() => update({ ...latest.current, step: draft.step + 1 })}>下一题</button>
        : <button className="primary small-button" disabled={busy || !allValid || !!saveError} onClick={() => submit('answers')}>提交全部答案</button>}
    </div>
  </section>;
}

function ApprovalPanel({ task, busy, hostEnabled, run, supplement }: { task: TaskView; busy: boolean; hostEnabled: boolean; run: Run; supplement: () => void }) {
  const action = task.approval!, host = ['shell', 'code'].includes(action.kind ?? '');
  const [scope, setScope] = useState(false), [reason, setReason] = useState('');
  const allow = (approve: boolean, scoped = false) => void run(() => bridge.decide({ taskId: task.id, approvalId: action.id, digest: action.digest, approve,
    ...(scoped ? { scope: host ? 'host' as const : 'files' as const } : {}), ...(!approve && reason.trim() ? { reason: reason.trim() } : {}) }));
  const title = action.kind === 'project_write' ? '修改项目文件' : action.kind === 'directory' ? '创建项目目录' : host ? '执行本机工具' : '创建一份成果文件';
  const expiry = Date.parse(action.expiresAt) <= Date.now();
  return <section className="decision-panel approval-decision" aria-label="确认工具操作">
    <div className="decision-heading"><ShieldCheck size={16} /><h2>{title}</h2><span>仅绑定当前内容 · {expiry ? '已过期，请停止后重新提出' : '一次性确认'}</span></div>
    <div className="decision-body">
      <p className="decision-target"><strong>{action.name}</strong>{action.root && <span>目录：{action.root}{action.payload?.cwd ? ` · cwd ${action.payload.cwd}` : ''}</span>}</p>
      {host && <p className="context-note">不是安全沙箱，可访问本机文件与网络；文件快照不覆盖这些改动。</p>}
      {host && <pre className="decision-code">{action.content}</pre>}
      {!host && <details className="decision-content"><summary>查看完整内容 · {new TextEncoder().encode(action.content).length} B · {action.digest.slice(0, 12)}</summary><pre>{action.content}</pre></details>}
      {action.before !== undefined && <details className="decision-content"><summary>修改前内容</summary><pre>{action.before}</pre></details>}
      <details className="decision-content"><summary>拒绝原因（可选）</summary><textarea aria-label="拒绝原因" value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={2000} disabled={busy} /></details>
      {scope && <div className="scope-review"><strong>授权范围：本次对话及其后续执行轮次</strong><p>{host ? '允许 Shell / JavaScript 以你的本机用户权限执行，不再逐命令询问。它不是项目目录沙箱；可能修改目录外文件或访问网络。全局关闭本机执行会撤销此授权。' : '允许本次对话创建成果和修改已授权项目文件，不再逐文件询问；项目修改前自动快照，外部改动仍受保护。'}</p></div>}
    </div>
    <div className="decision-actions"><button className="secondary small-button" disabled={busy} onClick={() => allow(false)}><X size={14} />{host ? '拒绝执行' : '拒绝写入'}</button>
      <button className="text-button" disabled={busy} onClick={supplement}>补充要求</button><span className="decision-spacer" />
      <button className="secondary small-button" disabled={busy || expiry || (host && !hostEnabled)} onClick={() => setScope(!scope)}>{scope ? '收起范围授权' : '按范围授权本次对话…'}</button>
      <button className="primary small-button" disabled={busy || expiry || (host && !hostEnabled)} onClick={() => allow(true, scope)}><Check size={14} />{scope ? '确认范围并批准' : action.kind === 'project_write' ? '批准写入' : action.kind ? '批准执行' : '批准创建'}</button>
    </div>
  </section>;
}

/** Kept separate from decision forms; unmount preserves draft, never sends it. */
export function MessageComposer({ task, busy, run, sent, editing, back, remember }: { task: TaskView; busy: boolean; run: Run; sent: (id: string) => void; editing: boolean; back: () => void; remember: (text: string) => void }) {
  const [text, setText] = useState(task.composerDraft ?? ''), [draftError, setDraftError] = useState('');
  const latest = useRef(task.composerDraft ?? ''), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), writes = useRef(Promise.resolve());
  const saved = useRef(task.composerDraft ?? ''), mounted = useRef(true);
  const persist = () => {
    const value = latest.current;
    const pending = writes.current.catch(() => {}).then(async () => { if (saved.current !== value) { await bridge.saveComposerDraft({ taskId: task.id, text: value }); saved.current = value; } });
    writes.current = pending;
    void pending.catch(() => { if (mounted.current) setDraftError('聊天草稿未保存，请重试。'); });
    return pending;
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timer.current); void persist().catch(() => {}); };
    // The component is keyed by task ID. Cleanup must use its original task.
  }, []);
  return <form className="reply-composer" onSubmit={event => {
    event.preventDefault(); if (!text.trim() || busy) return;
    void run(async () => {
      clearTimeout(timer.current); await persist();
      const next = await bridge.sendMessage({ taskId: task.id, text: latest.current.trim(), mode: 'queue', clientMessageId: crypto.randomUUID(), instruction: true });
      latest.current = ''; saved.current = ''; setText(''); remember(''); sent(next.id);
    });
  }}>
    <label className="sr-only" htmlFor="reply">继续对话</label><textarea id="reply" disabled={busy} value={text} onChange={e => {
      const next = e.target.value; setText(next); remember(next); latest.current = next; clearTimeout(timer.current); timer.current = setTimeout(() => { void persist().catch(() => {}); }, 250);
    }} maxLength={12000} rows={2} placeholder="补充要求或继续追问…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
    {draftError && <p className="decision-error" role="alert">{draftError}<button type="button" className="text-button" onClick={() => void persist().then(() => setDraftError('')).catch(() => {})}>重试保存</button></p>}
    <div className="composer-bottom">{editing ? <button type="button" className="text-button" onClick={back}>回到待回答／确认</button> : <span className="context-note">Enter 发送 · Shift + Enter 换行</span>}
      <button className="primary small-button" type="submit" disabled={!text.trim() || busy || task.status === 'awaiting_reconciliation' || (task.unknownEffect && task.status !== 'running')}>发送消息</button></div>
    {editing && <p className="context-note">补充要求先加入队列；点“立即发送”才作废当前决定。这里不是答题或授权入口。</p>}
  </form>;
}
