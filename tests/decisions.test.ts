import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { TaskStore } from '../src/core/store';
import { TaskRuntime } from '../src/core/runtime';
import { FileSnapshots } from '../src/core/snapshots';
import type { ModelDriver, ModelStep } from '../src/core/model';
import type { QuestionReply } from '../src/shared/contracts';
import { askUserInput, parseQuestions, validateAnswers } from '../src/shared/questions';

const input = { questions: [
  { id: 'audience', header: '对象', prompt: '给谁看？', type: 'single', options: [{ id: 'team', label: '团队' }, { id: 'public', label: '公众' }] },
  { id: 'topics', header: '内容', prompt: '包含哪些内容？', type: 'multiple', options: [{ id: 'plan', label: '计划' }, { id: 'tests', label: '测试' }] },
  { id: 'notes', header: '补充', prompt: '补充要求？', type: 'text', required: false }
] };
const answers = [
  { questionId: 'audience', selectedOptionIds: [], customText: '维护者' },
  { questionId: 'topics', selectedOptionIds: ['plan', 'tests'], customText: '风险' },
  { questionId: 'notes', selectedOptionIds: [], skipped: true }
];
const resources: { store: TaskStore; runtime: TaskRuntime }[] = [];
afterEach(async () => { for (const r of resources.splice(0)) { r.runtime.shutdown(); await new Promise(resolve => setImmediate(resolve)); r.store.close(); } });
const answer = (): ModelStep => ({ text: '完成', messages: [{ role: 'assistant', content: '完成' }], calls: [] });
function call(toolName: string, value: unknown): ModelStep {
  return { text: '', calls: [{ toolName, input: value, toolCallId: 'ask-1' }],
    messages: [{ role: 'assistant', content: [{ type: 'tool-call', toolName, input: value, toolCallId: 'ask-1' }] }] };
}
async function until(check: () => boolean) {
  const end = Date.now() + 10000;
  while (!check()) { if (Date.now() > end) throw new Error('Timeout'); await new Promise(r => setTimeout(r, 5)); }
}
async function setup(model?: ModelDriver, value: unknown = input) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-decisions-')));
  const store = new TaskStore(join(root, 'tasks.db'));
  const runtime = new TaskRuntime(store, model ?? (async () => call('askUser', value)), join(root, 'artifacts'));
  resources.push({ store, runtime }); runtime.start();
  const task = runtime.create('测试决策', 'general');
  await until(() => runtime.list()[0].status === 'awaiting_input');
  const q = runtime.list()[0].question!;
  const reply: QuestionReply = { taskId: task.id, questionId: q.id, revision: q.revision!, digest: q.digest!, clientCommandId: randomUUID(), result: 'answers', answers };
  return { root, runtime, store, task, q, reply };
}

it('exports a provider-compatible JSON schema and preserves legacy questions', () => {
  expect(z.toJSONSchema(askUserInput).type).toBe('object');
  expect(JSON.stringify(z.toJSONSchema(askUserInput))).toContain('questions');
  expect(() => parseQuestions({})).toThrow('exactly one');
  expect(() => parseQuestions({ ...input, question: 'duplicate format' })).toThrow('exactly one');
  expect(parseQuestions({ question: '旧问题？' })).toMatchObject({ legacy: true, questions: [{ id: 'answer', type: 'text' }] });
  expect(parseQuestions(input).questions).toHaveLength(3);
});
it('rejects duplicate questions, bad choices, mixed single answers and required skips', () => {
  expect(() => parseQuestions({ questions: [input.questions[0], input.questions[0]] })).toThrow();
  expect(() => parseQuestions({ questions: [{ ...input.questions[0], options: [] }] })).toThrow();
  const qs = parseQuestions(input).questions;
  expect(() => validateAnswers(qs, [{ ...answers[0], selectedOptionIds: ['team'] }, ...answers.slice(1)])).toThrow();
  expect(() => validateAnswers(qs, [{ questionId: 'audience', selectedOptionIds: [], skipped: true }, ...answers.slice(1)])).toThrow();
  expect(() => validateAnswers(qs, [{ ...answers[1], selectedOptionIds: ['unknown'] }], false)).toThrow();
  expect(validateAnswers(qs, [answers[0]], false)).toHaveLength(1);
});
it('submits all questions as exactly one paired tool result; repeated delivery is idempotent', async () => {
  let steps = 0;
  const { runtime, store, task, reply } = await setup(async messages => {
    if (++steps === 1) return call('askUser', input);
    expect(messages.at(-1)?.role).toBe('tool');
    expect(JSON.stringify(messages.at(-1))).toContain('维护者');
    expect(JSON.stringify(messages.at(-1))).toContain('风险');
    return answer();
  });
  runtime.respondQuestion(reply); runtime.respondQuestion(reply);
  await until(() => runtime.list()[0].status === 'completed');
  expect(store.get(task.id).messages.filter(m => m.role === 'tool')).toHaveLength(1);
  expect(steps).toBe(2);
  expect(() => runtime.respondQuestion({ ...reply, result: 'cancel', answers: [] })).toThrow('旧编号');
});
it('persists partial answers, review position and chat draft across an actual database reopen', async () => {
  const { runtime, store, task, q, root } = await setup();
  const draft = { taskId: task.id, questionId: q.id, revision: q.revision!, digest: q.digest!, answers: [answers[0]], step: 1, expectedVersion: 0 };
  expect(runtime.saveQuestionDraft(draft).version).toBe(1);
  expect(runtime.saveQuestionDraft(draft).version).toBe(1); // Lost-ack retry.
  expect(() => runtime.saveQuestionDraft({ ...draft, step: 2 })).toThrow('草稿');
  runtime.saveComposerDraft(task.id, '未发送的聊天草稿');
  runtime.shutdown(); store.close(); resources.pop();
  const reopened = new TaskStore(join(root, 'tasks.db'));
  const resumed = new TaskRuntime(reopened, async () => { throw new Error('Should not call model'); }, join(root, 'artifacts'));
  resources.push({ runtime: resumed, store: reopened }); resumed.start();
  expect(resumed.list()[0]).toMatchObject({ status: 'awaiting_input', composerDraft: '未发送的聊天草稿', question: { id: q.id, draft: { version: 1, step: 1, answers: [answers[0]] } } });
});
it('rejects incomplete, stale and tampered answers without consuming the question', async () => {
  const { runtime, store, task, reply } = await setup();
  expect(() => runtime.respondQuestion({ ...reply, answers: [answers[0]] })).toThrow();
  expect(() => runtime.respondQuestion({ ...reply, revision: 2 })).toThrow('版本');
  expect(() => runtime.respondQuestion({ ...reply, digest: '0'.repeat(64) })).toThrow('版本');
  const record = store.get(task.id); record.question!.questions![0].prompt = '篡改'; store.save(record);
  expect(() => runtime.respondQuestion(reply)).toThrow('版本');
  expect(runtime.list()[0].status).toBe('awaiting_input');
});
it('ordinary instructions queue without answering; selective interruption invalidates the question', async () => {
  let n = 0;
  const { runtime, task, reply } = await setup(async () => ++n === 1 ? call('askUser', input) : answer());
  runtime.send(task.id, '新的要求', 'queue', randomUUID(), true);
  expect(runtime.list()[0]).toMatchObject({ status: 'awaiting_input', question: { id: reply.questionId } });
  runtime.send(task.id, '立即修改', 'steer', randomUUID(), true);
  expect(() => runtime.respondQuestion(reply)).toThrow('结束');
  await until(() => runtime.list()[0].status === 'completed');
});
it('cancels one batch without an artifact or an extra ordinary user message', async () => {
  let n = 0;
  const { runtime, store, task, reply } = await setup(async messages => {
    if (++n === 1) return call('askUser', input);
    expect(JSON.stringify(messages.at(-1))).toContain('cancelled'); return answer();
  });
  runtime.respondQuestion({ ...reply, result: 'cancel', answers: [] });
  await until(() => runtime.list()[0].status === 'completed');
  expect(runtime.list()[0].artifacts).toHaveLength(0);
  expect(store.get(task.id).messages.filter(m => m.role === 'user')).toHaveLength(1);
});
it('migrates old pending questions on restart without changing their tool identity', async () => {
  const { runtime, store, task } = await setup(undefined, { question: '旧问题' });
  runtime.shutdown();
  const record = store.get(task.id); record.question = { id: 'ask-1', text: '旧问题' }; store.save(record);
  const resumed = new TaskRuntime(store, async () => answer(), '/unused'); resumed.start();
  resources[resources.length - 1].runtime = resumed;
  expect(resumed.list()[0].question).toMatchObject({ id: 'ask-1', legacy: true, revision: 1, questions: [{ type: 'text' }] });
});
it('rejects stale answers after stopping and does not resume stopped tasks', async () => {
  const { runtime, task, reply } = await setup(); runtime.cancel(task.id);
  expect(() => runtime.respondQuestion(reply)).toThrow('结束');
  expect(runtime.list()[0].status).toBe('cancelled');
});
it('denial reasons stay inside their tool result rather than breaking call/result ordering', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-denial-')));
  const store = new TaskStore(join(root, 'tasks.db')); let n = 0;
  const runtime = new TaskRuntime(store, async messages => {
    if (++n === 1) return call('writeArtifact', { name: 'test.md', content: 'test' });
    expect(messages.at(-2)?.role).toBe('assistant'); expect(messages.at(-1)?.role).toBe('tool');
    expect(JSON.stringify(messages.at(-1))).toContain('不要保存'); return answer();
  }, join(root, 'artifacts'));
  resources.push({ runtime, store }); runtime.start(); const task = runtime.create('写文件', 'general');
  await until(() => runtime.list()[0].status === 'awaiting_approval');
  const a = runtime.list()[0].approval!;
  runtime.decide(task.id, a.id, a.digest, false, undefined, '不要保存');
  await until(() => runtime.list()[0].status === 'completed');
});
it('file scope applies to subsequent artifacts without granting host execution', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'a47-scope-')));
  const store = new TaskStore(join(root, 'tasks.db')); let n = 0;
  const runtime = new TaskRuntime(store, async () => ++n < 3 ? {
    ...call('writeArtifact', { name: `${n}.md`, content: `${n}` }),
    calls: [{ toolName: 'writeArtifact', toolCallId: `file-${n}`, input: { name: `${n}.md`, content: `${n}` } }],
    messages: [{ role: 'assistant', content: [{ type: 'tool-call', toolName: 'writeArtifact', toolCallId: `file-${n}`, input: { name: `${n}.md`, content: `${n}` } }] }]
  } : answer(), join(root, 'artifacts'), undefined, { snapshots: new FileSnapshots(join(root, 'snapshots')) });
  resources.push({ runtime, store }); runtime.start(); const t = runtime.create('范围授权', 'general');
  await until(() => runtime.list()[0].status === 'awaiting_approval');
  const a = runtime.list()[0].approval!;
  expect(() => runtime.decide(t.id, a.id, a.digest, true, 'host')).toThrow('范围');
  runtime.decide(t.id, a.id, a.digest, true, 'files');
  await until(() => runtime.list()[0].status === 'completed');
  expect(runtime.list()[0]).toMatchObject({ fileMode: 'snapshot', hostMode: 'ask' });
  expect(runtime.list()[0].artifacts).toHaveLength(2);
});
it('malformed legacy question cannot prevent other tasks from loading on restart', async () => {
  const { runtime, store, task } = await setup(); runtime.shutdown();
  const record = store.get(task.id); record.pending[0].input = {}; record.question = undefined; store.save(record);
  const resumed = new TaskRuntime(store, async () => answer(), '/unused');
  resources[resources.length - 1].runtime = resumed;
  expect(() => resumed.start()).not.toThrow();
  await until(() => resumed.list()[0].status === 'completed');
  expect(store.get(task.id).messages.some(m => m.role === 'tool' && JSON.stringify(m).includes('Invalid saved question'))).toBe(true);
});
