import { z } from 'zod';
export const fileEditInput = z.object({
  path: z.string().min(1).max(1024), expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  edits: z.array(z.object({
    oldText: z.string().min(1).max(65536), newText: z.string().max(65536),
    startOffset: z.number().int().min(0).max(65536).optional()
  }).strict()).min(1).max(32)
}).strict();
export type FileEditInput = z.infer<typeof fileEditInput>;
export function sourceBoundary(content: string, at: number) {
  return !(at > 0 && at < content.length && (
    content[at - 1] === '\r' && content[at] === '\n' ||
    /[\uD800-\uDBFF]/.test(content[at - 1]) && /[\uDC00-\uDFFF]/.test(content[at])
  ));
}
function wellFormed(text: string) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = text.charCodeAt(++i); if (!(next >= 0xDC00 && next <= 0xDFFF)) return false;
    } else if (code >= 0xDC00 && code <= 0xDFFF) return false;
  }
  return true;
}
/** Preserve all untouched bytes; normalize only line-ending differences, never whitespace. */
function normalizedMap(content: string) {
  let text = ''; const offsets: number[] = [];
  for (let i = 0; i < content.length; i++) {
    offsets.push(i);
    if (content[i] === '\r' && content[i + 1] === '\n') { text += '\n'; i++; }
    else text += content[i];
  }
  offsets.push(content.length); return { text, offsets };
}
function matches(text: string, needle: string) {
  const found: number[] = []; let i = 0;
  while ((i = text.indexOf(needle, i)) !== -1) { found.push(i++); if (found.length > 10000) throw new Error('Too many edit matches'); }
  return found;
}
export function applyFileEdits(content: string, edits: FileEditInput['edits']) {
  const normalized = normalizedMap(content);
  const hasCRLF = content.includes('\r\n'), hasLF = content.replaceAll('\r\n', '').includes('\n');
  const replacements = edits.map(edit => {
    if (!wellFormed(edit.oldText) || !wellFormed(edit.newText) || edit.newText.includes('\0')) throw new Error('Malformed Unicode or binary edit rejected');
    if (edit.oldText === edit.newText) throw new Error('No-op edit rejected');
    let candidates = matches(content, edit.oldText).map(start => ({ start, end: start + edit.oldText.length }));
    let normalizedEnding = false;
    if (!candidates.length && !(hasCRLF && hasLF)) {
      const old = edit.oldText.replaceAll('\r\n', '\n');
      candidates = matches(normalized.text, old).map(start => ({ start: normalized.offsets[start], end: normalized.offsets[start + old.length] }));
      normalizedEnding = true;
    }
    if (edit.startOffset !== undefined) candidates = candidates.filter(c => c.start === edit.startOffset);
    if (candidates.length !== 1) throw new Error(`Edit must match one original region; found ${candidates.length}. Re-read and provide exact context or startOffset.`);
    if (!sourceBoundary(content, candidates[0].start) || !sourceBoundary(content, candidates[0].end)) throw new Error('Edit splits a source character or CRLF');
    const replacement = !(hasCRLF && hasLF) ? edit.newText.replaceAll('\r\n', '\n').replaceAll('\n', hasCRLF ? '\r\n' : '\n') : edit.newText;
    return { ...candidates[0], replacement, normalizedEnding };
  }).sort((a, b) => a.start - b.start);
  for (let i = 1; i < replacements.length; i++) if (replacements[i].start < replacements[i - 1].end) throw new Error('Overlapping edits rejected; combine into one block');
  let after = content;
  for (const edit of [...replacements].reverse()) after = after.slice(0, edit.start) + edit.replacement + after.slice(edit.end);
  if (after === content) throw new Error('No-op edit rejected');
  if (new TextEncoder().encode(after).length > 1_000_000) throw new Error('Edited file exceeds 1 MB');
  return { content: after, ranges: replacements.map(({ start, end, normalizedEnding }) => ({ start, end, normalizedEnding })) };
}
/** Monaco displays LF/no BOM; map its selection to the exact original version. */
export function displayText(content: string) { return content.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n'); }
export function rawSelection(content: string, start: number, end: number) {
  const bom = content.startsWith('\uFEFF') ? 1 : 0, mapped = normalizedMap(content.slice(bom));
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > mapped.text.length) throw new Error('Invalid selection');
  const range = { start: mapped.offsets[start] + bom, end: mapped.offsets[end] + bom };
  if (!sourceBoundary(content, range.start) || !sourceBoundary(content, range.end)) throw new Error('Split source character');
  return range;
}
