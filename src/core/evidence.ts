import { createHash, randomUUID } from 'node:crypto';
import type { EvidenceView } from '../shared/contracts';
import type { TaskRecord, ToolCall } from './store';
import { z } from 'zod';
export interface EvidenceSnapshot extends EvidenceView { content: string }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const evidenceID = /^s[a-f0-9]{16}$/;
export const evidenceReadInput = z.object({ id: z.string().regex(evidenceID), offset: z.number().int().min(0).max(65536).default(0), length: z.number().int().min(1).max(12000).default(12000) }).strict();
export function validateEvidence(source: EvidenceSnapshot) {
  if (!evidenceID.test(source.id) || source.uri !== `agent47-source:${source.id}` || !['material', 'project', 'web'].includes(source.kind) ||
    !/^[a-f0-9]{64}$/.test(source.versionHash) || hash(source.content) !== source.contentHash ||
    !Number.isInteger(source.offset) || source.offset < 0 || source.end !== source.offset + source.content.length ||
    source.content.length > 65536 || !Number.isFinite(Date.parse(source.observedAt)) ||
    typeof source.name !== 'string' || source.name.length > 200 || typeof source.coverage !== 'string' || source.coverage.length > 800 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(source.originRunId) ||
    ({ readMaterial: 'material', readFile: 'project', browserRead: 'web', readWeb: 'web' } as Record<string, string>)[source.tool] !== source.kind ||
    (source.kind === 'web') !== !!source.url) throw new Error('来源证据版本校验失败；请保留本地数据。');
  if (source.url) { const url = new URL(source.url); if (url.protocol !== 'https:' || url.username || url.password || source.url.length > 2048) throw new Error('Invalid evidence URL'); }
}
export function evidenceView({ content: _content, ...metadata }: EvidenceSnapshot): EvidenceView { return metadata; }
export function readArchivedEvidence(source: EvidenceSnapshot, input: unknown) {
  const { id, offset, length } = evidenceReadInput.parse(input); validateEvidence(source);
  if (id !== source.id || offset > source.content.length) throw new Error('来源或历史范围不匹配。');
  const end = Math.min(source.content.length, offset + length);
  return { content: source.content.slice(offset, end), source: evidenceView(source), historical: true, untrusted: true,
    readRange: { start: source.offset + offset, end: source.offset + end }, nextOffset: end < source.content.length ? end : null,
    coverage: 'Re-read archived observation only; this response covers readRange, not current file/page or new permissions.' };
}
/** Only successful built-in read results generate local citation receipts. */
export function captureEvidence(task: TaskRecord, call: ToolCall, value: unknown): unknown {
  if (!['readMaterial', 'readFile', 'browserRead', 'readWeb'].includes(call.toolName) || !value || typeof value !== 'object') return value;
  const result = value as Record<string, unknown>;
  if (typeof result.content !== 'string' || !result.content) return value;
  let content = result.content.slice(0, 65536);
  if (/[\uD800-\uDBFF]$/.test(content)) content = content.slice(0, -1);
  const web = call.toolName === 'browserRead' || call.toolName === 'readWeb';
  if (web && (typeof result.url !== 'string' || !result.url.startsWith('https:'))) return value;
  const versionHash = typeof result.sha256 === 'string' ? result.sha256 : typeof result.contentDigest === 'string' ? result.contentDigest : hash(result.content);
  if (!/^[a-f0-9]{64}$/.test(versionHash)) return value;
  const archive = Object.values(task.evidenceSnapshots ?? {});
  if (archive.length >= 128 || archive.reduce((n, s) => n + Buffer.byteLength(s.content), 0) + Buffer.byteLength(content) > 1_000_000) return { ...result, sourceUnavailable: 'Local evidence archive limit reached; do not invent a citation.' };
  const offset = typeof result.offset === 'number' && Number.isInteger(result.offset) && result.offset >= 0 ? result.offset : 0;
  const id = 's' + randomUUID().replaceAll('-', '').slice(0, 16);
  const source: EvidenceSnapshot = {
    id, uri: `agent47-source:${id}`, kind: web ? 'web' : call.toolName === 'readMaterial' ? 'material' : 'project',
    name: String(result.name || result.path || result.title || (web ? new URL(String(result.url)).hostname : '材料')).slice(0, 200),
    ...(web ? { url: String(result.url) } : {}),
    versionHash, contentHash: hash(content), offset, end: offset + content.length,
    observedAt: typeof result.observedAt === 'string' ? result.observedAt : new Date().toISOString(),
    coverage: `${String(result.coverage ?? 'Tool-returned text only; not proof of complete source.').slice(0, 350)}${result.scope && result.scope !== 'document' ? ` Region: ${JSON.stringify(result.scope).slice(0, 200)}.` : ''}${content.length < result.content.length ? ' Citation archive contains only the first 65536 returned characters.' : ''}`,
    originRunId: task.id, tool: call.toolName, content
  };
  validateEvidence(source);
  task.evidenceSnapshots ??= {}; task.evidenceSnapshots[id] = source;
  return { ...result, source: evidenceView(source), citationNotice: 'Cite this exact observed excerpt with the source.uri. A receipt proves reading, not claim entailment or full coverage.' };
}
