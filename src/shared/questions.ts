import { z } from 'zod';
import type { QuestionAnswer, QuestionItem } from './contracts';

const key = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
const questionItem = z.object({
  id: key, header: z.string().trim().min(1).max(60), prompt: z.string().trim().min(1).max(2000),
  type: z.enum(['single', 'multiple', 'text']), required: z.boolean().default(true),
  options: z.array(z.object({ id: key, label: z.string().trim().min(1).max(120), description: z.string().max(500).optional() }).strict()).max(8).default([]),
  allowCustom: z.boolean().default(true)
}).strict();
/** DeepSeek requires a root object; validate exclusivity at the runtime boundary. */
export const askUserInput = z.object({
  question: z.string().trim().min(1).max(2000).optional(),
  questions: z.array(questionItem).min(1).max(6).optional()
}).strict();
export const questionAnswerSchema = z.object({
  questionId: key, selectedOptionIds: z.array(key).max(8), customText: z.string().max(4000).optional(), skipped: z.boolean().optional()
}).strict();
export const answerListSchema = z.array(questionAnswerSchema).max(6);
export function parseQuestions(value: unknown): { questions: QuestionItem[]; legacy: boolean } {
  const input = askUserInput.parse(value);
  if ((input.question !== undefined) === (input.questions !== undefined)) throw new Error('Provide exactly one question format');
  const questions: QuestionItem[] = input.question !== undefined
    ? [{ id: 'answer', header: '补充信息', prompt: input.question, type: 'text', required: true, options: [], allowCustom: true }]
    : input.questions!;
  if (new Set(questions.map(q => q.id)).size !== questions.length) throw new Error('Question IDs must be unique');
  for (const q of questions) {
    if (new Set(q.options.map(o => o.id)).size !== q.options.length ||
      (q.type === 'text' && (q.options.length || !q.allowCustom)) ||
      (q.type !== 'text' && !q.options.length)) throw new Error('Invalid question choices');
  }
  return { questions, legacy: input.question !== undefined };
}
/** Shared validation: incomplete drafts are valid, never interpreted as user decisions. */
export function validateAnswers(questions: QuestionItem[], value: unknown, complete = true): QuestionAnswer[] {
  const answers = answerListSchema.parse(value);
  if (new Set(answers.map(a => a.questionId)).size !== answers.length || answers.some(a => !questions.some(q => q.id === a.questionId))) throw new Error('请检查题目编号。');
  return questions.flatMap(q => {
    const a = answers.find(a => a.questionId === q.id);
    if (!a) { if (complete) throw new Error(`请回答「${q.header}」或明确跳过。`); return []; }
    const selected = a.selectedOptionIds;
    const text = complete ? a.customText?.trim() : a.customText;
    const hasText = !!text?.trim();
    if (new Set(selected).size !== selected.length || selected.some(id => !q.options.some(o => o.id === id)) ||
      (!q.allowCustom && a.customText !== undefined) || (q.type === 'text' && selected.length) ||
      (q.type === 'single' && (selected.length > 1 || (selected.length && hasText))) ||
      (a.skipped && (q.required || selected.length || hasText))) throw new Error(`请检查「${q.header}」的答案。`);
    if (complete && !a.skipped && !selected.length && !hasText) throw new Error(`请回答「${q.header}」。`);
    return [{ questionId: q.id, selectedOptionIds: selected, ...(text !== undefined ? { customText: text } : {}), ...(a.skipped ? { skipped: true } : {}) }];
  });
}
export function answerSummary(questions: QuestionItem[], answers: QuestionAnswer[]): string {
  return questions.map(q => {
    const a = answers.find(a => a.questionId === q.id);
    return `${q.header}：${a?.skipped ? '跳过' : [...(a?.selectedOptionIds ?? []).map(id => q.options.find(o => o.id === id)!.label), a?.customText?.trim()].filter(Boolean).join('；') || '未回答'}`;
  }).join('\n');
}
