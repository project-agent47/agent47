import { expect, it } from 'vitest';
import { classifyDocument, codeLanguage, validDocumentRequest } from '../src/shared/documents';
import { artifactInput, approvalFor } from '../src/core/tools';
it('recognizes HTML, Markdown, code and unsupported document types without executing content', () => {
  expect(classifyDocument('a.HTML')).toBe('html'); expect(classifyDocument('notes.md')).toBe('markdown');
  expect(classifyDocument('a.ts')).toBe('code'); expect(codeLanguage('a.ts')).toBe('typescript');
  expect(classifyDocument('a.pdf')).toBe('unsupported'); expect(classifyDocument('a.exe')).toBe('unsupported');
});
it('accepts HTML artifact names but rejects traversal and executable artifact types', () => {
  expect(approvalFor('task', 'call', { name: 'report.html', content: '<h1>test</h1>' }).content).toContain('test');
  expect(() => artifactInput.parse({ name: '../x.html', content: '' })).toThrow();
  expect(() => artifactInput.parse({ name: 'x.exe', content: '' })).toThrow();
});
it('document network policy admits only registered snapshot URL and data resources', () => {
  const url = 'agent47-document://one/index.html';
  expect(validDocumentRequest(url, url)).toBe(true); expect(validDocumentRequest(url, 'data:image/png;base64,x')).toBe(true);
  for (const other of ['file:///etc/passwd', 'https://example.com', 'http://127.0.0.1:5173', 'agent47://app/', 'agent47-document://two/index.html']) expect(validDocumentRequest(url, other)).toBe(false);
});
