export function classifyDocument(name: string): 'html' | 'markdown' | 'code' | 'unsupported' {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  return ['txt', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'py', 'yaml', 'yml', 'toml', 'sh', 'sql', 'rs', 'go', 'c', 'cpp', 'h', 'java', 'xml', 'csv', 'log'].includes(ext ?? '') ? 'code' : 'unsupported';
}
export function codeLanguage(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return ({ ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', json: 'json', html: 'html', htm: 'html', md: 'markdown', py: 'python', yml: 'yaml', yaml: 'yaml', css: 'css', sh: 'shell', sql: 'sql' } as Record<string, string>)[ext] ?? 'plaintext';
}
export function validDocumentRequest(url: string, request: string): boolean { return request === url || request.startsWith('data:'); }
export function documentHTML(content: string): string {
  // Header CSP is authoritative; do not add application code or bridge objects.
  return content;
}
